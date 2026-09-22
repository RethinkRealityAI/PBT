/**
 * Admin: ingest documents into the RAG knowledge base (POST only).
 *
 *   { op: 'ingest', pdfBase64?, text?, title?, category?,
 *     tags? — { focus?, tools?: string[], species?: string[] } }
 *       PDF → Gemini native PDF understanding extracts structured markdown +
 *       citation metadata; text is used as-is. Content is chunked
 *       (~800-token paragraphs), embedded (gemini-embedding-001, 768d,
 *       normalised) and stored as knowledge_documents + knowledge_chunks.
 *   { op: 're-embed', slug }        — re-chunk + re-embed a stored document.
 *   { op: 'ingest-bundled' }        — ingest the study PDFs shipped in
 *       public/studies/ (fetched from this deploy's own origin). Idempotent:
 *       upserts by slug.
 *       NOTE: the bundled studies are now part of the automatic deploy sync
 *       (`netlify/plugins/knowledge-sync` → `npm run knowledge:sync`), which
 *       reads the PDFs from disk and skips unchanged ones by source hash.
 *       This op stays as the JWT-only fallback; both share `extractPdf` +
 *       `storeKnowledgeDoc` from `_shared/knowledgeIngest.ts`.
 *
 * PDF cap: 4MB raw (Netlify body limit ~6MB; base64 inflates ~33%).
 */
import { errorResponse, jsonResponse, requireAdmin, type AdminCtx } from './_shared/admin';
import { isFocusAreaKey } from '../../src/shared/knowledge/focusAreas';
import {
  BUNDLED_STUDIES,
  MAX_PDF_BYTES,
  extractPdf,
  storeKnowledgeDoc,
  withKnowledgeScope,
  type Extracted,
  type StoreDocArgs,
} from './_shared/knowledgeIngest';

/**
 * Chunk + embed + store a document, as this admin.
 *
 * Thin wrapper over the shared implementation — the sync script
 * (`scripts/knowledge-sync.ts`) calls the same function with a service-role
 * client and a null actor.
 */
function storeDoc(ctx: AdminCtx, args: StoreDocArgs): Promise<number> {
  return storeKnowledgeDoc(ctx.sb, ctx.user.id, args);
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
      const raw = (body.tags as Record<string, unknown>) ?? {};
      // A typo'd focus key would tag the document into a bucket no scenario
      // can ever select — reject rather than silently mis-file it.
      if (raw.focus != null && !isFocusAreaKey(raw.focus)) {
        return errorResponse(400, `Unknown focus area: ${String(raw.focus)}`);
      }
      // The scope is normalised, not rejected: an unknown tool key WIDENS
      // nothing (it is simply dropped) and an empty list means "the admin
      // didn't choose", which is what the defaults are for.
      const tags = withKnowledgeScope(raw);
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
