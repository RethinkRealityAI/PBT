import { describe, expect, it } from 'vitest';
import {
  driverMatchup,
  extremeSkill,
  groupStats,
  isScored,
  practiceClock,
  scoreHistogram,
  sessionStats,
  sessionTrend,
  skillAverages,
} from '../metrics';
import { session } from './fixtures';

describe('isScored', () => {
  it('only counts finished sessions with a real score', () => {
    expect(isScored(session())).toBe(true);
    expect(isScored(session({ completed: false }))).toBe(false);
    expect(isScored(session({ score_unavailable: true, score_overall: 0 }))).toBe(false);
    expect(isScored(session({ score_overall: null }))).toBe(false);
  });
});

describe('sessionStats', () => {
  it('never lets a failed scoring attempt drag the average down', () => {
    const st = sessionStats([
      session({ score_overall: 80 }),
      session({ score_overall: 60 }),
      session({ score_overall: 0, score_unavailable: true }),
      session({ completed: false, score_overall: null, owner_mood_end: 'red' }),
    ]);
    expect(st.avgScore).toBe(70);
    expect(st.sessions).toBe(4);
    expect(st.finished).toBe(3);
    expect(st.leftEarly).toBe(1);
    expect(st.scoringFailed).toBe(1);
    expect(st.finishRate).toBe(75);
  });

  it('measures resolution only over finished sessions with a recorded mood', () => {
    const st = sessionStats([
      session({ owner_mood_end: 'green' }),
      session({ owner_mood_end: 'red' }),
      session({ owner_mood_end: null }),
      session({ completed: false, owner_mood_end: 'green' }),
    ]);
    expect(st.resolvedRate).toBe(50);
  });

  it('is empty-safe', () => {
    const st = sessionStats([]);
    expect(st.avgScore).toBeNull();
    expect(st.finishRate).toBeNull();
    expect(st.medianMinutes).toBeNull();
  });
});

describe('skills', () => {
  it('averages each skill and names the weakest and strongest', () => {
    const { avg, count } = skillAverages([
      session({ skills: { acknowledge: 90, clarify: 50, transform: 60, empathy: 80, rapport: 70 } }),
      session({ skills: { acknowledge: 70, clarify: 40, transform: 60, empathy: 80, rapport: 70 } }),
      session({ skills: null }),
    ]);
    expect(count).toBe(2);
    expect(avg.acknowledge).toBe(80);
    expect(extremeSkill(avg, 'weakest')).toBe('clarify');
    expect(extremeSkill(avg, 'strongest')).toBe('acknowledge');
  });
});

describe('breakdowns', () => {
  it('groups by any key, busiest first', () => {
    const g = groupStats(
      [session({ pushback_id: 'cost' }), session({ pushback_id: 'cost' }), session({ pushback_id: 'rx-diet', score_overall: 40 })],
      (s) => s.pushback_id,
    );
    expect(g.map((x) => x.key)).toEqual(['cost', 'rx-diet']);
    expect(g[1].avgScore).toBe(40);
  });

  it('pairs trainee and owner drivers', () => {
    const m = driverMatchup(
      [session({ owner_driver: 'Activator', score_overall: 50 }), session({ owner_driver: 'Activator', score_overall: 70 })],
      () => 'Analyzer',
    );
    expect(m.get('Analyzer|Activator')).toEqual({ avgScore: 60, scored: 2 });
  });

  it('bins scores and clocks practice by weekday and hour', () => {
    expect(scoreHistogram([session({ score_overall: 100 }), session({ score_overall: 95 }), session({ score_overall: 5 })])).toEqual([
      1, 0, 0, 0, 0, 0, 0, 0, 0, 2,
    ]);
    const local = new Date('2026-10-14T09:30:00');
    const grid = practiceClock([session({ created_at: local.toISOString() })]);
    expect(grid[local.getDay()][9]).toBe(1);
  });
});

describe('sessionTrend', () => {
  it('buckets sessions and averages scores per day', () => {
    const now = new Date('2026-10-15T12:00:00').getTime();
    const today = new Date('2026-10-15T09:00:00').toISOString();
    const { points } = sessionTrend(
      [session({ created_at: today, score_overall: 80 }), session({ created_at: today, completed: false, score_overall: null })],
      '7d',
      now,
    );
    const last = points[points.length - 1];
    expect(last).toMatchObject({ sessions: 2, finished: 1, leftEarly: 1, avgScore: 80, trainees: 1 });
  });
});
