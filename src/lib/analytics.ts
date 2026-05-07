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

let buffer: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

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
}

/** Initialise the emitter: load persisted queue + register flush handlers. */
export function startAnalytics(): void {
  if (started) return;
  started = true;
  buffer = loadPersistedQueue();
  if (typeof window === 'undefined') return;
  // Flush on page hide so we don't lose events on close/refresh.
  window.addEventListener('pagehide', () => {
    void flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  if (buffer.length > 0) scheduleFlush();
}

/** Fire-and-forget. Safe to call before startAnalytics(). */
export function logEvent(input: NavEventInput): void {
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

/** Force an immediate flush (useful for tests / manual flush on logout). */
export async function flushAnalytics(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush();
}
