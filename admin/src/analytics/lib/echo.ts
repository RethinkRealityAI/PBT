/**
 * Analytics → ECHO: the ONE definition of every number on the tab, the
 * Skills tab's trainee-style lookup and both CSV shapes. Pure and
 * unit-tested (`__tests__/echo.test.ts`); the tab only draws.
 *
 * Three layers, in order:
 *   1. FILTERS (period, who, primary driver, flag state, language, source,
 *      staff, search) pick the rows the table and the export show.
 *   2. The POPULATION is those rows minus staff accounts (unless "Include
 *      staff") and minus backfilled profiles (unless "Include backfilled") —
 *      the KPIs (completed, people, % flagged, median time) count it.
 *   3. COUNTED rows are the population minus the quizzes the quality rules
 *      leave out: an admin's Exclude always; an automatic flag (rushed,
 *      straight-lined, pattern) unless the admin included that quiz or turned
 *      "Include flagged" on. The distributions read only these.
 *
 * Quality itself (flags, metrics, thresholds) is `src/shared/analytics/
 * echoQuality.ts` — the same module the tests and the offline mock use.
 */
import type {
  EchoQuizRow,
  EchoQuizSource,
  SessionSummary,
  TraineeDirectoryEntry,
} from '../../../../src/shared/analytics/contract';
import {
  DEFAULT_ECHO_THRESHOLDS,
  ECHO_FLAG_LABELS,
  assessEchoQuiz,
  mainAnswers,
  type EchoQuizAssessment,
  type EchoThresholds,
} from '../../../../src/shared/analytics/echoQuality';
import { QUIZ_QUESTIONS } from '../../../../src/data/quizQuestions';
import { deviceKey } from '../../../../src/shared/analytics/device';
import { DRIVER_KEYS, type DriverKey } from '../../lib/tokens';
import { buckets, bucketIndex, median, splitByPeriod, type Range } from './period';
import { languageKey, languageLabel, type WhoFilter } from './who';
import { localStamp } from './sessionsExplorer';
import type { CsvValue } from './csv';

// ─── Options and filters ───────────────────────────────────────────────

export interface EchoOptions {
  thresholds: EchoThresholds;
  /** Count auto-flagged quizzes too (an admin's Exclude still wins). Default off. */
  includeFlagged: boolean;
  /** Count quizzes by portal staff (an admin role). Default off. */
  includeStaff: boolean;
  /** Count profiles copied in when recording began (no answers). Default on. */
  includeBackfill: boolean;
}

export const DEFAULT_ECHO_OPTIONS: Readonly<EchoOptions> = Object.freeze({
  thresholds: DEFAULT_ECHO_THRESHOLDS,
  includeFlagged: false,
  includeStaff: false,
  includeBackfill: true,
});

export type EchoFlagFilter = 'all' | 'clean' | 'flagged' | 'rushed' | 'straightLined' | 'pattern' | 'reviewed';
export type EchoStaffFilter = 'all' | 'trainees' | 'staff';

export interface EchoFilters {
  who: WhoFilter;
  primary: 'all' | DriverKey;
  flag: EchoFlagFilter;
  /** 'all' or a `languageKey` ('en', 'fr', 'none'). */
  locale: string;
  source: 'all' | EchoQuizSource;
  staff: EchoStaffFilter;
}

export const NO_ECHO_FILTERS: Readonly<EchoFilters> = Object.freeze({
  who: 'all',
  primary: 'all',
  flag: 'all',
  locale: 'all',
  source: 'all',
  staff: 'all',
});

export const ECHO_FLAG_FILTER_LABELS: Record<EchoFlagFilter, string> = {
  all: 'Any quality',
  clean: 'Clean',
  flagged: 'Flagged (any)',
  rushed: ECHO_FLAG_LABELS.rushed,
  straightLined: ECHO_FLAG_LABELS.straightLined,
  pattern: ECHO_FLAG_LABELS.pattern,
  reviewed: 'Reviewed by an admin',
};

export const ECHO_SOURCE_LABELS: Record<EchoQuizSource, string> = {
  app: 'Recorded by the app',
  profile_backfill: 'Backfilled profile',
};

export function activeEchoFilterCount(f: EchoFilters): number {
  return (Object.keys(NO_ECHO_FILTERS) as Array<keyof EchoFilters>).filter((k) => f[k] !== NO_ECHO_FILTERS[k]).length;
}

// ─── One quiz, assessed ────────────────────────────────────────────────

export interface EchoView {
  row: EchoQuizRow;
  a: EchoQuizAssessment;
  /** The account holds an admin role (portal staff). */
  staff: boolean;
  at: number;
}

export type DirectoryLookup = (userId: string) => Pick<TraineeDirectoryEntry, 'admin_role' | 'display_name' | 'email' | 'user_id'> | undefined;

export function assessAll(rows: readonly EchoQuizRow[], thresholds: EchoThresholds, person: DirectoryLookup): EchoView[] {
  return rows.map((row) => ({
    row,
    a: assessEchoQuiz(row, thresholds),
    staff: row.user_id ? person(row.user_id)?.admin_role != null : false,
    at: new Date(row.created_at).getTime(),
  }));
}

/** In the population: staff and backfilled rows only when their toggles say so. */
export function inPopulation(v: EchoView, o: EchoOptions): boolean {
  return (o.includeStaff || !v.staff) && (o.includeBackfill || v.row.source !== 'profile_backfill');
}

/** Counted in the distributions (see the header for the rule). */
export function isCounted(v: EchoView, o: EchoOptions): boolean {
  if (!inPopulation(v, o)) return false;
  if (v.row.review_status === 'exclude') return false;
  if (v.row.review_status === 'include') return true;
  return o.includeFlagged || !v.a.autoFlagged;
}

/** The one reason a quiz is left out of the distributions, or null when it counts. */
export type ExclusionReason = 'reviewed' | 'flagged' | 'staff' | 'backfill';

export function exclusionReason(v: EchoView, o: EchoOptions): ExclusionReason | null {
  if (!o.includeStaff && v.staff) return 'staff';
  if (!o.includeBackfill && v.row.source === 'profile_backfill') return 'backfill';
  if (v.row.review_status === 'exclude') return 'reviewed';
  if (v.row.review_status !== 'include' && !o.includeFlagged && v.a.autoFlagged) return 'flagged';
  return null;
}

export function exclusionCounts(views: readonly EchoView[], o: EchoOptions): Record<ExclusionReason, number> & { total: number } {
  const out = { reviewed: 0, flagged: 0, staff: 0, backfill: 0, total: 0 };
  for (const v of views) {
    const r = exclusionReason(v, o);
    if (r) {
      out[r] += 1;
      out.total += 1;
    }
  }
  return out;
}

function matchesFlag(v: EchoView, f: EchoFlagFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'clean':
      return !v.a.autoFlagged;
    case 'flagged':
      return v.a.autoFlagged;
    case 'rushed':
      return v.a.flags.rushed;
    case 'straightLined':
      return v.a.flags.straightLined;
    case 'pattern':
      return v.a.flags.pattern;
    case 'reviewed':
      return v.a.reviewed;
  }
}

/** Name / device words a search can match. */
export function whoWords(row: EchoQuizRow, person: DirectoryLookup): string {
  if (!row.user_id) return `Anonymous · Device ${row.device ?? '????'}`;
  const e = person(row.user_id);
  return e ? e.display_name?.trim() || e.email?.split('@')[0] || `Trainee ${row.user_id.slice(0, 6)}` : 'Unknown trainee';
}

export function filterEcho(
  views: readonly EchoView[],
  f: EchoFilters,
  query: string,
  person: DirectoryLookup,
): EchoView[] {
  const q = query.trim().toLowerCase();
  return views.filter((v) => {
    const r = v.row;
    if (f.who !== 'all' && (f.who === 'anonymous') !== !r.user_id) return false;
    if (f.primary !== 'all' && r.primary_driver !== f.primary) return false;
    if (!matchesFlag(v, f.flag)) return false;
    if (f.locale !== 'all' && languageKey(r.locale) !== f.locale) return false;
    if (f.source !== 'all' && r.source !== f.source) return false;
    if (f.staff === 'staff' && !v.staff) return false;
    if (f.staff === 'trainees' && v.staff) return false;
    if (q && !`${whoWords(r, person)} ${r.primary_driver} ${r.secondary_driver ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ─── KPIs ──────────────────────────────────────────────────────────────

export interface EchoKpis {
  completed: number;
  /** Distinct signed-in accounts. */
  people: number;
  /** Distinct anonymous devices. */
  devices: number;
  flagged: number;
  rushed: number;
  straightLined: number;
  pattern: number;
  /** % of the population auto-flagged (null with none). */
  flaggedPct: number | null;
  /** Median total time of quizzes that recorded one, ms. */
  medianTotalMs: number | null;
}

export function echoKpis(population: readonly EchoView[]): EchoKpis {
  const people = new Set<string>();
  const devices = new Set<string>();
  let flagged = 0;
  let rushed = 0;
  let straightLined = 0;
  let pattern = 0;
  const totals: number[] = [];
  for (const v of population) {
    if (v.row.user_id) people.add(v.row.user_id);
    else if (v.row.device_key) devices.add(v.row.device_key);
    if (v.a.autoFlagged) flagged += 1;
    if (v.a.flags.rushed) rushed += 1;
    if (v.a.flags.straightLined) straightLined += 1;
    if (v.a.flags.pattern) pattern += 1;
    if (v.row.total_ms != null && v.row.source === 'app') totals.push(v.row.total_ms);
  }
  const n = population.length;
  return {
    completed: n,
    people: people.size,
    devices: devices.size,
    flagged,
    rushed,
    straightLined,
    pattern,
    flaggedPct: n > 0 ? (flagged / n) * 100 : null,
    medianTotalMs: median(totals),
  };
}

// ─── Distributions ─────────────────────────────────────────────────────

export type DriverCounts = Record<DriverKey, number>;

const zero = (): DriverCounts => ({ Activator: 0, Energizer: 0, Analyzer: 0, Harmonizer: 0 });

function asDriver(v: string | null | undefined): DriverKey | null {
  return v && (DRIVER_KEYS as readonly string[]).includes(v) ? (v as DriverKey) : null;
}

export function primaryCounts(rows: readonly EchoView[]): DriverCounts {
  const out = zero();
  for (const v of rows) {
    const d = asDriver(v.row.primary_driver);
    if (d) out[d] += 1;
  }
  return out;
}

export function secondaryCounts(rows: readonly EchoView[]): DriverCounts {
  const out = zero();
  for (const v of rows) {
    const d = asDriver(v.row.secondary_driver);
    if (d) out[d] += 1;
  }
  return out;
}

/** primary × secondary counts, keyed "primary|secondary". */
export function driverMatrix(rows: readonly EchoView[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of rows) {
    const p = asDriver(v.row.primary_driver);
    const s = asDriver(v.row.secondary_driver);
    if (!p || !s) continue;
    const k = `${p}|${s}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Completions per time bucket, split by primary driver (oldest first). */
export function completionsOverTime(
  rows: readonly EchoView[],
  range: Range,
  now = Date.now(),
): { granularity: 'hour' | 'day' | 'week'; points: Array<{ label: string; start: number; counts: DriverCounts; total: number }> } {
  const { granularity, list } = buckets(range, now);
  const points = list.map((b) => ({ label: b.label, start: b.start, counts: zero(), total: 0 }));
  for (const v of rows) {
    const i = bucketIndex(list, v.at);
    const d = asDriver(v.row.primary_driver);
    if (i < 0 || !d) continue;
    points[i].counts[d] += 1;
    points[i].total += 1;
  }
  return { granularity, points };
}

export interface EchoSplitGroup {
  key: string;
  label: string;
  total: number;
  counts: DriverCounts;
}

/** Primary-driver mix per group (Who, language, source), groups with no quizzes dropped. */
export function echoSplits(rows: readonly EchoView[]): { who: EchoSplitGroup[]; language: EchoSplitGroup[]; source: EchoSplitGroup[] } {
  const by = (keyOf: (v: EchoView) => string, labelOf: (k: string) => string, order: string[]) => {
    const groups = new Map<string, EchoSplitGroup>();
    for (const v of rows) {
      const k = keyOf(v);
      const g = groups.get(k) ?? { key: k, label: labelOf(k), total: 0, counts: zero() };
      const d = asDriver(v.row.primary_driver);
      if (d) g.counts[d] += 1;
      g.total += 1;
      groups.set(k, g);
    }
    const known = order.filter((k) => groups.has(k)).map((k) => groups.get(k) as EchoSplitGroup);
    const extra = [...groups.keys()].filter((k) => !order.includes(k)).sort().map((k) => groups.get(k) as EchoSplitGroup);
    return [...known, ...extra];
  };
  return {
    who: by((v) => (v.row.user_id ? 'signed_in' : 'anonymous'), (k) => (k === 'signed_in' ? 'Signed-in trainees' : 'Anonymous'), [
      'signed_in',
      'anonymous',
    ]),
    language: by((v) => languageKey(v.row.locale), languageLabel, ['en', 'fr', 'none']),
    source: by((v) => v.row.source, (k) => ECHO_SOURCE_LABELS[k as EchoQuizSource] ?? k, ['app', 'profile_backfill']),
  };
}

// ─── Question diagnostics ──────────────────────────────────────────────

export interface QuestionDiagnostic {
  id: number;
  prompt: string;
  answered: number;
  /** Share 0–1 of each letter. */
  share: Record<'A' | 'B' | 'C' | 'D', number>;
  medianMs: number | null;
  /** Share 0–1 of answers faster than the threshold. */
  fastShare: number | null;
}

export function questionDiagnostics(rows: readonly EchoView[], thresholds: EchoThresholds): QuestionDiagnostic[] {
  const byQ = new Map<number, { letters: Record<'A' | 'B' | 'C' | 'D', number>; times: number[] }>();
  for (const q of QUIZ_QUESTIONS) byQ.set(q.id, { letters: { A: 0, B: 0, C: 0, D: 0 }, times: [] });
  for (const v of rows) {
    for (const a of mainAnswers(v.row)) {
      const slot = byQ.get(a.q);
      if (!slot) continue;
      slot.letters[a.letter] += 1;
      slot.times.push(a.ms);
    }
  }
  return QUIZ_QUESTIONS.map((q) => {
    const slot = byQ.get(q.id) as { letters: Record<'A' | 'B' | 'C' | 'D', number>; times: number[] };
    const n = slot.times.length;
    const share = { A: 0, B: 0, C: 0, D: 0 };
    for (const l of ['A', 'B', 'C', 'D'] as const) share[l] = n > 0 ? slot.letters[l] / n : 0;
    return {
      id: q.id,
      prompt: q.prompt,
      answered: n,
      share,
      medianMs: median(slot.times),
      fastShare: n > 0 ? slot.times.filter((t) => t < thresholds.fastMs).length / n : null,
    };
  });
}

// ─── Period split (current vs previous) ────────────────────────────────

export function splitEchoByPeriod(views: readonly EchoView[], range: Range, now = Date.now()) {
  return splitByPeriod(
    views.map((v) => ({ ...v, created_at: v.row.created_at })),
    range,
    now,
  );
}

// ─── Words ─────────────────────────────────────────────────────────────

/** "4.2 s" / "1 m 05 s". */
export function fmtMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)} m ${String(s % 60).padStart(2, '0')} s`;
}

export function fmtPct(share: number | null | undefined): string {
  return share == null || !Number.isFinite(share) ? '—' : `${Math.round(share * 100)}%`;
}

/** "An 6 · Ha 3 · En 3 · Ac 3" — a tally, largest first. */
export function tallyWords(tally: Record<string, number>): string {
  return DRIVER_KEYS.map((k) => [k, tally[k] ?? 0] as const)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k.slice(0, 2)} ${n}`)
    .join(' · ');
}

export function flagWords(a: EchoQuizAssessment): string[] {
  const out: string[] = [];
  if (a.flags.rushed) out.push(ECHO_FLAG_LABELS.rushed);
  if (a.flags.straightLined) out.push(ECHO_FLAG_LABELS.straightLined);
  if (a.flags.pattern) out.push(`${ECHO_FLAG_LABELS.pattern} (all ${a.metrics.fingerprint})`);
  return out;
}

export const REVIEW_LABELS: Record<EchoQuizRow['review_status'], string> = {
  auto: 'Automatic',
  include: 'Included by an admin',
  exclude: 'Excluded by an admin',
};

// ─── CSV ───────────────────────────────────────────────────────────────

function whoCell(r: EchoQuizRow): string {
  return r.user_id ? 'Signed-in trainee' : `Anonymous · Device ${r.device ?? 'unknown'}`;
}

/** One row per quiz. Never a full device id — the 4-character tag only. */
export function echoQuizCsv(
  views: readonly EchoView[],
  opts: { nameOf: (userId: string) => string; emailOf?: (userId: string) => string | null; options: EchoOptions },
): { header: string[]; rows: CsvValue[][] } {
  const header = [
    'Date and time',
    'Who',
    'Trainee',
    ...(opts.emailOf ? ['Email'] : []),
    'Portal staff',
    'Language',
    'Source',
    'Primary style',
    'Secondary style',
    ...DRIVER_KEYS.map((k) => `${k} votes`),
    'Tie-breaker used',
    'Total time (seconds)',
    'Median time per answer (seconds)',
    'Answers under the time threshold (%)',
    'Most-used letter',
    'Most-used letter share (%)',
    'Longest same-letter run',
    'Undos',
    'Rushed',
    'Straight-lined',
    'Pattern match',
    'Review',
    'Review note',
    'Counted in ECHO analytics',
    'Quiz ID',
  ];
  const yes = (b: boolean) => (b ? 'Yes' : 'No');
  const secs = (ms: number | null) => (ms == null ? null : Math.round(ms / 100) / 10);
  const rows = views.map((v): CsvValue[] => {
    const r = v.row;
    const m = v.a.metrics;
    return [
      localStamp(r.created_at),
      whoCell(r),
      r.user_id ? opts.nameOf(r.user_id) : '',
      ...(opts.emailOf ? [r.user_id ? opts.emailOf(r.user_id) : ''] : []),
      yes(v.staff),
      languageLabel(languageKey(r.locale)),
      ECHO_SOURCE_LABELS[r.source],
      r.primary_driver,
      r.secondary_driver ?? '',
      ...DRIVER_KEYS.map((k) => r.tally[k] ?? 0),
      r.answers == null ? '' : yes(r.tie_breaker != null),
      secs(r.total_ms),
      secs(m.medianMs),
      m.fastShare == null ? null : Math.round(m.fastShare * 100),
      m.maxLetter ?? '',
      m.maxLetterShare == null ? null : Math.round(m.maxLetterShare * 100),
      m.answered > 0 ? m.longestRun : null,
      r.undo_count,
      yes(v.a.flags.rushed),
      yes(v.a.flags.straightLined),
      yes(v.a.flags.pattern),
      REVIEW_LABELS[r.review_status],
      r.review_note ?? '',
      yes(isCounted(v, opts.options)),
      r.id,
    ];
  });
  return { header, rows };
}

/** One row per ANSWER (long format) — quizzes without answers add none. */
export function echoAnswersCsv(
  views: readonly EchoView[],
  opts: { nameOf: (userId: string) => string; options: EchoOptions },
): { header: string[]; rows: CsvValue[][] } {
  const header = [
    'Quiz ID',
    'Date and time',
    'Who',
    'Trainee',
    'Question',
    'Question text',
    'Letter',
    'Style it maps to',
    'Time (seconds)',
    'Quiz primary style',
    'Quiz flagged',
    'Counted in ECHO analytics',
  ];
  const prompts = new Map(QUIZ_QUESTIONS.map((q) => [q.id, q.prompt]));
  const rows: CsvValue[][] = [];
  for (const v of views) {
    const r = v.row;
    const all = [...mainAnswers(r), ...(r.tie_breaker ? [r.tie_breaker] : [])];
    for (const a of all) {
      rows.push([
        r.id,
        localStamp(r.created_at),
        whoCell(r),
        r.user_id ? opts.nameOf(r.user_id) : '',
        a.q === 16 ? 'Tie-breaker' : a.q,
        a.q === 16 ? 'Tie-breaker' : prompts.get(a.q) ?? '',
        a.letter,
        a.driver,
        Math.round(a.ms / 100) / 10,
        r.primary_driver,
        v.a.autoFlagged ? 'Yes' : 'No',
        isCounted(v, opts.options) ? 'Yes' : 'No',
      ]);
    }
  }
  return { header, rows };
}

// ─── The Skills tab's trainee style ────────────────────────────────────

/**
 * The trainee's ECHO style for the Skills matchup, from their LATEST quiz:
 * the account's for a signed-in session, the device's for an anonymous one
 * (matched by `device_key`). A latest quiz the quality rules leave out makes
 * the style "unknown" (null) — `excludedFlagged` says how many sessions that
 * hid. A signed-in trainee with no quiz row falls back to the profile's
 * stored style (`fallback`).
 */
export function traineeStyleResolver(
  quizzes: readonly EchoQuizRow[],
  opts: { thresholds: EchoThresholds; includeFlagged: boolean; fallback?: (userId: string) => string | null },
): (s: Pick<SessionSummary, 'user_id' | 'anon_session_id'>) => { driver: DriverKey | null; excluded: boolean } {
  const latestByUser = new Map<string, EchoQuizRow>();
  const latestByDevice = new Map<string, EchoQuizRow>();
  for (const q of quizzes) {
    const put = (m: Map<string, EchoQuizRow>, k: string) => {
      const cur = m.get(k);
      if (!cur || q.created_at > cur.created_at) m.set(k, q);
    };
    if (q.user_id) put(latestByUser, q.user_id);
    else if (q.device_key) put(latestByDevice, q.device_key);
  }
  const decide = (q: EchoQuizRow | undefined) => {
    if (!q) return null;
    const a = assessEchoQuiz(q, opts.thresholds);
    const out =
      q.review_status === 'exclude' || (q.review_status !== 'include' && !opts.includeFlagged && a.autoFlagged);
    return { driver: out ? null : asDriver(q.primary_driver), excluded: out };
  };
  return (s) => {
    if (s.user_id) {
      const d = decide(latestByUser.get(s.user_id));
      if (d) return d;
      return { driver: asDriver(opts.fallback?.(s.user_id) ?? null), excluded: false };
    }
    const key = deviceKey(s.anon_session_id);
    return decide(key ? latestByDevice.get(key) : undefined) ?? { driver: null, excluded: false };
  };
}
