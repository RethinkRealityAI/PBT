// @vitest-environment node
/**
 * `admin-analytics` — the Analytics destination's server reads. Pins: GET
 * only, unknown op, the permission each op names (403 from requireAdmin),
 * the directory's email withheld without `team.read` (while last sign-in is
 * still shown), the profile fallback on a pre-RBAC database, engagement's
 * range / tz validation, its paging past PostgREST's 1,000-row page and its
 * truncation at the hard cap, and the trainee profile: id validation, 404,
 * per-section permissions (`withheld`), degraded optional sections, a failed
 * sessions read as a 500, hint counts and no transcripts in the output.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase, type SbCall, type SbResult } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler, { ENGAGEMENT_MAX_ROWS, aiUsageOf, parseTz } from '../admin-analytics';
import type {
  EngagementReport,
  TraineeDetail,
  TraineeDirectoryResponse,
} from '../../../src/shared/analytics/contract';
import type { Permission } from '../../../src/shared/access/permissions';

type Bag = Record<string, unknown>;

let sb: FakeSupabase;

const TRAINEE = '11111111-2222-4333-8444-555555555555';
const NOW = Date.parse('2026-10-15T15:30:00.000Z');

const ALL_SECTIONS: Permission[] = [
  'sessions.read',
  'analytics.read',
  'feedback.read',
  'scenarios.read',
  'analyzer.read',
  'reports.read',
  'quality.read',
];

/** The admin's own profile lookup (requireAdmin) vs any other profiles read. */
function isAdminLookup(call: SbCall): boolean {
  const cols = String(call.ops.find((o) => o.op === 'select')?.args[0] ?? '');
  return !cols.includes('display_name');
}

/**
 * A table that behaves like PostgREST for the ops these reads use: `eq` and
 * `gte` filters, `.range()` capped at 1,000 rows, `maybeSingle`.
 */
function table(rows: Bag[], opts: { failWith?: SbResult['error']; failColumn?: string } = {}) {
  return (call: SbCall): SbResult => {
    const cols = String(call.ops.find((o) => o.op === 'select')?.args[0] ?? '');
    if (opts.failWith) return { data: null, error: opts.failWith };
    if (opts.failColumn && cols.includes(opts.failColumn)) {
      return { data: null, error: { code: '42703', message: `column "${opts.failColumn}" does not exist` } };
    }
    let out = rows.filter((r) =>
      call.ops.every((o) => {
        const [col, val] = o.args as [string, unknown];
        if (o.op === 'eq') return r[col] === val;
        if (o.op === 'gte') return String(r[col] ?? '') >= String(val);
        return true;
      }),
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

/** Signs in an admin whose (custom) role holds exactly `permissions`. */
function signIn(permissions: Permission[], profiles: Bag[] = []) {
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('admin_roles', () => ({ data: [{ key: 'tester', permissions }], error: null }));
  const others = table(profiles);
  sb.setHandler('profiles', (call) =>
    isAdminLookup(call)
      ? { data: { is_admin: false, disabled: false, admin_role: 'tester', permission_overrides: null }, error: null }
      : others(call),
  );
}

function get(query: string) {
  return handler(
    jsonRequest(`admin-analytics?${query}`, null, { method: 'GET', headers: { authorization: 'Bearer admin' } }),
  );
}

function profileRow(over: Bag = {}): Bag {
  return {
    user_id: TRAINEE,
    display_name: 'Riley',
    echo_primary: 'Analyzer',
    echo_secondary: 'Harmonizer',
    created_at: '2026-09-01T00:00:00.000Z',
    locale: 'fr',
    disabled: false,
    admin_role: null,
    is_admin: false,
    ...over,
  };
}

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('admin-analytics — routing', () => {
  it('is GET only', async () => {
    signIn(ALL_SECTIONS);
    const res = await handler(
      jsonRequest('admin-analytics?op=directory', {}, { method: 'POST', headers: { authorization: 'Bearer admin' } }),
    );
    expect(res.status).toBe(405);
  });

  it('refuses an unknown or missing op', async () => {
    signIn(ALL_SECTIONS);
    expect((await get('op=nope')).status).toBe(400);
    expect((await get('')).status).toBe(400);
  });

  it('still requires a signed-in admin', async () => {
    const res = await handler(jsonRequest('admin-analytics?op=directory', null, { method: 'GET' }));
    expect(res.status).toBe(401);
  });
});

describe('admin-analytics — permissions per op', () => {
  it('directory and trainee need sessions.read', async () => {
    signIn(['analytics.read', 'team.read']);
    const dir = await get('op=directory');
    expect(dir.status).toBe(403);
    expect(((await dir.json()) as Bag).error).toBe('Missing permission: sessions.read');
    expect((await get(`op=trainee&id=${TRAINEE}`)).status).toBe(403);
    expect(sb.callsFor('training_sessions')).toHaveLength(0);
  });

  it('engagement needs analytics.read', async () => {
    signIn(['sessions.read']);
    const res = await get('op=engagement&range=7d');
    expect(res.status).toBe(403);
    expect(((await res.json()) as Bag).error).toBe('Missing permission: analytics.read');
    expect(sb.callsFor('nav_events')).toHaveLength(0);
  });
});

describe('admin-analytics — directory', () => {
  const people = [
    profileRow(),
    profileRow({ user_id: 'u-admin', display_name: 'Ada', admin_role: 'analyst', created_at: '2026-08-01T00:00:00Z' }),
  ];
  const authUsers = {
    data: {
      users: [
        { id: TRAINEE, email: 'riley@clinic.test', last_sign_in_at: '2026-10-14T09:00:00Z' },
        { id: 'u-admin', email: 'ada@clinic.test', last_sign_in_at: null },
      ],
    },
    error: null,
  };

  it('withholds email without team.read, keeps last sign-in', async () => {
    signIn(['sessions.read'], people);
    sb.listUsers.mockResolvedValue(authUsers);
    const res = await get('op=directory');
    expect(res.status).toBe(200);
    const body = (await res.json()) as TraineeDirectoryResponse;
    expect(body.emails).toBe(false);
    expect(body.rows).toHaveLength(2);
    expect(body.rows.every((r) => r.email === null)).toBe(true);
    expect(body.rows[0]).toEqual({
      user_id: TRAINEE,
      display_name: 'Riley',
      echo_primary: 'Analyzer',
      echo_secondary: 'Harmonizer',
      created_at: '2026-09-01T00:00:00.000Z',
      locale: 'fr',
      disabled: false,
      admin_role: null,
      email: null,
      last_sign_in_at: '2026-10-14T09:00:00Z',
    });
    expect(body.rows[1].admin_role).toBe('analyst');
    // No internals leak into the directory.
    expect(Object.keys(body.rows[0])).not.toContain('is_admin');
  });

  it('includes email with team.read', async () => {
    signIn(['sessions.read', 'team.read'], people);
    sb.listUsers.mockResolvedValue(authUsers);
    const body = (await (await get('op=directory')).json()) as TraineeDirectoryResponse;
    expect(body.emails).toBe(true);
    expect(body.rows.map((r) => r.email)).toEqual(['riley@clinic.test', 'ada@clinic.test']);
  });

  it('an Auth failure never fails the list', async () => {
    signIn(['sessions.read', 'team.read'], people);
    sb.listUsers.mockRejectedValue(new Error('auth down'));
    const res = await get('op=directory');
    expect(res.status).toBe(200);
    const body = (await res.json()) as TraineeDirectoryResponse;
    expect(body.rows.map((r) => [r.email, r.last_sign_in_at])).toEqual([
      [null, null],
      [null, null],
    ]);
  });

  it('falls back on a database without admin_role (legacy is_admin = admin)', async () => {
    signIn(['sessions.read']);
    const legacy = table([profileRow({ admin_role: undefined, is_admin: true })], { failColumn: 'admin_role' });
    sb.setHandler('profiles', (call) =>
      isAdminLookup(call)
        ? { data: { is_admin: false, disabled: false, admin_role: 'tester', permission_overrides: null }, error: null }
        : legacy(call),
    );
    sb.setHandler('admin_roles', () => ({ data: [{ key: 'tester', permissions: ['sessions.read'] }], error: null }));
    const body = (await (await get('op=directory')).json()) as TraineeDirectoryResponse;
    expect(body.rows[0].admin_role).toBe('admin');
  });

  it('pages past 1,000 profiles', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => profileRow({ user_id: `u-${i}` }));
    signIn(['sessions.read'], many);
    const body = (await (await get('op=directory')).json()) as TraineeDirectoryResponse;
    expect(body.rows).toHaveLength(1500);
  });
});

describe('admin-analytics — engagement', () => {
  it('rejects an unknown range and a non-numeric tz', async () => {
    signIn(['analytics.read']);
    expect((await get('op=engagement&range=30d')).status).toBe(400);
    expect((await get('op=engagement&range=7d&tz=abc')).status).toBe(400);
    expect(sb.callsFor('nav_events')).toHaveLength(0);
  });

  it('parseTz defaults to UTC and clamps to ±14 h', () => {
    expect(parseTz(null)).toBe(0);
    expect(parseTz('')).toBe(0);
    expect(parseTz('-240')).toBe(-240);
    expect(parseTz('300.6')).toBe(301);
    expect(parseTz('9999')).toBe(840);
    expect(parseTz('-9999')).toBe(-840);
    expect(parseTz('nope')).toBe('bad');
  });

  it('reads every event of twice the window, past the 1,000-row page', async () => {
    signIn(['analytics.read']);
    const rows = Array.from({ length: 2500 }, (_, i) => ({
      id: i + 1,
      user_id: i % 2 ? 'u1' : null,
      anon_session_id: `dev-${i % 5}`,
      event_type: 'screen_view',
      screen: 'home',
      target: null,
      meta: null,
      dwell_ms: null,
      created_at: new Date(NOW - (i % 10) * 60 * 60 * 1000).toISOString(),
    }));
    sb.setHandler('nav_events', table(rows));
    const res = await get('op=engagement&range=7d&tz=-240');
    expect(res.status).toBe(200);
    const body = (await res.json()) as EngagementReport;
    expect(body.scanned).toBe(2500);
    expect(body.truncated).toBe(false);
    expect(body.current.screen_views).toBe(2500);
    expect(body.range).toBe('7d');
    expect(body.granularity).toBe('day');
    expect(body.generated_at).toBe(new Date(NOW).toISOString());
    // Window start = now − 2 × 7 days (the previous window is the comparison).
    const gte = sb.callsFor('nav_events')[0].ops.find((o) => o.op === 'gte');
    expect(gte?.args).toEqual(['created_at', new Date(NOW - 14 * 24 * 60 * 60 * 1000).toISOString()]);
    // Only the columns the aggregation reads.
    const select = String(sb.callsFor('nav_events')[0].ops.find((o) => o.op === 'select')?.args[0]);
    expect(select).not.toContain('*');
  });

  it('range=all reads without a date filter and has no comparison', async () => {
    signIn(['analytics.read']);
    sb.setHandler('nav_events', table([]));
    const body = (await (await get('op=engagement&range=all')).json()) as EngagementReport;
    expect(body.previous).toBeNull();
    expect(sb.callsFor('nav_events')[0].ops.some((o) => o.op === 'gte')).toBe(false);
  });

  it('stops at the hard cap and says so', async () => {
    signIn(['analytics.read']);
    // An endless table: every page is full.
    sb.setHandler('nav_events', (call) => {
      const [from, to] = call.ops.find((o) => o.op === 'range')!.args as [number, number];
      const n = Math.min(to - from + 1, 1000);
      return {
        data: Array.from({ length: n }, (_, i) => ({
          id: from + i,
          user_id: null,
          anon_session_id: 'dev',
          event_type: 'screen_view',
          screen: 'home',
          target: null,
          meta: null,
          dwell_ms: null,
          created_at: new Date(NOW - 1000).toISOString(),
        })),
        error: null,
      };
    });
    const body = (await (await get('op=engagement&range=28d')).json()) as EngagementReport;
    expect(body.scanned).toBe(ENGAGEMENT_MAX_ROWS);
    expect(body.truncated).toBe(true);
  });

  it('a failed read is a 500', async () => {
    signIn(['analytics.read']);
    sb.setHandler('nav_events', table([], { failWith: { message: 'timeout' } }));
    expect((await get('op=engagement')).status).toBe(500);
  });
});

describe('admin-analytics — trainee', () => {
  const session = (over: Bag = {}): Bag => ({
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    user_id: TRAINEE,
    created_at: '2026-10-10T10:05:00.000Z',
    duration_seconds: 300,
    mode: 'text',
    completed: true,
    ended_reason: 'completed',
    turns: 2,
    pushback_id: 'cost',
    driver: 'Activator',
    scenario_summary: 'Lab · cost',
    scenario: { breed: 'Lab', age: 'Adult (3-7)', persona: 'Skeptical', difficulty: 2, pushback: { id: 'cost', title: 'Cost' } },
    transcript: [
      { role: 'ai', text: 'Too pricey', timestamp: 1, emotion: 'red' },
      { role: 'user', text: 'I hear you', timestamp: 5001 },
    ],
    score_report: null,
    score_overall: null,
    ...over,
  });

  function seed() {
    sb.setHandler(
      'training_sessions',
      table([session(), session({ id: 'aaaaaaaa-0000-4000-8000-000000000002', user_id: 'someone-else' })]),
    );
    sb.setHandler(
      'nav_events',
      table([
        { id: 1, user_id: TRAINEE, event_type: 'custom', screen: 'chat', target: 'coach_hint_request', meta: { sessionId: 'aaaaaaaa-0000-4000-8000-000000000001' }, dwell_ms: null, anon_session_id: 'd', created_at: '2026-10-10T10:02:00.000Z' },
        { id: 2, user_id: TRAINEE, event_type: 'custom', screen: 'chat', target: 'coach_hint_request', meta: { sessionId: 'aaaaaaaa-0000-4000-8000-000000000001' }, dwell_ms: null, anon_session_id: 'd', created_at: '2026-10-10T10:03:00.000Z' },
        { id: 3, user_id: TRAINEE, event_type: 'screen_view', screen: 'home', target: null, meta: null, dwell_ms: null, anon_session_id: 'd', created_at: '2026-10-10T09:59:00.000Z' },
        { id: 4, user_id: 'someone-else', event_type: 'screen_view', screen: 'home', target: null, meta: null, dwell_ms: null, anon_session_id: 'e', created_at: '2026-10-10T09:59:00.000Z' },
      ]),
    );
    sb.setHandler('session_feedback', table([{ id: 'f1', user_id: TRAINEE, session_id: null, realism: 4, ai_quality: 5, comfort: 3, comment: 'Good', created_at: '2026-10-10T10:06:00Z' }]));
    sb.setHandler('user_scenarios', table([{ id: 'sc1', creator_id: TRAINEE, title: 'My Lab', pushback_id: 'cost', difficulty: 2, species: 'dog', created_at: '2026-10-09T00:00:00Z' }]));
    sb.setHandler('analyzer_events', table([{ id: 'an1', user_id: TRAINEE, breed: 'Lab', bcs: 7, verdict: 'watch', source: 'vision', created_at: '2026-10-08T00:00:00Z' }]));
    sb.setHandler('platform_reports', table([{ id: 'r1', user_id: TRAINEE, kind: 'bug', status: 'open', message: 'Mic', created_at: '2026-10-07T00:00:00Z' }]));
    sb.setHandler(
      'ai_call_telemetry',
      table([
        { id: 'c1', user_id: TRAINEE, call_type: 'roleplay', cost_usd: 0.001 },
        { id: 'c2', user_id: TRAINEE, call_type: 'roleplay', cost_usd: '0.002' },
        { id: 'c3', user_id: TRAINEE, call_type: 'evaluate', cost_usd: 0.01 },
        { id: 'c4', user_id: 'someone-else', call_type: 'evaluate', cost_usd: 5 },
      ]),
    );
  }

  it('rejects a non-uuid id and a missing profile', async () => {
    signIn(['sessions.read'], [profileRow()]);
    expect((await get('op=trainee&id=not-a-uuid')).status).toBe(400);
    expect((await get('op=trainee')).status).toBe(400);
    expect((await get(`op=trainee&id=${TRAINEE}&tz=x`)).status).toBe(400);
    const missing = await get('op=trainee&id=99999999-2222-4333-8444-555555555555');
    expect(missing.status).toBe(404);
  });

  it('with sessions.read only: profile + sessions, every other section withheld', async () => {
    signIn(['sessions.read'], [profileRow()]);
    seed();
    sb.getUserById.mockResolvedValue({
      data: { user: { id: TRAINEE, email: 'riley@clinic.test', last_sign_in_at: '2026-10-14T09:00:00Z' } },
      error: null,
    });
    const res = await get(`op=trainee&id=${TRAINEE}&tz=-240`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as TraineeDetail;
    expect(body.profile.display_name).toBe('Riley');
    expect(body.profile.email).toBeNull();
    expect(body.profile.last_sign_in_at).toBe('2026-10-14T09:00:00Z');
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0].hints_used).toBe(2);
    expect(body.sessions[0].reply_seconds_median).toBe(5);
    expect(JSON.stringify(body)).not.toContain('Too pricey'); // no transcripts
    expect(body.withheld).toEqual(['activity', 'feedback', 'scenarios', 'analyzer', 'reports', 'ai_usage']);
    for (const k of ['activity', 'feedback', 'scenarios', 'analyzer', 'reports', 'ai_usage'] as const) {
      expect(body[k]).toBeNull();
    }
    // Withheld sections are never even read.
    for (const t of ['session_feedback', 'user_scenarios', 'analyzer_events', 'platform_reports', 'ai_call_telemetry']) {
      expect(sb.callsFor(t)).toHaveLength(0);
    }
  });

  it('with every permission: every section, scoped to this trainee', async () => {
    signIn([...ALL_SECTIONS, 'team.read'], [profileRow()]);
    seed();
    sb.getUserById.mockResolvedValue({
      data: { user: { id: TRAINEE, email: 'riley@clinic.test', last_sign_in_at: null } },
      error: null,
    });
    const body = (await (await get(`op=trainee&id=${TRAINEE}&tz=-240`)).json()) as TraineeDetail;
    expect(body.withheld).toEqual([]);
    expect(body.profile.email).toBe('riley@clinic.test');
    expect(body.activity?.screen_views).toBe(1);
    expect(body.activity?.active_days).toEqual(['2026-10-10']);
    expect(body.feedback).toEqual([
      { id: 'f1', session_id: null, realism: 4, ai_quality: 5, comfort: 3, comment: 'Good', created_at: '2026-10-10T10:06:00Z' },
    ]);
    expect(body.scenarios?.[0]).toMatchObject({ id: 'sc1', title: 'My Lab', species: 'dog' });
    expect(body.analyzer?.[0]).toMatchObject({ id: 'an1', bcs: 7, source: 'vision' });
    expect(body.reports?.[0]).toMatchObject({ id: 'r1', kind: 'bug', status: 'open' });
    expect(body.ai_usage).toEqual({
      calls: 3,
      cost_usd: 0.013,
      by_type: [
        { call_type: 'evaluate', calls: 1, cost_usd: 0.01 },
        { call_type: 'roleplay', calls: 2, cost_usd: 0.003 },
      ],
    });
    // Every section filtered on this trainee.
    expect(sb.firstOp('user_scenarios', 'eq')?.args).toEqual(['creator_id', TRAINEE]);
    expect(sb.firstOp('ai_call_telemetry', 'eq')?.args).toEqual(['user_id', TRAINEE]);
  });

  it('a failing optional read degrades that section only', async () => {
    signIn(ALL_SECTIONS, [profileRow()]);
    seed();
    sb.setHandler('session_feedback', table([], { failWith: { message: 'relation does not exist' } }));
    const res = await get(`op=trainee&id=${TRAINEE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as TraineeDetail;
    expect(body.feedback).toBeNull();
    expect(body.withheld).not.toContain('feedback');
    expect(body.reports).toHaveLength(1);
  });

  it('a database without user_scenarios.species still lists the scenarios', async () => {
    signIn(ALL_SECTIONS, [profileRow()]);
    seed();
    sb.setHandler(
      'user_scenarios',
      table([{ id: 'sc1', creator_id: TRAINEE, title: 'My Lab', pushback_id: 'cost', difficulty: 2, created_at: '2026-10-09T00:00:00Z' }], {
        failColumn: 'species',
      }),
    );
    const body = (await (await get(`op=trainee&id=${TRAINEE}`)).json()) as TraineeDetail;
    expect(body.scenarios).toEqual([
      { id: 'sc1', title: 'My Lab', pushback_id: 'cost', difficulty: 2, species: null, created_at: '2026-10-09T00:00:00Z' },
    ]);
  });

  it('a failed hint read shows hints as unknown, not zero', async () => {
    signIn(['sessions.read'], [profileRow()]);
    seed();
    sb.setHandler('nav_events', table([], { failWith: { message: 'timeout' } }));
    const body = (await (await get(`op=trainee&id=${TRAINEE}`)).json()) as TraineeDetail;
    expect(body.sessions[0].hints_used).toBeNull();
  });

  it('a failed sessions read is a 500', async () => {
    signIn(ALL_SECTIONS, [profileRow()]);
    seed();
    sb.setHandler('training_sessions', table([], { failWith: { message: 'boom' } }));
    expect((await get(`op=trainee&id=${TRAINEE}`)).status).toBe(500);
  });

  it('pages a trainee’s sessions past 1,000', async () => {
    signIn(['sessions.read'], [profileRow()]);
    seed();
    const many = Array.from({ length: 1200 }, (_, i) =>
      session({ id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}` }),
    );
    sb.setHandler('training_sessions', table(many));
    const body = (await (await get(`op=trainee&id=${TRAINEE}`)).json()) as TraineeDetail;
    expect(body.sessions).toHaveLength(1200);
  });
});

describe('aiUsageOf', () => {
  it('tolerates junk costs and types', () => {
    expect(aiUsageOf([{ call_type: null, cost_usd: 'x' }, { call_type: 'hint', cost_usd: null }])).toEqual({
      calls: 2,
      cost_usd: 0,
      by_type: [
        { call_type: 'hint', calls: 1, cost_usd: 0 },
        { call_type: 'unknown', calls: 1, cost_usd: 0 },
      ],
    });
  });
});
