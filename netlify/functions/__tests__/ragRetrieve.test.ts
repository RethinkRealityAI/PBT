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

let sb: FakeSupabase;

const ROW = { content: 'Chunk', citation: 'Cite', tags: { focus: 'weight' }, similarity: 0.8 };

function post(body: unknown): Request {
  return new Request('http://localhost/.netlify/functions/rag-retrieve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  setFunctionEnv();
  __clearRetrievalCache();
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

  it('returns mapped rows and passes k + filters through to the RPC', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [ROW], error: null });
    const res = await ragRetrieve(post({ query: 'weight denial', k: 3, filters: { focus: 'weight' } }));
    expect(await res.json()).toEqual({ results: [ROW] });
    expect(sb.rpc).toHaveBeenCalledWith(
      'match_knowledge_chunks',
      expect.objectContaining({ match_count: 3, filter: { focus: 'weight' } }),
    );
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
