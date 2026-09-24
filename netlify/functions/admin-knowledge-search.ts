/**
 * Admin: "Try a search" against the knowledge base (POST only, permission
 * `knowledge.read`).
 *
 *   POST { query, tool, species?, focus?, k? } → KnowledgeSearchResponse
 *
 * This runs the SAME retrieval the tools run — `_shared/retrieval`, same
 * embedding, same RPC, same cache, same fallback semantics — with an explicit
 * scope. It exists so an admin can PROVE the boundary rather than trust it:
 * search as `fecal-scan` + `cat` and a dog chart cannot appear; search as
 * `roleplay` and no fecal chart can. The response reports the jsonb filter
 * that was actually sent and whether the focus had to be relaxed, both taken
 * from retrieval itself rather than reconstructed from the request.
 *
 * `tool` is REQUIRED and validated (unlike the fail-open public endpoint): a
 * tester that silently searched the whole corpus would answer a different
 * question from the one the admin asked, which is worse than an error.
 */
import { errorResponse, jsonResponse, requireAdmin } from './_shared/admin';
import {
  MAX_K,
  MAX_QUERY_CHARS,
  retrieveChunksDetailed,
} from './_shared/retrieval';
import { isFocusAreaKey } from '../../src/shared/knowledge/focusAreas';
import {
  isKnowledgeSpeciesKey,
  isKnowledgeToolKey,
} from '../../src/shared/knowledge/knowledgeScopes';
import type {
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
} from '../../src/shared/knowledge/knowledgeSearch';

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'knowledge.read');
  if (ctx instanceof Response) return ctx;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: KnowledgeSearchRequest;
  try {
    body = (await req.json()) as KnowledgeSearchRequest;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  const query = typeof body.query === 'string' ? body.query.trim().slice(0, MAX_QUERY_CHARS) : '';
  if (!query) return errorResponse(400, 'query required');

  if (!isKnowledgeToolKey(body.tool)) {
    return errorResponse(400, `Unknown tool: ${String(body.tool ?? '')}`);
  }
  const tool = body.tool;

  const species = body.species == null || body.species === '' ? null : body.species;
  if (species !== null && !isKnowledgeSpeciesKey(species)) {
    return errorResponse(400, `Unknown species: ${String(species)}`);
  }

  const focus = body.focus == null || body.focus === '' ? null : body.focus;
  if (focus !== null && !isFocusAreaKey(focus)) {
    return errorResponse(400, `Unknown focus area: ${String(focus)}`);
  }

  // `|| 4` would turn an explicit k=0 into 4 instead of clamping it to 1.
  const rawK = Number(body.k);
  const k = Math.max(1, Math.min(MAX_K, Math.round(Number.isFinite(rawK) ? rawK : 4)));

  const { results, appliedFilter, focusRelaxed, latencyMs } = await retrieveChunksDetailed(query, {
    k,
    filters: {
      tool,
      ...(species ? { species } : {}),
      ...(focus ? { focus } : {}),
    },
    sb: ctx.sb,
  });

  const payload: KnowledgeSearchResponse = { results, appliedFilter, focusRelaxed, latencyMs };
  return jsonResponse(payload);
};
