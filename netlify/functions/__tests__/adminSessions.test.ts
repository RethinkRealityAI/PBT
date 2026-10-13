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
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

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
