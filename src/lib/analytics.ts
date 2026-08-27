/**
 * Client-side analytics emitter.
 *
 * - Buffers events in memory + sessionStorage so a navigation never drops
 *   in-flight rows.
 * - Flushes in batches to Supabase `nav_events` when authed; otherwise drops
 *   into a localStorage queue and tries again on next session.
 * - All events also fire as a `pbt:nav_event` CustomEvent for in-app listeners
 *   (e.g. dwell tracking, debug overlays).
 *
 * Anonymous use is the default for PBT, so events still attribute via
 * `pbt:session_id` even when no user is signed in.
 */
import { getSupabase } from '../features/auth/supabaseClient';
import { getOrCreateSessionId } from './storage';
import { isTrainingUseAllowed } from './privacy';
import { isPreviewMode } from './previewMode';

export type NavEventType =
  | 'screen_view'
  | 'card_click'
  | 'tab_change'
  | 'modal_open'
  | 'modal_close'
  | 'cta_click'
  | 'filter_change'
  | 'dwell'
  | 'error'
  | 'custom';

export interface NavEventInput {
  type: NavEventType;
  screen?: string;
  target?: string;
  meta?: Record<string, unknown>;
  dwellMs?: number;
}

interface QueuedEvent extends NavEventInput {
  ts: number;
  anonSessionId: string;
}

const QUEUE_KEY = 'pbt:nav_queue';
const MAX_QUEUE = 200;
const FLUSH_MS = 4000;
const FLUSH_BATCH = 25;

// A glance that never settled isn't time spent, and a tab left open overnight
// isn't either — both would distort the admin "where users spend time" view.
const MIN_DWELL_MS = 1000;
const MAX_DWELL_MS = 30 * 60 * 1000;

let buffer: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let started = false;

// Screen currently being timed, and when its visible stretch began. A zero
// anchor means the clock is paused (tab hidden, or the stretch already
// emitted).
let dwellScreen: string | null = null;
let dwellAnchor = 0;

function loadPersistedQueue(): QueuedEvent[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

function persistQueue(queue: QueuedEvent[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    // quota — silently drop oldest
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_MS);
}

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  // pagehide and visibilitychange both fire when a tab closes; without this
  // guard the second caller reads the same batch mid-insert and duplicates it.
  if (flushing) return;
  flushing = true;
  try {
    const sb = getSupabase();
    if (!sb) {
      // No supabase configured — drop queue so it doesn't grow unbounded.
      buffer = [];
      persistQueue([]);
      return;
    }

    const batch = buffer.slice(0, FLUSH_BATCH);
    const remainder = buffer.slice(FLUSH_BATCH);

    // Get current user (may be null for anonymous use).
    const {
      data: { user },
    } = await sb.auth.getUser().catch(() => ({ data: { user: null } }));

    const rows = batch.map((e) => ({
      user_id: user?.id ?? null,
      anon_session_id: e.anonSessionId,
      event_type: e.type,
      screen: e.screen ?? null,
      target: e.target ?? null,
      meta: e.meta ?? null,
      dwell_ms: e.dwellMs ?? null,
      created_at: new Date(e.ts).toISOString(),
    }));

    const { error } = await sb.from('nav_events').insert(rows);
    if (error) {
      // Keep the batch on the queue; try again next flush.
      persistQueue(buffer);
      if (remainder.length > 0) scheduleFlush();
      return;
    }

    buffer = remainder;
    persistQueue(buffer);
    if (buffer.length > 0) scheduleFlush();
  } finally {
    flushing = false;
  }
}

/**
 * Close the open dwell stretch and log it. Goes through `logEvent`, so the
 * privacy opt-out gates dwell exactly like every other nav_event.
 */
function closeDwell(): void {
  if (!dwellScreen || dwellAnchor === 0) return;
  const elapsed = Date.now() - dwellAnchor;
  // Pause first: pagehide + visibilitychange fire back to back on close, and
  // the second one must not log the same stretch again.
  dwellAnchor = 0;
  if (elapsed < MIN_DWELL_MS || elapsed > MAX_DWELL_MS) return;
  logEvent({ type: 'dwell', screen: dwellScreen, dwellMs: elapsed });
}

/** Initialise the emitter: load persisted queue + register flush handlers. */
export function startAnalytics(): void {
  if (started) return;
  started = true;
  buffer = loadPersistedQueue();
  if (typeof window === 'undefined') return;
  // Flush on page hide so we don't lose events on close/refresh.
  window.addEventListener('pagehide', () => {
    closeDwell();
    void flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      closeDwell();
      void flush();
    } else if (dwellScreen) {
      // Restart the clock rather than resuming it: a backgrounded tab is not
      // time the user spent on the screen.
      dwellAnchor = Date.now();
    }
  });
  if (buffer.length > 0) scheduleFlush();
}

/** Fire-and-forget. Safe to call before startAnalytics(). */
export function logEvent(input: NavEventInput): void {
  // Privacy gate (spec §8.3). Product analytics is data collected *about* the
  // user — it stops the moment they opt out. Their own sessions,
  // session_feedback, and platform_reports are NOT gated: that is the user's
  // own data / deliberate submissions, not "training use".
  if (!isTrainingUseAllowed()) return;
  // Admin preview iframe: an admin exercising a scenario draft is not usage.
  // Letting these through would inflate screen_view / session_open counts on
  // the very dashboard the admin is looking at.
  if (isPreviewMode()) return;
  const event: QueuedEvent = {
    ...input,
    ts: Date.now(),
    anonSessionId: getOrCreateSessionId(),
  };
  buffer.push(event);
  if (buffer.length > MAX_QUEUE) buffer = buffer.slice(-MAX_QUEUE);
  persistQueue(buffer);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pbt:nav_event', { detail: event }));
  }
  scheduleFlush();
}

/**
 * Tell the emitter which screen the user is on. Logs a `dwell` event for the
 * screen being left, then starts timing the new one.
 */
export function markScreenEntered(screen: string): void {
  closeDwell();
  dwellScreen = screen;
  dwellAnchor =
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
      ? 0
      : Date.now();
}

/** Force an immediate flush (useful for tests / manual flush on logout). */
export async function flushAnalytics(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush();
}
