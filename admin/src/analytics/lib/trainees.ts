/**
 * Per-trainee analytics — the roster on the Trainees tab and the numbers at
 * the top of a trainee's profile.
 *
 * Built from the trainee directory (who exists) and ALL their sessions (so
 * a status like "hasn't practised in three weeks" is true regardless of the
 * date range on screen). Window-specific figures take the window's rows.
 *
 * Pure and clock-injectable; unit-tested in `__tests__/trainees.test.ts`.
 */
import type {
  EngagementPerUser,
  SessionSummary,
  TraineeDirectoryEntry,
} from '../../../../src/shared/analytics/contract';
import { DAY_MS, dayKey, mean } from './period';
import {
  SKILL_HINTS,
  SKILL_LABELS,
  extremeSkill,
  groupStats,
  isScored,
  sessionTime,
  skillAverages,
  type SkillKey,
} from './metrics';

/**
 * Where a trainee is in their practice habit:
 *   active      practised in the last 7 days
 *   at_risk     last practised 8–21 days ago — the moment a nudge still works
 *   dormant     nothing for over 21 days
 *   not_started has an account, never finished or started a session
 */
export type TraineeStatus = 'active' | 'at_risk' | 'dormant' | 'not_started';

export const STATUS_LABELS: Record<TraineeStatus, string> = {
  active: 'Active',
  at_risk: 'At risk',
  dormant: 'Dormant',
  not_started: 'Not started',
};

export const STATUS_HELP: Record<TraineeStatus, string> = {
  active: 'Practised in the last 7 days',
  at_risk: 'Last practised 8–21 days ago',
  dormant: 'No practice for over 21 days',
  not_started: 'Has an account but hasn’t practised yet',
};

const ACTIVE_DAYS = 7;
const AT_RISK_DAYS = 21;
/** Joined within this many days = "New". */
export const NEW_DAYS = 14;

export function traineeStatus(lastSessionAt: number | null, now = Date.now()): TraineeStatus {
  if (lastSessionAt == null) return 'not_started';
  const days = (now - lastSessionAt) / DAY_MS;
  if (days <= ACTIVE_DAYS) return 'active';
  if (days <= AT_RISK_DAYS) return 'at_risk';
  return 'dormant';
}

/**
 * Practice streaks over local calendar days with at least one session.
 * `current` counts back from today, or from yesterday when today has no
 * session yet (a streak isn't broken until the day is over).
 */
export function streaks(times: readonly number[], now = Date.now()): { current: number; best: number; days: number } {
  const days = new Set(times.filter((t) => Number.isFinite(t)).map(dayKey));
  if (days.size === 0) return { current: 0, best: 0, days: 0 };
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00`).getTime();
    const cur = new Date(`${sorted[i]}T12:00:00`).getTime();
    run = Math.round((cur - prev) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  let current = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor.getTime()))) {
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, best, days: days.size };
}

/**
 * Score movement: the mean of the trainee's latest `n` scored sessions minus
 * the mean of the `n` before them. Needs at least 2 + 2 to say anything.
 */
export function scoreMomentum(scoredNewestFirst: readonly SessionSummary[], n = 5): number | null {
  const recent = scoredNewestFirst.slice(0, n).map((s) => s.score_overall as number);
  const earlier = scoredNewestFirst.slice(n, n * 2).map((s) => s.score_overall as number);
  if (recent.length < 2 || earlier.length < 2) return null;
  return (mean(recent) as number) - (mean(earlier) as number);
}

export interface TraineeRow {
  user_id: string;
  name: string;
  email: string | null;
  driver: string | null;
  admin_role: string | null;
  disabled: boolean;
  joinedAt: number;
  isNew: boolean;
  status: TraineeStatus;
  /** Sessions in the selected window. */
  sessions: number;
  finished: number;
  /** All-time. */
  sessionsAll: number;
  avgScore: number | null;
  /** Latest-5 vs previous-5 mean, points. */
  momentum: number | null;
  bestScore: number | null;
  skills: Record<SkillKey, number | null>;
  weakest: SkillKey | null;
  strongest: SkillKey | null;
  lastSessionAt: number | null;
  /** Latest sign of life: a session, app activity, or a sign-in. */
  lastActiveAt: number | null;
  streak: number;
  bestStreak: number;
  practiceSeconds: number;
  /** Sessions per week, oldest → newest, last 8 weeks (for the row sparkline). */
  weekly: number[];
  hintsUsed: number;
  /** App activity in the window (when engagement data is available). */
  appActiveDays: number | null;
}

export function displayName(e: Pick<TraineeDirectoryEntry, 'display_name' | 'email' | 'user_id'>): string {
  return e.display_name?.trim() || e.email?.split('@')[0] || `Trainee ${e.user_id.slice(0, 6)}`;
}

/**
 * One row per trainee in the directory. `allSessions` must be every session
 * (any window) — status, streaks and momentum are lifetime facts;
 * `windowStart` scopes the window-specific counts. Anonymous sessions are
 * skipped: they belong to a device, never to a person on the roster.
 */
export function rollupTrainees(
  directory: readonly TraineeDirectoryEntry[],
  allSessions: readonly SessionSummary[],
  opts: { windowStart: number; now?: number; engagement?: readonly EngagementPerUser[] | null },
): TraineeRow[] {
  const now = opts.now ?? Date.now();
  const byUser = new Map<string, SessionSummary[]>();
  for (const s of allSessions) {
    // An anonymous session (no account) belongs to no one on the roster.
    if (!s.user_id) continue;
    const list = byUser.get(s.user_id);
    if (list) list.push(s);
    else byUser.set(s.user_id, [s]);
  }
  const engagementByUser = new Map((opts.engagement ?? []).map((e) => [e.user_id, e]));

  return directory.map((e) => {
    const list = (byUser.get(e.user_id) ?? []).slice().sort((a, b) => sessionTime(b) - sessionTime(a));
    const inWindow = list.filter((s) => sessionTime(s) >= opts.windowStart);
    const scoredAll = list.filter(isScored);
    const scoredWindow = inWindow.filter(isScored);
    const skills = skillAverages(scoredWindow.length ? scoredWindow : scoredAll).avg;
    const lastSessionAt = list.length ? sessionTime(list[0]) : null;
    const eng = engagementByUser.get(e.user_id);
    const signals = [
      lastSessionAt,
      eng ? new Date(eng.last_seen).getTime() : null,
      e.last_sign_in_at ? new Date(e.last_sign_in_at).getTime() : null,
    ].filter((t): t is number => t != null && Number.isFinite(t));
    const st = streaks(list.map(sessionTime), now);
    const weekly = Array.from({ length: 8 }, () => 0);
    for (const s of list) {
      const w = Math.floor((now - sessionTime(s)) / (7 * DAY_MS));
      if (w >= 0 && w < 8) weekly[7 - w]++;
    }
    const joinedAt = new Date(e.created_at).getTime();
    return {
      user_id: e.user_id,
      name: displayName(e),
      email: e.email,
      driver: e.echo_primary,
      admin_role: e.admin_role,
      disabled: e.disabled,
      joinedAt,
      isNew: now - joinedAt <= NEW_DAYS * DAY_MS,
      status: traineeStatus(lastSessionAt, now),
      sessions: inWindow.length,
      finished: inWindow.filter((s) => s.completed).length,
      sessionsAll: list.length,
      avgScore: mean(scoredWindow.map((s) => s.score_overall as number)),
      momentum: scoreMomentum(scoredAll),
      bestScore: scoredAll.length ? Math.max(...scoredAll.map((s) => s.score_overall as number)) : null,
      skills,
      weakest: extremeSkill(skills, 'weakest'),
      strongest: extremeSkill(skills, 'strongest'),
      lastSessionAt,
      lastActiveAt: signals.length ? Math.max(...signals) : null,
      streak: st.current,
      bestStreak: st.best,
      practiceSeconds: inWindow.reduce((a, s) => a + (s.duration_seconds ?? 0), 0),
      weekly,
      hintsUsed: inWindow.reduce((a, s) => a + (s.hints_used ?? 0), 0),
      appActiveDays: eng ? eng.active_days : null,
    };
  });
}

export function statusCounts(rows: readonly TraineeRow[]): Record<TraineeStatus | 'all' | 'new', number> {
  const out = { all: rows.length, new: 0, active: 0, at_risk: 0, dormant: 0, not_started: 0 };
  for (const r of rows) {
    out[r.status]++;
    if (r.isNew) out.new++;
  }
  return out;
}

// ─── Coaching notes ────────────────────────────────────────────────────

export interface CoachingNote {
  tone: 'positive' | 'focus' | 'watch';
  text: string;
}

/**
 * Plain-English observations for a trainee's profile — what a practice
 * manager would say after reading the numbers. Ordered most useful first;
 * each one is backed by a figure on the same page.
 */
export function coachingNotes(input: {
  sessions: readonly SessionSummary[];
  teamSkills: Record<SkillKey, number | null>;
  objectionLabel: (id: string) => string;
  now?: number;
}): CoachingNote[] {
  const now = input.now ?? Date.now();
  const all = input.sessions.slice().sort((a, b) => sessionTime(b) - sessionTime(a));
  const notes: CoachingNote[] = [];
  if (all.length === 0) {
    return [{ tone: 'watch', text: 'Hasn’t practised yet — a first session on an easy owner is the best start.' }];
  }
  const scored = all.filter(isScored);
  const skills = skillAverages(scored).avg;
  const weakest = extremeSkill(skills, 'weakest');
  const strongest = extremeSkill(skills, 'strongest');

  const momentum = scoreMomentum(scored);
  if (momentum != null && Math.abs(momentum) >= 4) {
    notes.push(
      momentum > 0
        ? { tone: 'positive', text: `Improving: their last 5 scores average ${Math.round(momentum)} points higher than the 5 before.` }
        : { tone: 'watch', text: `Slipping: their last 5 scores average ${Math.round(-momentum)} points lower than the 5 before.` },
    );
  }

  if (weakest && skills[weakest] != null) {
    const team = input.teamSkills[weakest];
    const gap = team != null ? (skills[weakest] as number) - team : null;
    notes.push({
      tone: 'focus',
      text:
        `Focus on ${SKILL_LABELS[weakest]} — ${SKILL_HINTS[weakest]}. They average ${Math.round(skills[weakest] as number)}` +
        (gap != null ? ` (${gap >= 0 ? `${Math.round(gap)} above` : `${Math.round(-gap)} below`} the team).` : '.'),
    });
  }
  if (strongest && strongest !== weakest && skills[strongest] != null && (skills[strongest] as number) >= 70) {
    notes.push({
      tone: 'positive',
      text: `Strongest at ${SKILL_LABELS[strongest]} (${Math.round(skills[strongest] as number)}) — a good peer example for the team.`,
    });
  }

  // Objection to practise next: the lowest average with 2+ scored tries.
  const byObjection = groupStats(scored, (s) => s.pushback_id).filter((g) => g.scored >= 2 && g.avgScore != null);
  if (byObjection.length >= 2) {
    const worst = byObjection.reduce((a, b) => ((a.avgScore as number) <= (b.avgScore as number) ? a : b));
    const best = byObjection.reduce((a, b) => ((a.avgScore as number) >= (b.avgScore as number) ? a : b));
    if ((best.avgScore as number) - (worst.avgScore as number) >= 8) {
      notes.push({
        tone: 'focus',
        text: `Hardest objection: “${input.objectionLabel(worst.key)}” (avg ${Math.round(worst.avgScore as number)}, vs ${Math.round(best.avgScore as number)} on “${input.objectionLabel(best.key)}”).`,
      });
    }
  }

  // Difficulty ceiling.
  const maxLevel = Math.max(0, ...all.map((s) => s.difficulty ?? 0));
  const recentAvg = mean(scored.slice(0, 5).map((s) => s.score_overall as number));
  if (maxLevel > 0 && maxLevel < 3 && recentAvg != null && recentAvg >= 75) {
    notes.push({ tone: 'focus', text: 'Scoring well and hasn’t faced a Hostile or Combative owner yet — ready to step up the difficulty.' });
  }

  const finishRate = all.filter((s) => s.completed).length / all.length;
  if (all.length >= 4 && finishRate < 0.6) {
    notes.push({ tone: 'watch', text: `Leaves ${Math.round((1 - finishRate) * 100)}% of sessions before the end — check whether sessions feel too long or too hard.` });
  }

  const hints = all.reduce((a, s) => a + (s.hints_used ?? 0), 0);
  const textSessions = all.filter((s) => s.mode !== 'voice').length;
  if (textSessions >= 4 && hints / textSessions >= 2) {
    notes.push({ tone: 'watch', text: `Leans on coach hints (${(hints / textSessions).toFixed(1)} per session) — worth a debrief on structuring the reply themselves.` });
  }

  const daysSince = (now - sessionTime(all[0])) / DAY_MS;
  if (daysSince > 7) {
    notes.push({ tone: 'watch', text: `Hasn’t practised in ${Math.floor(daysSince)} days.` });
  }

  return notes.slice(0, 6);
}
