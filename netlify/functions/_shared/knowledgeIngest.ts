/**
 * Shared ingestion pieces for the RAG knowledge base: the bundled study
 * manifest, Gemini PDF extraction, and the chunk+embed+store write path.
 *
 * Extracted from `admin-knowledge-ingest.ts` so the function, the sync script
 * (`scripts/knowledge-sync.ts`) and the deploy plugin all run ONE
 * implementation. The function keeps the HTTP/auth shell; everything below is
 * transport-free and takes an explicit Supabase client + actor id, so a
 * service-role script can call it with `userId = null`.
 */
import { embedTexts, getGeminiClient } from './gemini';
import { chunkMarkdown } from '../../../src/services/ragShared';
import { estimateTokens } from '../../../src/shared/ai/telemetryHeuristics';
import {
  ALL_KNOWLEDGE_SPECIES,
  DEFAULT_KNOWLEDGE_TOOLS,
  normalizeKnowledgeSpecies,
  normalizeKnowledgeTools,
} from '../../../src/shared/knowledge/knowledgeScopes';

export const EXTRACT_MODEL = 'gemini-3-flash-preview';
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

/**
 * The Dr. Coe studies shipped in public/studies/ (served at /studies/*).
 *
 * Every entry carries a `focus` from the shared vocabulary — retrieval filters
 * chunks on `tags @> { focus }`, so a study tagged only `topic` (as the two
 * communication papers were) can never be reached by a focus-targeted
 * scenario. `topic` is kept alongside for back-compat with anything that read
 * the old shape.
 */
const STUDY_SCOPE = {
  tools: DEFAULT_KNOWLEDGE_TOOLS,
  species: ALL_KNOWLEDGE_SPECIES,
} as const;

export interface BundledStudy {
  /** File name under public/studies/. */
  file: string;
  slug: string;
  tags: Record<string, unknown>;
}

export const BUNDLED_STUDIES: BundledStudy[] = [
  {
    file: 'davies-2024-dog-owner-preferences-obesity.pdf',
    slug: 'study:davies-2024',
    tags: { focus: 'weight', ...STUDY_SCOPE },
  },
  {
    file: 'sutherland-2024-cat-owner-preferences-obesity.pdf',
    slug: 'study:sutherland-2024-cat',
    tags: { focus: 'weight', ...STUDY_SCOPE },
  },
  {
    file: 'sutherland-2024-client-obesity-communication.pdf',
    slug: 'study:sutherland-2024-client',
    tags: { focus: 'weight', ...STUDY_SCOPE },
  },
  {
    file: 'macmartin-2015-nutritional-history-question-design.pdf',
    slug: 'study:macmartin-2015',
    tags: { focus: 'communication', topic: 'communication', ...STUDY_SCOPE },
  },
  {
    file: 'macmartin-2023-client-resistance-conversation-analysis.pdf',
    slug: 'study:macmartin-2023',
    tags: { focus: 'communication', topic: 'communication', ...STUDY_SCOPE },
  },
];

/**
 * Stamp a knowledge scope onto a tag bag: unknown keys dropped, absent or
 * empty → the defaults (the four training-session tools, every species —
 * never the Fecal Scan, which has to be chosen on purpose).
 *
 * Applied in `storeKnowledgeDoc`, so EVERY write path — upload, bundled
 * study, re-embed — produces a document that scoped retrieval can see.
 */
export function withKnowledgeScope(tags: Record<string, unknown>): Record<string, unknown> {
  return {
    ...tags,
    tools: normalizeKnowledgeTools(tags.tools),
    species: normalizeKnowledgeSpecies(tags.species),
  };
}

export interface Extracted {
  title: string;
  citation: string;
  markdown: string;
}

/** Gemini native PDF understanding → structured markdown + citation. */
export async function extractPdf(pdfBase64: string): Promise<Extracted> {
  const ai = getGeminiClient();
  const res = await ai.models.generateContent({
    model: EXTRACT_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          {
            text:
              'Extract this research paper for a retrieval corpus. Return JSON with: ' +
              '"title" (paper title), "citation" (short form: "Authors, Year — Journal"), ' +
              '"markdown" (the full substantive content as clean markdown: abstract, findings, ' +
              'discussion, practical implications; omit references list, page furniture, and tables ' +
              'that do not read as prose — summarise key tables in text).',
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        required: ['title', 'citation', 'markdown'],
        properties: {
          title: { type: 'string' },
          citation: { type: 'string' },
          markdown: { type: 'string' },
        },
      } as never,
    },
  });
  const parsed = JSON.parse(res.text ?? '{}') as Partial<Extracted>;
  if (!parsed.markdown?.trim()) throw new Error('PDF extraction returned no content');
  return {
    title: parsed.title?.trim() || 'Untitled document',
    citation: parsed.citation?.trim() || '',
    markdown: parsed.markdown,
  };
}

/**
 * The slice of a Supabase client these helpers use. Structural on purpose:
 * the Netlify functions pass `ctx.sb`, the sync script passes a service-role
 * client, and the tests pass a fake — none of them need to agree on generics.
 */
export interface KnowledgeDb {
  from(table: string): any;
}

export interface StoreDocArgs {
  slug: string;
  title: string;
  category: string;
  content: string;
  citation: string;
  tags: Record<string, unknown>;
  /** Preserve 'code-seed' when re-indexing a built-in doc (default 'admin'). */
  source?: string;
  /** Full metadata object to write (defaults to `{ citation, tags }`). */
  metadata?: Record<string, unknown>;
  /**
   * Tombstone to write. Default `null` — ingesting is an explicit (re-)add,
   * so it revives a soft-deleted slug. The automatic sync passes the STORED
   * value instead, because a re-sync must never be an undelete.
   */
  deletedAt?: string | null;
}

/** One chunk row, embedded and ready to insert. */
export interface PreparedChunkRow {
  chunk_idx: number;
  content: string;
  token_estimate: number;
  tags: Record<string, unknown>;
  citation: string | null;
  /** Normalised embedding vector (serialised to a pgvector literal on write). */
  embedding: number[];
}

/**
 * Upsert the document row and, unless `chunks` is null, replace its chunks
 * wholesale (which is what makes a re-run idempotent).
 *
 * `chunks: null` refreshes the body alone — the shape a soft-deleted document
 * needs, where re-embedding would quietly return it to retrieval.
 */
export async function writeKnowledgeDoc(
  sb: KnowledgeDb,
  userId: string | null,
  args: StoreDocArgs,
  chunks: PreparedChunkRow[] | null,
): Promise<number> {
  // One choke point for the scope: document metadata and chunk tags can never
  // disagree, whichever op got here.
  const tags = withKnowledgeScope(args.tags);
  const { data: doc, error: docErr } = await sb
    .from('knowledge_documents')
    .upsert(
      {
        slug: args.slug,
        title: args.title,
        category: args.category,
        content: args.content,
        metadata: args.metadata ? { ...args.metadata, tags } : { citation: args.citation, tags },
        source: args.source ?? 'admin',
        updated_by: userId,
        updated_at: new Date().toISOString(),
        deleted_at: args.deletedAt ?? null,
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .maybeSingle();
  if (docErr || !doc) throw new Error(docErr?.message ?? 'doc upsert failed');

  if (chunks === null) return 0;

  // Replace chunks wholesale (idempotent re-ingest).
  await sb.from('knowledge_chunks').delete().eq('doc_id', doc.id);
  const { error: chunkErr } = await sb.from('knowledge_chunks').insert(
    chunks.map((c) => ({
      doc_id: doc.id,
      chunk_idx: c.chunk_idx,
      content: c.content,
      token_estimate: c.token_estimate,
      tags: c.tags,
      citation: c.citation,
      embedding: `[${c.embedding.join(',')}]`,
    })),
  );
  if (chunkErr) throw new Error(chunkErr.message);
  return chunks.length;
}

/** Chunk + embed + store a document. Replaces any existing chunks. */
export async function storeKnowledgeDoc(
  sb: KnowledgeDb,
  userId: string | null,
  args: StoreDocArgs,
): Promise<number> {
  const tags = withKnowledgeScope(args.tags);
  const units = chunkMarkdown(args.content);
  const embeddings = await embedTexts(units, 'RETRIEVAL_DOCUMENT');
  return writeKnowledgeDoc(
    sb,
    userId,
    args,
    units.map((content, i) => ({
      chunk_idx: i,
      content,
      token_estimate: estimateTokens(content),
      tags: { category: args.category, ...tags },
      citation: args.citation || null,
      embedding: embeddings[i],
    })),
  );
}
