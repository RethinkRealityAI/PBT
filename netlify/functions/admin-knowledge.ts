/**
 * Admin: RAG knowledge base (knowledge_documents).
 *
 *   GET  /admin-knowledge                 → { documents: [...] }
 *   POST /admin-knowledge { op: 'seed' }  → ingest the code knowledge modules
 *        (driver personas, pushback taxonomy, ACT guide, clinical reference)
 *        as 'code-seed' documents, upserted by slug — re-running refreshes
 *        them after a code change without duplicating.
 *   POST { op: 'update', slug, title?, category?, focus?, citation? }
 *        → edit a stored document's cataloguing WITHOUT re-embedding it.
 *          `title`/`category` are only editable on source='admin' documents
 *          (code-seeded ones are rebuilt by re-seeding); `focus`/`citation`
 *          are editable on every document — tagging built-in knowledge is the
 *          whole point of the focus vocabulary.
 *   POST { op: 'delete', slug }
 *
 * This is the SOW "ingestion of the current working knowledge base": one row
 * per document with structured metadata, ready to feed an embedder in Phase 3.
 */
import { can, errorResponse, jsonResponse, requireAdmin, type AdminCtx } from './_shared/admin';
import { isFocusAreaKey } from '../../src/shared/knowledge/focusAreas';
import { embedTexts } from './_shared/gemini';
import { chunkMarkdown } from '../../src/services/ragShared';
import { estimateTokens } from '../../src/services/aiTelemetry';
import { DRIVER_KNOWLEDGE } from '../../src/data/knowledge/driverProfiles';
import { PUSHBACK_KNOWLEDGE } from '../../src/data/knowledge/pushbackTaxonomy';
import { ACT_STEPS } from '../../src/data/knowledge/actGuide';
import {
  BCS_BLURB,
  CALORIE_FORMULA_BLURB,
  MCS_BLURB,
  NON_SHAMING_FRAMING,
  PRODUCT_ANCHORS,
} from '../../src/data/knowledge/clinicalReference';

const CATEGORIES = ['driver', 'pushback', 'act', 'clinical', 'custom'];

type Bag = Record<string, unknown>;

/**
 * Read the focus area out of a document/chunk tag bag.
 *
 * Legacy fallback: the first bundled-study pass tagged the two communication
 * papers `{ topic: 'communication' }`, which predates `communication` becoming
 * a real focus area. Treat it as a focus so those documents aren't invisible
 * to focus-filtered retrieval before they're re-ingested.
 */
function readFocus(tags: unknown): string | null {
  if (!tags || typeof tags !== 'object') return null;
  const bag = tags as Bag;
  if (typeof bag.focus === 'string' && bag.focus) return bag.focus;
  return bag.topic === 'communication' ? 'communication' : null;
}

/** Set (or clear) the focus key on a tag bag, dropping the legacy `topic` key. */
function applyFocus(tags: unknown, focus: string | null): Bag {
  const next: Bag = tags && typeof tags === 'object' ? { ...(tags as Bag) } : {};
  if (focus) next.focus = focus;
  else delete next.focus;
  if (next.topic === 'communication') delete next.topic;
  return next;
}

interface SeedDoc {
  slug: string;
  title: string;
  category: 'driver' | 'pushback' | 'act' | 'clinical';
  content: string;
  metadata: Record<string, unknown>;
}

/** Serialise the code knowledge modules into embedder-ready documents. */
function buildSeedDocs(): SeedDoc[] {
  const docs: SeedDoc[] = [];

  for (const [key, d] of Object.entries(DRIVER_KNOWLEDGE)) {
    docs.push({
      slug: `driver:${key}`,
      title: `ECHO driver — ${key}`,
      category: 'driver',
      content: [
        `# ${key}`,
        `Motivation: ${d.motivation}`,
        `Communication style:\n${d.communicationStyle.map((s) => `- ${s}`).join('\n')}`,
        `Strengths:\n${d.strengths.map((s) => `- ${s}`).join('\n')}`,
        `Under stress: ${d.stressSignature}`,
        `Recognition cues:\n${d.recognitionCues.map((s) => `- ${s}`).join('\n')}`,
        `Flexing tips:\n${d.flexingTips.map((s) => `- ${s}`).join('\n')}`,
        `Sample customer phrasings:\n${d.customerSamplePhrasings.map((s) => `- ${s}`).join('\n')}`,
      ].join('\n\n'),
      metadata: { driver: key },
    });
  }

  for (const [id, p] of Object.entries(PUSHBACK_KNOWLEDGE)) {
    docs.push({
      slug: `pushback:${id}`,
      title: `Pushback — ${p.title}`,
      category: 'pushback',
      content: [
        `# ${p.title}`,
        `Examples:\n${p.examples.map((s) => `- ${s}`).join('\n')}`,
        `Root concerns:\n${p.rootConcerns.map((s) => `- ${s}`).join('\n')}`,
        `Acknowledge patterns:\n${p.acknowledgePatterns.map((s) => `- ${s}`).join('\n')}`,
        `Clarify questions:\n${p.clarifyQuestions.map((s) => `- ${s}`).join('\n')}`,
        `Take-action patterns:\n${p.takeActionPatterns.map((s) => `- ${s}`).join('\n')}`,
        `Watch-outs:\n${p.watchOuts.map((s) => `- ${s}`).join('\n')}`,
      ].join('\n\n'),
      metadata: { pushback_id: id },
    });
  }

  for (const step of ACT_STEPS) {
    docs.push({
      slug: `act:${step.key}`,
      title: `ACT method — ${step.label}`,
      category: 'act',
      content: [
        `# ${step.label}`,
        `Goal: ${step.goal}`,
        `Techniques:\n${step.techniques.map((s) => `- ${s}`).join('\n')}`,
        `Do:\n${step.doExamples.map((s) => `- ${s}`).join('\n')}`,
        `Don't:\n${step.dontExamples.map((s) => `- ${s}`).join('\n')}`,
      ].join('\n\n'),
      metadata: { act_step: step.key },
    });
  }

  docs.push({
    slug: 'clinical:reference',
    title: 'Clinical reference — BCS / MCS / calories / product anchors',
    category: 'clinical',
    content: [
      `BCS: ${BCS_BLURB}`,
      `MCS: ${MCS_BLURB}`,
      `Calories: ${CALORIE_FORMULA_BLURB}`,
      `Framing: ${NON_SHAMING_FRAMING}`,
      `Product anchors: ${PRODUCT_ANCHORS.satietySupport.name} — ${PRODUCT_ANCHORS.satietySupport.keyClaims.join('; ')}`,
    ].join('\n\n'),
    metadata: { anchors: Object.keys(PRODUCT_ANCHORS) },
  });

  return docs;
}

async function seed(ctx: AdminCtx): Promise<Response> {
  const docs = buildSeedDocs();

  // Re-seeding rebuilds these documents from code, but an admin's cataloguing
  // (focus area) is NOT in the code — carry it across so "Load built-in
  // knowledge" doesn't silently untag everything they filed.
  const keptFocus = new Map<string, string>();
  const { data: existing } = await ctx.sb
    .from('knowledge_documents')
    .select('slug, metadata')
    .eq('source', 'code-seed');
  for (const row of existing ?? []) {
    const meta = (row.metadata ?? {}) as Bag;
    const focus = readFocus(meta.tags);
    if (focus) keptFocus.set(row.slug, focus);
  }

  const { error } = await ctx.sb.from('knowledge_documents').upsert(
    docs.map((d) => ({
      slug: d.slug,
      title: d.title,
      category: d.category,
      content: d.content,
      metadata: keptFocus.has(d.slug)
        ? { ...d.metadata, tags: { focus: keptFocus.get(d.slug) } }
        : d.metadata,
      source: 'code-seed',
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'slug' },
  );
  if (error) return errorResponse(500, error.message);

  // Chunk + embed each seeded doc (best-effort per doc so one embedding
  // failure doesn't fail the whole seed — docs without chunks simply don't
  // participate in retrieval until re-embedded).
  const failures: string[] = [];
  for (const d of docs) {
    try {
      const { data: row } = await ctx.sb
        .from('knowledge_documents')
        .select('id')
        .eq('slug', d.slug)
        .maybeSingle();
      if (!row) continue;
      const chunks = chunkMarkdown(d.content);
      const embeddings = await embedTexts(chunks, 'RETRIEVAL_DOCUMENT');
      await ctx.sb.from('knowledge_chunks').delete().eq('doc_id', row.id);
      await ctx.sb.from('knowledge_chunks').insert(
        chunks.map((content, i) => ({
          doc_id: row.id,
          chunk_idx: i,
          content,
          token_estimate: estimateTokens(content),
          tags: {
            category: d.category,
            ...d.metadata,
            ...(keptFocus.has(d.slug) ? { focus: keptFocus.get(d.slug) } : {}),
          },
          citation: null,
          embedding: `[${embeddings[i].join(',')}]`,
        })),
      );
    } catch (err) {
      failures.push(`${d.slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return jsonResponse({ ok: true, seeded: docs.length, failures });
}

/**
 * Edit a document's cataloguing (title / category / focus area / citation).
 *
 * Deliberately does NOT touch `content` or embeddings — this is the cheap
 * "file it correctly" path, distinct from re-ingesting. It DOES rewrite the
 * document's chunk tags, because retrieval filters on chunk tags: a focus
 * change that stopped at the document row would be invisible at query time.
 */
async function update(ctx: AdminCtx, body: Record<string, unknown>): Promise<Response> {
  const slug = String(body.slug ?? '').trim();
  if (!slug) return errorResponse(400, 'slug required');

  const hasFocus = Object.prototype.hasOwnProperty.call(body, 'focus');
  const focusInput = body.focus == null ? null : String(body.focus).trim() || null;
  if (hasFocus && focusInput !== null && !isFocusAreaKey(focusInput)) {
    return errorResponse(400, `Unknown focus area: ${focusInput}`);
  }

  const { data: doc, error: readErr } = await ctx.sb
    .from('knowledge_documents')
    .select('id, slug, title, category, source, metadata')
    .eq('slug', slug)
    .maybeSingle();
  if (readErr) return errorResponse(500, readErr.message);
  if (!doc) return errorResponse(404, 'Document not found');

  const title = typeof body.title === 'string' ? body.title.trim() : null;
  const category = typeof body.category === 'string' ? body.category.trim() : null;
  if (title !== null && !title) return errorResponse(400, 'title cannot be empty');
  if (category !== null && !CATEGORIES.includes(category)) {
    return errorResponse(400, 'invalid category');
  }
  // Built-in documents are regenerated from code on every seed, so editing
  // their title/type here would silently revert. Focus + citation survive a
  // re-seed only in the chunk tags we write below… so we allow those, and
  // block the two fields the seeder owns.
  const retitles = (title !== null && title !== doc.title) || (category !== null && category !== doc.category);
  if (retitles && doc.source !== 'admin') {
    return errorResponse(
      400,
      'Built-in documents are rebuilt from code — re-run “Load built-in knowledge” to change their title or type. Focus area and citation can still be edited.',
    );
  }

  const meta: Bag = doc.metadata && typeof doc.metadata === 'object' ? { ...(doc.metadata as Bag) } : {};
  const nextFocus = hasFocus ? focusInput : readFocus(meta.tags);
  meta.tags = applyFocus(meta.tags, nextFocus);

  const hasCitation = Object.prototype.hasOwnProperty.call(body, 'citation');
  let citation: string | null = typeof meta.citation === 'string' ? meta.citation : null;
  if (hasCitation) {
    citation = body.citation == null ? null : String(body.citation).trim() || null;
    if (citation) meta.citation = citation;
    else delete meta.citation;
  }

  const patch: Record<string, unknown> = {
    metadata: meta,
    updated_by: ctx.user.id,
    updated_at: new Date().toISOString(),
  };
  if (title !== null) patch.title = title;
  if (category !== null) patch.category = category;

  const { error: writeErr } = await ctx.sb
    .from('knowledge_documents')
    .update(patch)
    .eq('id', doc.id);
  if (writeErr) return errorResponse(500, writeErr.message);

  // Sync the chunk tag bags (focus + category + citation) without going
  // anywhere near `embedding` — re-embedding is a separate, expensive op.
  const nextCategory = category ?? doc.category;
  const { data: chunkRows, error: chunkErr } = await ctx.sb
    .from('knowledge_chunks')
    .select('id, tags')
    .eq('doc_id', doc.id);
  if (chunkErr) return errorResponse(500, chunkErr.message);

  let chunksUpdated = 0;
  const chunkFailures: string[] = [];
  for (const row of chunkRows ?? []) {
    const tags = applyFocus(row.tags, nextFocus);
    tags.category = nextCategory;
    const rowPatch: Record<string, unknown> = { tags };
    if (hasCitation) rowPatch.citation = citation;
    const { error } = await ctx.sb.from('knowledge_chunks').update(rowPatch).eq('id', row.id);
    if (error) chunkFailures.push(error.message);
    else chunksUpdated++;
  }

  return jsonResponse({
    ok: true,
    slug,
    focus: nextFocus,
    citation,
    chunks_updated: chunksUpdated,
    chunk_failures: chunkFailures,
  });
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'knowledge.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const { data, error } = await ctx.sb
      .from('knowledge_documents')
      .select('id, slug, title, category, source, metadata, content, updated_at, created_at')
      .order('category')
      .order('slug');
    if (error) return errorResponse(500, error.message);
    // Chunk counts per doc (corpus size at a glance in the Knowledge screen).
    const counts = new Map<string, number>();
    const { data: chunkRows } = await ctx.sb.from('knowledge_chunks').select('doc_id');
    for (const r of chunkRows ?? []) {
      counts.set(r.doc_id, (counts.get(r.doc_id) ?? 0) + 1);
    }
    const documents = (data ?? []).map((d) => ({
      ...d,
      chunk_count: counts.get(d.id) ?? 0,
    }));
    return jsonResponse({ documents });
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');
  if (!can(ctx, 'knowledge.write')) return errorResponse(403, 'Missing permission: knowledge.write');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  if (body.op === 'seed') return seed(ctx);

  if (body.op === 'update') return update(ctx, body);

  if (body.op === 'delete') {
    const slug = String(body.slug ?? '');
    if (!slug) return errorResponse(400, 'slug required');
    const { error } = await ctx.sb.from('knowledge_documents').delete().eq('slug', slug);
    if (error) return errorResponse(500, error.message);
    return jsonResponse({ ok: true });
  }

  return errorResponse(400, `Unknown op: ${String(body.op)}`);
};
