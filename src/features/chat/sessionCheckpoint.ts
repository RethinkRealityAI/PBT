/**
 * Save-as-you-go for training sessions — nothing a trainee practises is lost.
 *
 * Before 2026-10-29 a conversation was only written when it ENDED through the
 * app (scorecard, End, leaving the chat screen). A closed tab, a locked phone
 * that reloaded, a dropped connection or a crash left nothing behind: at the
 * 27/29 Oct workshops an estimated 25–40 real conversations vanished, and
 * trainees who ran out of time were left with no score.
 *
 * Now every exchange is checkpointed twice:
 *  - LOCALLY, here, in `pbt:pending_session` (one slot — one live session per
 *    device), so the next time this device opens the app the interrupted
 *    session is scored and lands in the trainee's history
 *    (`recoverPendingSession`, run once at boot), and
 *  - on the SERVER (`useTextChat` → the signed-in upsert / `session-save`
 *    `checkpoint: true`), so a device that never comes back is still scored
 *    by the hourly `sessions-recover` job.
 *
 * A checkpoint is cleared when the session is finalised through the app.
 */
import { readStorage, removeStorage, writeStorage, type StorageKeyDef } from '../../lib/storage';
import { SESSIONS_KEY } from '../../lib/sessionsKey';
import { uuid } from '../../lib/id';
import type { Scenario } from '../../data/scenarios';
import type { ChatMessage, SessionRecord } from '../../services/types';
import { isScoreUnavailable } from '../../services/types';
import { evaluateConversation } from '../../services/geminiService';
import { scenarioSummaryLine } from '../../data/scenarioSummary';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../../i18n/locales';

export interface PendingSession {
  id: string;
  mode: 'text' | 'voice';
  scenario: Scenario;
  transcript: ChatMessage[];
  startedAt: number;
  updatedAt: number;
  locale: Locale;
  /** The browser tab that wrote it (see `currentTabId`). */
  tabId: string;
}

function isPendingSession(v: unknown): v is PendingSession | null {
  if (v === null) return true;
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    (p.mode === 'text' || p.mode === 'voice') &&
    !!p.scenario &&
    typeof p.scenario === 'object' &&
    Array.isArray(p.transcript) &&
    typeof p.startedAt === 'number' &&
    typeof p.updatedAt === 'number' &&
    typeof p.tabId === 'string'
  );
}

export const PENDING_SESSION_KEY: StorageKeyDef<PendingSession | null> = {
  key: 'pending_session',
  fallback: null,
  validate: isPendingSession,
};

/** A session the app recovered and scored after an interruption — Home tells the trainee once. */
export interface RecoveredNotice {
  sessionId: string;
  overall: number;
}

export const RECOVERED_NOTICE_KEY: StorageKeyDef<RecoveredNotice | null> = {
  key: 'recovered_session_notice',
  fallback: null,
  validate: (v): v is RecoveredNotice | null =>
    v === null ||
    (!!v &&
      typeof v === 'object' &&
      typeof (v as RecoveredNotice).sessionId === 'string' &&
      typeof (v as RecoveredNotice).overall === 'number'),
};

/**
 * Another tab may be mid-session right now; its checkpoint is only treated
 * as abandoned once it has been quiet this long. A checkpoint from THIS tab
 * (a reload) is abandoned at once — the page that wrote it is gone.
 */
export const OTHER_TAB_STALE_MS = 15 * 60_000;

let memoTabId: string | null = null;

/** Per-tab id: survives a reload of the same tab (sessionStorage), not a new tab. */
export function currentTabId(): string {
  if (memoTabId) return memoTabId;
  try {
    const existing = sessionStorage.getItem('pbt:tab_id');
    if (existing) return (memoTabId = existing);
    const fresh = uuid();
    sessionStorage.setItem('pbt:tab_id', fresh);
    return (memoTabId = fresh);
  } catch {
    return (memoTabId = uuid());
  }
}

export function writePendingSession(p: Omit<PendingSession, 'updatedAt' | 'tabId'>): void {
  writeStorage(PENDING_SESSION_KEY, { ...p, updatedAt: Date.now(), tabId: currentTabId() });
}

/** Clear the checkpoint — only if it still belongs to `id` (a newer session keeps its own). */
export function clearPendingSession(id: string | null | undefined): void {
  const current = readStorage(PENDING_SESSION_KEY);
  if (current && (!id || current.id === id)) removeStorage(PENDING_SESSION_KEY.key);
}

export function readPendingSession(): PendingSession | null {
  return readStorage(PENDING_SESSION_KEY);
}

/** Pure: has the page that owned this checkpoint gone away? */
export function isOrphaned(p: PendingSession, now: number, tabId: string): boolean {
  return p.tabId === tabId || now - p.updatedAt > OTHER_TAB_STALE_MS;
}

export function staffTurns(transcript: ChatMessage[]): number {
  return transcript.filter((m) => m.role === 'user' && !m._transientError && m.text.trim().length > 0).length;
}

/** How the recovered session is persisted — injected so this module stays free of the chat hook. */
export type PersistRecovered = (args: {
  scenario: Scenario;
  recordId: string;
  transcript: ChatMessage[];
  durationSeconds: number;
  mode: 'text' | 'voice';
  completed: boolean;
  endedReason: 'completed' | 'abandoned' | 'timeout' | 'error' | 'user_exit';
  locale: Locale;
}) => Promise<void>;

let recovering = false;

/**
 * Run once at boot. An orphaned checkpoint with trainee turns is scored (the
 * scorer is told it was interrupted), added to this device's history marked
 * `recovered`, saved as finished, and announced on Home. One with no trainee
 * turns is saved as abandoned. A scoring failure keeps the checkpoint for the
 * next boot (and the server job will still score the checkpointed row).
 * Resolves to the recovered record, or null.
 */
export async function recoverPendingSession(
  persist: PersistRecovered,
  { now = Date.now(), tabId = currentTabId() }: { now?: number; tabId?: string } = {},
): Promise<SessionRecord | null> {
  if (recovering) return null;
  const pending = readPendingSession();
  if (!pending || !isOrphaned(pending, now, tabId)) return null;
  // Already in history (finalised, but the clear didn't land) — just tidy up.
  if (readStorage(SESSIONS_KEY).some((s) => s.id === pending.id)) {
    clearPendingSession(pending.id);
    return null;
  }
  recovering = true;
  try {
    const transcript = pending.transcript.filter((m) => !m._transientError);
    const locale = isLocale(pending.locale) ? pending.locale : DEFAULT_LOCALE;
    const durationSeconds = Math.max(1, Math.round((pending.updatedAt - pending.startedAt) / 1000));
    if (staffTurns(transcript) === 0) {
      await persist({
        scenario: pending.scenario,
        recordId: pending.id,
        transcript,
        durationSeconds,
        mode: pending.mode,
        completed: false,
        endedReason: 'abandoned',
        locale,
      });
      clearPendingSession(pending.id);
      return null;
    }

    const report = await evaluateConversation(pending.scenario, transcript, {
      sessionId: pending.id,
      locale,
      mode: pending.mode,
      endedEarly: 'interrupted',
    });
    if (isScoreUnavailable(report)) return null;

    const record: SessionRecord = {
      id: pending.id,
      scenarioSummary: scenarioSummaryLine(pending.scenario),
      pushbackId: pending.scenario.pushback.id,
      driver: pending.scenario.suggestedDriver,
      durationSeconds,
      mode: pending.mode,
      scoreReport: report,
      transcript,
      createdAt: new Date(pending.startedAt).toISOString(),
      difficulty: pending.scenario.difficulty,
      recovered: true,
    };
    const existing = readStorage(SESSIONS_KEY);
    writeStorage(SESSIONS_KEY, [record, ...existing].slice(0, 50));
    await persist({
      scenario: pending.scenario,
      recordId: pending.id,
      transcript,
      durationSeconds,
      mode: pending.mode,
      completed: true,
      endedReason: 'completed',
      locale,
    });
    writeStorage(RECOVERED_NOTICE_KEY, { sessionId: record.id, overall: report.overall });
    clearPendingSession(pending.id);
    return record;
  } catch (err) {
    console.warn('[sessionCheckpoint] recovery failed — will retry next launch', err);
    return null;
  } finally {
    recovering = false;
  }
}

/** Test hook. */
export function __resetSessionCheckpoint(): void {
  recovering = false;
  memoTabId = null;
}
