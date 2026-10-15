/**
 * Aggregations only the Overview needs, on top of `metrics.ts` /
 * `trainees.ts`: per-bucket series for the tile sparklines that
 * `sessionTrend` doesn't carry, the getting-started funnel, and the leaders.
 *
 * Pure and clock-injectable; unit-tested in `__tests__/overview.test.ts`.
 */
import type { SessionSummary, TraineeDirectoryEntry } from '../../../../src/shared/analytics/contract';
import { bucketIndex, buckets, pct, type Range } from './period';
import { isScored, sessionTime } from './metrics';
import type { TraineeRow } from './trainees';

/**
 * Per-bucket series across the current window (same buckets as
 * `sessionTrend`): practice time and the share of finished sessions whose
 * owner ended won over. A bucket with nothing to measure is null, never 0 —
 * an empty day isn't a 0% day.
 */
export function trendExtras(
  rows: readonly SessionSummary[],
  range: Range,
  now = Date.now(),
): {
  practiceHours: number[];
  resolvedRate: Array<number | null>;
  finishRate: Array<number | null>;
  /** Scored sessions per bucket (what each average-score point rests on). */
  scored: number[];
  /** Share of scored sessions at 70+ per bucket. */
  passRate: Array<number | null>;
} {
  const { list } = buckets(range, now);
  const acc = list.map(() => ({ seconds: 0, sessions: 0, finished: 0, mood: 0, green: 0, scored: 0, passed: 0 }));
  for (const s of rows) {
    const i = bucketIndex(list, sessionTime(s));
    if (i < 0) continue;
    const a = acc[i];
    a.sessions++;
    if (s.duration_seconds != null && s.duration_seconds > 0) a.seconds += s.duration_seconds;
    if (isScored(s)) {
      a.scored++;
      if ((s.score_overall as number) >= 70) a.passed++;
    }
    if (s.completed) {
      a.finished++;
      if (s.owner_mood_end != null) {
        a.mood++;
        if (s.owner_mood_end === 'green') a.green++;
      }
    }
  }
  return {
    practiceHours: acc.map((a) => a.seconds / 3600),
    resolvedRate: acc.map((a) => pct(a.green, a.mood)),
    finishRate: acc.map((a) => pct(a.finished, a.sessions)),
    scored: acc.map((a) => a.scored),
    passRate: acc.map((a) => pct(a.passed, a.scored)),
  };
}

/** A sparkline needs numbers: drop the empty buckets (the line joins the measured ones). */
export function measured(series: ReadonlyArray<number | null>): number[] {
  return series.filter((v): v is number => v != null && Number.isFinite(v));
}

// ─── Getting started ───────────────────────────────────────────────────

export interface FunnelStep {
  key: 'accounts' | 'practised' | 'regular' | 'window';
  label: string;
  hint: string;
  count: number;
  /** Share of accounts, 0–100 (null with no accounts). */
  pctOfAccounts: number | null;
}

/** Sessions (all-time) that make someone a regular. */
export const REGULAR_SESSIONS = 3;

/**
 * How far people get: accounts → practised at least once → practised 3+
 * times → practised in the selected window. Disabled accounts are left out
 * of every step (they can't practise). Counts are people, from the directory
 * joined to ALL sessions, so the first three steps don't move with the range.
 */
export function practiceFunnel(
  directory: readonly TraineeDirectoryEntry[],
  allSessions: readonly SessionSummary[],
  windowStart: number,
  windowLabel: string,
): FunnelStep[] {
  const people = directory.filter((d) => !d.disabled);
  const ids = new Set(people.map((d) => d.user_id));
  const perUser = new Map<string, number>();
  const inWindow = new Set<string>();
  for (const s of allSessions) {
    if (!ids.has(s.user_id)) continue;
    perUser.set(s.user_id, (perUser.get(s.user_id) ?? 0) + 1);
    if (sessionTime(s) >= windowStart) inWindow.add(s.user_id);
  }
  const accounts = people.length;
  const practised = perUser.size;
  const regular = [...perUser.values()].filter((n) => n >= REGULAR_SESSIONS).length;
  const step = (key: FunnelStep['key'], label: string, hint: string, n: number): FunnelStep => ({
    key,
    label,
    hint,
    count: n,
    pctOfAccounts: pct(n, accounts),
  });
  return [
    step('accounts', 'Accounts', 'Everyone who can sign in', accounts),
    step('practised', 'Practised once', 'At least one session, ever', practised),
    step('regular', `${REGULAR_SESSIONS}+ sessions`, `Practised ${REGULAR_SESSIONS} or more times`, regular),
    step('window', 'Practising now', `At least one session in the ${windowLabel}`, inWindow.size),
  ];
}

// ─── Leaders ───────────────────────────────────────────────────────────

export interface Leaders {
  /**
   * Biggest positive score momentum, among people who practised in the window.
   * Momentum is the shared `scoreMomentum` (latest 5 scored vs the 5 before),
   * so it needs 7+ scored sessions and matches the trainee profile.
   */
  improved: TraineeRow[];
  /** Most sessions in the window. */
  active: TraineeRow[];
}

export function leaders(rows: readonly TraineeRow[], opts: { improved?: number; active?: number } = {}): Leaders {
  const live = rows.filter((r) => !r.disabled);
  const improved = live
    .filter((r) => r.momentum != null && r.momentum > 0 && r.sessions > 0)
    .sort((a, b) => (b.momentum as number) - (a.momentum as number))
    .slice(0, opts.improved ?? 3);
  const active = live
    .filter((r) => r.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions || (b.avgScore ?? -1) - (a.avgScore ?? -1))
    .slice(0, opts.active ?? 5);
  return { improved, active };
}
