// @vitest-environment node
/**
 * The knowledge base seeds itself because the endpoints people actually hit
 * nudge the background sync on their way out. That nudge is only acceptable
 * if it is INVISIBLE: `flags-resolve` is on the boot path of every session,
 * so its response must be byte-identical whether the trigger fires, is
 * disabled, or fails.
 *
 * It must also be SAFE: production only, aimed at the site's primary URL
 * (never the request's own host — an old deploy's permalink must not run its
 * own stale code), and carrying the HMAC `x-pbt-sync-key`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import flagsResolve from '../flags-resolve';
import adminKnowledge from '../admin-knowledge';
import {
  KNOWLEDGE_SYNC_KEY_HEADER,
  __resetKnowledgeTrigger,
  knowledgeSyncKey,
  syncAllowedHere,
  triggerKnowledgeSync,
  verifyKnowledgeSyncKey,
  type NetlifyContextLike,
} from '../_shared/knowledgeTrigger';

const PRIMARY = 'https://pbt.example.org';
const PROD: NetlifyContextLike = { deploy: { context: 'production', published: true } };

let sb: FakeSupabase;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setFunctionEnv();
  process.env.CONTEXT = 'production';
  process.env.URL = PRIMARY;
  delete process.env.PBT_ALLOW_DEV_SYNC;
  __resetKnowledgeTrigger();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);

  sb.setHandler('flags', () => ({
    data: [{ key: 'nav.sidebar.fecalScan.enabled', default_value: true, value_type: 'boolean' }],
    error: null,
  }));
  sb.setHandler('flag_rules', () => ({ data: [], error: null }));
  sb.setHandler('scenario_overrides', () => ({ data: [], error: null }));
  sb.setHandler('simulation_config', () => ({ data: { config: null }, error: null }));

  fetchMock = vi.fn(async () => new Response('{}', { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.URL;
  delete process.env.CONTEXT;
  delete process.env.PBT_ALLOW_DEV_SYNC;
});

const resolve = (ctx: NetlifyContextLike | undefined = PROD) =>
  flagsResolve(jsonRequest('flags-resolve', { driver: 'Analyzer' }), ctx);

/** Let the dispatch promise settle (state flips after the fetch resolves). */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('flags-resolve × knowledge trigger', () => {
  it('returns the same response whether or not the trigger fires', async () => {
    const withTrigger = await resolve();
    const bodyA = await withTrigger.json();

    __resetKnowledgeTrigger();
    const withoutTrigger = await resolve({ deploy: { context: 'deploy-preview' } });
    const bodyB = await withoutTrigger.json();

    expect(withTrigger.status).toBe(200);
    expect(withoutTrigger.status).toBe(200);
    expect(withTrigger.headers.get('cache-control')).toBe(
      withoutTrigger.headers.get('cache-control'),
    );
    expect(bodyA.flags).toEqual(bodyB.flags);
    expect(bodyA.scenarioOverrides).toEqual(bodyB.scenarioOverrides);
    expect(bodyA.simulationConfig).toEqual(bodyB.simulationConfig);
    expect(bodyA.flags['nav.sidebar.fecalScan.enabled']).toBe(true);
  });

  it('POSTs the PRIMARY site URL with the sync key, exactly once per instance', async () => {
    await resolve();
    await settle();
    await resolve();
    await resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PRIMARY}/.netlify/functions/knowledge-sync-background`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers[KNOWLEDGE_SYNC_KEY_HEADER]).toBe(knowledgeSyncKey());
    // The raw service-role key never travels.
    expect(JSON.stringify(init)).not.toContain('service-key');
  });

  it('never targets the request host — an old deploy permalink kicks the published deploy', async () => {
    await flagsResolve(
      new Request('https://0123abcd--pbt.netlify.app/.netlify/functions/flags-resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      PROD,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0]).startsWith(PRIMARY)).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain('0123abcd');
  });

  it('does not fire without a primary URL (never falls back to the request host)', async () => {
    delete process.env.URL;
    await resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('hands the dispatch to context.waitUntil so the instance is not frozen first', async () => {
    const waitUntil = vi.fn();
    await resolve({ ...PROD, waitUntil });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it('does not fire from preview / branch deploys', async () => {
    for (const context of ['deploy-preview', 'branch-deploy']) {
      __resetKnowledgeTrigger();
      await resolve({ deploy: { context } });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fire under `netlify dev` unless PBT_ALLOW_DEV_SYNC=1', async () => {
    await resolve({ deploy: { context: 'dev' } });
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.PBT_ALLOW_DEV_SYNC = '1';
    await resolve({ deploy: { context: 'dev' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still answers when the trigger rejects — and re-arms after a back-off', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')));
    const res = await resolve();
    expect(res.status).toBe(200);
    expect((await res.json()).flags['nav.sidebar.fecalScan.enabled']).toBe(true);
    // Let the rejected promise settle; an unhandled rejection would fail the run.
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Inside the back-off: no retry storm on every boot.
    await resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // After it: a later request retries.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    fetchMock.mockImplementation(async () => new Response('{}', { status: 202 }));
    await resolve();
    vi.useRealTimers();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not count a non-2xx dispatch as done', async () => {
    fetchMock.mockImplementation(async () => new Response('nope', { status: 404 }));
    expect(triggerKnowledgeSync(PROD)).toBe(true);
    await settle();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    expect(triggerKnowledgeSync(PROD)).toBe(true);
    vi.useRealTimers();
  });
});

describe('triggerKnowledgeSync', () => {
  it('reports whether it dispatched, and is idempotent per instance', async () => {
    expect(triggerKnowledgeSync(PROD)).toBe(true);
    // In flight: no second dispatch.
    expect(triggerKnowledgeSync(PROD)).toBe(false);
    await settle();
    // Done: still none.
    expect(triggerKnowledgeSync(PROD)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cannot throw on a malformed primary URL', () => {
    process.env.URL = 'not a url';
    expect(() => triggerKnowledgeSync(PROD)).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fire when the service-role key is absent (no key to sign with)', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(triggerKnowledgeSync(PROD)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to CONTEXT when Netlify passes no context object', () => {
    process.env.CONTEXT = 'deploy-preview';
    expect(triggerKnowledgeSync()).toBe(false);
    process.env.CONTEXT = 'production';
    expect(triggerKnowledgeSync()).toBe(true);
  });
});

describe('sync key + deploy gate', () => {
  const withKey = (value?: string) =>
    new Request('https://pbt.example.org/.netlify/functions/knowledge-sync-background', {
      method: 'POST',
      headers: value === undefined ? {} : { [KNOWLEDGE_SYNC_KEY_HEADER]: value },
    });

  it('accepts the HMAC and rejects anything else', () => {
    const good = knowledgeSyncKey()!;
    expect(good).toMatch(/^[0-9a-f]{64}$/);
    expect(verifyKnowledgeSyncKey(withKey(good))).toBe(true);
    expect(verifyKnowledgeSyncKey(withKey())).toBe(false);
    expect(verifyKnowledgeSyncKey(withKey(''))).toBe(false);
    expect(verifyKnowledgeSyncKey(withKey('service-key'))).toBe(false);
    expect(verifyKnowledgeSyncKey(withKey(good.slice(0, -1) + (good.endsWith('0') ? '1' : '0')))).toBe(false);
    expect(verifyKnowledgeSyncKey(withKey(knowledgeSyncKey('another-projects-key')!))).toBe(false);
  });

  it('refuses everything when the service-role key is absent', () => {
    const good = knowledgeSyncKey()!;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(verifyKnowledgeSyncKey(withKey(good))).toBe(false);
  });

  it('allows only the published production deploy (and opted-in dev)', () => {
    expect(syncAllowedHere(PROD).ok).toBe(true);
    expect(syncAllowedHere({ deploy: { context: 'production', published: false } }).ok).toBe(false);
    expect(syncAllowedHere({ deploy: { context: 'deploy-preview' } }).ok).toBe(false);
    expect(syncAllowedHere({ deploy: { context: 'branch-deploy' } }).ok).toBe(false);
    expect(syncAllowedHere({ deploy: { context: 'dev' } }).ok).toBe(false);
    process.env.PBT_ALLOW_DEV_SYNC = '1';
    expect(syncAllowedHere({ deploy: { context: 'dev' } }).ok).toBe(true);
    delete process.env.CONTEXT;
    expect(syncAllowedHere(undefined).ok).toBe(false);
  });
});

describe('admin-knowledge GET × knowledge trigger', () => {
  beforeEach(() => {
    sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    sb.setHandler('profiles', () => ({
      data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
      error: null,
    }));
    sb.setHandler('admin_roles', () => ({ data: [], error: null }));
    sb.setHandler('knowledge_documents', () => ({ data: [], error: null }));
    sb.setHandler('knowledge_chunk_counts', () => ({ data: [], error: null }));
  });

  it('kicks the sync when the Knowledge screen loads', async () => {
    const res = await adminKnowledge(
      jsonRequest('admin-knowledge', null, {
        method: 'GET',
        headers: { authorization: 'Bearer admin' },
      }),
      PROD,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ documents: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${PRIMARY}/.netlify/functions/knowledge-sync-background`,
    );
  });

  it('410s the retired seed op, pointing at the automatic sync', async () => {
    const res = await adminKnowledge(
      jsonRequest('admin-knowledge', { op: 'seed' }, { headers: { authorization: 'Bearer admin' } }),
      PROD,
    );
    expect(res.status).toBe(410);
    expect((await res.json()).error).toMatch(/automatic/i);
    expect(sb.callsFor('knowledge_chunks')).toEqual([]);
  });
});
