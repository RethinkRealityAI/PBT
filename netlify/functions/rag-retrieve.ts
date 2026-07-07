/**
 * Public retrieval endpoint for the RAG loop (no auth — same posture as
 * flags-resolve; serves anonymous consumer sessions).
 *
 *   POST { query: string, k?: number, filters?: Record<string, unknown> }
 *   → { results: [{ content, citation, tags, similarity }] }
 *
 * Embeds the query (gemini-embedding-001, RETRIEVAL_QUERY) and runs the
 * match_knowledge_chunks pgvector RPC via the service role.
 *
 * FAIL-OPEN by design: any error (missing key, embed failure, DB hiccup)
 * returns { results: [] } with HTTP 200 — a RAG outage must degrade the
 * roleplay to un-grounded prompts, never break it. This deliberately differs
 * from flags-resolve's error responses.
 */
import { getServiceClient } from './_shared/admin';
import { embedTexts } from './_shared/gemini';
import { toPgvectorLiteral, type RetrievedChunk } from '../../src/services/ragShared';

const CACHE_TTL_MS = 5 * 60_000;
const MAX_K = 8;
const cache = new Map<string, { value: RetrievedChunk[]; expiresAt: number }>();

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, max-age=60',
};

function ok(results: RetrievedChunk[]): Response {
  return new Response(JSON.stringify({ results }), { headers: JSON_HEADERS });
}

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'POST') return ok([]);
    const body = (await req.json().catch(() => ({}))) as {
      query?: string;
      k?: number;
      filters?: Record<string, unknown>;
    };
    const query = (body.query ?? '').trim().slice(0, 2000);
    if (!query) return ok([]);
    const k = Math.max(1, Math.min(MAX_K, Math.round(body.k ?? 4)));
    const filters = body.filters && typeof body.filters === 'object' ? body.filters : {};

    const cacheKey = JSON.stringify({ query, k, filters });
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return ok(hit.value);

    const [embedding] = await embedTexts([query], 'RETRIEVAL_QUERY');
    const sb = getServiceClient();
    const { data, error } = await sb.rpc('match_knowledge_chunks', {
      query_embedding: toPgvectorLiteral(embedding),
      match_count: k,
      filter: filters,
    });
    if (error) {
      console.warn('[rag-retrieve] rpc failed', error.message);
      return ok([]);
    }

    const results: RetrievedChunk[] = (data ?? []).map(
      (r: { content: string; citation: string | null; tags: Record<string, unknown> | null; similarity: number }) => ({
        content: r.content,
        citation: r.citation,
        tags: r.tags,
        similarity: r.similarity,
      }),
    );

    // Bound the cache so a scan of unique queries can't grow it unbounded.
    if (cache.size > 500) cache.clear();
    cache.set(cacheKey, { value: results, expiresAt: Date.now() + CACHE_TTL_MS });
    return ok(results);
  } catch (err) {
    console.warn('[rag-retrieve] failed open', err);
    return ok([]);
  }
};
