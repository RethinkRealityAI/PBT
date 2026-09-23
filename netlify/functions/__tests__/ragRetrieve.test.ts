// @vitest-environment node
/**
 * The public `rag-retrieve` endpoint is now a thin wrapper over
 * `_shared/retrieval.retrieveChunks`. These tests pin its external contract:
 * never 400s, fails open to `{ results: [] }`, same headers, same fallback.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  embedContent: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { embedContent: mocks.embedContent };
  }
  return { GoogleGenAI: MockGoogleGenAI, Type: {}, Modality: {} };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import ragRetrieve from '../rag-retrieve';
import { __clearRetrievalCache, retrieveChunks } from '../_shared/retrieval';
import { __resetRateLimits } from '../_shared/ai';

let sb: FakeSupabase;

const ROW = { content: 'Chunk', citation: 'Cite', tags: { focus: 'weight' }, similarity: 0.8 };

function post(body: unknown, ip = '203.0.113.7'): Request {
  return new Request('http://localhost/.netlify/functions/rag-retrieve', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  setFunctionEnv();
  __clearRetrievalCache();
  __resetRateLimits();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.embedContent.mockReset();
  mocks.embedContent.mockResolvedValue({ embeddings: [{ values: Array(768).fill(0.5) }] });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('rag-retrieve', () => {
  it('answers 200 { results: [] } for GET, invalid JSON and an empty query', async () => {
    for (const req of [
      new Request('http://localhost/.netlify/functions/rag-retrieve', { method: 'GET' }),
      post('{nope'),
      post({ query: '   ' }),
    ]) {
      const res = await ragRetrieve(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('public, max-age=60');
      expect(await res.json()).toEqual({ results: [] });
    }
    expect(mocks.embedContent).not.toHaveBeenCalled();
  });

  it('returns mapped rows and passes k + focus through, always scoped to roleplay', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [ROW], error: null });
    const res = await ragRetrieve(post({ query: 'weight denial', k: 3, filters: { focus: 'weight' } }));
    expect(await res.json()).toEqual({ results: [ROW] });
    expect(sb.rpc).toHaveBeenCalledWith(
      'match_knowledge_chunks',
      expect.objectContaining({
        match_count: 3,
        filter: { tools: ['roleplay'], focus: 'weight' },
      }),
    );
  });

  it('ignores a client-supplied tool / species — the public scope is fixed', async () => {
    for (const filters of [
      { tool: 'fecal-scan', species: 'dog' },
      { tool: 'not-a-tool' },
      { species: 'cat' },
      {},
      undefined,
    ]) {
      __clearRetrievalCache();
      sb.rpc.mockReset();
      sb.rpc.mockResolvedValueOnce({ data: [ROW], error: null });
      await ragRetrieve(post({ query: 'stool score', filters }));
      // Exactly the roleplay scope: never the fecal-scan tool, never a
      // species, and never the unscoped `{}` that used to mean "everything".
      expect(sb.rpc.mock.calls[0][1]).toMatchObject({ filter: { tools: ['roleplay'] } });
      expect((sb.rpc.mock.calls[0][1] as { filter: object }).filter).toEqual({
        tools: ['roleplay'],
      });
    }
  });

  it('keeps attached-document targeting inside the roleplay scope', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [ROW], error: null });
    await ragRetrieve(post({ query: 'q', filters: { docSlugs: ['fecal:dog'], tool: 'fecal-scan' } }));
    expect(sb.rpc.mock.calls[0][1]).toMatchObject({
      filter: { tools: ['roleplay'] },
      doc_slugs: ['fecal:dog'],
    });
  });

  it('strips document provenance from the public response', async () => {
    sb.rpc.mockResolvedValueOnce({
      data: [{ ...ROW, doc_slug: 'fecal:dog', doc_title: 'Royal Canin dog chart' }],
      error: null,
    });
    const res = await ragRetrieve(post({ query: 'q' }));
    const body = await res.json();
    expect(body).toEqual({ results: [ROW] });
    expect(JSON.stringify(body)).not.toContain('fecal:dog');
  });

  it('rate-limits a caller at 30 requests a minute', async () => {
    sb.rpc.mockResolvedValue({ data: [ROW], error: null });
    for (let i = 0; i < 30; i++) {
      expect((await ragRetrieve(post({ query: `q${i}` }))).status).toBe(200);
    }
    const limited = await ragRetrieve(post({ query: 'one too many' }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
    // Another caller is unaffected.
    expect((await ragRetrieve(post({ query: 'q' }, '198.51.100.9'))).status).toBe(200);
  });

  it('retries unfiltered when a focus filter matches nothing', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: [ROW], error: null });
    const results = await retrieveChunks('q', { k: 2, filters: { focus: 'weight' } });
    expect(results).toEqual([ROW]);
    expect(sb.rpc).toHaveBeenCalledTimes(2);
    expect(sb.rpc.mock.calls[1][1]).toEqual(expect.objectContaining({ filter: {} }));
  });

  it('fails open when the embedder throws', async () => {
    mocks.embedContent.mockRejectedValueOnce(new Error('embed down'));
    const res = await ragRetrieve(post({ query: 'anything' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it('caches by query + k + filters', async () => {
    sb.rpc.mockResolvedValue({ data: [ROW], error: null });
    await retrieveChunks('same', { k: 4 });
    await retrieveChunks('same', { k: 4 });
    expect(mocks.embedContent).toHaveBeenCalledTimes(1);
    await retrieveChunks('same', { k: 5 });
    expect(mocks.embedContent).toHaveBeenCalledTimes(2);
  });
});
