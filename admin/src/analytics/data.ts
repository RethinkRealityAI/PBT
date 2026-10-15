/**
 * Data hooks for the Analytics destination.
 *
 * Every tab reads through the shared cache (`../data/cache.ts`), keyed by
 * endpoint + window, so switching tabs paints from memory and the Overview,
 * Trainees, Sessions and Skills tabs share ONE sessions fetch per window
 * instead of four. Sessions are fetched for twice the window so every
 * headline can be compared with the period before.
 */
import { apiFetch } from '../lib/api';
import { useCachedQuery } from '../data/cache';
import type {
  EngagementReport,
  SessionSummary,
  SessionSummaryResponse,
  TraineeDetail,
  TraineeDirectoryResponse,
} from '../../../src/shared/analytics/contract';
import type { AdminSession, AiCall, SessionFeedbackRow, PlatformReportRow } from '../data/types';
import { fetchSince, type Range } from './lib/period';

/** Minutes WEST of UTC as the server expects (Date#getTimezoneOffset sign). */
export function tzOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}

/**
 * Session summaries for twice the window (current + previous period).
 * `lite` skips transcripts and full score reports — for all-time lifetime
 * figures (status, streaks, funnel) that never read them; `enabled: false`
 * when the admin can't read sessions (the request would be refused).
 */
export function useSessionSummaries(range: Range, opts: { lite?: boolean; enabled?: boolean } = {}) {
  const { lite = false, enabled = true } = opts;
  return useCachedQuery<SessionSummaryResponse>(
    enabled ? `sessions:summary:${range}${lite ? ':lite' : ''}` : null,
    () =>
      apiFetch<SessionSummaryResponse>('admin-sessions', {
        view: 'summary',
        since: fetchSince(range),
        limit: 10000,
        lite: lite ? 1 : undefined,
      }),
    { rows: [], truncated: false },
  );
}

/** One session in full (transcript + score report) — fetched when opened. */
export function useSessionDetail(id: string | null) {
  return useCachedQuery<AdminSession | null>(
    id ? `sessions:one:${id}` : null,
    () => apiFetch<AdminSession>('admin-sessions', { id: id ?? '' }),
    null,
    5 * 60_000,
  );
}

/** Everyone with a profile, named — readable with `sessions.read`. */
export function useTraineeDirectory(enabled = true) {
  return useCachedQuery<TraineeDirectoryResponse>(
    enabled ? 'analytics:directory' : null,
    () => apiFetch<TraineeDirectoryResponse>('admin-analytics', { op: 'directory' }),
    { rows: [], emails: false },
    5 * 60_000,
  );
}

/** App usage, aggregated on the server (counts every event, not the newest 1,000). */
export function useEngagement(range: Range, enabled = true) {
  return useCachedQuery<EngagementReport | null>(
    enabled ? `analytics:engagement:${range}` : null,
    () =>
      apiFetch<EngagementReport>('admin-analytics', {
        op: 'engagement',
        range,
        tz: tzOffsetMinutes(),
      }),
    null,
  );
}

/** Everything about one trainee the caller is allowed to see. */
export function useTraineeDetail(userId: string | null) {
  return useCachedQuery<TraineeDetail | null>(
    userId ? `analytics:trainee:${userId}` : null,
    () =>
      apiFetch<TraineeDetail>('admin-analytics', {
        op: 'trainee',
        id: userId ?? '',
        tz: tzOffsetMinutes(),
      }),
    null,
  );
}

/** AI calls for twice the window (cost / failure context on the Overview). */
export function useAiCallsWindow(range: Range, enabled = true) {
  return useCachedQuery<AiCall[]>(
    enabled ? `aicalls:${range}` : null,
    () => apiFetch<AiCall[]>('admin-ai-calls', { since: fetchSince(range), limit: 20000 }),
    [],
  );
}

export function useFeedbackWindow(range: Range, enabled = true) {
  return useCachedQuery<SessionFeedbackRow[]>(
    enabled ? `feedback:${range}` : null,
    () => apiFetch<SessionFeedbackRow[]>('admin-feedback', { since: fetchSince(range), limit: 5000 }),
    [],
  );
}

export function useOpenReports(enabled = true) {
  return useCachedQuery<PlatformReportRow[]>(
    enabled ? 'reports:recent' : null,
    () =>
      apiFetch<PlatformReportRow[]>('admin-reports', {
        since: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        limit: 1000,
      }),
    [],
  );
}

export type { SessionSummary };
