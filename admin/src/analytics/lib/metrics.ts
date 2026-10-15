/**
 * Training metrics over session summaries — the ONE place every Analytics tab
 * gets its numbers from, so the Overview, a trainee's profile and the Skills
 * tab can never disagree about what "average score" means.
 *
 * Rules that hold everywhere:
 *   - A score is only real when the session finished, was scored, and the
 *     scoring didn't fail (`isScored`). A failed scoring attempt is stored as
 *     a stand-in 0; counting it would invent a terrible session.
 *   - "Finished" = `completed`. Everything else didn't finish: it LEFT EARLY
 *     when the app recorded why, and its ending is NOT RECORDED when it
 *     didn't (an anonymous session rebuilt from app activity whose end was
 *     never seen — `endingUnknown`).
 *   - People are signed-in trainees (`user_id`). An anonymous session counts
 *     as a session — and its score in every average — but never as a
 *     trainee; anonymous DEVICES are counted on their own (`./who.ts`).
 *   - Difficulty is context beside a score, never a weight on it.
 *
 * Pure; dates come in through `now` so everything is unit-tested.
 */
import type { ScenarioSource, SessionSummary, SkillKey, SkillScores } from '../../../../src/shared/analytics/contract';
import { SKILL_KEYS } from '../../../../src/shared/analytics/contract';
import { bucketIndex, buckets, mean, median, pct, type Range } from './period';
import { anonymousDevices, signedInTrainees } from './who';

export { SKILL_KEYS };
export type { SkillKey, SkillScores };

/**
 * Where a session's scenario came from — the ONE set of words the Sessions
 * filter and table, the CSV export, the Skills split and the session modal
 * all use.
 */
export const SCENARIO_SOURCE_LABELS: Record<ScenarioSource, string> = {
  library: 'Built-in library',
  studio: 'Scenario Studio',
  'self-built': 'Built by the trainee',
  unknown: 'Not recorded',
};

/** One line on each source, for tooltips. */
export const SCENARIO_SOURCE_HINTS: Record<ScenarioSource, string> = {
  library: 'The ready-made scenarios that ship with the app',
  studio: 'Published by your team from the Scenario Studio',
  'self-built': 'Made on the trainee’s own Build screen',
  unknown: 'Older sessions that didn’t store it',
};

export const SKILL_LABELS: Record<SkillKey, string> = {
  acknowledge: 'Acknowledge',
  clarify: 'Clarify',
  transform: 'Transform',
  empathy: 'Empathy',
  rapport: 'Rapport',
};

/** One line on what each skill means, for tooltips and coaching notes. */
export const SKILL_HINTS: Record<SkillKey, string> = {
  acknowledge: 'naming the owner’s concern before answering it',
  clarify: 'asking questions that surface the real worry',
  transform: 'turning the concern into a credible next step',
  empathy: 'warmth and validation in tone',
  rapport: 'keeping the owner on side through the conversation',
};

export function isScored(s: SessionSummary): boolean {
  return s.completed && !s.score_unavailable && s.score_overall != null && Number.isFinite(s.score_overall);
}

/**
 * Didn't finish, and nothing says how it ended — no reason was recorded (a
 * rebuilt anonymous session that never reached the scorecard and was never
 * seen leaving). Shown as "Ending not recorded", never as "Left early".
 */
export function endingUnknown(s: SessionSummary): boolean {
  return !s.completed && !s.ended_reason;
}

/** Didn't finish, and the app recorded why (left, timed out, an error). */
export function leftEarly(s: SessionSummary): boolean {
  return !s.completed && !endingUnknown(s);
}

export function sessionTime(s: SessionSummary): number {
  return new Date(s.started_at ?? s.created_at).getTime();
}

// ─── Headline summary ──────────────────────────────────────────────────

export interface SessionStats {
  sessions: number;
  finished: number;
  /** Didn't finish, with a recorded reason. */
  leftEarly: number;
  /** Didn't finish, and how it ended wasn't recorded (rebuilt anonymous sessions). */
  endingUnknown: number;
  scored: number;
  /** Finished but the scorer failed — excluded from every average. */
  scoringFailed: number;
  avgScore: number | null;
  /** 0–100. */
  finishRate: number | null;
  /** Distinct SIGNED-IN trainees — an anonymous session is never a person. */
  activeTrainees: number;
  /** Sessions played without an account. */
  anonSessions: number;
  /** Distinct anonymous devices behind them. */
  anonDevices: number;
  /** Anonymous sessions rebuilt from app activity (no transcript, no score). */
  rebuilt: number;
  medianMinutes: number | null;
  /** Total practice time, seconds. */
  practiceSeconds: number;
  voiceSessions: number;
  hintsUsed: number;
  /** Finished sessions whose AI owner ended on a green mood (0–100). */
  resolvedRate: number | null;
  /** Share of scored sessions at 70+ (0–100). */
  passRate: number | null;
}

export function sessionStats(rows: readonly SessionSummary[]): SessionStats {
  const finished = rows.filter((s) => s.completed);
  const scored = rows.filter(isScored);
  const withMood = finished.filter((s) => s.owner_mood_end != null);
  const durations = rows.map((s) => s.duration_seconds).filter((d): d is number => d != null && d > 0);
  return {
    sessions: rows.length,
    finished: finished.length,
    leftEarly: rows.filter(leftEarly).length,
    endingUnknown: rows.filter(endingUnknown).length,
    scored: scored.length,
    scoringFailed: finished.filter((s) => s.score_unavailable).length,
    avgScore: mean(scored.map((s) => s.score_overall as number)),
    finishRate: pct(finished.length, rows.length),
    activeTrainees: signedInTrainees(rows),
    anonSessions: rows.filter((s) => !s.user_id).length,
    anonDevices: anonymousDevices(rows),
    rebuilt: rows.filter((s) => s.reconstructed).length,
    medianMinutes: (() => {
      const m = median(durations);
      return m == null ? null : m / 60;
    })(),
    practiceSeconds: durations.reduce((a, d) => a + d, 0),
    voiceSessions: rows.filter((s) => s.mode === 'voice').length,
    hintsUsed: rows.reduce((a, s) => a + (s.hints_used ?? 0), 0),
    resolvedRate: pct(withMood.filter((s) => s.owner_mood_end === 'green').length, withMood.length),
    passRate: pct(scored.filter((s) => (s.score_overall as number) >= 70).length, scored.length),
  };
}

// ─── Skills ────────────────────────────────────────────────────────────

export interface SkillAverages {
  /** Mean per skill; null when no session carried it. */
  avg: Record<SkillKey, number | null>;
  /** Sessions that contributed. */
  count: number;
}

export function skillAverages(rows: readonly SessionSummary[]): SkillAverages {
  const withSkills = rows.filter((s) => isScored(s) && s.skills != null);
  const avg = {} as Record<SkillKey, number | null>;
  for (const k of SKILL_KEYS) avg[k] = mean(withSkills.map((s) => (s.skills as SkillScores)[k]));
  return { avg, count: withSkills.length };
}

/** The lowest / highest skill, ignoring skills with no data. */
export function extremeSkill(avg: Record<SkillKey, number | null>, which: 'weakest' | 'strongest'): SkillKey | null {
  let best: SkillKey | null = null;
  for (const k of SKILL_KEYS) {
    const v = avg[k];
    if (v == null) continue;
    if (best == null) best = k;
    else if (which === 'weakest' ? v < (avg[best] as number) : v > (avg[best] as number)) best = k;
  }
  return best;
}

// ─── Trend ─────────────────────────────────────────────────────────────

export interface TrendPoint {
  start: number;
  label: string;
  sessions: number;
  finished: number;
  /** Didn't finish, with a recorded reason. */
  leftEarly: number;
  /** Didn't finish, ending not recorded (rebuilt anonymous sessions). */
  endingUnknown: number;
  /** Distinct signed-in trainees. */
  trainees: number;
  /** Distinct anonymous devices. */
  devices: number;
  avgScore: number | null;
}

/** Per-bucket activity and average score across the current window. */
export function sessionTrend(
  rows: readonly SessionSummary[],
  range: Range,
  now = Date.now(),
): { granularity: 'hour' | 'day' | 'week'; points: TrendPoint[] } {
  const { granularity, list } = buckets(range, now);
  const acc = list.map(() => ({
    sessions: 0,
    finished: 0,
    unknown: 0,
    scores: [] as number[],
    users: new Set<string>(),
    devices: new Set<string>(),
  }));
  for (const s of rows) {
    const i = bucketIndex(list, sessionTime(s));
    if (i < 0) continue;
    acc[i].sessions++;
    if (s.completed) acc[i].finished++;
    else if (endingUnknown(s)) acc[i].unknown++;
    if (isScored(s)) acc[i].scores.push(s.score_overall as number);
    if (s.user_id) acc[i].users.add(s.user_id);
    else if (s.anon_session_id) acc[i].devices.add(s.anon_session_id);
  }
  return {
    granularity,
    points: list.map((b, i) => ({
      start: b.start,
      label: b.label,
      sessions: acc[i].sessions,
      finished: acc[i].finished,
      leftEarly: acc[i].sessions - acc[i].finished - acc[i].unknown,
      endingUnknown: acc[i].unknown,
      trainees: acc[i].users.size,
      devices: acc[i].devices.size,
      avgScore: mean(acc[i].scores),
    })),
  };
}

// ─── Breakdowns ────────────────────────────────────────────────────────

export interface GroupStats {
  key: string;
  sessions: number;
  scored: number;
  avgScore: number | null;
  finishRate: number | null;
  skills: Record<SkillKey, number | null>;
  trainees: number;
  lastAt: number | null;
}

/** Group sessions by any key (objection, difficulty, species, owner driver…). */
export function groupStats(
  rows: readonly SessionSummary[],
  keyOf: (s: SessionSummary) => string | null,
): GroupStats[] {
  const groups = new Map<string, SessionSummary[]>();
  for (const s of rows) {
    const k = keyOf(s);
    if (k == null) continue;
    const list = groups.get(k);
    if (list) list.push(s);
    else groups.set(k, [s]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const st = sessionStats(list);
      return {
        key,
        sessions: list.length,
        scored: st.scored,
        avgScore: st.avgScore,
        finishRate: st.finishRate,
        skills: skillAverages(list).avg,
        trainees: st.activeTrainees,
        lastAt: Math.max(...list.map(sessionTime)),
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

/** Sessions by local weekday (0 = Sun) × hour — when the team practises. */
export function practiceClock(rows: readonly SessionSummary[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const s of rows) {
    const d = new Date(sessionTime(s));
    if (Number.isNaN(d.getTime())) continue;
    grid[d.getDay()][d.getHours()]++;
  }
  return grid;
}

/**
 * Trainee's ECHO driver × AI owner's driver → average score. Shows which
 * communication-style pairings the team finds hard (an Analyzer trainee
 * facing an Activator owner, say).
 */
export function driverMatchup(
  rows: readonly SessionSummary[],
  traineeDriverOf: (userId: string) => string | null,
): Map<string, { avgScore: number | null; scored: number }> {
  const acc = new Map<string, number[]>();
  for (const s of rows) {
    // An anonymous session has no trainee, so no trainee style to pair.
    if (!isScored(s) || !s.owner_driver || !s.user_id) continue;
    const td = traineeDriverOf(s.user_id);
    if (!td) continue;
    const k = `${td}|${s.owner_driver}`;
    const list = acc.get(k);
    if (list) list.push(s.score_overall as number);
    else acc.set(k, [s.score_overall as number]);
  }
  const out = new Map<string, { avgScore: number | null; scored: number }>();
  for (const [k, list] of acc) out.set(k, { avgScore: mean(list), scored: list.length });
  return out;
}

/** Score distribution in 10-point bins (0–9 … 90–100). */
export function scoreHistogram(rows: readonly SessionSummary[]): number[] {
  const bins = Array.from({ length: 10 }, () => 0);
  for (const s of rows) {
    if (!isScored(s)) continue;
    const v = Math.max(0, Math.min(100, s.score_overall as number));
    bins[Math.min(9, Math.floor(v / 10))]++;
  }
  return bins;
}
