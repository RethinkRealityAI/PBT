/**
 * Consumer-side retrieval client for the RAG loop.
 *
 * Calls the public rag-retrieve Netlify function once per session start.
 * FAIL-OPEN: any error, timeout, or non-2xx yields [] — retrieval must never
 * block or break the roleplay. Results are cached per cache key (scenario id
 * + `k` + retrieval filters) with a short TTL.
 */
import type { RetrievedChunk } from './ragShared';
import type { Scenario } from '../data/scenarios';
import { scenarioSummaryLine } from '../data/scenarioSummary';

const ENDPOINT = '/.netlify/functions/rag-retrieve';
const TIMEOUT_MS = 2500;

/**
 * Cache lifetime. The corpus is admin-editable (knowledge documents, scenario
 * ↔ knowledge links), so a tab left open all day must not keep serving the
 * retrieval it made at 9am. Five minutes matches the flag-snapshot refresh
 * interval — long enough that a session's own turns share one fetch, short
 * enough that an admin edit shows up without a reload.
 */
const CACHE_TTL_MS = 5 * 60_000;

interface CacheEntry {
  results: RetrievedChunk[];
  at: number;
}

const cache = new Map<string, CacheEntry>();

/** Test hook — retrieval caching is module state. */
export function __clearRetrievalCache(): void {
  cache.clear();
}

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

/**
 * The per-scenario retrieval cache key, shared by text and voice mode.
 *
 * `_overrideId` is the stable admin/seed id when the scenario came from a
 * flag-aware surface; otherwise the summary line distinguishes user-built
 * scenarios from each other. (Voice used to key on `pushback.id + breed`,
 * which every custom "cost pushback / Lab" build collided on.)
 */
export function scenarioRetrievalCacheKey(scenario: Scenario): string {
  return scenario._overrideId ?? scenarioSummaryLine(scenario);
}

export async function retrieveContext(
  query: string,
  opts: { k?: number; filters?: RetrievalFilters; cacheKey?: string } = {},
): Promise<RetrievedChunk[]> {
  const k = opts.k ?? 4;
  // `k` is part of the key: the same scenario asked for 4 chunks and then 8
  // (an admin raising the RAG budget) must not be served the shorter list.
  const key = `${opts.cacheKey ?? query}|k=${k}${filterKey(opts.filters)}`;
  const hit = cache.get(key);
  if (hit) {
    if (Date.now() - hit.at < CACHE_TTL_MS) return hit.results;
    cache.delete(key);
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        k,
        filters: opts.filters ?? {},
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: RetrievedChunk[] };
    const results = Array.isArray(data.results) ? data.results : [];
    // Never cache an empty result: it is indistinguishable from "the corpus
    // wasn't ready / the embedder was cold", and pinning it for five minutes
    // would leave the whole session ungrounded over one bad round-trip.
    if (results.length > 0) cache.set(key, { results, at: Date.now() });
    return results;
  } catch {
    return [];
  }
}
