import { describe, expect, it } from 'vitest';
import { coachingNotes, rollupTrainees, scoreMomentum, statusCounts, streaks, traineeStatus } from '../trainees';
import { DAY_MS } from '../period';
import { person, session } from './fixtures';

const NOW = new Date('2026-10-15T12:00:00').getTime();
const daysAgo = (d: number) => new Date(NOW - d * DAY_MS).toISOString();

describe('traineeStatus', () => {
  it('reads the practice habit from the last session', () => {
    expect(traineeStatus(null, NOW)).toBe('not_started');
    expect(traineeStatus(NOW - 2 * DAY_MS, NOW)).toBe('active');
    expect(traineeStatus(NOW - 10 * DAY_MS, NOW)).toBe('at_risk');
    expect(traineeStatus(NOW - 40 * DAY_MS, NOW)).toBe('dormant');
  });
});

describe('streaks', () => {
  it('counts consecutive local days, and today without a session does not break it', () => {
    const t = (d: number) => NOW - d * DAY_MS;
    expect(streaks([t(1), t(2), t(3), t(6)], NOW)).toEqual({ current: 3, best: 3, days: 4 });
    expect(streaks([t(0), t(1)], NOW).current).toBe(2);
    expect(streaks([t(3)], NOW).current).toBe(0);
    expect(streaks([], NOW)).toEqual({ current: 0, best: 0, days: 0 });
  });
});

describe('scoreMomentum', () => {
  it('compares the latest five scores with the five before', () => {
    const rows = [90, 90, 90, 90, 90, 70, 70, 70, 70, 70].map((v) => session({ score_overall: v }));
    expect(scoreMomentum(rows)).toBe(20);
    expect(scoreMomentum(rows.slice(0, 3))).toBeNull();
  });
});

describe('rollupTrainees', () => {
  it('gives every person in the directory a row, including those who never trained', () => {
    const rows = rollupTrainees(
      [person({ user_id: 'u1' }), person({ user_id: 'u2', display_name: null, email: 'sam@clinic.ca' })],
      [
        session({ user_id: 'u1', created_at: daysAgo(1), score_overall: 80 }),
        session({ user_id: 'u1', created_at: daysAgo(40), score_overall: 60 }),
      ],
      { windowStart: NOW - 28 * DAY_MS, now: NOW },
    );
    const u1 = rows.find((r) => r.user_id === 'u1')!;
    expect(u1).toMatchObject({ status: 'active', sessions: 1, sessionsAll: 2, avgScore: 80, bestScore: 80 });
    const u2 = rows.find((r) => r.user_id === 'u2')!;
    expect(u2).toMatchObject({ status: 'not_started', name: 'sam', sessions: 0, avgScore: null });
    expect(statusCounts(rows)).toMatchObject({ all: 2, active: 1, not_started: 1 });
  });

  it('takes the latest sign of life from sessions, app activity or sign-in', () => {
    const [row] = rollupTrainees(
      [person({ last_sign_in_at: daysAgo(3) })],
      [session({ created_at: daysAgo(9) })],
      {
        windowStart: NOW - 28 * DAY_MS,
        now: NOW,
        engagement: [{ user_id: 'u1', last_seen: daysAgo(1), active_days: 4, screen_views: 20, dwell_ms: 1, hint_requests: 0 }],
      },
    );
    expect(row.status).toBe('at_risk');
    expect(row.lastActiveAt).toBe(NOW - DAY_MS);
    expect(row.appActiveDays).toBe(4);
  });
});

describe('coachingNotes', () => {
  const label = (id: string) => id;
  it('suggests a first session for someone who never practised', () => {
    expect(coachingNotes({ sessions: [], teamSkills: {} as never, objectionLabel: label, now: NOW })[0].tone).toBe('watch');
  });

  it('names the weakest skill against the team and the hardest objection', () => {
    const notes = coachingNotes({
      sessions: [
        session({ created_at: daysAgo(1), pushback_id: 'cost', score_overall: 85, skills: { acknowledge: 85, clarify: 50, transform: 80, empathy: 90, rapport: 85 } }),
        session({ created_at: daysAgo(2), pushback_id: 'cost', score_overall: 83, skills: { acknowledge: 85, clarify: 50, transform: 80, empathy: 90, rapport: 85 } }),
        session({ created_at: daysAgo(3), pushback_id: 'rx-diet', score_overall: 55, skills: { acknowledge: 85, clarify: 50, transform: 80, empathy: 90, rapport: 85 } }),
        session({ created_at: daysAgo(4), pushback_id: 'rx-diet', score_overall: 57, skills: { acknowledge: 85, clarify: 50, transform: 80, empathy: 90, rapport: 85 } }),
      ],
      teamSkills: { acknowledge: 70, clarify: 65, transform: 70, empathy: 70, rapport: 70 },
      objectionLabel: label,
      now: NOW,
    });
    const text = notes.map((n) => n.text).join('\n');
    expect(text).toContain('Focus on Clarify');
    expect(text).toContain('15 below the team');
    expect(text).toContain('Hardest objection: “rx-diet”');
    expect(text).toContain('Strongest at Empathy');
  });

  it('flags a long gap and a habit of leaving early', () => {
    const notes = coachingNotes({
      sessions: [0, 1, 2, 3].map((i) => session({ created_at: daysAgo(12 + i), completed: i === 0 })),
      teamSkills: { acknowledge: 70, clarify: 70, transform: 70, empathy: 70, rapport: 70 },
      objectionLabel: label,
      now: NOW,
    });
    const text = notes.map((n) => n.text).join('\n');
    expect(text).toContain('Hasn’t practised in 12 days');
    expect(text).toContain('Leaves 75% of sessions');
  });
});
