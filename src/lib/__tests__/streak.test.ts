import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import { computeStreak } from '../streak';

/**
 * Every date here is built with the LOCAL `Date` constructor and `now` is always
 * passed explicitly, so the assertions hold in any timezone the runner uses.
 */
const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m - 1, d, h, min);

describe('computeStreak', () => {
  it('returns all zeros for an empty list', () => {
    expect(computeStreak([], at(2026, 5, 11))).toEqual({
      streakDays: 0,
      practicedToday: false,
      sessionsThisWeek: 0,
      totalSessions: 0,
    });
  });

  it('counts a single session today as a 1-day streak', () => {
    const stats = computeStreak([at(2026, 5, 11, 9)], at(2026, 5, 11, 18));
    expect(stats.streakDays).toBe(1);
    expect(stats.practicedToday).toBe(true);
    expect(stats.totalSessions).toBe(1);
  });

  it('counts consecutive days ending today', () => {
    const stats = computeStreak(
      [at(2026, 5, 9), at(2026, 5, 10), at(2026, 5, 11, 8)],
      at(2026, 5, 11, 20),
    );
    expect(stats.streakDays).toBe(3);
    expect(stats.practicedToday).toBe(true);
  });

  it('keeps a streak alive when the last session was yesterday', () => {
    const stats = computeStreak(
      [at(2026, 5, 9), at(2026, 5, 10, 21)],
      at(2026, 5, 11, 10),
    );
    expect(stats.streakDays).toBe(2);
    expect(stats.practicedToday).toBe(false);
  });

  it('drops the streak to 0 once a full day is missed', () => {
    const stats = computeStreak(
      [at(2026, 5, 8), at(2026, 5, 9, 22)],
      at(2026, 5, 11, 10),
    );
    expect(stats.streakDays).toBe(0);
    expect(stats.practicedToday).toBe(false);
    expect(stats.totalSessions).toBe(2);
  });

  it('only counts the run adjacent to today, not an older longer run', () => {
    const stats = computeStreak(
      [
        at(2026, 5, 1),
        at(2026, 5, 2),
        at(2026, 5, 3),
        at(2026, 5, 4), // gap on the 5th–9th
        at(2026, 5, 10),
        at(2026, 5, 11),
      ],
      at(2026, 5, 11, 23),
    );
    expect(stats.streakDays).toBe(2);
    expect(stats.totalSessions).toBe(6);
  });

  it('counts multiple sessions in one day once toward the streak', () => {
    const stats = computeStreak(
      [at(2026, 5, 11, 8), at(2026, 5, 11, 13), at(2026, 5, 11, 19)],
      at(2026, 5, 11, 22),
    );
    expect(stats.streakDays).toBe(1);
    expect(stats.totalSessions).toBe(3);
  });

  it('treats 23:50 and 00:10 local as two different calendar days', () => {
    const stats = computeStreak(
      [at(2026, 5, 10, 23, 50), at(2026, 5, 11, 0, 10)],
      at(2026, 5, 11, 9),
    );
    expect(stats.streakDays).toBe(2);
    expect(stats.practicedToday).toBe(true);
  });

  it('crosses a month boundary', () => {
    const stats = computeStreak(
      [at(2026, 2, 27), at(2026, 2, 28), at(2026, 3, 1)],
      at(2026, 3, 1, 20),
    );
    expect(stats.streakDays).toBe(3);
  });

  it('crosses a year boundary', () => {
    const stats = computeStreak(
      [at(2025, 12, 30), at(2025, 12, 31), at(2026, 1, 1)],
      at(2026, 1, 1, 11),
    );
    expect(stats.streakDays).toBe(3);
    expect(stats.practicedToday).toBe(true);
  });

  it('uses a Monday-start week (Sunday belongs to the week just ended)', () => {
    const stats = computeStreak(
      [
        at(2026, 5, 10), // Sunday — previous week
        at(2026, 5, 11), // Monday — current week
        at(2026, 5, 13),
        at(2026, 5, 13, 18),
      ],
      at(2026, 5, 13, 20), // Wednesday
    );
    expect(stats.sessionsThisWeek).toBe(3);
    expect(stats.totalSessions).toBe(4);
  });

  it('starts a fresh week count on Monday itself', () => {
    const stats = computeStreak(
      [at(2026, 5, 8), at(2026, 5, 9), at(2026, 5, 10, 23, 59), at(2026, 5, 11, 0, 5)],
      at(2026, 5, 11, 7), // Monday
    );
    expect(stats.sessionsThisWeek).toBe(1);
    expect(stats.streakDays).toBe(4);
  });

  it('skips unparseable entries without throwing', () => {
    const messy = [
      at(2026, 5, 10),
      'not a date',
      '',
      NaN,
      Infinity,
      new Date('nope'),
      null,
      undefined,
      { when: 'today' },
      at(2026, 5, 11),
    ] as unknown as Array<string | number | Date>;

    const stats = computeStreak(messy, at(2026, 5, 11, 12));
    expect(stats.totalSessions).toBe(2);
    expect(stats.streakDays).toBe(2);
    expect(stats.practicedToday).toBe(true);
  });

  it('accepts Date, epoch-ms and ISO strings interchangeably', () => {
    const stats = computeStreak(
      [
        at(2026, 5, 9).getTime(),
        at(2026, 5, 10).toISOString(),
        at(2026, 5, 11, 6),
      ],
      at(2026, 5, 11, 16),
    );
    expect(stats.streakDays).toBe(3);
    expect(stats.totalSessions).toBe(3);
  });

  it('reads a bare YYYY-MM-DD string as that local calendar day', () => {
    const stats = computeStreak(['2026-05-11'], at(2026, 5, 11, 3));
    expect(stats.practicedToday).toBe(true);
    expect(stats.streakDays).toBe(1);
  });

  it('ignores future-dated sessions for the streak and week count', () => {
    const stats = computeStreak(
      [at(2026, 5, 11), at(2026, 5, 12), at(2026, 5, 20)],
      at(2026, 5, 11, 12),
    );
    expect(stats.streakDays).toBe(1);
    expect(stats.sessionsThisWeek).toBe(1);
    expect(stats.totalSessions).toBe(3);
  });
});

describe('computeStreak across DST transitions (America/New_York)', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('actually runs under a DST-observing zone', () => {
    // Guard: if the override stopped working the two cases below would silently
    // become plain UTC tests and stop proving anything.
    expect(at(2026, 3, 7).getTimezoneOffset()).toBe(300); // EST
    expect(at(2026, 3, 8).getTimezoneOffset()).toBe(240); // EDT
  });

  it('spans spring-forward (23-hour day) without breaking the streak', () => {
    // 2026-03-08 is the US spring-forward day.
    const stats = computeStreak(
      [at(2026, 3, 7, 23, 30), at(2026, 3, 8, 12), at(2026, 3, 9, 0, 30)],
      at(2026, 3, 9, 10),
    );
    expect(stats.streakDays).toBe(3);
    expect(stats.practicedToday).toBe(true);
  });

  it('spans fall-back (25-hour day) without merging days', () => {
    // 2026-11-01 is the US fall-back day.
    const stats = computeStreak(
      [at(2026, 10, 31, 23, 30), at(2026, 11, 1, 1, 30), at(2026, 11, 2, 8)],
      at(2026, 11, 2, 9),
    );
    expect(stats.streakDays).toBe(3);
  });
});
