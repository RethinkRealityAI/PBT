// @vitest-environment node
/**
 * Every admin list endpoint pages past PostgREST's 1,000-row cap. Before
 * this, `.limit(5000)` silently stopped at 1,000 — the AI quality and
 * engagement screens counted a busy window as if it held 1,000 rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase, type SbCall } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import aiCalls from '../admin-ai-calls';
import navEvents from '../admin-nav-events';
import analyzer from '../admin-analyzer';
import feedback from '../admin-feedback';
import reports from '../admin-reports';

let sb: FakeSupabase;

function signInAdmin() {
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
}

/** A table of `total` rows answered the way PostgREST does: `.range()`, ≤ 1,000 per page. */
function serveRows(table: string, total: number) {
  sb.setHandler(table, (call: SbCall) => {
    const range = call.ops.find((o) => o.op === 'range');
    const [from, to] = (range?.args ?? [0, 999]) as [number, number];
    const end = Math.min(to, from + 999, total - 1);
    const data = [];
    for (let i = from; i <= end; i++) data.push({ id: `r${i}`, created_at: '2026-10-01T00:00:00Z' });
    return { data, error: null };
  });
}

const get = (handler: (req: Request) => Promise<Response>, name: string, query = 'days=28&limit=5000') =>
  handler(jsonRequest(`${name}?${query}`, null, { method: 'GET', headers: { authorization: 'Bearer admin' } }));

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('admin list endpoints page past 1,000 rows', () => {
  it.each([
    ['admin-ai-calls', aiCalls, 'ai_call_telemetry'],
    ['admin-nav-events', navEvents, 'nav_events'],
    ['admin-analyzer', analyzer, 'analyzer_events'],
    ['admin-feedback', feedback, 'session_feedback'],
    ['admin-reports', reports, 'platform_reports'],
  ] as const)('%s returns every row up to its limit', async (name, handler, table) => {
    signInAdmin();
    serveRows(table, 2500);
    const res = await get(handler, name);
    expect(res.status).toBe(200);
    const rows = (await res.json()) as unknown[];
    expect(rows).toHaveLength(2500);
  });

  it('stops at the requested limit', async () => {
    signInAdmin();
    serveRows('nav_events', 2500);
    const rows = (await (await get(navEvents, 'admin-nav-events', 'days=28&limit=1200')).json()) as unknown[];
    expect(rows).toHaveLength(1200);
  });

  it('treats a nonsense limit as the default, never as "no cap"', async () => {
    signInAdmin();
    serveRows('nav_events', 2500);
    const rows = (await (await get(navEvents, 'admin-nav-events', 'days=28&limit=lots')).json()) as unknown[];
    expect(rows).toHaveLength(1000);
  });
});
