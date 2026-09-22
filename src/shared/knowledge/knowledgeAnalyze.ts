// Tag assistant — the wire contract between the admin Knowledge screen and
// `netlify/functions/admin-knowledge-analyze`. When an admin adds a document
// (or presses "Suggest with AI" on an existing one), the model reads it and
// pre-fills WHAT it is and WHERE it should be used; the admin can change every
// field before saving. Dependency-free on purpose (imported by admin/src and
// netlify/functions alike), like the vocabularies it refers to:
// `focusAreas.ts` (focus) and `knowledgeScopes.ts` (tools, species).

export interface KnowledgeAnalyzeRequest {
  /** Raw PDF, base64 (≤ 4MB raw). Extracted first, then analysed. */
  pdfBase64?: string;
  /** Plain text / markdown to analyse as-is (≤ 200k chars). */
  text?: string;
  /** What the admin typed as the title, if anything — a hint, not a rule. */
  title?: string;
  /** Existing document slug — analyse its stored content instead. */
  slug?: string;
}

/** What the model decided. Every key is a vocabulary key the UI can render. */
export interface KnowledgeAnalysis {
  title: string;
  /** 2–3 sentences, plain English, written for a non-technical admin. */
  summary: string;
  category: 'clinical' | 'custom';
  /** A `FOCUS_AREAS` key, or null when no area fits. */
  focus: string | null;
  /** `KNOWLEDGE_TOOLS` keys — "Used by". Never empty (defaults applied). */
  tools: string[];
  /** `KNOWLEDGE_SPECIES` keys. Never empty (defaults applied). */
  species: string[];
  /** Short-form citation, or null when the text does not state one. */
  citation: string | null;
  /** ≤ 6 short noun phrases. */
  topics: string[];
  /** 0–1. */
  confidence: number;
  /** One short sentence each, explaining the placement to the admin. */
  reasons: { focus: string; tools: string; species: string };
  /** Things the admin should double-check before saving. */
  warnings: string[];
}

export interface KnowledgeAnalyzeResponse {
  analysis: KnowledgeAnalysis;
  /**
   * The extracted markdown for a PDF, so the UI can ingest it as `text` and
   * skip a second extraction.
   */
  extractedMarkdown?: string;
  extractedCitation?: string;
}

/** Hard cap on `text` (the request), not what the model sees. */
export const MAX_ANALYZE_TEXT_CHARS = 200_000;
/** What the model actually reads; longer content is cut and flagged. */
export const ANALYZE_MODEL_CHARS = 40_000;
export const MAX_ANALYZE_TOPICS = 6;
