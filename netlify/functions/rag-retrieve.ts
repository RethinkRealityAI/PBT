/**
 * Public retrieval endpoint for the RAG loop (no auth — same posture as
 * flags-resolve; serves anonymous consumer sessions).
 *
 *   POST { query: string, k?: number,
 *          filters?: { focus?: string, docSlugs?: string[] } }
 *   → { results: [{ content, citation, tags, similarity }] }
 *
 * ── Scope is fixed, not requested ──────────────────────────────────────────
 * The only browser caller is the text-mode roleplay (`src/services/ragClient`
 * via `useTextChat`), so this endpoint ALWAYS searches as `tool: 'roleplay'`.
 * A client-supplied `tool` / `species` is ignored: letting an anonymous
 * caller pick the scope (or omit it, which used to mean "the whole corpus")
 * would expose documents filed for other tools — the fecal charts, admin
 * supplements filed for the Fecal Scan — to anyone with curl. Server-side AI
 * functions that need another scope call `_shared/retrieval.ts` in-process,
 * and the admin search tester has its own gated function
 * (`admin-knowledge-search`, `knowledge.read`).
 *
 * Document provenance (`docSlug` / `docTitle`) is stripped from the response
 * for the same reason: the roleplay prompt only needs the passage and its
 * citation, and the corpus's internal naming is not public.
 *
 * Rate-limited per IP (30 / min, in-memory) because every call costs an
 * embedding. A limited caller gets 429, which the client treats like any
 * other failure: no grounding, roleplay continues.
 *
 * Thin HTTP wrapper over `_shared/retrieval.ts` (`retrieveChunks`), which
 * holds the embedding + pgvector RPC + cache + fallback semantics.
 *
 * FAIL-OPEN by design: any error (missing key, embed failure, DB hiccup, a
 * malformed body) returns { results: [] } with HTTP 200 — a RAG outage must
 * degrade the roleplay to un-grounded prompts, never break it. This endpoint
 * never 400s; invalid filter input is ignored rather than rejected.
 */
import { MAX_K, MAX_QUERY_CHARS, retrieveChunks, sanitizeFilters } from './_shared/retrieval';
import { rateLimit } from './_shared/ai';
import type { RetrievedChunk } from '../../src/services/ragShared';

/** The one knowledge scope a public, anonymous caller may search. */
export const PUBLIC_RETRIEVAL_TOOL = 'roleplay';

const RATE = { limit: 30, windowMs: 60_000 };

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, max-age=60',
};

function ok(results: RetrievedChunk[]): Response {
  return new Response(JSON.stringify({ results }), { headers: JSON_HEADERS });
}

/** Passage, citation, tags and score only — never the document's slug/title. */
function publicChunk(c: RetrievedChunk): RetrievedChunk {
  return { content: c.content, citation: c.citation, tags: c.tags, similarity: c.similarity };
}

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'POST') return ok([]);

    const limited = rateLimit(req, 'rag-retrieve', RATE);
    if (limited) return limited;

    const body = (await req.json().catch(() => ({}))) as {
      query?: string;
      k?: number;
      filters?: unknown;
    };
    const query = (body.query ?? '').trim().slice(0, MAX_QUERY_CHARS);
    if (!query) return ok([]);
    const k = Math.max(1, Math.min(MAX_K, Math.round(Number(body.k ?? 4)) || 4));
    // Targeting (focus / attached documents) is the client's to choose; the
    // SCOPE is not. Anything the client said about tool or species is dropped.
    const { focus, docSlugs } = sanitizeFilters(body.filters);
    const filters = {
      ...(focus ? { focus } : {}),
      ...(docSlugs ? { docSlugs } : {}),
      tool: PUBLIC_RETRIEVAL_TOOL,
    };
    const results = await retrieveChunks(query, { k, filters });
    return ok(results.map(publicChunk));
  } catch (err) {
    console.warn('[rag-retrieve] failed open', err);
    return ok([]);
  }
};
