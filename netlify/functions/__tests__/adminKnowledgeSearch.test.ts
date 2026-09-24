// @vitest-environment node
/**
 * `admin-knowledge-search` — the admin "Try a search" tester.
 *
 * It runs the SAME retrieval production runs, so the interesting assertions
 * are the honest ones: it reports the jsonb filter that was actually sent and
 * whether the focus had to be relaxed. That report is how an admin PROVES a
 * cat document cannot reach a dog scan, so it must not be reconstructed from
 * the request — it comes back from retrieval itself.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  retrieveChunksDetailed: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { embedContent: vi.fn() };
    constructor(_opts: unknown) {}
  }
  return { GoogleGenAI: MockGoogleGenAI, Type: {}, Modality: {} };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../_shared/retrieval', () => ({
  retrieveChunksDetailed: mocks.retrieveChunksDetailed,
  MAX_K: 8,
  MAX_QUERY_CHARS: 2000,
}));

import search from '../admin-knowledge-search';

let sb: FakeSupabase;

const HIT = {
  content: 'Score 3.5 — moist, no cracks.',
  citation: 'Royal Canin — Fecal Scoring System for Dogs',
  tags: { tools: ['fecal-scan'], species: ['dog'] },
  similarity: 0.91,
  docSlug: 'fecal:dog',
  docTitle: 'Fecal Scoring System for Dogs',
};

function adminHeaders() {
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  return { authorization: 'Bearer admin' };
}

const post = (body: unknown, headers?: Record<string, string>) =>
  search(jsonRequest('admin-knowledge-search', body, { headers }));

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.retrieveChunksDetailed.mockReset();
  mocks.retrieveChunksDetailed.mockResolvedValue({
    results: [HIT],
    appliedFilter: { tools: ['fecal-scan'], species: ['dog'] },
    focusRelaxed: false,
    latencyMs: 42,
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('admin-knowledge-search — access', () => {
  it('401s without a bearer token', async () => {
    const res = await post({ query: 'moist stool', tool: 'fecal-scan' });
    expect(res.status).toBe(401);
    expect(mocks.retrieveChunksDetailed).not.toHaveBeenCalled();
  });

  it('403s for a signed-in non-admin', async () => {
    sb.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
    sb.setHandler('profiles', () => ({ data: { is_admin: false, disabled: false }, error: null }));
    const res = await post(
      { query: 'moist stool', tool: 'fecal-scan' },
      { authorization: 'Bearer t' },
    );
    expect(res.status).toBe(403);
    expect(mocks.retrieveChunksDetailed).not.toHaveBeenCalled();
  });

  it('405s on GET', async () => {
    const headers = adminHeaders();
    const res = await search(
      jsonRequest('admin-knowledge-search', {}, { headers, method: 'GET' }),
    );
    expect(res.status).toBe(405);
  });
});

describe('admin-knowledge-search — validation', () => {
  it('rejects a missing or unknown tool — the tester must name its scope', async () => {
    const headers = adminHeaders();
    for (const body of [
      { query: 'q' },
      { query: 'q', tool: 'exfiltrate' },
      { query: 'q', tool: '' },
    ]) {
      const res = await post(body, headers);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/tool/i);
    }
    expect(mocks.retrieveChunksDetailed).not.toHaveBeenCalled();
  });

  it('rejects an unknown species or focus', async () => {
    const headers = adminHeaders();
    const badSpecies = await post({ query: 'q', tool: 'roleplay', species: 'dragon' }, headers);
    expect(badSpecies.status).toBe(400);
    expect((await badSpecies.json()).error).toMatch(/species/i);

    const badFocus = await post({ query: 'q', tool: 'roleplay', focus: 'astrology' }, headers);
    expect(badFocus.status).toBe(400);
    expect((await badFocus.json()).error).toMatch(/focus/i);
  });

  it('rejects an empty query and clamps k to 1–8', async () => {
    const headers = adminHeaders();
    const empty = await post({ query: '   ', tool: 'roleplay' }, headers);
    expect(empty.status).toBe(400);

    await post({ query: 'q', tool: 'roleplay', k: 99 }, headers);
    expect(mocks.retrieveChunksDetailed.mock.calls[0][1]).toMatchObject({ k: 8 });

    await post({ query: 'q', tool: 'roleplay', k: 0 }, headers);
    expect(mocks.retrieveChunksDetailed.mock.calls[1][1]).toMatchObject({ k: 1 });
  });

  it('clamps an over-long query rather than rejecting it', async () => {
    const headers = adminHeaders();
    const res = await post({ query: 'x'.repeat(5000), tool: 'roleplay' }, headers);
    expect(res.status).toBe(200);
    expect((mocks.retrieveChunksDetailed.mock.calls[0][0] as string).length).toBe(2000);
  });
});

describe('admin-knowledge-search — happy path', () => {
  it('searches in the named scope and echoes the applied filter', async () => {
    const headers = adminHeaders();
    const res = await post(
      { query: 'moist stool no cracks', tool: 'fecal-scan', species: 'dog', k: 3 },
      headers,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [HIT],
      appliedFilter: { tools: ['fecal-scan'], species: ['dog'] },
      focusRelaxed: false,
      latencyMs: 42,
    });

    const [query, opts] = mocks.retrieveChunksDetailed.mock.calls[0];
    expect(query).toBe('moist stool no cracks');
    expect(opts).toMatchObject({ k: 3, filters: { tool: 'fecal-scan', species: 'dog' } });
    // The admin's own service-role client, so the tester sees what production
    // sees rather than opening a second connection.
    expect(opts.sb).toBeDefined();
  });

  it('reports a relaxed focus rather than hiding it', async () => {
    mocks.retrieveChunksDetailed.mockResolvedValueOnce({
      results: [],
      appliedFilter: { tools: ['roleplay'] },
      focusRelaxed: true,
      latencyMs: 17,
    });
    const res = await post({ query: 'q', tool: 'roleplay', focus: 'urinary' }, adminHeaders());
    expect(await res.json()).toMatchObject({
      results: [],
      appliedFilter: { tools: ['roleplay'] },
      focusRelaxed: true,
    });
    expect(mocks.retrieveChunksDetailed.mock.calls[0][1]).toMatchObject({
      filters: { tool: 'roleplay', focus: 'urinary' },
    });
  });
});
