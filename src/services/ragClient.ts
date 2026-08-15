/**
 * Consumer-side retrieval client for the RAG loop.
 *
 * Calls the public rag-retrieve Netlify function once per session start.
 * FAIL-OPEN: any error, timeout, or non-2xx yields [] — retrieval must never
 * block or break the roleplay. Results are cached per cache key (scenario id
 * + retrieval filters) for the tab's lifetime.
 */
import type { RetrievedChunk } from './ragShared';
import type { Scenario } from '../data/scenarios';

const ENDPOINT = '/.netlify/functions/rag-retrieve';
const TIMEOUT_MS = 2500;

const cache = new Map<string, RetrievedChunk[]>();

/**
 * Scenario-derived retrieval targeting. `docSlugs` (explicit knowledge
 * attachments) wins over `focus` (clinical focus area) server-side.
 */
export interface RetrievalFilters {
  focus?: string;
  docSlugs?: string[];
}

/**
 * Derive retrieval targeting from the scenario the user is about to play.
 * Explicitly attached knowledge documents win over the broader focus area;
 * an unlinked scenario retrieves un-targeted, exactly as before.
 */
export function scenarioRetrievalFilters(
  scenario: Pick<Scenario, 'focusArea' | 'knowledgeSlugs'>,
): RetrievalFilters | undefined {
  if (scenario.knowledgeSlugs?.length) return { docSlugs: scenario.knowledgeSlugs };
  if (scenario.focusArea) return { focus: scenario.focusArea };
  return undefined;
}

/**
 * Stable serialization so `{ focus: 'gi' }` always produces the same cache
 * suffix regardless of key order, and an empty/absent filter contributes
 * nothing (keeps pre-existing cache keys intact).
 */
function filterKey(filters: RetrievalFilters | undefined): string {
  if (!filters) return '';
  const parts: string[] = [];
  if (filters.focus) parts.push(`focus=${filters.focus}`);
  if (filters.docSlugs?.length) parts.push(`docs=${[...filters.docSlugs].sort().join(',')}`);
  return parts.length ? `|${parts.join('&')}` : '';
}

export async function retrieveContext(
  query: string,
  opts: { k?: number; filters?: RetrievalFilters; cacheKey?: string } = {},
): Promise<RetrievedChunk[]> {
  const key = (opts.cacheKey ?? query) + filterKey(opts.filters);
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        k: opts.k ?? 4,
        filters: opts.filters ?? {},
      }),
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
