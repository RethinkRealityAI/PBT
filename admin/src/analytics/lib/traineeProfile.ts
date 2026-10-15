/**
 * One trainee's profile — the pure aggregations behind the panels on
 * `#/analytics/trainees/<id>` that the shared libs (`metrics.ts`,
 * `trainees.ts`) don't already cover: the score progression with its rolling
 * average, the practice calendar, when they practise, objection coverage,
 * difficulty, practice style and a plain-English activity timeline.
 *
 * Everything takes the trainee's sessions (any order) and an injectable
 * `now`; unit-tested in `__tests__/traineeProfile.test.ts`.
 */
import type { SessionSummary, TraineeActivity } from '../../../../src/shared/analytics/contract';
import { ACTION_LABELS, EVENT_TYPE_LABELS, SCREEN_LABELS, labelOf } from '../../lib/labels';
import { DAY_MS, dayKey, mean, median, pct } from './period';
import { isScored, sessionTime } from './metrics';

// ─── Dates in words ───────────────────────────────────────────────────

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** "3 Sep" — with the year when it isn't this year ("3 Sep 2025"). */
export function shortDate(t: number, now = Date.now()): string {
  const d = new Date(t);
  const base = `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "Tue 3 Sep" — the calendar's cell title and the session list's date. */
export function dayLabel(t: number, now = Date.now()): string {
  return `${WEEKDAY_SHORT[new Date(t).getDay()]} ${shortDate(t, now)}`;
}

/** "8:14am" */
export function clockTime(t: number): string {
  const d = new Date(t);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m}${h < 12 ? 'am' : 'pm'}`;
}

/** Whole local calendar days between two instants (b − a). */
function calendarDaysBetween(a: number, b: number): number {
  const da = new Date(a);
  const db = new Date(b);
  da.setHours(12, 0, 0, 0);
  db.setHours(12, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / DAY_MS);
}

/**
 * "Today", "Yesterday", "3 days ago", "2 weeks ago", "4 months ago" — by
 * local calendar day, so something at 11pm yesterday reads "Yesterday".
 */
export function relativeDay(t: number | null | undefined, now = Date.now()): string {
  if (t == null || !Number.isFinite(t)) return 'Never';
  const days = calendarDaysBetween(t, now);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return w === 1 ? '1 week ago' : `${w} weeks ago`;
  }
  if (days < 365) {
    const m = Math.max(1, Math.floor(days / 30.44));
    return m === 1 ? '1 month ago' : `${m} months ago`;
  }
  const y = Math.floor(days / 365);
  return y === 1 ? 'Over a year ago' : `${y} years ago`;
}

/** Practice time: "1h 24m", "12m", "45s", "0m". */
export function practiceTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '0m';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

/** Session length: "4m 12s", "45s". */
export function sessionLength(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

// ─── Score progression ─────────────────────────────────────────────────

/** Trailing mean over the last `n` values (fewer at the start), same length. */
export function rollingAverage(values: readonly number[], n = 5): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    out.push(sum / Math.min(i + 1, n));
  }
  return out;
}

export interface ProgressPoint {
  id: string;
  t: number;
  score: number;
  /** Mean of this and the previous n−1 scored sessions — across ALL history. */
  rolling: number;
  pushback_id: string | null;
  difficulty: 1 | 2 | 3 | 4 | null;
  title: string | null;
}

/**
 * Scored sessions oldest → newest from `from`, each with a rolling average
 * computed over the whole history (so the line doesn't restart at the window
 * edge). Also counts what was left out in the same window and why.
 */
export function scoreProgression(
  sessions: readonly SessionSummary[],
  opts: { from?: number; n?: number } = {},
): { points: ProgressPoint[]; leftEarly: number; failed: number } {
  const from = opts.from ?? 0;
  const scored = sessions
    .filter(isScored)
    .slice()
    .sort((a, b) => sessionTime(a) - sessionTime(b));
  const rolling = rollingAverage(
    scored.map((s) => s.score_overall as number),
    opts.n ?? 5,
  );
  const points: ProgressPoint[] = [];
  scored.forEach((s, i) => {
    const t = sessionTime(s);
    if (t < from) return;
    points.push({
      id: s.id,
      t,
      score: s.score_overall as number,
      rolling: rolling[i],
      pushback_id: s.pushback_id,
      difficulty: s.difficulty,
      title: s.scenario_title,
    });
  });
  const inWindow = sessions.filter((s) => sessionTime(s) >= from);
  return {
    points,
    leftEarly: inWindow.filter((s) => !s.completed).length,
    failed: inWindow.filter((s) => s.completed && !isScored(s)).length,
  };
}

// ─── Practice calendar ─────────────────────────────────────────────────

export interface CalendarDay {
  /** Local YYYY-MM-DD. */
  key: string;
  /** Local noon of the day (stable across DST). */
  t: number;
  sessions: number;
  /** The app was opened that day (any activity). */
  appActive: boolean;
  /** After today — rendered empty. */
  future: boolean;
}

export interface CalendarModel {
  /** One column per week, oldest first; each column runs Monday → Sunday. */
  columns: CalendarDay[][];
  /** Month names placed on the column where the month starts. */
  monthLabels: Array<{ col: number; label: string }>;
  /** Most sessions on one day (the colour scale's top). */
  max: number;
  /** Days with at least one session. */
  practiceDays: number;
  /** Days the app was used with no session. */
  appOnlyDays: number;
  sessions: number;
}

/**
 * A GitHub-style practice calendar: the last `weeks` weeks (current week
 * included, Monday-first), sessions per local day and the days the app was
 * opened (`activity.active_days`, already local to the viewer).
 */
export function practiceCalendar(
  sessionTimes: readonly number[],
  appDays: readonly string[] = [],
  opts: { weeks?: number; now?: number } = {},
): CalendarModel {
  const weeks = opts.weeks ?? 26;
  const now = opts.now ?? Date.now();
  const counts = new Map<string, number>();
  for (const t of sessionTimes) {
    if (!Number.isFinite(t)) continue;
    const k = dayKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const app = new Set(appDays);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  const todayKey = dayKey(today.getTime());
  const sinceMonday = (today.getDay() + 6) % 7;
  const first = new Date(today);
  first.setDate(first.getDate() - sinceMonday - (weeks - 1) * 7);

  const columns: CalendarDay[][] = [];
  const monthLabels: Array<{ col: number; label: string }> = [];
  let max = 0;
  let practiceDays = 0;
  let appOnlyDays = 0;
  let total = 0;
  let prevMonth = -1;
  for (let c = 0; c < weeks; c++) {
    const col: CalendarDay[] = [];
    for (let r = 0; r < 7; r++) {
      const d = new Date(first);
      d.setDate(first.getDate() + c * 7 + r);
      d.setHours(12, 0, 0, 0);
      const key = dayKey(d.getTime());
      const future = key > todayKey;
      const sessions = future ? 0 : (counts.get(key) ?? 0);
      const appActive = !future && app.has(key);
      if (!future) {
        max = Math.max(max, sessions);
        total += sessions;
        if (sessions > 0) practiceDays++;
        else if (appActive) appOnlyDays++;
      }
      col.push({ key, t: d.getTime(), sessions, appActive, future });
    }
    // Label the column holding the 1st of a month (or the first column).
    const month = new Date(col[0].t).getMonth();
    const startsMonth = col.some((d) => new Date(d.t).getDate() === 1);
    if (c === 0) {
      monthLabels.push({ col: c, label: MONTH_SHORT[month] });
      prevMonth = month;
    } else if (startsMonth) {
      const m = new Date(col.find((d) => new Date(d.t).getDate() === 1)!.t).getMonth();
      if (m !== prevMonth) {
        monthLabels.push({ col: c, label: MONTH_SHORT[m] });
        prevMonth = m;
      }
    }
    columns.push(col);
  }
  // The first column's label collides with a month that starts right after.
  if (monthLabels.length > 1 && monthLabels[1].col - monthLabels[0].col < 3) monthLabels.shift();
  return { columns, monthLabels, max, practiceDays, appOnlyDays, sessions: total };
}

// ─── When they practise ────────────────────────────────────────────────

export type DayPart = 'morning' | 'lunchtime' | 'afternoon' | 'evening' | 'night';

export const DAY_PART_WORDS: Record<DayPart, string> = {
  morning: 'in the morning',
  lunchtime: 'around lunchtime',
  afternoon: 'in the afternoon',
  evening: 'in the evening',
  night: 'late at night',
};

export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'lunchtime';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

export interface PeakPractice {
  weekday: number;
  /** Share of sessions on that weekday, 0–100. */
  weekdayShare: number;
  part: DayPart;
  partShare: number;
  sessions: number;
}

/**
 * The weekday and the time of day they practise most (local time). Needs 3+
 * sessions to say anything; ties go to the earlier day / part of the day.
 */
export function peakPractice(times: readonly number[]): PeakPractice | null {
  const valid = times.filter((t) => Number.isFinite(t));
  if (valid.length < 3) return null;
  const days = Array.from({ length: 7 }, () => 0);
  const parts: Record<DayPart, number> = { morning: 0, lunchtime: 0, afternoon: 0, evening: 0, night: 0 };
  for (const t of valid) {
    const d = new Date(t);
    days[d.getDay()]++;
    parts[dayPart(d.getHours())]++;
  }
  // Monday-first tie-break so a tie reads as the start of the week.
  const order = [1, 2, 3, 4, 5, 6, 0];
  const weekday = order.reduce((best, d) => (days[d] > days[best] ? d : best), order[0]);
  const partOrder: DayPart[] = ['morning', 'lunchtime', 'afternoon', 'evening', 'night'];
  const part = partOrder.reduce((best, p) => (parts[p] > parts[best] ? p : best), partOrder[0]);
  return {
    weekday,
    weekdayShare: (days[weekday] / valid.length) * 100,
    part,
    partShare: (parts[part] / valid.length) * 100,
    sessions: valid.length,
  };
}

/** "Practises most on Tuesdays, usually in the morning." */
export function peakPracticeSentence(p: PeakPractice | null): string | null {
  if (!p) return null;
  return `Practises most on ${WEEKDAY_LONG[p.weekday]}s, usually ${DAY_PART_WORDS[p.part]}.`;
}

// ─── Objections ────────────────────────────────────────────────────────

/** The built-in objections every trainee can practise (PUSHBACK_CATEGORIES minus "custom"). */
export const BUILT_IN_OBJECTIONS = [
  'cost',
  'breeder-advice',
  'raw-food',
  'rx-diet',
  'brand-switch',
  'weight-denial',
] as const;

export interface ObjectionRow {
  key: string;
  sessions: number;
  scored: number;
  avgScore: number | null;
  best: number | null;
  /** 0–100. */
  finishRate: number | null;
  lastAt: number;
}

/**
 * Every objection the trainee has practised, weakest first (lowest average;
 * never-scored ones last, busiest first among equals).
 */
export function objectionBreakdown(sessions: readonly SessionSummary[]): ObjectionRow[] {
  const groups = new Map<string, SessionSummary[]>();
  for (const s of sessions) {
    if (!s.pushback_id) continue;
    const list = groups.get(s.pushback_id);
    if (list) list.push(s);
    else groups.set(s.pushback_id, [s]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const scores = list.filter(isScored).map((s) => s.score_overall as number);
      return {
        key,
        sessions: list.length,
        scored: scores.length,
        avgScore: mean(scores),
        best: scores.length ? Math.max(...scores) : null,
        finishRate: pct(list.filter((s) => s.completed).length, list.length),
        lastAt: Math.max(...list.map(sessionTime)),
      };
    })
    .sort((a, b) => {
      if (a.avgScore == null && b.avgScore == null) return b.sessions - a.sessions;
      if (a.avgScore == null) return 1;
      if (b.avgScore == null) return -1;
      return a.avgScore - b.avgScore || b.sessions - a.sessions;
    });
}

/** Built-in objections they have never faced, in catalogue order. */
export function untriedObjections(
  sessions: readonly SessionSummary[],
  builtIns: readonly string[] = BUILT_IN_OBJECTIONS,
): string[] {
  const tried = new Set(sessions.map((s) => s.pushback_id).filter(Boolean));
  return builtIns.filter((id) => !tried.has(id));
}

// ─── Difficulty ────────────────────────────────────────────────────────

export interface DifficultyRow {
  level: 1 | 2 | 3 | 4;
  sessions: number;
  scored: number;
  avgScore: number | null;
}

/** Sessions and average score per difficulty level; unrecorded levels counted apart. */
export function difficultyBreakdown(sessions: readonly SessionSummary[]): { levels: DifficultyRow[]; unknown: number } {
  const levels: DifficultyRow[] = ([1, 2, 3, 4] as const).map((level) => {
    const list = sessions.filter((s) => s.difficulty === level);
    const scores = list.filter(isScored).map((s) => s.score_overall as number);
    return { level, sessions: list.length, scored: scores.length, avgScore: mean(scores) };
  });
  return { levels, unknown: sessions.filter((s) => s.difficulty == null).length };
}

// ─── Practice style ────────────────────────────────────────────────────

export interface PracticeStyle {
  typed: number;
  spoken: number;
  /** Median session length, seconds. */
  medianSeconds: number | null;
  /** Mean words per trainee message, weighted by messages. */
  wordsPerReply: number | null;
  /** Median of each typed session's median reply time, seconds. */
  replySeconds: number | null;
  /** Coach hints per typed session (only sessions whose hints are known). */
  hintsPerTextSession: number | null;
  /** How the AI owner felt at the end of finished sessions. */
  moods: { green: number; yellow: number; red: number };
}

export function practiceStyle(sessions: readonly SessionSummary[]): PracticeStyle {
  const lengths = sessions.map((s) => s.duration_seconds).filter((d): d is number => d != null && d > 0);
  let words = 0;
  let messages = 0;
  for (const s of sessions) {
    if (s.staff_words_avg != null && s.staff_messages > 0) {
      words += s.staff_words_avg * s.staff_messages;
      messages += s.staff_messages;
    }
  }
  const text = sessions.filter((s) => s.mode !== 'voice');
  const withHints = text.filter((s) => s.hints_used != null);
  const moods = { green: 0, yellow: 0, red: 0 };
  for (const s of sessions) if (s.completed && s.owner_mood_end) moods[s.owner_mood_end]++;
  return {
    typed: text.length,
    spoken: sessions.length - text.length,
    medianSeconds: median(lengths),
    wordsPerReply: messages > 0 ? words / messages : null,
    replySeconds: median(
      text.map((s) => s.reply_seconds_median).filter((v): v is number => v != null && Number.isFinite(v)),
    ),
    hintsPerTextSession: withHints.length
      ? withHints.reduce((a, s) => a + (s.hints_used as number), 0) / withHints.length
      : null,
    moods,
  };
}

// ─── App activity in words ─────────────────────────────────────────────

type ActivityEvent = TraineeActivity['recent'][number];

/** One app event as a sentence; null for noise (time-on-screen pings). */
export function activityLine(e: Pick<ActivityEvent, 'type' | 'screen' | 'action'>): string | null {
  if (e.type === 'dwell') return null;
  if (e.action) return labelOf(ACTION_LABELS, e.action);
  if (e.type === 'screen_view') return e.screen ? `Opened ${labelOf(SCREEN_LABELS, e.screen)}` : 'Opened a screen';
  const what = labelOf(EVENT_TYPE_LABELS, e.type);
  return e.screen ? `${what} on ${labelOf(SCREEN_LABELS, e.screen)}` : what;
}

/**
 * The latest app events as plain-English lines, newest first — noise
 * dropped and an immediate repeat of the same line folded into one.
 */
export function activityTimeline(
  recent: readonly ActivityEvent[],
  limit = 12,
): Array<{ at: number; text: string; repeat: number }> {
  const out: Array<{ at: number; text: string; repeat: number }> = [];
  for (const e of recent) {
    const text = activityLine(e);
    const at = new Date(e.at).getTime();
    if (!text || !Number.isFinite(at)) continue;
    const prev = out[out.length - 1];
    if (prev && prev.text === text) {
      prev.repeat++;
      continue;
    }
    if (out.length >= limit) break;
    out.push({ at, text, repeat: 1 });
  }
  return out;
}

/** Count of one action in a trainee's activity (`fecal_scan`, `vision_analyze`…). */
export function actionCount(activity: Pick<TraineeActivity, 'actions'> | null, action: string): number {
  return activity?.actions.find((a) => a.action === action)?.count ?? 0;
}

// ─── A note the session data can't give ────────────────────────────────

/**
 * For someone who hasn't practised yet, what their app use says — the
 * difference between "never opened it" (check the invite reached them) and
 * "keeps opening it but never starts" (they may be stuck). Null otherwise,
 * or when app activity isn't visible to this viewer.
 */
export function gettingStartedNote(input: {
  sessions: number;
  activity: Pick<TraineeActivity, 'active_days' | 'last_seen'> | null;
  joinedAt: number;
  now?: number;
}): { tone: 'watch' | 'focus'; text: string } | null {
  if (input.sessions > 0 || !input.activity) return null;
  const now = input.now ?? Date.now();
  const days = input.activity.active_days.length;
  const since = relativeDay(input.joinedAt, now).toLowerCase();
  if (days === 0) {
    return {
      tone: 'watch',
      text: `Hasn’t opened the app since joining ${since} — check their invitation reached them and they can sign in.`,
    };
  }
  return {
    tone: 'focus',
    text: `Has opened the app on ${days} day${days === 1 ? '' : 's'} but never started a session — a quick walkthrough of their first scenario may help.`,
  };
}
