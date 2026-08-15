import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { retrieveContext, scenarioRetrievalFilters } from '../ragClient';

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

describe('retrieveContext (scenario filters)', () => {
  function mockOk() {
    // Fresh Response per call — a Response body can only be read once.
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        new Response(JSON.stringify({ results: [] }), { status: 200 }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, call = 0) =>
    JSON.parse(fetchMock.mock.calls[call][1].body as string);

  it('sends focus filters in the request body', async () => {
    const fetchMock = mockOk();
    await retrieveContext('q', { cacheKey: 'f-focus', filters: { focus: 'weight' } });
    expect(bodyOf(fetchMock)).toEqual({ query: 'q', k: 4, filters: { focus: 'weight' } });
  });

  it('sends docSlugs filters in the request body', async () => {
    const fetchMock = mockOk();
    await retrieveContext('q', {
      cacheKey: 'f-docs',
      filters: { docSlugs: ['a-doc', 'b-doc'] },
    });
    expect(bodyOf(fetchMock).filters).toEqual({ docSlugs: ['a-doc', 'b-doc'] });
  });

  it('sends an empty filter object when the scenario has no targeting', async () => {
    const fetchMock = mockOk();
    await retrieveContext('q', { cacheKey: 'f-none' });
    expect(bodyOf(fetchMock).filters).toEqual({});
  });

  it('folds filters into the cache key so one scenario id can hold two results', async () => {
    const fetchMock = mockOk();
    await retrieveContext('q', { cacheKey: 'f-shared', filters: { focus: 'weight' } });
    await retrieveContext('q', { cacheKey: 'f-shared', filters: { focus: 'gi' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Same cacheKey + same filters → cached, no second round-trip.
    await retrieveContext('q', { cacheKey: 'f-shared', filters: { focus: 'gi' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cache key is stable regardless of docSlugs order', async () => {
    const fetchMock = mockOk();
    await retrieveContext('q', { cacheKey: 'f-order', filters: { docSlugs: ['b', 'a'] } });
    await retrieveContext('q', { cacheKey: 'f-order', filters: { docSlugs: ['a', 'b'] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('an unfiltered call keeps the legacy cache key (no filter suffix)', async () => {
    const fetchMock = mockOk();
    await retrieveContext('q', { cacheKey: 'f-legacy' });
    await retrieveContext('q', { cacheKey: 'f-legacy', filters: undefined });
    await retrieveContext('q', { cacheKey: 'f-legacy', filters: {} });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('scenarioRetrievalFilters', () => {
  it('prefers explicit knowledge slugs over the focus area', () => {
    expect(
      scenarioRetrievalFilters({ focusArea: 'weight', knowledgeSlugs: ['doc-1'] }),
    ).toEqual({ docSlugs: ['doc-1'] });
  });

  it('falls back to the focus area', () => {
    expect(scenarioRetrievalFilters({ focusArea: 'gi' })).toEqual({ focus: 'gi' });
    expect(scenarioRetrievalFilters({ focusArea: 'gi', knowledgeSlugs: [] })).toEqual({
      focus: 'gi',
    });
  });

  it('returns undefined for an unlinked scenario', () => {
    expect(scenarioRetrievalFilters({})).toBeUndefined();
  });
});
