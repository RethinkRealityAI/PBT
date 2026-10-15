import { describe, expect, it } from 'vitest';
import {
  activityLine,
  activityTimeline,
  actionCount,
  dayLabel,
  dayPart,
  difficultyBreakdown,
  objectionBreakdown,
  peakPractice,
  peakPracticeSentence,
  practiceCalendar,
  practiceStyle,
  practiceTime,
  relativeDay,
  rollingAverage,
  scoreProgression,
  sessionLength,
  untriedObjections,
} from '../traineeProfile';
import { DAY_MS, dayKey } from '../period';
import { session } from './fixtures';

// A Thursday, local noon.
const NOW = new Date('2026-10-15T12:00:00').getTime();
const at = (daysAgo: number, hour = 12) => {
  const d = new Date(NOW - daysAgo * DAY_MS);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

describe('relativeDay', () => {
  it('reads local calendar days in words', () => {
    expect(relativeDay(null, NOW)).toBe('Never');
    expect(relativeDay(NOW - 60_000, NOW)).toBe('Today');
    expect(relativeDay(new Date(at(1, 23)).getTime(), NOW)).toBe('Yesterday');
    expect(relativeDay(NOW - 3 * DAY_MS, NOW)).toBe('3 days ago');
    expect(relativeDay(NOW - 8 * DAY_MS, NOW)).toBe('1 week ago');
    expect(relativeDay(NOW - 20 * DAY_MS, NOW)).toBe('2 weeks ago');
    expect(relativeDay(NOW - 95 * DAY_MS, NOW)).toBe('3 months ago');
    expect(relativeDay(NOW - 400 * DAY_MS, NOW)).toBe('Over a year ago');
  });
});

describe('durations and dates', () => {
  it('formats practice time and session length', () => {
    expect(practiceTime(0)).toBe('0m');
    expect(practiceTime(45)).toBe('45s');
    expect(practiceTime(12 * 60)).toBe('12m');
    expect(practiceTime(84 * 60)).toBe('1h 24m');
    expect(practiceTime(120 * 60)).toBe('2h');
    expect(sessionLength(null)).toBe('—');
    expect(sessionLength(252)).toBe('4m 12s');
    expect(sessionLength(40)).toBe('40s');
  });

  it('labels a day like the calendar cell does', () => {
    expect(dayLabel(new Date('2026-09-01T12:00:00').getTime(), NOW)).toBe('Tue 1 Sep');
    expect(dayLabel(new Date('2025-09-02T12:00:00').getTime(), NOW)).toBe('Tue 2 Sep 2025');
  });
});

describe('rollingAverage', () => {
  it('averages the trailing window, shorter at the start', () => {
    expect(rollingAverage([10, 20, 30, 40, 50, 60], 3)).toEqual([10, 15, 20, 30, 40, 50]);
    expect(rollingAverage([], 5)).toEqual([]);
  });
});

describe('scoreProgression', () => {
  it('keeps scored sessions in the window, oldest first, with a rolling average over all history', () => {
    const rows = [
      session({ id: 'a', created_at: at(40), score_overall: 50 }),
      session({ id: 'b', created_at: at(20), score_overall: 70 }),
      session({ id: 'c', created_at: at(10), score_overall: 90 }),
      session({ id: 'd', created_at: at(5), completed: false, score_overall: null }),
      session({ id: 'e', created_at: at(4), score_unavailable: true, score_overall: 0 }),
    ];
    const out = scoreProgression(rows, { from: NOW - 28 * DAY_MS, n: 2 });
    expect(out.points.map((p) => p.id)).toEqual(['b', 'c']);
    expect(out.points[0].rolling).toBe(60); // (50 + 70) / 2 — the earlier session still counts
    expect(out.points[1].rolling).toBe(80);
    expect(out.leftEarly).toBe(1);
    expect(out.failed).toBe(1);
  });
});

describe('practiceCalendar', () => {
  it('lays out Monday-first week columns ending in the current week', () => {
    const cal = practiceCalendar(
      [new Date(at(0)).getTime(), new Date(at(0, 8)).getTime(), new Date(at(2)).getTime()],
      [dayKey(new Date(at(1)).getTime()), dayKey(new Date(at(2)).getTime())],
      { weeks: 4, now: NOW },
    );
    expect(cal.columns).toHaveLength(4);
    for (const col of cal.columns) {
      expect(col).toHaveLength(7);
      expect(new Date(col[0].t).getDay()).toBe(1); // Monday on top
    }
    const last = cal.columns[3];
    const today = last.find((d) => d.key === dayKey(NOW))!;
    expect(today.sessions).toBe(2);
    expect(last.filter((d) => d.future)).toHaveLength(3); // Fri, Sat, Sun
    expect(cal.max).toBe(2);
    expect(cal.sessions).toBe(3);
    expect(cal.practiceDays).toBe(2);
    expect(cal.appOnlyDays).toBe(1); // yesterday: app, no session
  });

  it('labels months where they start and drops a label that would collide', () => {
    const cal = practiceCalendar([], [], { weeks: 26, now: NOW });
    const labels = cal.monthLabels.map((m) => m.label);
    expect(labels).toContain('Oct');
    expect(labels).toContain('Sep');
    for (let i = 1; i < cal.monthLabels.length; i++) {
      expect(cal.monthLabels[i].col - cal.monthLabels[i - 1].col).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('peakPractice', () => {
  it('names the busiest weekday and time of day', () => {
    // 15 Oct 2026 is a Thursday; 13 Oct a Tuesday.
    const tue = (h: number) => new Date(`2026-10-13T${String(h).padStart(2, '0')}:10:00`).getTime();
    const thu = (h: number) => new Date(`2026-10-15T${String(h).padStart(2, '0')}:10:00`).getTime();
    const p = peakPractice([tue(8), tue(9), new Date('2026-10-06T07:30:00').getTime(), thu(19)]);
    expect(p?.weekday).toBe(2);
    expect(p?.part).toBe('morning');
    expect(Math.round(p!.weekdayShare)).toBe(75);
    expect(peakPracticeSentence(p)).toBe('Practises most on Tuesdays, usually in the morning.');
    expect(peakPractice([tue(8)])).toBeNull();
  });

  it('buckets hours into parts of the day', () => {
    expect(dayPart(6)).toBe('morning');
    expect(dayPart(12)).toBe('lunchtime');
    expect(dayPart(15)).toBe('afternoon');
    expect(dayPart(20)).toBe('evening');
    expect(dayPart(23)).toBe('night');
    expect(dayPart(3)).toBe('night');
  });
});

describe('objections', () => {
  const rows = [
    session({ pushback_id: 'cost', score_overall: 80 }),
    session({ pushback_id: 'cost', score_overall: 60 }),
    session({ pushback_id: 'rx-diet', score_overall: 50 }),
    session({ pushback_id: 'rx-diet', completed: false, score_overall: null }),
    session({ pushback_id: 'team:probiotic-doubt', completed: false, score_overall: null }),
  ];

  it('lists every practised objection weakest first, unscored last', () => {
    const out = objectionBreakdown(rows);
    expect(out.map((r) => r.key)).toEqual(['rx-diet', 'cost', 'team:probiotic-doubt']);
    expect(out[0]).toMatchObject({ sessions: 2, scored: 1, avgScore: 50, best: 50, finishRate: 50 });
    expect(out[1]).toMatchObject({ avgScore: 70, best: 80, finishRate: 100 });
    expect(out[2].avgScore).toBeNull();
  });

  it('names the built-in objections never faced', () => {
    expect(untriedObjections(rows)).toEqual(['breeder-advice', 'raw-food', 'brand-switch', 'weight-denial']);
  });
});

describe('difficultyBreakdown', () => {
  it('counts sessions and averages scores per level', () => {
    const out = difficultyBreakdown([
      session({ difficulty: 1, score_overall: 80 }),
      session({ difficulty: 1, score_overall: 70 }),
      session({ difficulty: 3, score_unavailable: true, score_overall: 0 }),
      session({ difficulty: null }),
    ]);
    expect(out.levels[0]).toEqual({ level: 1, sessions: 2, scored: 2, avgScore: 75 });
    expect(out.levels[2]).toEqual({ level: 3, sessions: 1, scored: 0, avgScore: null });
    expect(out.unknown).toBe(1);
  });
});

describe('practiceStyle', () => {
  it('summarises how they practise', () => {
    const out = practiceStyle([
      session({ mode: 'text', duration_seconds: 200, staff_messages: 4, staff_words_avg: 10, reply_seconds_median: 20, hints_used: 2, owner_mood_end: 'green' }),
      session({ mode: 'text', duration_seconds: 400, staff_messages: 1, staff_words_avg: 40, reply_seconds_median: 30, hints_used: null, owner_mood_end: 'red' }),
      session({ mode: 'voice', duration_seconds: 300, staff_messages: 0, staff_words_avg: null, reply_seconds_median: null, hints_used: null, owner_mood_end: 'yellow' }),
      session({ mode: 'text', completed: false, duration_seconds: 60, owner_mood_end: 'red', hints_used: 0 }),
    ]);
    expect(out.typed).toBe(3);
    expect(out.spoken).toBe(1);
    expect(out.medianSeconds).toBe(250);
    // (4×10 + 1×40 + 5×22) / 10 — weighted by messages
    expect(out.wordsPerReply).toBe(19);
    expect(out.hintsPerTextSession).toBe(1); // (2 + 0) / 2 known
    expect(out.moods).toEqual({ green: 1, yellow: 1, red: 1 }); // the unfinished one doesn't count
  });
});

describe('activity in words', () => {
  it('turns events into sentences and drops noise', () => {
    expect(activityLine({ type: 'custom', screen: 'chat', action: 'session_open' })).toBe('Started a training session');
    expect(activityLine({ type: 'screen_view', screen: 'stats', action: null })).toBe('Opened Session scorecard');
    expect(activityLine({ type: 'dwell', screen: 'home', action: null })).toBeNull();
    expect(activityLine({ type: 'tab_change', screen: 'history', action: null })).toBe('Switched tab on Past sessions');
  });

  it('folds an immediate repeat and caps the list', () => {
    const e = (min: number, screen: string, type = 'screen_view') => ({
      at: new Date(NOW - min * 60_000).toISOString(),
      type,
      screen,
      action: null,
    });
    const out = activityTimeline([e(1, 'home'), e(2, 'home', 'dwell'), e(3, 'home'), e(4, 'stats'), e(5, 'chat')], 2);
    expect(out).toEqual([
      { at: NOW - 60_000, text: 'Opened Home', repeat: 2 },
      { at: NOW - 4 * 60_000, text: 'Opened Session scorecard', repeat: 1 },
    ]);
  });

  it('counts an action', () => {
    expect(actionCount({ actions: [{ action: 'fecal_scan', count: 3, visitors: 1 }] }, 'fecal_scan')).toBe(3);
    expect(actionCount(null, 'fecal_scan')).toBe(0);
  });
});
