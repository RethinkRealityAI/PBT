/**
 * Public retrieval endpoint for the RAG loop (no auth — same posture as
 * flags-resolve; serves anonymous consumer sessions).
 *
 *   POST { query: string, k?: number,
 *          filters?: { focus?: string, docSlugs?: string[] } }
 *   → { results: [{ content, citation, tags, similarity }] }
 *
 * Thin HTTP wrapper over `_shared/retrieval.ts` (`retrieveChunks`), which
 * holds the embedding + pgvector RPC + cache + fallback semantics so the
 * server-side AI functions can ground prompts in-process.
 *
 * FAIL-OPEN by design: any error (missing key, embed failure, DB hiccup, a
 * malformed body) returns { results: [] } with HTTP 200 — a RAG outage must
 * degrade the roleplay to un-grounded prompts, never break it. This endpoint
 * never 400s; invalid filter input is ignored rather than rejected.
 */
import { MAX_K, MAX_QUERY_CHARS, retrieveChunks, sanitizeFilters } from './_shared/retrieval';
import type { RetrievedChunk } from '../../src/services/ragShared';

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
      filters?: unknown;
    };
    const query = (body.query ?? '').trim().slice(0, MAX_QUERY_CHARS);
    if (!query) return ok([]);
    const k = Math.max(1, Math.min(MAX_K, Math.round(body.k ?? 4)));
    const filters = sanitizeFilters(body.filters);
    return ok(await retrieveChunks(query, { k, filters }));
  } catch (err) {
    console.warn('[rag-retrieve] failed open', err);
    return ok([]);
  }
};
