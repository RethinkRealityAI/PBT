/**
 * Consumer-side retrieval client for the RAG loop.
 *
 * Calls the public rag-retrieve Netlify function once per session start.
 * FAIL-OPEN: any error, timeout, or non-2xx yields [] — retrieval must never
 * block or break the roleplay. Results are cached per cache key (scenario id)
 * for the tab's lifetime.
 */
import type { RetrievedChunk } from './ragShared';

const ENDPOINT = '/.netlify/functions/rag-retrieve';
const TIMEOUT_MS = 2500;

const cache = new Map<string, RetrievedChunk[]>();

export async function retrieveContext(
  query: string,
  opts: { k?: number; filters?: Record<string, unknown>; cacheKey?: string } = {},
): Promise<RetrievedChunk[]> {
  const key = opts.cacheKey ?? query;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, k: opts.k ?? 4, filters: opts.filters ?? {} }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: RetrievedChunk[] };
    const results = Array.isArray(data.results) ? data.results : [];
    cache.set(key, results);
    return results;
  } catch {
    return [];
  }
}
