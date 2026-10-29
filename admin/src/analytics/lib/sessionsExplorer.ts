/**
 * The Sessions tab's explorer logic — outcome chips, filters, search, sort
 * and the CSV export — kept pure so every rule is unit-tested
 * (`__tests__/sessionsExplorer.test.ts`) and the tab only draws.
 *
 * Definitions match `metrics.ts` (the one place "finished" and "scored" are
 * decided): a session FINISHED when `completed`; it has a real score only
 * when `isScored`. A failed scoring attempt is a finished session with no
 * score — it is never shown or exported as a 0.
 *
 * Anonymous sessions (no account) are listed like any other; they are named
 * "Anonymous · Device 4F2A" (`./who.ts`), never as a trainee. A session that
 * didn't finish and recorded no reason reads "Ending not recorded" — never
 * "Left early".
 */
import { objectionLabel } from './objectionNames';
import type { OwnerMood, ScenarioSource, SessionSummary } from '../../../../src/shared/analytics/contract';
import { ENDED_REASON_LABELS, MODE_LABELS, humanize, labelOf } from '../../lib/labels';
import { difficultyLabel } from '../../lib/difficulty';
import { SCENARIO_SOURCE_LABELS, SKILL_KEYS, SKILL_LABELS, endingUnknown, isScored, leftEarly } from './metrics';
import type { CsvValue } from './csv';
import {
  REBUILT_TAG,
  RECOVERED_TAG,
  anonymousName,
  deviceLabel,
  languageKey,
  matchesWho,
  sessionLanguage,
  speciesOf,
  type WhoFilter,
} from './who';

/** Re-exported for the tabs that import it from here; defined once in `period.ts`. */
export { inWindowWords } from './period';

// ─── Outcomes ──────────────────────────────────────────────────────────

/** Below this a scored session counts as a low score (the "Needs work" band). */
export const LOW_SCORE = 55;

export type OutcomeFilter = 'all' | 'finished' | 'left' | 'unknown' | 'failed' | 'low';

export const OUTCOME_FILTERS: readonly OutcomeFilter[] = ['all', 'finished', 'left', 'unknown', 'failed', 'low'];

export const OUTCOME_FILTER_LABELS: Record<OutcomeFilter, string> = {
  all: 'All',
  finished: 'Finished',
  left: 'Left early',
  unknown: 'Ending not recorded',
  failed: 'Scoring failed',
  low: `Low score (under ${LOW_SCORE})`,
};

/** What happened to one session, as its row pill says it. */
export type SessionOutcome = 'finished' | 'left' | 'unknown' | 'failed';

export function sessionOutcome(s: SessionSummary): SessionOutcome {
  if (!s.completed) return endingUnknown(s) ? 'unknown' : 'left';
  return s.score_unavailable ? 'failed' : 'finished';
}

/** Tooltip for "Ending not recorded". */
export const ENDING_UNKNOWN_HELP =
  'It didn’t reach the scorecard, and the app recorded no reason — it may have been closed or left in the background.';

/**
 * The words on a row's outcome: "Finished", "Scoring failed", why the
 * session ended early ("Left early", "Timed out", "Ended by an error"), or
 * "Ending not recorded" when nothing says how it ended.
 */
export function outcomeWords(s: SessionSummary): string {
  const o = sessionOutcome(s);
  if (o === 'finished') return 'Finished';
  if (o === 'failed') return 'Scoring failed';
  if (o === 'unknown') return 'Ending not recorded';
  // A row that says `completed` as its reason but isn't completed is still early.
  if (s.ended_reason === 'completed') return 'Left early';
  return labelOf(ENDED_REASON_LABELS, s.ended_reason, 'Left early');
}

export function matchesOutcome(s: SessionSummary, f: OutcomeFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'finished':
      return s.completed;
    case 'left':
      return leftEarly(s);
    case 'unknown':
      return endingUnknown(s);
    case 'failed':
      return s.completed && s.score_unavailable;
    case 'low':
      return isScored(s) && (s.score_overall as number) < LOW_SCORE;
  }
}

/**
 * Count per outcome chip. Finished + Left early + Ending not recorded = All;
 * the last two chips are subsets of Finished.
 */
export function outcomeCounts(rows: readonly SessionSummary[]): Record<OutcomeFilter, number> {
  const out: Record<OutcomeFilter, number> = { all: 0, finished: 0, left: 0, unknown: 0, failed: 0, low: 0 };
  for (const s of rows) for (const f of OUTCOME_FILTERS) if (matchesOutcome(s, f)) out[f]++;
  return out;
}

// ─── Words for raw values ──────────────────────────────────────────────

/** How the AI owner felt by the end of the conversation (its last message). */
export const OWNER_ENDING_LABELS: Record<OwnerMood, string> = {
  green: 'Won over',
  yellow: 'Undecided',
  red: 'Still upset',
};

/** Where the scenario came from (`SCENARIO_SOURCE_LABELS` in `metrics.ts`), short enough for a table row's muted line. */
export const SOURCE_SHORT: Record<ScenarioSource, string> = {
  library: 'Built-in',
  studio: 'Studio',
  'self-built': 'Self-built',
  unknown: '',
};

export const SPECIES_LABELS: Record<'dog' | 'cat', string> = { dog: 'Dog', cat: 'Cat' };

/** The scenario as a person reads it: its title, else its summary, else its objection. */
export function sessionTitle(s: SessionSummary): string {
  return (
    s.scenario_title?.trim() ||
    s.scenario_summary?.trim() ||
    objectionLabel(s.pushback_id, 'Practice session')
  );
}

/**
 * The objection, when the title doesn't already say it. A Studio scenario is
 * titled by its card ("Senior lab, cost-sensitive owner"), so its objection
 * is worth a second line; a library or self-built scenario's title IS the
 * objection, and repeating it is noise.
 */
export function objectionIfDifferent(s: SessionSummary): string | null {
  if (!s.pushback_id) return null;
  const label = objectionLabel(s.pushback_id);
  const title = sessionTitle(s).trim().toLowerCase();
  const l = label.trim().toLowerCase();
  if (!l || title === l || title.includes(l)) return null;
  // The stored objection title can differ from the portal's label for the same id.
  const stored = s.scenario_title?.trim().toLowerCase();
  if (stored && s.scenario_source !== 'studio' && stored === title) return null;
  return label;
}

/** "Dog · Labrador Retriever · Skeptical owner · Built-in" (a rebuilt session stored none of it). */
export function scenarioContext(s: SessionSummary): string {
  const species = speciesOf(s);
  return [
    species ? SPECIES_LABELS[species] : null,
    s.breed?.trim() || null,
    s.persona?.trim() ? `${s.persona.trim()} owner` : null,
    SOURCE_SHORT[s.scenario_source] || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** "4m 12s" — a session's length. */
export function fmtLength(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

// ─── Filters ───────────────────────────────────────────────────────────

export interface SessionFilters {
  outcome: OutcomeFilter;
  /** Signed-in trainees, anonymous sessions, or both. */
  who: WhoFilter;
  /** 'all', a language key ('en', 'fr') or 'none' (not recorded). */
  language: string;
  mode: 'all' | 'text' | 'voice';
  /** 'all' or a level 1–4, as a string (it comes from a <select>). */
  difficulty: string;
  /** 'all' or a pushback id. */
  objection: string;
  species: 'all' | 'dog' | 'cat';
  source: 'all' | ScenarioSource;
}

export const NO_FILTERS: SessionFilters = {
  outcome: 'all',
  who: 'all',
  language: 'all',
  mode: 'all',
  difficulty: 'all',
  objection: 'all',
  species: 'all',
  source: 'all',
};

export function activeFilterCount(f: SessionFilters): number {
  return (Object.keys(NO_FILTERS) as Array<keyof SessionFilters>).filter((k) => f[k] !== NO_FILTERS[k]).length;
}

/**
 * Filters another tab asks the Sessions tab to open with ("see Sessions →
 * Who: Anonymous"). Read once when the tab mounts (`sessionFilterPreset`),
 * then cleared (`clearSessionFilterPreset`) so a later visit starts clean.
 */
let preset: Partial<SessionFilters> | null = null;

export function presetSessionFilters(f: Partial<SessionFilters>): void {
  preset = { ...f };
}

/** The filters the Sessions tab should start from (no filters unless another tab asked). */
export function sessionFilterPreset(): SessionFilters {
  return { ...NO_FILTERS, ...(preset ?? {}) };
}

export function clearSessionFilterPreset(): void {
  preset = null;
}

/** Every filter but the outcome chip — the chips count within these. */
export function matchesSelects(s: SessionSummary, f: SessionFilters): boolean {
  if (!matchesWho(s, f.who)) return false;
  if (f.language !== 'all' && languageKey(s.locale) !== f.language) return false;
  if (f.mode !== 'all' && s.mode !== f.mode) return false;
  if (f.difficulty !== 'all' && String(s.difficulty ?? '') !== f.difficulty) return false;
  if (f.objection !== 'all' && (s.pushback_id ?? '') !== f.objection) return false;
  // A rebuilt session's animal was never stored: it matches neither Dog nor Cat.
  if (f.species !== 'all' && speciesOf(s) !== f.species) return false;
  if (f.source !== 'all' && s.scenario_source !== f.source) return false;
  return true;
}

/**
 * Who a session belongs to, as a name: the trainee's, or "Anonymous ·
 * Device 4F2A" — never a lookup with no account behind it.
 */
export function whoName(s: SessionSummary, nameOf: (userId: string) => string): string {
  return s.user_id ? nameOf(s.user_id) : anonymousName(s.anon_session_id);
}

/** Everything a search box should find a session by, lower-cased. */
export function searchText(s: SessionSummary, traineeName: string): string {
  const species = speciesOf(s);
  return [
    traineeName,
    s.user_id ? null : 'anonymous no account',
    s.locale ? sessionLanguage(s) : null,
    s.reconstructed ? `${REBUILT_TAG} rebuilt from app activity` : null,
    s.recovered ? `${RECOVERED_TAG} recovered interrupted` : null,
    s.scenario_title,
    s.scenario_summary,
    s.pushback_id ? objectionLabel(s.pushback_id) : null,
    s.breed,
    s.persona,
    s.difficulty != null ? difficultyLabel(s.difficulty) : null,
    species ? SPECIES_LABELS[species] : null,
    s.scenario_source !== 'unknown' ? SCENARIO_SOURCE_LABELS[s.scenario_source] : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Every word of the query must appear somewhere ("cat hostile" narrows, not widens). */
export function matchesQuery(s: SessionSummary, traineeName: string, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = searchText(s, traineeName);
  return terms.every((t) => hay.includes(t));
}

/**
 * Rows the table shows, and the rows the outcome chips count over (every
 * filter applied except the chip itself, so a chip's count is what you'd get
 * by clicking it).
 */
export function filterSessions(
  rows: readonly SessionSummary[],
  f: SessionFilters,
  query: string,
  nameOf: (userId: string) => string,
): { rows: SessionSummary[]; chipBase: SessionSummary[] } {
  const chipBase = rows.filter((s) => matchesSelects(s, f) && matchesQuery(s, whoName(s, nameOf), query));
  return { rows: chipBase.filter((s) => matchesOutcome(s, f.outcome)), chipBase };
}

/** The objections present in the data, as select options, by label. */
export function objectionOptions(rows: readonly SessionSummary[]): Array<{ value: string; label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const s of rows) if (s.pushback_id) counts.set(s.pushback_id, (counts.get(s.pushback_id) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: objectionLabel(value), count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ─── Sort ──────────────────────────────────────────────────────────────

export type SortKey = 'when' | 'score' | 'length';
export type SortDir = 'asc' | 'desc';

function sortValue(s: SessionSummary, key: SortKey): number | null {
  switch (key) {
    case 'when':
      return new Date(s.created_at).getTime();
    case 'score':
      return isScored(s) ? (s.score_overall as number) : null;
    case 'length':
      return s.duration_seconds != null && s.duration_seconds > 0 ? s.duration_seconds : null;
  }
}

/** A sorted copy. Rows with no value (unscored, no length) go last either way; ties newest first. */
export function sortSessions(rows: readonly SessionSummary[], key: SortKey, dir: SortDir): SessionSummary[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
    if (va != null && vb != null && va !== vb) return (va - vb) * sign;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// ─── Export ────────────────────────────────────────────────────────────

/** "2026-10-10 15:04" in the reader's time zone — what a spreadsheet sorts on. */
export function localStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * The filtered sessions as a spreadsheet: plain-English headers, words not
 * ids, a blank score when there is no real one (never a stand-in 0), and the
 * five skills. `emailOf` adds an Email column — pass it only when the caller
 * may see emails. An anonymous session's "Who" carries the short device tag
 * and nothing more (no device id, no name, no email).
 */
export function sessionsCsv(
  rows: readonly SessionSummary[],
  opts: { nameOf: (userId: string) => string; emailOf?: (userId: string) => string | null },
): { header: string[]; rows: CsvValue[][] } {
  const header = [
    'Date and time',
    'Who',
    'Trainee',
    ...(opts.emailOf ? ['Email'] : []),
    'Language',
    'Recorded as',
    'Scenario',
    'Objection',
    'Animal',
    'Breed',
    'Owner persona',
    'Owner communication style',
    'Scenario source',
    'Difficulty',
    'Mode',
    'Outcome',
    'Length (minutes)',
    'Messages',
    'Coach hints used',
    'Median reply time (seconds)',
    'Words per reply',
    'Owner by the end',
    'Score',
    ...SKILL_KEYS.map((k) => SKILL_LABELS[k]),
    'Session ID',
  ];
  const out = rows.map((s): CsvValue[] => {
    const scored = isScored(s);
    const species = speciesOf(s);
    return [
      localStamp(s.created_at),
      s.user_id ? 'Signed-in trainee' : `Anonymous · ${deviceLabel(s.anon_session_id)}`,
      s.user_id ? opts.nameOf(s.user_id) : '',
      ...(opts.emailOf ? [s.user_id ? opts.emailOf(s.user_id) : ''] : []),
      sessionLanguage(s),
      s.reconstructed ? 'Rebuilt from app activity' : 'Saved by the app',
      sessionTitle(s),
      s.pushback_id ? objectionLabel(s.pushback_id) : '',
      species ? SPECIES_LABELS[species] : '',
      s.breed ?? '',
      s.persona ?? '',
      s.owner_driver ? humanize(s.owner_driver) : '',
      SCENARIO_SOURCE_LABELS[s.scenario_source],
      s.difficulty != null ? difficultyLabel(s.difficulty) : '',
      s.mode ? labelOf(MODE_LABELS, s.mode) : '',
      outcomeWords(s),
      s.duration_seconds != null && s.duration_seconds > 0 ? Math.round((s.duration_seconds / 60) * 10) / 10 : null,
      s.turns,
      s.hints_used,
      s.reply_seconds_median,
      s.staff_words_avg,
      s.owner_mood_end ? OWNER_ENDING_LABELS[s.owner_mood_end] : '',
      scored ? s.score_overall : null,
      ...SKILL_KEYS.map((k) => (scored && s.skills ? s.skills[k] : null)),
      s.id,
    ];
  });
  return { header, rows: out };
}
