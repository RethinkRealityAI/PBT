/**
 * Knowledge retrieval for the RAG loop — the body of the public
 * `rag-retrieve` endpoint, extracted so the server-side AI functions
 * (`ai-roleplay`, `ai-evaluate`, `ai-voice-token`, `admin-scenario-ai`,
 * `ai-fecal-scan`) can ground their prompts in-process instead of calling
 * their own HTTP endpoint.
 *
 * Embeds the query (gemini-embedding-001, RETRIEVAL_QUERY) and runs the
 * match_knowledge_chunks pgvector RPC via the service role.
 *
 * ── Scoping (see docs/superpowers/specs/2026-09-21-knowledge-scopes-design.md)
 * Four filters, two of which are HARD:
 *   • `tool`    — WHO is asking (KNOWLEDGE_TOOL_KEYS). HARD: it is present on
 *                 EVERY rpc call this module makes, including both fallbacks.
 *                 Without it a fecal chart is a legitimate hit for a GI
 *                 roleplay, and a zero-hit retry would quote it.
 *   • `species` — WHICH animal (KNOWLEDGE_SPECIES_KEYS). HARD, same rule: a
 *                 cat passage must never ground a dog scan.
 *   • `docSlugs`— explicit scenario attachments. Restricts documents INSIDE
 *                 the scope, replaces `focus`, and never triggers a zero-row
 *                 retry (the admin UI promises "only inside them").
 *   • `focus`   — clinical topic. SOFT: zero rows with a focus retries once
 *                 with the scope alone, so tagging a topic nobody has filed
 *                 yet can never return less than not tagging it.
 *
 * FAIL-OPEN by design: any error (missing key, embed failure, DB hiccup)
 * resolves to `[]` — a RAG outage must degrade the roleplay to un-grounded
 * prompts, never break it. Invalid filter input is ignored rather than
 * rejected.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from './admin';
import { embedTexts } from './gemini';
import { toPgvectorLiteral, type RetrievedChunk } from '../../../src/services/ragShared';
import { isFocusAreaKey } from '../../../src/shared/knowledge/focusAreas';
import {
  isKnowledgeSpeciesKey,
  isKnowledgeToolKey,
} from '../../../src/shared/knowledge/knowledgeScopes';

const CACHE_TTL_MS = 5 * 60_000;
export const MAX_K = 8;
export const MAX_QUERY_CHARS = 2000;
const MAX_DOC_SLUGS = 40;
const MAX_SLUG_LEN = 200;

/** What one retrieval produced, minus the wall clock (which is per-call). */
interface CachedRetrieval {
  results: RetrievedChunk[];
  appliedFilter: Record<string, unknown>;
  focusRelaxed: boolean;
}

const cache = new Map<string, { value: CachedRetrieval; expiresAt: number }>();

export interface RetrievalFilters {
  /** Clinical focus area — SOFT, relaxed when it matches nothing. */
  focus?: string;
  /** Explicit document attachment — runs inside the scope, never relaxed. */
  docSlugs?: string[];
  /** The consumer asking (KNOWLEDGE_TOOL_KEYS) — HARD. */
  tool?: string;
  /** Species / life-stage scope (KNOWLEDGE_SPECIES_KEYS) — HARD. */
  species?: string;
}

export interface RetrieveOptions {
  k?: number;
  filters?: RetrievalFilters;
  /** Service-role client to reuse; a fresh one is created when omitted. */
  sb?: SupabaseClient;
}

/** `retrieveChunks` plus the provenance the admin search tester reports. */
export interface DetailedRetrieval extends CachedRetrieval {
  /** Wall-clock of the embed + search. */
  latencyMs: number;
}

/** Test hook — the retrieval cache is module state. */
export function __clearRetrievalCache(): void {
  cache.clear();
}

/** Ignore-don't-reject validation: anything unrecognised is simply dropped. */
export function sanitizeFilters(raw: unknown): RetrievalFilters {
  if (!raw || typeof raw !== 'object') return {};
  const { focus, docSlugs, tool, species } = raw as {
    focus?: unknown;
    docSlugs?: unknown;
    tool?: unknown;
    species?: unknown;
  };
  const out: RetrievalFilters = {};
  if (isFocusAreaKey(focus)) out.focus = focus;
  if (isKnowledgeToolKey(tool)) out.tool = tool;
  if (isKnowledgeSpeciesKey(species)) out.species = species;
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
 * The jsonb containment filter for a set of (already sanitized) filters.
 *
 * `tags @> filter` means "contains", so `{"tools":["fecal-scan"]}` matches a
 * chunk filed `tools: ['fecal-scan','coach']` and never one filed
 * `tools: ['roleplay']`. Explicit document attachment replaces the focus tag
 * (the documents ARE the targeting) but never the scope.
 */
export function buildScopeFilter(filters: RetrievalFilters): Record<string, unknown> {
  return {
    ...(filters.tool ? { tools: [filters.tool] } : {}),
    ...(filters.species ? { species: [filters.species] } : {}),
    ...(filters.focus && !filters.docSlugs ? { focus: filters.focus } : {}),
  };
}

/** The scope alone — what both fallback paths narrow to. */
function scopeOnly(filters: RetrievalFilters): Record<string, unknown> {
  return buildScopeFilter({ tool: filters.tool, species: filters.species });
}

type Row = {
  content: string;
  citation: string | null;
  tags: Record<string, unknown> | null;
  similarity: number;
  /** Provenance — only once 20260922000000_knowledge_scopes.sql is applied. */
  doc_slug?: string | null;
  doc_title?: string | null;
};

function mapRow(r: Row): RetrievedChunk {
  const chunk: RetrievedChunk = {
    content: r.content,
    citation: r.citation,
    tags: r.tags,
    similarity: r.similarity,
  };
  if (r.doc_slug !== undefined) chunk.docSlug = r.doc_slug;
  if (r.doc_title !== undefined) chunk.docTitle = r.doc_title;
  return chunk;
}

/**
 * Retrieve the top-`k` knowledge chunks for `query`, with the filter that was
 * actually applied and whether the focus had to be relaxed. Never throws —
 * every failure path resolves to an empty result (see the header comment).
 */
export async function retrieveChunksDetailed(
  rawQuery: string,
  opts: RetrieveOptions = {},
): Promise<DetailedRetrieval> {
  const startedAt = Date.now();
  const filters = sanitizeFilters(opts.filters);
  const elapsed = () => Date.now() - startedAt;
  const empty = (): DetailedRetrieval => ({
    results: [],
    appliedFilter: buildScopeFilter(filters),
    focusRelaxed: false,
    latencyMs: elapsed(),
  });

  try {
    const query = String(rawQuery ?? '').trim().slice(0, MAX_QUERY_CHARS);
    if (!query) return empty();
    const k = Math.max(1, Math.min(MAX_K, Math.round(opts.k ?? 4)));

    const cacheKey = JSON.stringify({
      query,
      k,
      focus: filters.focus ?? null,
      docSlugs: filters.docSlugs ? [...filters.docSlugs].sort() : null,
      tool: filters.tool ?? null,
      species: filters.species ?? null,
    });
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return { ...hit.value, latencyMs: elapsed() };

    const [embedding] = await embedTexts([query], 'RETRIEVAL_QUERY');
    const sb = opts.sb ?? getServiceClient();
    const literal = toPgvectorLiteral(embedding);

    let appliedFilter = buildScopeFilter(filters);
    const args: Record<string, unknown> = {
      query_embedding: literal,
      match_count: k,
      filter: appliedFilter,
    };
    if (filters.docSlugs) args.doc_slugs = filters.docSlugs;

    let { data, error } = await sb.rpc('match_knowledge_chunks', args);

    // Fallback semantics. The tool/species scope is in `scopeOnly`, so it
    // survives BOTH retries — it is a boundary, not a preference.
    // • RPC ERROR (e.g. a migration not yet applied): retry inside the scope
    //   with no focus and no document restriction — grounding must never get
    //   worse than it was before scenarios carried knowledge links.
    // • ZERO ROWS with a focus: retry inside the scope — a topic nobody has
    //   tagged yet shouldn't strip the session of all grounding.
    // • ZERO ROWS with explicit doc attachments: honest empty result. The
    //   admin UI promises "the search only looks inside them", so pulling
    //   from the whole corpus here would silently break that contract.
    const softened = Boolean(filters.docSlugs || filters.focus);
    const zeroRows = !(data as Row[] | null)?.length;
    let focusRelaxed = false;
    if (softened && (error || (zeroRows && filters.focus && !filters.docSlugs))) {
      if (error) console.warn('[rag-retrieve] filtered rpc failed', error.message);
      focusRelaxed = Boolean(filters.focus);
      appliedFilter = scopeOnly(filters);
      ({ data, error } = await sb.rpc('match_knowledge_chunks', {
        query_embedding: literal,
        match_count: k,
        filter: appliedFilter,
      }));
    }

    if (error) {
      console.warn('[rag-retrieve] rpc failed', error.message);
      return { results: [], appliedFilter, focusRelaxed, latencyMs: elapsed() };
    }

    const value: CachedRetrieval = {
      results: ((data ?? []) as Row[]).map(mapRow),
      appliedFilter,
      focusRelaxed,
    };

    // Bound the cache so a scan of unique queries can't grow it unbounded.
    if (cache.size > 500) cache.clear();
    cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return { ...value, latencyMs: elapsed() };
  } catch (err) {
    console.warn('[rag-retrieve] failed open', err);
    return empty();
  }
}

/**
 * Retrieve the top-`k` knowledge chunks for `query`. Never throws — every
 * failure path resolves to `[]`. Thin wrapper over `retrieveChunksDetailed`
 * for the many callers that only want the passages.
 */
export async function retrieveChunks(
  rawQuery: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  return (await retrieveChunksDetailed(rawQuery, opts)).results;
}
