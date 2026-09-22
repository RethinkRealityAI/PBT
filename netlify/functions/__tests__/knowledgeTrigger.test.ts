// @vitest-environment node
/**
 * The knowledge base seeds itself because the endpoints people actually hit
 * nudge the background sync on their way out. That nudge is only acceptable
 * if it is INVISIBLE: `flags-resolve` is on the boot path of every session,
 * so its response must be byte-identical whether the trigger fires, is
 * disabled, or fails.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import flagsResolve from '../flags-resolve';
import adminKnowledge from '../admin-knowledge';
import { __resetKnowledgeTrigger, triggerKnowledgeSync } from '../_shared/knowledgeTrigger';

let sb: FakeSupabase;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setFunctionEnv();
  delete process.env.CONTEXT;
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

const resolve = () => flagsResolve(jsonRequest('flags-resolve', { driver: 'Analyzer' }));

describe('flags-resolve × knowledge trigger', () => {
  it('returns the same response whether or not the trigger fires', async () => {
    const withTrigger = await resolve();
    const bodyA = await withTrigger.json();

    __resetKnowledgeTrigger();
    process.env.CONTEXT = 'dev';
    const withoutTrigger = await resolve();
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

  it('POSTs the background function exactly once per instance', async () => {
    await resolve();
    await resolve();
    await resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost/.netlify/functions/knowledge-sync-background');
    expect(init.method).toBe('POST');
  });

  it('does not fire under `netlify dev` (CONTEXT=dev), where the keys are masked', async () => {
    process.env.CONTEXT = 'dev';
    const res = await resolve();
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fires in every other context', async () => {
    process.env.CONTEXT = 'branch-deploy';
    await resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still answers when the trigger rejects — never awaited, never unhandled', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error('network down')));
    const res = await resolve();
    expect(res.status).toBe(200);
    expect((await res.json()).flags['nav.sidebar.fecalScan.enabled']).toBe(true);
    // Let the rejected promise settle; an unhandled rejection would fail the run.
    await new Promise((r) => setTimeout(r, 0));
  });
});

describe('triggerKnowledgeSync', () => {
  it('reports whether it dispatched, and is idempotent per instance', () => {
    const req = jsonRequest('flags-resolve', {});
    expect(triggerKnowledgeSync(req)).toBe(true);
    expect(triggerKnowledgeSync(req)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cannot throw on a malformed request url', () => {
    const bad = { url: 'not a url' } as Request;
    expect(() => triggerKnowledgeSync(bad)).not.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
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
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ documents: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('knowledge-sync-background');
  });
});
