/**
 * Admin: ingest documents into the RAG knowledge base (POST only).
 *
 *   { op: 'ingest', pdfBase64?, text?, title?, category?, tags? }
 *       PDF → Gemini native PDF understanding extracts structured markdown +
 *       citation metadata; text is used as-is. Content is chunked
 *       (~800-token paragraphs), embedded (gemini-embedding-001, 768d,
 *       normalised) and stored as knowledge_documents + knowledge_chunks.
 *   { op: 're-embed', slug }        — re-chunk + re-embed a stored document.
 *   { op: 'ingest-bundled' }        — ingest the study PDFs shipped in
 *       public/studies/ (fetched from this deploy's own origin). Idempotent:
 *       upserts by slug.
 *
 * PDF cap: 4MB raw (Netlify body limit ~6MB; base64 inflates ~33%).
 */
import { errorResponse, jsonResponse, requireAdmin, type AdminCtx } from './_shared/admin';
import { isFocusAreaKey } from '../../src/shared/knowledge/focusAreas';
import { embedTexts, getGeminiClient } from './_shared/gemini';
import { chunkMarkdown } from '../../src/services/ragShared';
import { estimateTokens } from '../../src/services/aiTelemetry';

const EXTRACT_MODEL = 'gemini-3-flash-preview';
const MAX_PDF_BYTES = 4 * 1024 * 1024;

/**
 * The Dr. Coe studies shipped in public/studies/ (served at /studies/*).
 *
 * Every entry carries a `focus` from the shared vocabulary — retrieval filters
 * chunks on `tags @> { focus }`, so a study tagged only `topic` (as the two
 * communication papers were) can never be reached by a focus-targeted
 * scenario. `topic` is kept alongside for back-compat with anything that read
 * the old shape.
 */
const BUNDLED_STUDIES: Array<{ file: string; slug: string; tags: Record<string, unknown> }> = [
  { file: 'davies-2024-dog-owner-preferences-obesity.pdf', slug: 'study:davies-2024', tags: { focus: 'weight' } },
  { file: 'sutherland-2024-cat-owner-preferences-obesity.pdf', slug: 'study:sutherland-2024-cat', tags: { focus: 'weight' } },
  { file: 'sutherland-2024-client-obesity-communication.pdf', slug: 'study:sutherland-2024-client', tags: { focus: 'weight' } },
  {
    file: 'macmartin-2015-nutritional-history-question-design.pdf',
    slug: 'study:macmartin-2015',
    tags: { focus: 'communication', topic: 'communication' },
  },
  {
    file: 'macmartin-2023-client-resistance-conversation-analysis.pdf',
    slug: 'study:macmartin-2023',
    tags: { focus: 'communication', topic: 'communication' },
  },
];

interface Extracted {
  title: string;
  citation: string;
  markdown: string;
}

/** Gemini native PDF understanding → structured markdown + citation. */
async function extractPdf(pdfBase64: string): Promise<Extracted> {
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

/** Chunk + embed + store a document. Replaces any existing chunks. */
async function storeDoc(
  ctx: AdminCtx,
  args: {
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
  },
): Promise<number> {
  const { data: doc, error: docErr } = await ctx.sb
    .from('knowledge_documents')
    .upsert(
      {
        slug: args.slug,
        title: args.title,
        category: args.category,
        content: args.content,
        metadata: args.metadata ?? { citation: args.citation, tags: args.tags },
        source: args.source ?? 'admin',
        updated_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .maybeSingle();
  if (docErr || !doc) throw new Error(docErr?.message ?? 'doc upsert failed');

  const chunks = chunkMarkdown(args.content);
  const embeddings = await embedTexts(chunks, 'RETRIEVAL_DOCUMENT');

  // Replace chunks wholesale (idempotent re-ingest).
  await ctx.sb.from('knowledge_chunks').delete().eq('doc_id', doc.id);
  const { error: chunkErr } = await ctx.sb.from('knowledge_chunks').insert(
    chunks.map((content, i) => ({
      doc_id: doc.id,
      chunk_idx: i,
      content,
      token_estimate: estimateTokens(content),
      tags: { category: args.category, ...args.tags },
      citation: args.citation || null,
      embedding: `[${embeddings[i].join(',')}]`,
    })),
  );
  if (chunkErr) throw new Error(chunkErr.message);
  return chunks.length;
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'knowledge.write');
  if (ctx instanceof Response) return ctx;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  try {
    if (body.op === 'ingest') {
      const tags = (body.tags as Record<string, unknown>) ?? {};
      // A typo'd focus key would tag the document into a bucket no scenario
      // can ever select — reject rather than silently mis-file it.
      if (tags.focus != null && !isFocusAreaKey(tags.focus)) {
        return errorResponse(400, `Unknown focus area: ${String(tags.focus)}`);
      }
      const category = ['clinical', 'custom'].includes(String(body.category))
        ? String(body.category)
        : 'custom';
      let extracted: Extracted;
      if (typeof body.pdfBase64 === 'string' && body.pdfBase64) {
        if (body.pdfBase64.length * 0.75 > MAX_PDF_BYTES) {
          return errorResponse(400, 'PDF exceeds the 4MB limit');
        }
        extracted = await extractPdf(body.pdfBase64);
      } else if (typeof body.text === 'string' && body.text.trim()) {
        const title = String(body.title ?? '').trim();
        if (!title) return errorResponse(400, 'title required for text ingestion');
        extracted = { title, citation: title, markdown: body.text.trim() };
      } else {
        return errorResponse(400, 'pdfBase64 or text required');
      }
      const slug = `custom:${crypto.randomUUID()}`;
      const title = String(body.title ?? '').trim() || extracted.title;
      const chunkCount = await storeDoc(ctx, {
        slug,
        title,
        category,
        content: extracted.markdown,
        citation: extracted.citation,
        tags,
      });
      return jsonResponse({ ok: true, slug, chunks: chunkCount });
    }

    if (body.op === 're-embed') {
      const slug = String(body.slug ?? '');
      const { data: doc, error } = await ctx.sb
        .from('knowledge_documents')
        .select('id, slug, title, category, content, source, metadata')
        .eq('slug', slug)
        .maybeSingle();
      if (error || !doc) return errorResponse(404, 'Document not found');
      const rawMeta = (doc.metadata ?? {}) as Record<string, unknown>;
      const nested =
        rawMeta.tags && typeof rawMeta.tags === 'object'
          ? (rawMeta.tags as Record<string, unknown>)
          : null;
      // Code-seeded docs keep their tag bag flat on metadata (`{ driver: … }`);
      // ingested ones nest it under `tags`. Support both so re-indexing a
      // built-in doesn't strip the tags its chunks were filtered by.
      const flat = nested
        ? {}
        : Object.fromEntries(Object.entries(rawMeta).filter(([k]) => k !== 'citation'));
      const tags: Record<string, unknown> = { ...flat, ...(nested ?? {}) };
      // Legacy migration: the first bundled-study pass tagged the two
      // communication papers `{ topic: 'communication' }`, which retrieval's
      // focus filter can't see. Promote it on the way through.
      if (tags.focus == null && tags.topic === 'communication') tags.focus = 'communication';
      const citation = typeof rawMeta.citation === 'string' ? rawMeta.citation : '';
      const chunkCount = await storeDoc(ctx, {
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        citation,
        tags,
        // Re-indexing must not reclassify a built-in document as uploaded —
        // that would hand the UI a delete/edit affordance the seeder undoes.
        source: doc.source,
        metadata: { ...rawMeta, ...(citation ? { citation } : {}), tags },
      });
      return jsonResponse({ ok: true, chunks: chunkCount });
    }

    if (body.op === 'ingest-bundled') {
      let ingested = 0;
      const failures: string[] = [];
      for (const study of BUNDLED_STUDIES) {
        try {
          const url = new URL(`/studies/${study.file}`, req.url);
          const res = await fetch(url.toString());
          if (!res.ok) throw new Error(`fetch ${res.status}`);
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.byteLength > MAX_PDF_BYTES) throw new Error('over 4MB');
          const extracted = await extractPdf(buf.toString('base64'));
          await storeDoc(ctx, {
            slug: study.slug,
            title: extracted.title,
            category: 'clinical',
            content: extracted.markdown,
            citation: extracted.citation,
            tags: study.tags,
          });
          ingested++;
        } catch (err) {
          failures.push(`${study.file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return jsonResponse({ ok: true, ingested, failures });
    }

    return errorResponse(400, `Unknown op: ${String(body.op)}`);
  } catch (err) {
    return errorResponse(500, err instanceof Error ? err.message : 'Ingestion failed');
  }
};
