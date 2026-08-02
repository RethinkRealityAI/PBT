/**
 * Streak / practice-cadence stats for the Home screen streak strip (spec §9.4).
 *
 * Pure + deterministic: every calculation is derived from the caller-supplied
 * `now`, so callers (and tests) never depend on the wall clock.
 *
 * Day identity is always the LOCAL calendar day (Y/M/D as the user sees it),
 * never `ms / 86_400_000`, so DST transitions cannot merge or split days.
 */

export interface StreakStats {
  /** Consecutive local calendar days with ≥1 session, ending today or yesterday (else 0). */
  streakDays: number;
  /** True when the streak includes today (drives "practice today to keep it" nudges). */
  practicedToday: boolean;
  /** Sessions in the current local week (Monday-start). */
  sessionsThisWeek: number;
  totalSessions: number;
}

const MS_PER_DAY = 86_400_000;

/** Bare `YYYY-MM-DD` — `new Date()` would read these as UTC midnight. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Coerce a loosely-typed session date into a `Date`, or `null` when unusable.
 * Never throws — callers feed this straight from persisted / synced records.
 */
function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const fromMs = new Date(value);
    return Number.isNaN(fromMs.getTime()) ? null : fromMs;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Date-only strings are calendar days, so anchor them to LOCAL midnight.
    // (`new Date('2026-05-11')` is UTC midnight — the previous local day west
    // of Greenwich, which would silently shift the streak.)
    if (DATE_ONLY.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      const local = new Date(y, m - 1, d);
      return Number.isNaN(local.getTime()) ? null : local;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Stable index for a local calendar day. Built from the LOCAL Y/M/D and then
 * projected onto the UTC timeline (which has no DST), so consecutive calendar
 * days are always exactly 1 apart regardless of clock shifts.
 */
function localDayIndex(date: Date): number {
  return Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY,
  );
}

export function computeStreak(
  sessionDates: Array<string | number | Date>,
  now: Date = new Date(),
): StreakStats {
  const empty: StreakStats = {
    streakDays: 0,
    practicedToday: false,
    sessionsThisWeek: 0,
    totalSessions: 0,
  };

  const reference = parseDate(now);
  if (!reference) return empty;
  if (!Array.isArray(sessionDates) || sessionDates.length === 0) return empty;

  const todayIndex = localDayIndex(reference);
  // Monday-start week: Sunday (getDay() === 0) belongs to the week just ended.
  const mondayIndex = todayIndex - ((reference.getDay() + 6) % 7);

  const activeDays = new Set<number>();
  let totalSessions = 0;
  let sessionsThisWeek = 0;

  for (const raw of sessionDates) {
    const date = parseDate(raw);
    if (!date) continue; // unparseable entries are skipped, never fatal
    totalSessions += 1;

    const dayIndex = localDayIndex(date);
    // Days in the future can't extend a streak or count toward "so far this week".
    if (dayIndex > todayIndex) continue;

    activeDays.add(dayIndex);
    if (dayIndex >= mondayIndex) sessionsThisWeek += 1;
  }

  const practicedToday = activeDays.has(todayIndex);
  // A streak is only broken once a FULL day is missed, so it may end yesterday.
  let cursor = practicedToday
    ? todayIndex
    : activeDays.has(todayIndex - 1)
      ? todayIndex - 1
      : null;

  let streakDays = 0;
  while (cursor !== null && activeDays.has(cursor)) {
    streakDays += 1;
    cursor -= 1;
  }

  return { streakDays, practicedToday, sessionsThisWeek, totalSessions };
}
