/**
 * One `training_sessions` row → the `SessionSummary` the Analytics tabs read.
 *
 * Pure and dependency-free (beyond two other shared readers) so the server
 * derives it once per row and the tests pin every field. Everything is read
 * TOLERANTLY: `scenario`, `transcript` and `score_report` are jsonb written by
 * several generations of the app (full client scenarios, sanitized server
 * copies, three-field backfills, pre-Phase-2 score reports), so an unexpected
 * shape degrades the field it feeds to null / 0 — it never throws and never
 * invents a value.
 *
 * Imported by netlify/functions (admin-sessions, admin-analytics) — keep it
 * free of browser and Node APIs.
 */
import { isScoreUnavailable, type ScoreReport } from '../../services/types';
import { difficultyFromScenario } from '../scenarios/difficulty';
import {
  SKILL_KEYS,
  type OwnerMood,
  type ScenarioSource,
  type SessionSummary,
  type SkillScores,
} from './contract';

/** The `training_sessions` columns the summary reads (any may be missing or malformed). */
export type SessionRowLike = Record<string, unknown>;

/** Columns to select for `toSessionSummary` (the transcript is read, never returned). */
export const SESSION_SUMMARY_COLUMNS =
  'id, user_id, anon_session_id, locale, origin, scenario, scenario_summary, pushback_id, driver, model_id, transcript, score_report, score_overall, duration_seconds, mode, completed, ended_reason, turns, created_at';

/**
 * The LITE summary read (`admin-sessions?view=summary&lite=1`): scalar columns
 * plus only the jsonb paths the lifetime figures need — skills, overall,
 * failure markers, and the scenario's level / animal / source / objection.
 * No transcript and no full score report, which are most of a row's weight;
 * `fromLiteRow` rebuilds a row `toSessionSummary` can read. Transcript-derived
 * fields (owner mood, words, reply time) and sentiment / key moments come back
 * empty — the all-time roster and funnel never use them.
 */
export const SESSION_SUMMARY_LITE_COLUMNS = [
  'id, user_id, anon_session_id, locale, origin, created_at, completed, ended_reason, mode, duration_seconds, turns',
  'pushback_id, driver, model_id, scenario_summary, score_overall',
  'sr_acknowledge:score_report->acknowledge, sr_clarify:score_report->clarify',
  'sr_transform:score_report->transform, sr_empathy:score_report->empathy',
  'sr_rapport:score_report->rapport, sr_overall:score_report->overall, sr_band:score_report->band',
  'sr_unavailable:score_report->scoreUnavailable, sr_critique:score_report->critique, sr_recovered:score_report->recovered',
  'sc_difficulty:scenario->difficulty, sc_species:scenario->species, sc_override:scenario->_overrideId',
  'sc_pushback:scenario->pushback, sc_breed:scenario->breed, sc_persona:scenario->persona, sc_age:scenario->age',
].join(', ');

const LITE_REPORT_KEYS: Array<[string, string]> = [
  ['sr_acknowledge', 'acknowledge'],
  ['sr_clarify', 'clarify'],
  ['sr_transform', 'transform'],
  ['sr_empathy', 'empathy'],
  ['sr_rapport', 'rapport'],
  ['sr_overall', 'overall'],
  ['sr_band', 'band'],
  ['sr_unavailable', 'scoreUnavailable'],
  ['sr_critique', 'critique'],
  ['sr_recovered', 'recovered'],
];
const LITE_SCENARIO_KEYS: Array<[string, string]> = [
  ['sc_difficulty', 'difficulty'],
  ['sc_species', 'species'],
  ['sc_override', '_overrideId'],
  ['sc_pushback', 'pushback'],
  ['sc_breed', 'breed'],
  ['sc_persona', 'persona'],
  ['sc_age', 'age'],
];

/** Rebuild a `training_sessions`-shaped row from a lite read. */
export function fromLiteRow(row: unknown): Record<string, unknown> {
  const r: Record<string, unknown> = isObj(row) ? { ...row } : {};
  const report: Record<string, unknown> = {};
  for (const [alias, key] of LITE_REPORT_KEYS) {
    if (r[alias] !== undefined && r[alias] !== null) report[key] = r[alias];
    delete r[alias];
  }
  const scenario: Record<string, unknown> = {};
  for (const [alias, key] of LITE_SCENARIO_KEYS) {
    if (r[alias] !== undefined && r[alias] !== null) scenario[key] = r[alias];
    delete r[alias];
  }
  // Every path is null exactly when the column itself is null.
  r.score_report = Object.keys(report).length > 0 ? report : null;
  r.scenario = Object.keys(scenario).length > 0 ? scenario : null;
  r.transcript = [];
  return r;
}

/** A reply slower than this is a pause (phone call, coffee), not a reply time. */
export const MAX_REPLY_GAP_SECONDS = 600;

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** ms epoch from a number, a numeric string or an ISO string; null otherwise. */
function toMs(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * `isScoreUnavailable` assumes a well-formed report (it calls
 * `critique.startsWith`); a hand-edited or truncated jsonb must not take the
 * whole list down, so a report it can't read is treated as a real one.
 */
function safeUnavailable(report: Obj): boolean {
  try {
    return isScoreUnavailable(report as unknown as ScoreReport);
  } catch {
    return report.scoreUnavailable === true;
  }
}

/**
 * Whether a stored `score_report` is a scoring-FAILURE placeholder. No report
 * at all is not a failure (the session was never scored); a report of any
 * other shape is read tolerantly.
 */
export function scoreUnavailableOf(report: unknown): boolean {
  return isObj(report) && safeUnavailable(report);
}

/**
 * Did a scoring attempt FAIL for this session? Two shapes:
 *  - the old placeholder report (every dimension 0 / `scoreUnavailable`);
 *  - since scores became server-authoritative, NO report at all on a session
 *    the app finished and saved itself: `ai-evaluate` persists nothing when
 *    the scorer fails, and the app then saves the session as completed
 *    without one. Such a row has a `model_id` and the full scenario.
 * A session backfilled from the device at sign-up is ALSO completed with no
 * report — its local score is dropped on purpose (unverifiable) — but it has
 * no `model_id` and only a three-field scenario. That is not a failure.
 * One definition for every view (`admin-sessions` list / `?id=`, summaries).
 */
export function scoringFailedOf(row: unknown): boolean {
  if (!isObj(row)) return false;
  if (isObj(row.score_report)) return safeUnavailable(row.score_report);
  return (
    row.completed === true &&
    str(row.model_id) !== null &&
    isObj(row.scenario) &&
    isObj(row.scenario.pushback)
  );
}

/** Where the scenario came from, from its `_overrideId`. */
export function scenarioSourceOf(scenario: unknown): { source: ScenarioSource; id: string | null } {
  if (!isObj(scenario)) return { source: 'unknown', id: null };
  const id = str(scenario._overrideId);
  if (id) {
    if (id.startsWith('seed:')) return { source: 'library', id };
    if (id.startsWith('admin:')) return { source: 'studio', id };
    if (id.startsWith('user:')) return { source: 'self-built', id };
    return { source: 'unknown', id };
  }
  // No override id. A full client scenario (it carries the owner's life stage
  // or persona) was built on the Create screen and played without one; a
  // backfilled three-field summary can't say where it came from.
  const looksFull = isObj(scenario.pushback) && (str(scenario.age) !== null || str(scenario.persona) !== null);
  return { source: looksFull ? 'self-built' : 'unknown', id: null };
}

function skillsOf(report: Obj): SkillScores | null {
  const out = {} as SkillScores;
  for (const k of SKILL_KEYS) {
    const v = num(report[k]);
    if (v === null) return null;
    out[k] = v;
  }
  return out;
}

function ownerSentiment(report: Obj): { start: number | null; end: number | null } {
  const list = Array.isArray(report.turnSentiment) ? report.turnSentiment : [];
  const customer: Array<{ idx: number; s: number; order: number }> = [];
  list.forEach((entry, order) => {
    if (!isObj(entry) || entry.speaker !== 'customer') return;
    const s = num(entry.sentiment);
    if (s === null) return;
    const idx = num(entry.idx);
    customer.push({ idx: idx ?? order, s: Math.max(-1, Math.min(1, s)), order });
  });
  if (customer.length === 0) return { start: null, end: null };
  customer.sort((a, b) => a.idx - b.idx || a.order - b.order);
  return { start: customer[0].s, end: customer[customer.length - 1].s };
}

const MOODS: readonly OwnerMood[] = ['red', 'yellow', 'green'];

interface TranscriptStats {
  messages: number | null;
  staffMessages: number;
  staffWordsAvg: number | null;
  replyMedian: number | null;
  moodEnd: OwnerMood | null;
}

function transcriptStats(transcript: unknown, mode: SessionSummary['mode']): TranscriptStats {
  if (!Array.isArray(transcript)) {
    return { messages: null, staffMessages: 0, staffWordsAvg: null, replyMedian: null, moodEnd: null };
  }
  // A transient error bubble was never part of the conversation.
  const msgs = transcript.filter((m): m is Obj => isObj(m) && m._transientError !== true);
  let staff = 0;
  let words = 0;
  let moodEnd: OwnerMood | null = null;
  const gaps: number[] = [];
  let prev: Obj | null = null;
  for (const m of msgs) {
    if (m.role === 'user') {
      staff += 1;
      if (typeof m.text === 'string') words += m.text.trim().split(/\s+/).filter(Boolean).length;
      if (prev && prev.role === 'ai') {
        const a = toMs(prev.timestamp);
        const u = toMs(m.timestamp);
        if (a !== null && u !== null) {
          const gap = (u - a) / 1000;
          if (gap >= 0 && gap <= MAX_REPLY_GAP_SECONDS) gaps.push(gap);
        }
      }
    } else if (m.role === 'ai') {
      if (typeof m.emotion === 'string' && (MOODS as readonly string[]).includes(m.emotion)) {
        moodEnd = m.emotion as OwnerMood;
      }
    }
    prev = m;
  }
  const med = mode === 'voice' ? null : median(gaps);
  return {
    messages: msgs.length,
    staffMessages: staff,
    staffWordsAvg: staff > 0 ? round1(words / staff) : null,
    replyMedian: med === null ? null : round1(med),
    moodEnd,
  };
}

export interface SessionSummaryOptions {
  /**
   * Coach hints per session id (from `coach_hint_request` events). Absent =
   * the caller couldn't read them → `hints_used: null`; present but missing
   * the id → a real 0.
   */
  hintsBySession?: Map<string, number>;
}

export function toSessionSummary(row: SessionRowLike, options: SessionSummaryOptions = {}): SessionSummary {
  const r: Obj = isObj(row) ? row : {};
  const id = str(r.id) ?? (typeof r.id === 'number' ? String(r.id) : '');
  const scenario = isObj(r.scenario) ? r.scenario : null;
  const pushback = scenario && isObj(scenario.pushback) ? scenario.pushback : null;

  const createdMs = toMs(r.created_at);
  const created_at = typeof r.created_at === 'string' ? r.created_at : createdMs !== null ? new Date(createdMs).toISOString() : '';
  const durationRaw = num(r.duration_seconds);
  const duration_seconds = durationRaw !== null && durationRaw >= 0 ? durationRaw : null;
  const started_at =
    createdMs !== null && duration_seconds !== null ? new Date(createdMs - duration_seconds * 1000).toISOString() : null;

  const mode: SessionSummary['mode'] = r.mode === 'text' || r.mode === 'voice' ? r.mode : null;

  const report = isObj(r.score_report) ? r.score_report : null;
  const unavailable = scoringFailedOf(r);
  const scored = report !== null && !unavailable ? report : null;

  let score_overall: number | null = null;
  if (scored) score_overall = num(r.score_overall) ?? num(scored.overall);

  const sentiment = scored ? ownerSentiment(scored) : { start: null, end: null };
  const moments = scored && Array.isArray(scored.keyMoments) ? scored.keyMoments : [];
  const stats = transcriptStats(r.transcript, mode);
  const { source, id: scenarioId } = scenarioSourceOf(scenario);
  const turnsCol = num(r.turns);
  const reconstructed = r.origin === 'reconstructed';
  // A rebuilt row's transcript is an empty placeholder: its message count is
  // the logged one (when the app logged it) or unknown — never "0 messages".
  const turns =
    turnsCol !== null && turnsCol >= 0 ? turnsCol : reconstructed ? null : stats.messages;

  return {
    id,
    user_id: str(r.user_id),
    anon_session_id: str(r.user_id) ? null : str(r.anon_session_id),
    locale: str(r.locale),
    reconstructed,
    recovered: isObj(r.score_report) && isObj((r.score_report as Obj).recovered),
    created_at,
    started_at,
    completed: r.completed === true,
    ended_reason: str(r.ended_reason),
    mode,
    duration_seconds,
    turns,
    pushback_id: str(r.pushback_id) ?? (pushback ? str(pushback.id) : null),
    owner_driver: str(r.driver) ?? (scenario ? str(scenario.suggestedDriver) : null),
    scenario_summary: str(r.scenario_summary),
    scenario_title: (scenario ? str(scenario.title) : null) ?? (pushback ? str(pushback.title) : null),
    objection_title: pushback ? str(pushback.title) : null,
    scenario_source: source,
    scenario_id: scenarioId,
    difficulty: difficultyFromScenario(scenario),
    species: scenario?.species === 'cat' ? 'cat' : 'dog',
    breed: scenario ? str(scenario.breed) : null,
    persona: scenario ? str(scenario.persona) : null,
    score_overall,
    score_unavailable: unavailable,
    skills: scored ? skillsOf(scored) : null,
    band: scored ? str(scored.band) : null,
    owner_sentiment_start: sentiment.start,
    owner_sentiment_end: sentiment.end,
    owner_mood_end: stats.moodEnd,
    staff_messages: stats.staffMessages,
    staff_words_avg: stats.staffWordsAvg,
    reply_seconds_median: stats.replyMedian,
    hints_used: options.hintsBySession ? (options.hintsBySession.get(id) ?? 0) : null,
    key_wins: moments.filter((m) => isObj(m) && m.type === 'win').length,
    key_misses: moments.filter((m) => isObj(m) && m.type === 'miss').length,
  };
}

/**
 * Coach-hint requests per session id, from `coach_hint_request` nav events
 * (`meta.sessionId`). Rows of any other shape are ignored.
 */
export function countHintsBySession(rows: ReadonlyArray<{ meta?: unknown }>): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const meta = isObj(row) && isObj(row.meta) ? row.meta : null;
    const sid = meta ? str(meta.sessionId) : null;
    if (!sid) continue;
    out.set(sid, (out.get(sid) ?? 0) + 1);
  }
  return out;
}
