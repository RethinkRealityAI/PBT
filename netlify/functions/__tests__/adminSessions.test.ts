// @vitest-environment node
/**
 * `admin-sessions` derives two per-row facts once, server-side, so every
 * admin screen reads them the same way:
 *  - `score_unavailable` — a scoring-failure placeholder, never a real 0;
 *  - `difficulty` — the level the session was played at, from the stored
 *    scenario jsonb (no column, no migration). Context beside a score only:
 *    the scorer holds every level to one standard, so it never touches
 *    `score_overall`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  jsonRequest,
  makeFakeSupabase,
  setFunctionEnv,
  type FakeSupabase,
  type SbCall,
  type SbResult,
} from './fakeSupabase';
import type { SessionSummaryResponse } from '../../../src/shared/analytics/contract';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import sessions from '../admin-sessions';

let sb: FakeSupabase;

function signInAdmin() {
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
}

const get = () =>
  sessions(
    jsonRequest('admin-sessions?days=28', null, {
      method: 'GET',
      headers: { authorization: 'Bearer admin' },
    }),
  );

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('admin-sessions — difficulty', () => {
  it('reads each row’s level from its stored scenario and leaves the score alone', async () => {
    signInAdmin();
    sb.setHandler('training_sessions', () => ({
      data: [
        { id: 'a', scenario: { difficulty: 4, breed: 'Labrador' }, score_report: null, score_overall: 75 },
        { id: 'b', scenario: { summary: 'backfilled', pushbackId: 'cost' }, score_report: null, score_overall: 60 },
        { id: 'c', scenario: null, score_report: null, score_overall: null },
        { id: 'd', scenario: { difficulty: 'Combative' }, score_report: null, score_overall: 50 },
      ],
      error: null,
    }));

    const res = await get();
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    expect(rows.map((r) => [r.id, r.difficulty, r.score_overall])).toEqual([
      ['a', 4, 75],
      ['b', null, 60],
      ['c', null, null],
      ['d', null, 50],
    ]);
  });

  it('still requires an admin', async () => {
    const res = await sessions(jsonRequest('admin-sessions', null, { method: 'GET' }));
    expect(res.status).toBe(401);
  });
});

/** PostgREST-like: `eq` filters, `.range()` capped at 1,000 rows, `maybeSingle`. */
function table(rows: Array<Record<string, unknown>>, opts: { failWith?: SbResult['error'] } = {}) {
  return (call: SbCall): SbResult => {
    if (opts.failWith) return { data: null, error: opts.failWith };
    let out = rows.filter((r) =>
      call.ops.every((o) => (o.op === 'eq' ? r[o.args[0] as string] === o.args[1] : true)),
    );
    const range = call.ops.find((o) => o.op === 'range');
    if (range) {
      const [from, to] = range.args as [number, number];
      out = out.slice(from, Math.min(to + 1, from + 1000));
    }
    if (call.ops.some((o) => o.op === 'maybeSingle')) return { data: out[0] ?? null, error: null };
    return { data: out, error: null };
  };
}

const SESSION_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function sessionRow(i: number, over: Record<string, unknown> = {}) {
  return {
    id: i === 0 ? SESSION_ID : `bbbbbbbb-0000-4000-8000-${String(i).padStart(12, '0')}`,
    user_id: 'u1',
    created_at: '2026-10-10T10:00:00.000Z',
    scenario: { breed: 'Lab', age: 'Adult (3-7)', persona: 'Skeptical', difficulty: 2, pushback: { id: 'cost', title: 'Cost' }, _overrideId: 'seed:1' },
    transcript: [
      { role: 'ai', text: 'Too pricey', timestamp: 0 },
      { role: 'user', text: 'Tell me more', timestamp: 3000 },
    ],
    score_report: null,
    score_overall: null,
    mode: 'text',
    ...over,
  };
}

const getPath = (path: string) =>
  sessions(jsonRequest(path, null, { method: 'GET', headers: { authorization: 'Bearer admin' } }));

describe('admin-sessions — paging past PostgREST’s 1,000-row page', () => {
  it('the default list reads past 1,000 rows up to the limit', async () => {
    signInAdmin();
    sb.setHandler('training_sessions', table(Array.from({ length: 2500 }, (_, i) => sessionRow(i))));
    const all = (await (await getPath('admin-sessions?limit=5000')).json()) as unknown[];
    expect(all).toHaveLength(2500);
    const capped = (await (await getPath('admin-sessions?limit=1200')).json()) as unknown[];
    expect(capped).toHaveLength(1200);
    // A garbage limit falls back to the old default instead of NaN.
    const fallback = (await (await getPath('admin-sessions?limit=abc')).json()) as unknown[];
    expect(fallback).toHaveLength(1000);
  });

  it('refuses an unknown view', async () => {
    signInAdmin();
    expect((await getPath('admin-sessions?view=nope')).status).toBe(400);
  });
});

describe('admin-sessions — ?view=summary', () => {
  it('returns summaries (no transcript) with hint counts from nav events', async () => {
    signInAdmin();
    sb.setHandler('training_sessions', table([sessionRow(0)]));
    sb.setHandler(
      'nav_events',
      table([
        { id: 1, target: 'coach_hint_request', meta: { sessionId: SESSION_ID } },
        { id: 2, target: 'coach_hint_request', meta: { sessionId: SESSION_ID } },
        { id: 3, target: 'coach_hint_request', meta: { sessionId: 'other' } },
      ]),
    );
    const res = await getPath('admin-sessions?view=summary&since=2026-10-01T00:00:00.000Z');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SessionSummaryResponse;
    expect(body.truncated).toBe(false);
    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      id: SESSION_ID,
      scenario_source: 'library',
      difficulty: 2,
      hints_used: 2,
      staff_messages: 1,
      reply_seconds_median: 3,
    });
    expect(JSON.stringify(body)).not.toContain('Too pricey');
    // Hints are read from a day before the window (a session's row is written when it ends).
    const hintCall = sb.callsFor('nav_events')[0];
    expect(hintCall.ops.find((o) => o.op === 'eq')?.args).toEqual(['target', 'coach_hint_request']);
    expect(hintCall.ops.find((o) => o.op === 'gte')?.args).toEqual(['created_at', '2026-09-30T00:00:00.000Z']);
  });

  it('caps at 10,000 and says truncated', async () => {
    signInAdmin();
    sb.setHandler('nav_events', table([]));
    // Every page is full: more rows than the cap.
    sb.setHandler('training_sessions', (call) => {
      const [from, to] = call.ops.find((o) => o.op === 'range')!.args as [number, number];
      const n = Math.min(to - from + 1, 1000);
      return { data: Array.from({ length: n }, (_, i) => sessionRow(from + i + 1)), error: null };
    });
    const body = (await (await getPath('admin-sessions?view=summary&limit=99999')).json()) as SessionSummaryResponse;
    expect(body.rows).toHaveLength(10_000);
    expect(body.truncated).toBe(true);
  });

  it('a failed hint read leaves hints unknown; a failed session read is a 500', async () => {
    signInAdmin();
    sb.setHandler('training_sessions', table([sessionRow(0)]));
    sb.setHandler('nav_events', table([], { failWith: { message: 'timeout' } }));
    const body = (await (await getPath('admin-sessions?view=summary')).json()) as SessionSummaryResponse;
    expect(body.rows[0].hints_used).toBeNull();

    sb.setHandler('training_sessions', table([], { failWith: { message: 'boom' } }));
    expect((await getPath('admin-sessions?view=summary')).status).toBe(500);
  });

  it('rejects a since that is not a date', async () => {
    signInAdmin();
    expect((await getPath('admin-sessions?view=summary&since=yesterday')).status).toBe(400);
  });
});

describe('admin-sessions — ?id=', () => {
  it('returns one full row with the derived fields', async () => {
    signInAdmin();
    sb.setHandler(
      'training_sessions',
      table([sessionRow(0, { score_report: { overall: 0, scoreUnavailable: true, critique: 'x' }, score_overall: 0 })]),
    );
    const res = await getPath(`admin-sessions?id=${SESSION_ID}`);
    expect(res.status).toBe(200);
    const row = (await res.json()) as Record<string, unknown>;
    expect(row.id).toBe(SESSION_ID);
    expect(row.transcript).toHaveLength(2);
    expect(row.score_unavailable).toBe(true);
    expect(row.difficulty).toBe(2);
  });

  it('400 for a non-uuid, 404 for a missing session', async () => {
    signInAdmin();
    sb.setHandler('training_sessions', table([]));
    expect((await getPath('admin-sessions?id=abc')).status).toBe(400);
    expect((await getPath(`admin-sessions?id=${SESSION_ID}`)).status).toBe(404);
  });

  it('still needs sessions.read', async () => {
    sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    sb.setHandler('profiles', () => ({
      data: { is_admin: false, disabled: false, admin_role: 'scenario_author', permission_overrides: null },
      error: null,
    }));
    sb.setHandler('admin_roles', () => ({ data: [], error: null }));
    expect((await getPath(`admin-sessions?id=${SESSION_ID}`)).status).toBe(403);
    expect((await getPath('admin-sessions?view=summary')).status).toBe(403);
  });
});
