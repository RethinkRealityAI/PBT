/**
 * Wire contract for the admin "Try a search" tester
 * (`netlify/functions/admin-knowledge-search`, permission `knowledge.read`).
 *
 * It runs the SAME retrieval the tools run (`_shared/retrieval.retrieveChunks`)
 * with an explicit scope, and returns the ranked passages with enough
 * provenance for an admin to see — and prove — that a cat document can never
 * reach a dog scan, or a fecal chart a roleplay. Nothing here is cached
 * differently from production retrieval: what the tester shows is what a
 * session would get.
 */
import type { RetrievedChunk } from '../../services/ragShared';

export interface KnowledgeSearchRequest {
  query: string;
  /** Which consumer to search as (KNOWLEDGE_TOOL_KEYS). Required. */
  tool: string;
  /** Optional species scope (KNOWLEDGE_SPECIES_KEYS). */
  species?: string | null;
  /** Optional clinical focus (FOCUS_AREA_KEYS) — soft filter, as in production. */
  focus?: string | null;
  /** 1–8, default 4. */
  k?: number;
}

export interface KnowledgeSearchResponse {
  results: RetrievedChunk[];
  /** The jsonb containment filter that was actually sent to the database. */
  appliedFilter: Record<string, unknown>;
  /**
   * True when the focus filter matched nothing and retrieval fell back to the
   * tool/species scope alone (the tool/species scope is never relaxed).
   */
  focusRelaxed: boolean;
  /** Wall-clock of the embed + search, for the "is this fast enough" question. */
  latencyMs: number;
}
