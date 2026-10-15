/**
 * The Trainees roster — segment filter, search, sort, the four summary
 * figures and the CSV a manager pastes into a spreadsheet.
 *
 * Operates on `TraineeRow`s from `rollupTrainees()` (trainees.ts) plus the
 * raw sessions for the comparisons against the previous window. Pure and
 * clock-injectable; unit-tested in `__tests__/traineeRoster.test.ts`.
 */
import type { SessionSummary } from '../../../../src/shared/analytics/contract';
import { SYSTEM_ROLES } from '../../../../src/shared/access/permissions';
import { humanize } from '../../lib/labels';
import { rangeWords, windows, type Range } from './period';
import { SKILL_KEYS, SKILL_LABELS, sessionTime } from './metrics';
import { STATUS_LABELS, traineeStatus, type TraineeRow, type TraineeStatus } from './trainees';
import type { CsvValue } from './csv';

export type RosterSegment = 'all' | TraineeStatus | 'new';

/** Momentum (points) at which a trainee counts as improving / slipping. */
export const MOMENTUM_THRESHOLD = 4;

/** "Content Manager" for `content_manager`; custom roles humanised. */
export function roleLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return SYSTEM_ROLES.find((r) => r.key === key)?.name ?? humanize(key);
}

export function inSegment(row: TraineeRow, segment: RosterSegment): boolean {
  if (segment === 'all') return true;
  if (segment === 'new') return row.isNew;
  return row.status === segment;
}

/** Case-insensitive match on name, email and role (key or its label). */
export function matchesQuery(row: TraineeRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.name, row.email ?? '', row.admin_role ?? '', roleLabel(row.admin_role) ?? '']
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((part) => hay.includes(part));
}

export type RosterSortKey = 'name' | 'status' | 'sessions' | 'avgScore' | 'skills' | 'streak' | 'lastActive';
export type SortDir = 'asc' | 'desc';

/** Status by urgency: who needs a nudge comes first ascending. */
const STATUS_RANK: Record<TraineeStatus, number> = { at_risk: 0, dormant: 1, not_started: 2, active: 3 };

/** The value a column sorts by; null always sorts last. */
function sortValue(row: TraineeRow, key: RosterSortKey): number | string | null {
  switch (key) {
    case 'name':
      return row.name.toLowerCase();
    case 'status':
      return STATUS_RANK[row.status];
    case 'sessions':
      return row.sessions;
    case 'avgScore':
      return row.avgScore;
    case 'skills':
      // By the weakest skill's score — who has the biggest gap.
      return row.weakest ? row.skills[row.weakest] : null;
    case 'streak':
      return row.streak;
    case 'lastActive':
      return row.lastActiveAt;
  }
}

export function sortRoster(rows: readonly TraineeRow[], key: RosterSortKey, dir: SortDir): TraineeRow[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va == null && vb == null) return a.name.localeCompare(b.name);
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
    return cmp !== 0 ? cmp * sign : a.name.localeCompare(b.name);
  });
}

/** The direction a column sorts in when first clicked. */
export function defaultDir(key: RosterSortKey): SortDir {
  return key === 'name' || key === 'status' || key === 'skills' ? 'asc' : 'desc';
}

export interface RosterSummary {
  /** Trainees with at least one session in the window… */
  practising: number;
  /** …and in the window before (null for `all`). */
  practisingPrev: number | null;
  atRisk: number;
  /** How many were at risk at the start of this window (null for `all`). */
  atRiskPrev: number | null;
  improving: number;
  slipping: number;
  /** Sessions per practising trainee, this window and the one before. */
  perActive: number | null;
  perActivePrev: number | null;
}

/**
 * The four headline figures above the roster. "Previous" figures are what
 * the same measure read one window ago, from the same sessions — so a delta
 * compares like with like.
 */
export function rosterSummary(
  rows: readonly TraineeRow[],
  allSessions: readonly SessionSummary[],
  range: Range,
  now = Date.now(),
): RosterSummary {
  const ids = new Set(rows.map((r) => r.user_id));
  const sessions = allSessions.filter((s) => ids.has(s.user_id));
  const { current, previous } = windows(range, now);

  const curSessions = sessions.filter((s) => sessionTime(s) >= current.start);
  const practising = new Set(curSessions.map((s) => s.user_id)).size;

  let practisingPrev: number | null = null;
  let perActivePrev: number | null = null;
  let atRiskPrev: number | null = null;
  if (previous) {
    const prevSessions = sessions.filter((s) => {
      const t = sessionTime(s);
      return t >= previous.start && t < previous.end;
    });
    practisingPrev = new Set(prevSessions.map((s) => s.user_id)).size;
    perActivePrev = practisingPrev > 0 ? prevSessions.length / practisingPrev : null;
    // Status as it read when this window began.
    const lastBefore = new Map<string, number>();
    for (const s of sessions) {
      const t = sessionTime(s);
      if (t >= previous.end) continue;
      if (t > (lastBefore.get(s.user_id) ?? -Infinity)) lastBefore.set(s.user_id, t);
    }
    atRiskPrev = rows.filter(
      (r) => traineeStatus(lastBefore.get(r.user_id) ?? null, previous.end) === 'at_risk',
    ).length;
  }

  return {
    practising,
    practisingPrev,
    atRisk: rows.filter((r) => r.status === 'at_risk').length,
    atRiskPrev,
    improving: rows.filter((r) => r.momentum != null && r.momentum >= MOMENTUM_THRESHOLD).length,
    slipping: rows.filter((r) => r.momentum != null && r.momentum <= -MOMENTUM_THRESHOLD).length,
    perActive: practising > 0 ? curSessions.length / practising : null,
    perActivePrev,
  };
}

// ─── CSV ───────────────────────────────────────────────────────────────

function isoDay(t: number | null): string {
  return t == null || !Number.isFinite(t) ? '' : new Date(t).toISOString().slice(0, 10);
}

const round = (v: number | null) => (v == null ? null : Math.round(v));

/** The roster as a spreadsheet: plain-English headers, one row per trainee. */
export function rosterCsv(rows: readonly TraineeRow[], range: Range): { header: string[]; rows: CsvValue[][] } {
  const w = rangeWords(range);
  const header = [
    'Name',
    'Email',
    'Role',
    'Status',
    'New (joined in the last 14 days)',
    'Account disabled',
    `Sessions (${w})`,
    `Finished sessions (${w})`,
    'Sessions (all time)',
    `Average score (${w})`,
    'Score momentum (last 5 vs previous 5, points)',
    'Best score (all time)',
    ...SKILL_KEYS.map((k) => `${SKILL_LABELS[k]} (average)`),
    'Weakest skill',
    'Current streak (days)',
    'Best streak (days)',
    `Practice minutes (${w})`,
    `Coach hints used (${w})`,
    'Last session',
    'Last active',
    'Joined',
  ];
  return {
    header,
    rows: rows.map((r) => [
      r.name,
      r.email,
      roleLabel(r.admin_role),
      STATUS_LABELS[r.status],
      r.isNew ? 'Yes' : 'No',
      r.disabled ? 'Yes' : 'No',
      r.sessions,
      r.finished,
      r.sessionsAll,
      round(r.avgScore),
      round(r.momentum),
      r.bestScore,
      ...SKILL_KEYS.map((k) => round(r.skills[k])),
      r.weakest ? SKILL_LABELS[r.weakest] : null,
      r.streak,
      r.bestStreak,
      Math.round(r.practiceSeconds / 60),
      r.hintsUsed,
      isoDay(r.lastSessionAt),
      isoDay(r.lastActiveAt),
      isoDay(r.joinedAt),
    ]),
  };
}
