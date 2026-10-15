import { describe, expect, it } from 'vitest';
import { AI_ALERTS, aiHealth, buildAttention, nameList, type AiHealth } from '../attention';
import { DAY_MS } from '../period';
import { rollupTrainees } from '../trainees';
import { anonSession, person, rebuiltSession, session } from './fixtures';

const NOW = new Date('2026-10-15T12:00:00.000Z').getTime();
const ago = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

function call(over: Partial<{ created_at: string; latency_ms: number; cost_usd: number; error: string | null }> = {}) {
  return { created_at: ago(1), latency_ms: 1200, cost_usd: 0.01, error: null, ...over };
}

const healthy: AiHealth = {
  calls: 200,
  failures: 2,
  failureRate: 1,
  medianMs: 1400,
  p95Ms: 3000,
  costUsd: 4,
  projectedMonthlyUsd: 4.3,
};

function base() {
  const directory = [
    person({ user_id: 'a', display_name: 'Active Ann', created_at: ago(60) }),
    person({ user_id: 'b', display_name: 'Slipping Sam', created_at: ago(60) }),
    person({ user_id: 'c', display_name: 'Slipping Cy', created_at: ago(60) }),
    person({ user_id: 'd', display_name: 'New Nia', created_at: ago(3) }),
    person({ user_id: 'e', display_name: 'Idle Ed', created_at: ago(30) }),
    person({ user_id: 'f', display_name: 'Staff Flo', created_at: ago(30), admin_role: 'analyst' }),
    person({ user_id: 'g', display_name: 'Gone Gil', created_at: ago(30), disabled: true }),
  ];
  const sessions = [
    session({ user_id: 'a', created_at: ago(1), score_overall: 48, pushback_id: 'cost' }),
    session({ user_id: 'a', created_at: ago(2), score_overall: 80 }),
    session({ user_id: 'b', created_at: ago(10), score_overall: 52, pushback_id: 'weight-denial' }),
    session({ user_id: 'c', created_at: ago(18) }),
    session({ user_id: 'a', created_at: ago(3), score_unavailable: true, score_overall: 0 }),
  ];
  const trainees = rollupTrainees(directory, sessions, { windowStart: NOW - 28 * DAY_MS, now: NOW });
  const names = new Map(directory.map((d) => [d.user_id, d.display_name as string]));
  return {
    trainees,
    windowSessions: sessions,
    nameOf: (id: string) => names.get(id) ?? 'Someone',
    objectionLabel: (id: string | null) => (id === 'cost' ? 'Cost / price pushback' : id ?? 'Unknown'),
    now: NOW,
  };
}

describe('buildAttention', () => {
  it('lists every kind of item, most severe first', () => {
    const items = buildAttention({
      ...base(),
      ai: { ...healthy, failures: 14, failureRate: 7, p95Ms: 8000 },
      reports: [
        { kind: 'bug', status: 'open', message: 'Scorecard spun forever.', created_at: ago(0.1) },
        { kind: 'suggestion', status: 'open', message: 'Keep hints on screen.', created_at: ago(2) },
        { kind: 'bug', status: 'resolved', message: 'Old.', created_at: ago(9) },
      ],
    });
    expect(items.map((i) => i.key)).toEqual([
      'ai-failures',
      'reports-bugs',
      'ai-slow',
      'low-scores',
      'at-risk',
      'scoring-failed',
      'not-started',
    ]);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey['ai-failures'].tone).toBe('danger');
    expect(byKey['reports-bugs'].title).toBe('1 open problem report');
    expect(byKey['reports-bugs'].detail).toBe('Latest: “Scorecard spun forever.” Plus 1 open suggestion.');
    expect(byKey['reports-bugs'].action.target).toEqual({ kind: 'nav', screen: 'feedback', tab: 'reports' });
    expect(byKey['low-scores'].title).toBe('2 sessions scored under 55');
    expect(byKey['low-scores'].detail).toContain('Lowest: Active Ann on “Cost / price pushback” (48)');
    expect(byKey['at-risk'].title).toBe('2 trainees are slipping');
    // Closest to going dormant first.
    expect(byKey['at-risk'].detail.startsWith('Slipping Cy and Slipping Sam')).toBe(true);
    expect(byKey['scoring-failed'].title).toBe('1 session couldn’t be scored');
  });

  it('nudges only trainees who joined over a week ago — never staff, the disabled or the brand new', () => {
    const items = buildAttention(base());
    const ns = items.find((i) => i.key === 'not-started');
    expect(ns?.title).toBe('1 person hasn’t started');
    expect(ns?.detail).toBe('Idle Ed joined over a week ago and hasn’t practised yet.');
  });

  it('opens the session itself when only one scored low', () => {
    const b = base();
    const items = buildAttention({ ...b, windowSessions: b.windowSessions.filter((s) => s.score_overall !== 52) });
    const low = items.find((i) => i.key === 'low-scores');
    expect(low?.action.target).toMatchObject({ kind: 'tab', tab: 'sessions' });
    expect((low?.action.target as { id?: string }).id).toBeTruthy();
  });

  it('never turns anonymous sessions into a person: no name, no slipping, no "never started"', () => {
    const b = base();
    const anon = [
      anonSession('dev-1', { created_at: ago(1), score_overall: 30, pushback_id: 'cost' }),
      anonSession('dev-2', { created_at: ago(2), score_overall: 50 }),
      rebuiltSession('dev-3', 'unknown', { created_at: ago(12) }),
    ];
    const sessions = [...b.windowSessions, ...anon];
    const directory = [
      person({ user_id: 'a', display_name: 'Active Ann', created_at: ago(60) }),
      person({ user_id: 'b', display_name: 'Slipping Sam', created_at: ago(60) }),
      person({ user_id: 'c', display_name: 'Slipping Cy', created_at: ago(60) }),
    ];
    const asked: string[] = [];
    const items = buildAttention({
      ...b,
      trainees: rollupTrainees(directory, sessions, { windowStart: NOW - 28 * DAY_MS, now: NOW }),
      windowSessions: sessions,
      nameOf: (id) => {
        asked.push(id);
        return b.nameOf(id);
      },
    });
    const low = items.find((i) => i.key === 'low-scores');
    expect(low?.title).toBe('4 sessions scored under 55');
    expect(low?.detail).toBe(
      'Across 2 trainees and 2 anonymous devices. Lowest: an anonymous session on “Cost / price pushback” (30). Its transcript shows where the conversation went wrong.',
    );
    // The name lookup is never asked about a session with no account.
    expect(asked.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    const atRisk = items.find((i) => i.key === 'at-risk');
    expect(atRisk?.detail.startsWith('Slipping Cy and Slipping Sam')).toBe(true);
    expect(items.find((i) => i.key === 'not-started')).toBeUndefined();
  });

  it('stays quiet about AI on a healthy or tiny sample, and when the viewer cannot see it', () => {
    expect(buildAttention({ ...base(), ai: healthy }).some((i) => i.key.startsWith('ai-'))).toBe(false);
    const tiny: AiHealth = { ...healthy, calls: AI_ALERTS.minCalls - 1, failures: 5, failureRate: 60 };
    expect(buildAttention({ ...base(), ai: tiny }).some((i) => i.key.startsWith('ai-'))).toBe(false);
    expect(buildAttention({ ...base(), ai: null, reports: null }).some((i) => i.key.startsWith('ai-') || i.key.startsWith('reports'))).toBe(false);
  });

  it('treats suggestions alone as information, not a problem', () => {
    const items = buildAttention({
      ...base(),
      reports: [{ kind: 'suggestion', status: 'open', message: 'Dark mode please', created_at: ago(1) }],
    });
    const r = items.find((i) => i.key === 'reports-ideas');
    expect(r?.tone).toBe('info');
    expect(r?.title).toBe('1 new suggestion from trainees');
  });

  it('is empty when all is well', () => {
    const directory = [person({ user_id: 'a', created_at: ago(60) })];
    const sessions = [session({ user_id: 'a', created_at: ago(1), score_overall: 80 })];
    expect(
      buildAttention({
        trainees: rollupTrainees(directory, sessions, { windowStart: NOW - 28 * DAY_MS, now: NOW }),
        windowSessions: sessions,
        nameOf: () => 'A',
        objectionLabel: () => 'X',
        reports: [],
        ai: healthy,
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe('aiHealth', () => {
  it('measures only the current window and projects spend over the days observed', () => {
    const calls = [
      call({ created_at: ago(2), latency_ms: 1000, cost_usd: 0.5 }),
      call({ created_at: ago(1), latency_ms: 2000, cost_usd: 0.5, error: 'boom' }),
      call({ created_at: ago(1), latency_ms: 3000, cost_usd: 1 }),
      // Previous window — ignored.
      call({ created_at: ago(10), latency_ms: 99_000, cost_usd: 100, error: 'old' }),
    ];
    const h = aiHealth(calls, '7d', NOW);
    expect(h.calls).toBe(3);
    expect(h.failures).toBe(1);
    expect(h.failureRate).toBeCloseTo(33.33, 1);
    expect(h.medianMs).toBe(2000);
    expect(h.p95Ms).toBe(3000);
    expect(h.costUsd).toBe(2);
    // $2 over 2 observed days → $30 a month.
    expect(h.projectedMonthlyUsd).toBeCloseTo(30, 5);
  });

  it('is empty-safe', () => {
    const h = aiHealth([], '28d', NOW);
    expect(h).toMatchObject({ calls: 0, failureRate: null, medianMs: null, p95Ms: null, costUsd: 0, projectedMonthlyUsd: null });
  });
});

describe('nameList', () => {
  it('names up to three, then counts the rest', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['A'])).toBe('A');
    expect(nameList(['A', 'B'])).toBe('A and B');
    expect(nameList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(nameList(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
  });
});
