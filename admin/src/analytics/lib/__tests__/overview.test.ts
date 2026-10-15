import { describe, expect, it } from 'vitest';
import { leaders, measured, practiceFunnel, trendExtras } from '../overview';
import { DAY_MS } from '../period';
import { rollupTrainees } from '../trainees';
import { person, session } from './fixtures';

const NOW = new Date('2026-10-15T12:00:00.000Z').getTime();
const ago = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

describe('trendExtras', () => {
  it('adds practice hours, owner-won-over and finish rates per bucket, null where nothing was measured', () => {
    const rows = [
      session({ created_at: ago(0.1), duration_seconds: 1800, owner_mood_end: 'green' }),
      session({ created_at: ago(0.1), duration_seconds: 1800, owner_mood_end: 'red' }),
      session({ created_at: ago(0.1), completed: false, duration_seconds: 600, owner_mood_end: 'green' }),
    ];
    const t = trendExtras(rows, '7d', NOW);
    expect(t.practiceHours).toHaveLength(7);
    const last = t.practiceHours.length - 1;
    expect(t.practiceHours[last]).toBeCloseTo(4200 / 3600, 5);
    // Only finished sessions count towards "won over": 1 of 2.
    expect(t.resolvedRate[last]).toBe(50);
    expect(t.finishRate[last]).toBeCloseTo(66.67, 1);
    expect(t.scored[last]).toBe(2);
    expect(t.passRate[last]).toBe(100);
    expect(t.passRate[0]).toBeNull();
    expect(t.resolvedRate[0]).toBeNull();
    expect(t.finishRate[0]).toBeNull();
  });

  it('measured() drops empty buckets', () => {
    expect(measured([null, 3, null, 5])).toEqual([3, 5]);
  });
});

describe('practiceFunnel', () => {
  it('counts people at each step as a share of (enabled) accounts', () => {
    const directory = [
      person({ user_id: 'a' }),
      person({ user_id: 'b' }),
      person({ user_id: 'c' }),
      person({ user_id: 'd' }),
      person({ user_id: 'x', disabled: true }),
    ];
    const sessions = [
      session({ user_id: 'a', created_at: ago(1) }),
      session({ user_id: 'a', created_at: ago(40) }),
      session({ user_id: 'a', created_at: ago(50) }),
      session({ user_id: 'b', created_at: ago(60) }),
      session({ user_id: 'x', created_at: ago(1) }),
      session({ user_id: 'ghost', created_at: ago(1) }),
    ];
    const steps = practiceFunnel(directory, sessions, NOW - 28 * DAY_MS, 'last 28 days');
    expect(steps.map((s) => [s.key, s.count, s.pctOfAccounts])).toEqual([
      ['accounts', 4, 100],
      ['practised', 2, 50],
      ['regular', 1, 25],
      ['window', 1, 25],
    ]);
    expect(steps[3].hint).toBe('At least one session in the last 28 days');
  });

  it('is empty-safe', () => {
    const steps = practiceFunnel([], [], 0, 'last 7 days');
    expect(steps.every((s) => s.count === 0 && s.pctOfAccounts === null)).toBe(true);
  });
});

describe('leaders', () => {
  it('ranks the most improved (positive, practised in the window) and the most active', () => {
    const directory = [
      person({ user_id: 'up', display_name: 'Up' }),
      person({ user_id: 'down', display_name: 'Down' }),
      person({ user_id: 'old', display_name: 'Lapsed improver' }),
      person({ user_id: 'busy', display_name: 'Busy' }),
    ];
    const seq = (user: string, scores: number[], startDaysAgo: number) =>
      scores.map((score, i) => session({ user_id: user, score_overall: score, created_at: ago(startDaysAgo - i) }));
    const sessions = [
      // Momentum = mean of the latest 5 scores minus the 5 before (needs 2 + 2 beyond the latest 5).
      ...seq('up', [50, 52, 50, 70, 72, 70, 74, 76], 8),
      ...seq('down', [80, 82, 80, 60, 62, 60, 60, 60], 8),
      ...seq('old', [40, 40, 40, 80, 80, 80, 80, 80], 60),
      ...seq('busy', Array.from({ length: 10 }, () => 70), 10),
    ];
    const rows = rollupTrainees(directory, sessions, { windowStart: NOW - 28 * DAY_MS, now: NOW });
    const l = leaders(rows);
    expect(l.improved.map((r) => r.name)).toEqual(['Up']);
    // A tie on sessions goes to the higher average.
    expect(l.active.map((r) => r.name)).toEqual(['Busy', 'Down', 'Up']);
    expect(l.active.map((r) => r.sessions)).toEqual([10, 8, 8]);
  });
});
