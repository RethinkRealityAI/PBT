import { describe, expect, it } from 'vitest';
import {
  anonymousSessionsInWindow,
  inSegment,
  matchesQuery,
  roleLabel,
  rosterCsv,
  rosterSummary,
  sortRoster,
} from '../traineeRoster';
import { rollupTrainees } from '../trainees';
import { DAY_MS } from '../period';
import { anonSession, person, rebuiltSession, session } from './fixtures';

const NOW = new Date('2026-10-15T12:00:00').getTime();
const daysAgo = (d: number) => new Date(NOW - d * DAY_MS).toISOString();

const directory = [
  person({ user_id: 'u1', display_name: 'Marie Tremblay', email: 'marie@clinic.ca', admin_role: 'content_manager' }),
  person({ user_id: 'u2', display_name: 'Alex Chen', email: 'alex@clinic.ca' }),
  person({ user_id: 'u3', display_name: 'Grace Kim', email: null, created_at: daysAgo(3) }),
  person({ user_id: 'u4', display_name: 'Jonah Reed' }),
];
const sessions = [
  // Marie: active now, practised in both windows.
  session({ user_id: 'u1', created_at: daysAgo(1), score_overall: 80 }),
  session({ user_id: 'u1', created_at: daysAgo(2), score_overall: 70 }),
  session({ user_id: 'u1', created_at: daysAgo(40), score_overall: 60 }),
  // Alex: at risk now (12 days); was active at the start of the window.
  session({ user_id: 'u2', created_at: daysAgo(12), score_overall: 50 }),
  session({ user_id: 'u2', created_at: daysAgo(30), score_overall: 55 }),
  // Jonah: dormant now, at risk when the window began (28 + 10 days ago).
  session({ user_id: 'u4', created_at: daysAgo(38), score_overall: 65 }),
  // Someone not in the directory never counts.
  session({ user_id: 'ghost', created_at: daysAgo(1) }),
  // Nor does anonymous practice: it belongs to a device, not a trainee.
  anonSession('dev-1', { created_at: daysAgo(1) }),
  anonSession('dev-1', { created_at: daysAgo(31) }),
  rebuiltSession('dev-2', 'unknown', { created_at: daysAgo(14) }),
];
const rows = rollupTrainees(directory, sessions, { windowStart: NOW - 28 * DAY_MS, now: NOW });

describe('roleLabel', () => {
  it('names system roles and humanises custom ones', () => {
    expect(roleLabel('content_manager')).toBe('Content Manager');
    expect(roleLabel('front_desk_lead')).toBe('Front desk lead');
    expect(roleLabel(null)).toBeNull();
  });
});

describe('segments and search', () => {
  it('filters by status and by "new"', () => {
    expect(rows.filter((r) => inSegment(r, 'active')).map((r) => r.user_id)).toEqual(['u1']);
    expect(rows.filter((r) => inSegment(r, 'at_risk')).map((r) => r.user_id)).toEqual(['u2']);
    expect(rows.filter((r) => inSegment(r, 'not_started')).map((r) => r.user_id)).toEqual(['u3']);
    expect(rows.filter((r) => inSegment(r, 'new')).map((r) => r.user_id)).toEqual(['u3']);
    expect(rows.filter((r) => inSegment(r, 'all'))).toHaveLength(4);
  });

  it('matches name, email and role', () => {
    const ids = (q: string) => rows.filter((r) => matchesQuery(r, q)).map((r) => r.user_id);
    expect(ids('marie')).toEqual(['u1']);
    expect(ids('alex@')).toEqual(['u2']);
    expect(ids('content manager')).toEqual(['u1']);
    expect(ids('  ')).toHaveLength(4);
  });
});

describe('sortRoster', () => {
  it('sorts by a column with empty values last either way', () => {
    expect(sortRoster(rows, 'avgScore', 'desc').map((r) => r.user_id)).toEqual(['u1', 'u2', 'u3', 'u4']);
    expect(sortRoster(rows, 'avgScore', 'asc').map((r) => r.user_id)).toEqual(['u2', 'u1', 'u3', 'u4']);
    expect(sortRoster(rows, 'lastActive', 'desc')[0].user_id).toBe('u1');
    expect(sortRoster(rows, 'lastActive', 'desc').at(-1)?.user_id).toBe('u3');
  });

  it('sorts status by urgency', () => {
    expect(sortRoster(rows, 'status', 'asc').map((r) => r.status)).toEqual([
      'at_risk',
      'dormant',
      'not_started',
      'active',
    ]);
  });
});

describe('rosterSummary', () => {
  it('compares each figure with what it read one window ago', () => {
    const s = rosterSummary(rows, sessions, '28d', NOW);
    expect(s.practising).toBe(2); // Marie + Alex
    expect(s.practisingPrev).toBe(3); // Marie (40d), Alex (30d), Jonah (38d)
    expect(s.perActive).toBe(1.5);
    expect(s.perActivePrev).toBe(1);
    expect(s.atRisk).toBe(1);
    // When the window began: Jonah (10 days since) and Marie (12 days) were at risk; Alex had practised 2 days before.
    expect(s.atRiskPrev).toBe(2);
  });

  it('has no previous figures for all time', () => {
    const s = rosterSummary(rows, sessions, 'all', NOW);
    expect(s.practisingPrev).toBeNull();
    expect(s.atRiskPrev).toBeNull();
    expect(s.practising).toBe(3);
  });
});

describe('anonymousSessionsInWindow', () => {
  it('counts the window’s sessions played without an account', () => {
    expect(anonymousSessionsInWindow(sessions, '28d', NOW)).toBe(2);
    expect(anonymousSessionsInWindow(sessions, '7d', NOW)).toBe(1);
    expect(anonymousSessionsInWindow(sessions, 'all', NOW)).toBe(3);
    expect(anonymousSessionsInWindow([], '28d', NOW)).toBe(0);
  });
});

describe('rosterCsv', () => {
  it('writes plain-English headers and one row per trainee', () => {
    const csv = rosterCsv(rows, '28d');
    expect(csv.header[0]).toBe('Name');
    expect(csv.header).toContain('Sessions (last 28 days)');
    expect(csv.rows).toHaveLength(4);
    const marie = csv.rows[0];
    expect(marie[0]).toBe('Marie Tremblay');
    expect(marie[2]).toBe('Content Manager');
    expect(marie[3]).toBe('Active');
  });
});
