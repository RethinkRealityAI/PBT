import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { retrieveContext } from '../ragClient';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('retrieveContext (fail-open)', () => {
  it('returns results and caches by cacheKey', async () => {
    const results = [{ content: 'x', citation: 'Davies et al., 2024', tags: null, similarity: 0.8 }];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const a = await retrieveContext('q1', { cacheKey: 'scen-1' });
    const b = await retrieveContext('q1-different-text', { cacheKey: 'scen-1' });
    expect(a).toEqual(results);
    expect(b).toEqual(results); // served from cache
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns [] on network failure', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    await expect(retrieveContext('qq', { cacheKey: 'k-err' })).resolves.toEqual([]);
  });

  it('returns [] on non-2xx', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('nope', { status: 500 })) as unknown as typeof fetch;
    await expect(retrieveContext('qq', { cacheKey: 'k-500' })).resolves.toEqual([]);
  });

  it('returns [] on malformed body', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"weird": true}', { status: 200 })) as unknown as typeof fetch;
    await expect(retrieveContext('qq', { cacheKey: 'k-bad' })).resolves.toEqual([]);
  });
});
