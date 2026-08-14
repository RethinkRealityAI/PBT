/**
 * Public retrieval endpoint for the RAG loop (no auth — same posture as
 * flags-resolve; serves anonymous consumer sessions).
 *
 *   POST { query: string, k?: number,
 *          filters?: { focus?: string, docSlugs?: string[] } }
 *   → { results: [{ content, citation, tags, similarity }] }
 *
 * Embeds the query (gemini-embedding-001, RETRIEVAL_QUERY) and runs the
 * match_knowledge_chunks pgvector RPC via the service role.
 *
 * Retrieval targeting comes from the scenario (see scenario_overrides
 * .focus_area / .knowledge_slugs). Explicit document attachment wins: when
 * `docSlugs` is present the RPC is restricted to those documents and NO focus
 * tag filter is applied; otherwise a valid `focus` becomes the jsonb tag
 * filter. Invalid filter input is ignored rather than rejected — this
 * endpoint never 400s.
 *
 * FAIL-OPEN by design: any error (missing key, embed failure, DB hiccup)
 * returns { results: [] } with HTTP 200 — a RAG outage must degrade the
 * roleplay to un-grounded prompts, never break it. This deliberately differs
 * from flags-resolve's error responses. Filtering is fail-open too: a filtered
 * query that errors or matches nothing retries once unfiltered, so adding a
 * focus area can never return less context than no focus area at all.
 */
import { getServiceClient } from './_shared/admin';
import { embedTexts } from './_shared/gemini';
import { toPgvectorLiteral, type RetrievedChunk } from '../../src/services/ragShared';
import { isFocusAreaKey } from '../../src/shared/knowledge/focusAreas';

const CACHE_TTL_MS = 5 * 60_000;
const MAX_K = 8;
const MAX_DOC_SLUGS = 40;
const MAX_SLUG_LEN = 200;
const cache = new Map<string, { value: RetrievedChunk[]; expiresAt: number }>();

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, max-age=60',
};

interface RetrievalFilters {
  focus?: string;
  docSlugs?: string[];
}

function ok(results: RetrievedChunk[]): Response {
  return new Response(JSON.stringify({ results }), { headers: JSON_HEADERS });
}

/** Ignore-don't-reject validation: anything unrecognised is simply dropped. */
function sanitizeFilters(raw: unknown): RetrievalFilters {
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

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'POST') return ok([]);
    const body = (await req.json().catch(() => ({}))) as {
      query?: string;
      k?: number;
      filters?: unknown;
    };
    const query = (body.query ?? '').trim().slice(0, 2000);
    if (!query) return ok([]);
    const k = Math.max(1, Math.min(MAX_K, Math.round(body.k ?? 4)));
    const filters = sanitizeFilters(body.filters);

    const cacheKey = JSON.stringify({
      query,
      k,
      focus: filters.focus ?? null,
      docSlugs: filters.docSlugs ? [...filters.docSlugs].sort() : null,
    });
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return ok(hit.value);

    const [embedding] = await embedTexts([query], 'RETRIEVAL_QUERY');
    const sb = getServiceClient();
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

    // Fail-open on the FILTER, not just on the service: a targeted query that
    // errors (e.g. the doc_slugs migration hasn't been applied yet) or that
    // matches nothing falls back to un-targeted retrieval so grounding never
    // gets worse than it was before scenarios carried knowledge links.
    if (filtered && (error || !(data as Row[] | null)?.length)) {
      if (error) console.warn('[rag-retrieve] filtered rpc failed', error.message);
      ({ data, error } = await sb.rpc('match_knowledge_chunks', {
        query_embedding: literal,
        match_count: k,
        filter: {},
      }));
    }

    if (error) {
      console.warn('[rag-retrieve] rpc failed', error.message);
      return ok([]);
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
    return ok(results);
  } catch (err) {
    console.warn('[rag-retrieve] failed open', err);
    return ok([]);
  }
};
