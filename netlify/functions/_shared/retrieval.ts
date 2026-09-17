/**
 * Knowledge retrieval for the RAG loop — the body of the public
 * `rag-retrieve` endpoint, extracted so the server-side AI functions
 * (`ai-roleplay`, `ai-evaluate`, `ai-voice-token`, `admin-scenario-ai`) can
 * ground their prompts in-process instead of calling their own HTTP endpoint.
 *
 * Embeds the query (gemini-embedding-001, RETRIEVAL_QUERY) and runs the
 * match_knowledge_chunks pgvector RPC via the service role.
 *
 * Retrieval targeting comes from the scenario (see scenario_overrides
 * .focus_area / .knowledge_slugs). Explicit document attachment wins: when
 * `docSlugs` is present the RPC is restricted to those documents and NO focus
 * tag filter is applied; otherwise a valid `focus` becomes the jsonb tag
 * filter. Invalid filter input is ignored rather than rejected.
 *
 * FAIL-OPEN by design: any error (missing key, embed failure, DB hiccup)
 * resolves to `[]` — a RAG outage must degrade the roleplay to un-grounded
 * prompts, never break it. Filtering is fail-open too: a filtered query that
 * errors or matches nothing retries once unfiltered, so adding a focus area
 * can never return less context than no focus area at all.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from './admin';
import { embedTexts } from './gemini';
import { toPgvectorLiteral, type RetrievedChunk } from '../../../src/services/ragShared';
import { isFocusAreaKey } from '../../../src/shared/knowledge/focusAreas';

const CACHE_TTL_MS = 5 * 60_000;
export const MAX_K = 8;
export const MAX_QUERY_CHARS = 2000;
const MAX_DOC_SLUGS = 40;
const MAX_SLUG_LEN = 200;
const cache = new Map<string, { value: RetrievedChunk[]; expiresAt: number }>();

export interface RetrievalFilters {
  focus?: string;
  docSlugs?: string[];
}

export interface RetrieveOptions {
  k?: number;
  filters?: RetrievalFilters;
  /** Service-role client to reuse; a fresh one is created when omitted. */
  sb?: SupabaseClient;
}

/** Test hook — the retrieval cache is module state. */
export function __clearRetrievalCache(): void {
  cache.clear();
}

/** Ignore-don't-reject validation: anything unrecognised is simply dropped. */
export function sanitizeFilters(raw: unknown): RetrievalFilters {
  if (!raw || typeof raw !== 'object') return {};
  const { focus, docSlugs } = raw as { focus?: unknown; docSlugs?: unknown };
  const out: RetrievalFilters = {};
  if (isFocusAreaKey(focus)) out.focus = focus;
  if (Array.isArray(docSlugs)) {
    const slugs = docSlugs
      .filter(
        (s): s is string =>
          typeof s === 'string' && s.trim() !== '' && s.length <= MAX_SLUG_LEN,
      )
      .slice(0, MAX_DOC_SLUGS);
    if (slugs.length) out.docSlugs = slugs;
  }
  return out;
}

/**
 * Retrieve the top-`k` knowledge chunks for `query`. Never throws — every
 * failure path resolves to `[]` (see the header comment).
 */
export async function retrieveChunks(
  rawQuery: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  try {
    const query = String(rawQuery ?? '').trim().slice(0, MAX_QUERY_CHARS);
    if (!query) return [];
    const k = Math.max(1, Math.min(MAX_K, Math.round(opts.k ?? 4)));
    const filters = sanitizeFilters(opts.filters);

    const cacheKey = JSON.stringify({
      query,
      k,
      focus: filters.focus ?? null,
      docSlugs: filters.docSlugs ? [...filters.docSlugs].sort() : null,
    });
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    const [embedding] = await embedTexts([query], 'RETRIEVAL_QUERY');
    const sb = opts.sb ?? getServiceClient();
    const literal = toPgvectorLiteral(embedding);

    // Explicit document attachment wins over the focus tag filter.
    const args: Record<string, unknown> = {
      query_embedding: literal,
      match_count: k,
      filter: {},
    };
    let filtered = false;
    if (filters.docSlugs) {
      args.doc_slugs = filters.docSlugs;
      filtered = true;
    } else if (filters.focus) {
      args.filter = { focus: filters.focus };
      filtered = true;
    }

    type Row = {
      content: string;
      citation: string | null;
      tags: Record<string, unknown> | null;
      similarity: number;
    };

    let { data, error } = await sb.rpc('match_knowledge_chunks', args);

    // Fallback semantics differ by filter kind:
    // • RPC ERROR (e.g. the doc_slugs migration hasn't been applied yet):
    //   retry unfiltered for BOTH kinds — grounding must never get worse than
    //   it was before scenarios carried knowledge links.
    // • ZERO ROWS with a focus filter: retry unfiltered — a topic nobody has
    //   tagged yet shouldn't strip the session of all grounding.
    // • ZERO ROWS with explicit doc attachments: honest empty result. The
    //   admin UI promises "the search only looks inside them", so pulling
    //   from the whole corpus here would silently break that contract.
    const zeroRows = !(data as Row[] | null)?.length;
    if (filtered && (error || (zeroRows && !filters.docSlugs))) {
      if (error) console.warn('[rag-retrieve] filtered rpc failed', error.message);
      ({ data, error } = await sb.rpc('match_knowledge_chunks', {
        query_embedding: literal,
        match_count: k,
        filter: {},
      }));
    }

    if (error) {
      console.warn('[rag-retrieve] rpc failed', error.message);
      return [];
    }

    const results: RetrievedChunk[] = ((data ?? []) as Row[]).map((r) => ({
      content: r.content,
      citation: r.citation,
      tags: r.tags,
      similarity: r.similarity,
    }));

    // Bound the cache so a scan of unique queries can't grow it unbounded.
    if (cache.size > 500) cache.clear();
    cache.set(cacheKey, { value: results, expiresAt: Date.now() + CACHE_TTL_MS });
    return results;
  } catch (err) {
    console.warn('[rag-retrieve] failed open', err);
    return [];
  }
}
