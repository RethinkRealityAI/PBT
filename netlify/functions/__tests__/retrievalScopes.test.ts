// @vitest-environment node
/**
 * Knowledge SCOPES in `_shared/retrieval.ts`.
 *
 * The contract these pin (docs/superpowers/specs/2026-09-21-knowledge-scopes-design.md):
 *   • `tool` and `species` are HARD — present on EVERY rpc call, including the
 *     zero-row retry and the RPC-error retry. A cat document can never reach a
 *     dog scan, and a fecal chart can never reach a roleplay.
 *   • `focus` is SOFT — dropped on the zero-row retry (inside the scope).
 *   • `docSlugs` run inside the scope, and never trigger a zero-row retry.
 *   • unknown tool/species keys are dropped rather than rejected.
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

import {
  __clearRetrievalCache,
  buildScopeFilter,
  retrieveChunks,
  retrieveChunksDetailed,
  sanitizeFilters,
} from '../_shared/retrieval';

let sb: FakeSupabase;

const ROW = {
  content: 'Chunk',
  citation: 'Cite',
  tags: { focus: 'gi', tools: ['fecal-scan'] },
  similarity: 0.8,
};

/** The `filter` jsonb of the Nth rpc call. */
const filterOf = (call: number) =>
  (sb.rpc.mock.calls[call][1] as { filter: Record<string, unknown> }).filter;

const argsOf = (call: number) => sb.rpc.mock.calls[call][1] as Record<string, unknown>;

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

describe('buildScopeFilter', () => {
  it('folds tool + species + focus into one containment filter', () => {
    expect(buildScopeFilter({ tool: 'roleplay', species: 'dog', focus: 'gi' })).toEqual({
      tools: ['roleplay'],
      species: ['dog'],
      focus: 'gi',
    });
  });

  it('drops focus when explicit documents are attached, keeping the scope', () => {
    expect(
      buildScopeFilter({ tool: 'fecal-scan', species: 'cat', focus: 'gi', docSlugs: ['fecal:cat'] }),
    ).toEqual({ tools: ['fecal-scan'], species: ['cat'] });
  });

  it('is empty for an unscoped, untargeted request', () => {
    expect(buildScopeFilter({})).toEqual({});
  });
});

describe('sanitizeFilters', () => {
  it('keeps vocabulary tool/species keys and drops unknown ones', () => {
    expect(sanitizeFilters({ tool: 'roleplay', species: 'puppy' })).toEqual({
      tool: 'roleplay',
      species: 'puppy',
    });
    expect(sanitizeFilters({ tool: 'hacker', species: 'dragon' })).toEqual({});
    expect(sanitizeFilters({ tool: 42, species: ['dog'] })).toEqual({});
  });
});

describe('retrieveChunks — hard scope', () => {
  it('sends tool + species on the initial call', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [ROW], error: null });
    await retrieveChunks('q', { filters: { tool: 'fecal-scan', species: 'dog' } });
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(filterOf(0)).toEqual({ tools: ['fecal-scan'], species: ['dog'] });
  });

  it('does NOT relax tool/species when the scope matches nothing', async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    const out = await retrieveChunks('q', { filters: { tool: 'fecal-scan', species: 'cat' } });
    expect(out).toEqual([]);
    // One call only — there is no wider corpus to fall back to.
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(filterOf(0)).toEqual({ tools: ['fecal-scan'], species: ['cat'] });
  });

  it('relaxes focus but keeps the scope on the zero-row retry', async () => {
    sb.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [ROW], error: null });
    const out = await retrieveChunks('q', {
      filters: { tool: 'roleplay', species: 'dog', focus: 'gi' },
    });
    expect(out).toHaveLength(1);
    expect(sb.rpc).toHaveBeenCalledTimes(2);
    expect(filterOf(0)).toEqual({ tools: ['roleplay'], species: ['dog'], focus: 'gi' });
    expect(filterOf(1)).toEqual({ tools: ['roleplay'], species: ['dog'] });
  });

  it('keeps the scope on the RPC-error retry', async () => {
    sb.rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'no such function' } })
      .mockResolvedValueOnce({ data: [ROW], error: null });
    await retrieveChunks('q', {
      filters: { tool: 'scoring', species: 'puppy', docSlugs: ['study:davies-2024'] },
    });
    expect(sb.rpc).toHaveBeenCalledTimes(2);
    expect(filterOf(1)).toEqual({ tools: ['scoring'], species: ['puppy'] });
    // The document restriction is what is relaxed, never the scope.
    expect(argsOf(1).doc_slugs).toBeUndefined();
  });

  it('applies docSlugs AND the scope together, and never retries on zero rows', async () => {
    sb.rpc.mockResolvedValue({ data: [], error: null });
    await retrieveChunks('q', {
      filters: { tool: 'fecal-scan', species: 'dog', docSlugs: ['fecal:dog'] },
    });
    expect(sb.rpc).toHaveBeenCalledTimes(1);
    expect(argsOf(0).doc_slugs).toEqual(['fecal:dog']);
    expect(filterOf(0)).toEqual({ tools: ['fecal-scan'], species: ['dog'] });
  });

  it('drops an unknown tool/species rather than filtering on it', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [ROW], error: null });
    await retrieveChunks('q', {
      filters: { tool: 'wat', species: 'dragon' } as never,
    });
    expect(filterOf(0)).toEqual({});
  });

  it('keys the cache on tool and species', async () => {
    sb.rpc.mockResolvedValue({ data: [ROW], error: null });
    await retrieveChunks('same', { k: 4, filters: { tool: 'roleplay' } });
    await retrieveChunks('same', { k: 4, filters: { tool: 'roleplay' } });
    expect(mocks.embedContent).toHaveBeenCalledTimes(1);
    await retrieveChunks('same', { k: 4, filters: { tool: 'scoring' } });
    expect(mocks.embedContent).toHaveBeenCalledTimes(2);
    await retrieveChunks('same', { k: 4, filters: { tool: 'scoring', species: 'cat' } });
    expect(mocks.embedContent).toHaveBeenCalledTimes(3);
  });

  it('maps doc_slug / doc_title provenance when the RPC returns it', async () => {
    sb.rpc.mockResolvedValueOnce({
      data: [{ ...ROW, doc_slug: 'fecal:dog', doc_title: 'Fecal Scoring System for Dogs' }],
      error: null,
    });
    const [hit] = await retrieveChunks('q', { filters: { tool: 'fecal-scan' } });
    expect(hit).toMatchObject({
      docSlug: 'fecal:dog',
      docTitle: 'Fecal Scoring System for Dogs',
    });
  });

  it('leaves provenance out when an older RPC does not return it', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [ROW], error: null });
    const [hit] = await retrieveChunks('q', { filters: { tool: 'fecal-scan' } });
    expect(hit.docSlug).toBeUndefined();
    expect(hit.docTitle).toBeUndefined();
  });
});

describe('retrieveChunksDetailed', () => {
  it('echoes the filter that was actually sent and flags a relaxed focus', async () => {
    sb.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [ROW], error: null });
    const out = await retrieveChunksDetailed('q', {
      k: 2,
      filters: { tool: 'coach', species: 'cat', focus: 'gi' },
    });
    expect(out.results).toHaveLength(1);
    expect(out.appliedFilter).toEqual({ tools: ['coach'], species: ['cat'] });
    expect(out.focusRelaxed).toBe(true);
    expect(typeof out.latencyMs).toBe('number');
  });

  it('reports focusRelaxed false when the focus matched', async () => {
    sb.rpc.mockResolvedValueOnce({ data: [ROW], error: null });
    const out = await retrieveChunksDetailed('q', { filters: { tool: 'coach', focus: 'gi' } });
    expect(out.focusRelaxed).toBe(false);
    expect(out.appliedFilter).toEqual({ tools: ['coach'], focus: 'gi' });
  });

  it('fails open to an empty result with the attempted filter', async () => {
    mocks.embedContent.mockRejectedValueOnce(new Error('embed down'));
    const out = await retrieveChunksDetailed('q', { filters: { tool: 'roleplay' } });
    expect(out.results).toEqual([]);
    expect(out.appliedFilter).toEqual({ tools: ['roleplay'] });
    expect(out.focusRelaxed).toBe(false);
  });
});
