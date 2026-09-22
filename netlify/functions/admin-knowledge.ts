/**
 * Admin: RAG knowledge base (knowledge_documents).
 *
 *   GET  /admin-knowledge                 → { documents: [...] }  (live only)
 *   GET  /admin-knowledge?trash=1         → { documents: [...] }  (soft-deleted)
 *   POST /admin-knowledge { op: 'seed' }  → ingest the code knowledge modules
 *        (driver personas, pushback taxonomy, ACT guide, clinical reference,
 *        fecal charts) as 'code-seed' documents, upserted by slug — re-running
 *        refreshes them after a code change without duplicating.
 *        NOTE: the built-in corpus is now synced automatically on every
 *        deploy (`netlify/plugins/knowledge-sync` → `npm run knowledge:sync`),
 *        which hashes content and skips unchanged documents. This op stays as
 *        the JWT-only fallback and shares the same precedence rules
 *        (`_shared/knowledgeSeed.ts`), so both paths write identical rows.
 *   POST { op: 'update', slug, title?, category?, focus?, citation?,
 *          tools?: string[], species?: string[] }
 *        → edit a stored document's cataloguing WITHOUT re-embedding it.
 *          `title`/`category` are only editable on source='admin' documents
 *          (code-seeded ones are rebuilt by re-seeding); `focus`, `citation`
 *          and the knowledge scope (`tools` / `species`, see
 *          `src/shared/knowledge/knowledgeScopes.ts`) are editable on every
 *          document — filing built-in knowledge is the whole point.
 *   POST { op: 'delete', slug }    → SOFT delete (see below)
 *   POST { op: 'restore', slug }   → undo a soft delete
 *
 * Deleting is reversible on purpose. An ingested corpus is expensive (PDF
 * parse + embedding spend) and irreplaceable from the admin UI, so `delete`
 * stamps `deleted_at` instead of dropping the row: the document disappears
 * from the list and from retrieval (the `match_knowledge_chunks` RPC filters
 * `kd.deleted_at is null`) while its chunks + embeddings survive, which makes
 * restore free. The delete IS audited, so it can also be reverted from the
 * audit log.
 *
 * One thing a restore cannot undo by itself: deleting a document prunes its
 * slug out of every `scenario_overrides.knowledge_slugs` array, because a
 * scenario pointing at a hidden document would silently retrieve nothing. The
 * pruned scenario ids come back in the delete response (and in the audit note)
 * so the admin can re-attach deliberately.
 *
 * This is the SOW "ingestion of the current working knowledge base": one row
 * per document with structured metadata, ready to feed an embedder in Phase 3.
 */
import {
  can,
  errorResponse,
  jsonResponse,
  requireAdmin,
  writeAuditLog,
  type AdminCtx,
} from './_shared/admin';
import { isFocusAreaKey } from '../../src/shared/knowledge/focusAreas';
import {
  isKnowledgeSpeciesKey,
  isKnowledgeToolKey,
  normalizeKnowledgeSpecies,
  normalizeKnowledgeTools,
} from '../../src/shared/knowledge/knowledgeScopes';
import { embedTexts } from './_shared/gemini';
import { chunkMarkdown } from '../../src/services/ragShared';
import { estimateTokens } from '../../src/services/aiTelemetry';
import {
  applyFocus,
  applyScope,
  buildSeedCatalogue,
  buildSeedDocs,
  readFocus,
  readScopeList,
  type Bag,
  type SeedDoc,
} from './_shared/knowledgeSeed';
import { triggerKnowledgeSync } from './_shared/knowledgeTrigger';

const CATEGORIES = ['driver', 'pushback', 'act', 'clinical', 'custom'];

/**
 * Rebuild the built-in documents from code.
 *
 * Superseded in day-to-day use by `scripts/knowledge-sync.ts` (run
 * automatically on every deploy by the `netlify/plugins/knowledge-sync`
 * plugin), which adds content hashing so unchanged documents are not
 * re-embedded. This op is kept because it is the only seeding path that needs
 * nothing but an admin JWT, and the shared precedence rules
 * (`buildSeedCatalogue`) mean both paths write byte-identical rows.
 */
async function seed(ctx: AdminCtx): Promise<Response> {
  const docs = buildSeedDocs();

  // Re-seeding rebuilds these documents from code, but an admin's cataloguing
  // (focus area, citation, knowledge scope) is NOT in the code — carry it
  // across so a re-seed doesn't silently re-file everything. Soft-deleted
  // built-ins stay deleted: a re-seed refreshes CONTENT, it is not an
  // undelete, and silently resurrecting a document the admin removed would
  // put it back into retrieval behind their back.
  const { data: existing } = await ctx.sb
    .from('knowledge_documents')
    .select('slug, metadata, deleted_at')
    .eq('source', 'code-seed');
  const catalogue = buildSeedCatalogue(existing ?? []);
  const tagsFor = (d: SeedDoc): Bag => catalogue.tagsFor(d);
  const citationFor = (d: SeedDoc): string | null => catalogue.citationFor(d);

  const { error } = await ctx.sb.from('knowledge_documents').upsert(
    docs.map((d) => {
      const tags = tagsFor(d);
      const citation = citationFor(d);
      return {
        slug: d.slug,
        title: d.title,
        category: d.category,
        content: d.content,
        metadata: {
          ...d.metadata,
          tags,
          ...(citation ? { citation } : {}),
        },
        source: 'code-seed',
        deleted_at: catalogue.deletedAt(d.slug),
        updated_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      };
    }),
    { onConflict: 'slug' },
  );
  if (error) return errorResponse(500, error.message);

  // Chunk + embed each seeded doc (best-effort per doc so one embedding
  // failure doesn't fail the whole seed — docs without chunks simply don't
  // participate in retrieval until re-embedded).
  const failures: string[] = [];
  const skippedDeleted: string[] = [];
  for (const d of docs) {
    if (catalogue.isDeleted(d.slug)) {
      skippedDeleted.push(d.slug);
      continue;
    }
    try {
      const { data: row } = await ctx.sb
        .from('knowledge_documents')
        .select('id')
        .eq('slug', d.slug)
        .maybeSingle();
      if (!row) continue;
      const chunks = d.chunks ?? chunkMarkdown(d.content);
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
            ...tagsFor(d),
          },
          citation: citationFor(d),
          embedding: `[${embeddings[i].join(',')}]`,
        })),
      );
    } catch (err) {
      failures.push(`${d.slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return jsonResponse({
    ok: true,
    seeded: docs.length - skippedDeleted.length,
    skipped_deleted: skippedDeleted,
    failures,
  });
}

/** Cap on the document body copied into an audit row (Postgres jsonb payload). */
const MAX_AUDIT_CONTENT = 100_000;

/**
 * Drop a slug out of every scenario's explicit knowledge attachment list.
 *
 * A scenario that still points at a deleted document retrieves nothing (the
 * RPC filters it out) while the Builder keeps showing the link — the worst
 * kind of silent failure. Pruning is small-N: scenario_overrides is a handful
 * of rows, so we read the ones that HAVE attachments and rewrite the arrays
 * that mention the slug.
 */
async function pruneScenarioLinks(ctx: AdminCtx, slug: string): Promise<string[]> {
  const { data, error } = await ctx.sb
    .from('scenario_overrides')
    .select('scenario_id, knowledge_slugs')
    .not('knowledge_slugs', 'is', null);
  if (error) {
    console.error('[admin-knowledge] link prune read failed', error);
    return [];
  }
  const pruned: string[] = [];
  for (const row of data ?? []) {
    const slugs = row.knowledge_slugs;
    if (!Array.isArray(slugs) || !slugs.includes(slug)) continue;
    const next = slugs.filter((s: unknown) => s !== slug);
    const { error: writeErr } = await ctx.sb
      .from('scenario_overrides')
      .update({ knowledge_slugs: next, updated_by: ctx.user.id })
      .eq('scenario_id', row.scenario_id);
    if (writeErr) {
      console.error('[admin-knowledge] link prune write failed', writeErr);
      continue;
    }
    pruned.push(String(row.scenario_id));
  }
  return pruned;
}

/** Soft-delete a document: tombstone + audit + unlink from scenarios. */
async function softDelete(ctx: AdminCtx, slug: string): Promise<Response> {
  const { data: doc, error: readErr } = await ctx.sb
    .from('knowledge_documents')
    .select('id, slug, title, category, source, metadata, content, deleted_at')
    .eq('slug', slug)
    .maybeSingle();
  if (readErr) return errorResponse(500, readErr.message);
  if (!doc) return errorResponse(404, 'Document not found');
  if (doc.deleted_at) return errorResponse(400, 'Document is already in Recently deleted');

  const { error: writeErr } = await ctx.sb
    .from('knowledge_documents')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.user.id })
    .eq('id', doc.id);
  if (writeErr) return errorResponse(500, writeErr.message);

  const prunedScenarios = await pruneScenarioLinks(ctx, slug);

  const content = typeof doc.content === 'string' ? doc.content : '';
  const truncated = content.length > MAX_AUDIT_CONTENT;
  const before: Record<string, unknown> = {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    category: doc.category,
    source: doc.source,
    metadata: doc.metadata,
    ...(truncated ? {} : { content }),
  };

  const notes = [
    'Soft delete — the row and its chunks survive; retrieval skips it.',
    truncated
      ? `Document body omitted from this audit entry (${content.length} chars > ${MAX_AUDIT_CONTENT}); restoring keeps the stored text.`
      : null,
    prunedScenarios.length > 0
      ? `Unlinked from scenarios: ${prunedScenarios.join(', ')}.`
      : null,
  ].filter(Boolean);

  await writeAuditLog(ctx, {
    entity_type: 'knowledge_document',
    entity_id: slug,
    action: 'delete',
    before,
    note: notes.join(' '),
  });

  return jsonResponse({ ok: true, pruned_scenarios: prunedScenarios });
}

/** Undo a soft delete. Scenario links pruned at delete time do NOT come back. */
async function restore(ctx: AdminCtx, slug: string): Promise<Response> {
  const { data: doc, error: readErr } = await ctx.sb
    .from('knowledge_documents')
    .select('id, slug, title, category, source, deleted_at')
    .eq('slug', slug)
    .maybeSingle();
  if (readErr) return errorResponse(500, readErr.message);
  if (!doc || !doc.deleted_at) {
    return errorResponse(404, 'No deleted document with that slug');
  }

  const { error: writeErr } = await ctx.sb
    .from('knowledge_documents')
    .update({ deleted_at: null, updated_by: ctx.user.id })
    .eq('id', doc.id);
  if (writeErr) return errorResponse(500, writeErr.message);

  await writeAuditLog(ctx, {
    entity_type: 'knowledge_document',
    entity_id: slug,
    action: 'revert',
    before: { slug, deleted_at: doc.deleted_at },
    after: { slug, deleted_at: null },
    note:
      'Restored from Recently deleted. Scenario knowledge links pruned at delete time are NOT restored — re-attach the document to any scenario that needs it.',
  });

  return jsonResponse({ ok: true, slug });
}

/**
 * Edit a document's cataloguing (title / category / focus / citation / scope).
 *
 * Deliberately does NOT touch `content` or embeddings — this is the cheap
 * "file it correctly" path, distinct from re-ingesting. It DOES rewrite the
 * document's chunk tags, because retrieval filters on chunk tags: a focus or
 * scope change that stopped at the document row would be invisible at query
 * time, which is the most expensive kind of wrong here (an admin would see
 * "Fecal Scan only" in the UI while roleplay kept quoting the document).
 */
async function update(ctx: AdminCtx, body: Record<string, unknown>): Promise<Response> {
  const slug = String(body.slug ?? '').trim();
  if (!slug) return errorResponse(400, 'slug required');

  const hasFocus = Object.prototype.hasOwnProperty.call(body, 'focus');
  const focusInput = body.focus == null ? null : String(body.focus).trim() || null;
  if (hasFocus && focusInput !== null && !isFocusAreaKey(focusInput)) {
    return errorResponse(400, `Unknown focus area: ${focusInput}`);
  }

  // Scope. Unlike focus, "none" is not a meaningful answer: a document with an
  // empty tools list can never be retrieved by anything, which is a delete
  // wearing a disguise. Absent → leave whatever is stored untouched.
  const scopeOrError = (
    key: 'tools' | 'species',
    label: string,
    isKey: (v: unknown) => boolean,
    normalize: (v: unknown, fallback?: readonly string[]) => string[],
  ): string[] | null | Response => {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return null;
    const raw = body[key];
    if (!Array.isArray(raw)) return errorResponse(400, `${label} must be a list`);
    const unknown = raw.find((v) => !isKey(v));
    if (unknown !== undefined) {
      return errorResponse(400, `Unknown ${label.toLowerCase()}: ${String(unknown)}`);
    }
    if (raw.length === 0) {
      return errorResponse(400, `${label}: choose at least one, or delete the document instead.`);
    }
    return normalize(raw);
  };

  const nextTools = scopeOrError('tools', 'Tool', isKnowledgeToolKey, normalizeKnowledgeTools);
  if (nextTools instanceof Response) return nextTools;
  const nextSpecies = scopeOrError(
    'species',
    'Species',
    isKnowledgeSpeciesKey,
    normalizeKnowledgeSpecies,
  );
  if (nextSpecies instanceof Response) return nextSpecies;

  const { data: doc, error: readErr } = await ctx.sb
    .from('knowledge_documents')
    .select('id, slug, title, category, source, metadata, deleted_at')
    .eq('slug', slug)
    .maybeSingle();
  if (readErr) return errorResponse(500, readErr.message);
  if (!doc) return errorResponse(404, 'Document not found');
  if (doc.deleted_at) {
    return errorResponse(400, 'Document is in Recently deleted — restore it first');
  }

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
      'Built-in documents are rebuilt from code on every deploy — change their title or type in the source, not here. Focus area, citation and scope can still be edited.',
    );
  }

  const meta: Bag = doc.metadata && typeof doc.metadata === 'object' ? { ...(doc.metadata as Bag) } : {};
  const nextFocus = hasFocus ? focusInput : readFocus(meta.tags);
  meta.tags = applyScope(applyFocus(meta.tags, nextFocus), nextTools, nextSpecies);

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

  // Batched with bounded concurrency — a large PDF can hold hundreds of
  // chunks, and one awaited round-trip per row would run past the function
  // timeout, leaving retrieval tags half-updated.
  let chunksUpdated = 0;
  const chunkFailures: string[] = [];
  const rows = chunkRows ?? [];
  const BATCH = 25;
  for (let i = 0; i < rows.length; i += BATCH) {
    const results = await Promise.all(
      rows.slice(i, i + BATCH).map(async (row) => {
        const tags = applyScope(applyFocus(row.tags, nextFocus), nextTools, nextSpecies);
        tags.category = nextCategory;
        const rowPatch: Record<string, unknown> = { tags };
        if (hasCitation) rowPatch.citation = citation;
        const { error } = await ctx.sb.from('knowledge_chunks').update(rowPatch).eq('id', row.id);
        return error?.message ?? null;
      }),
    );
    for (const err of results) {
      if (err) chunkFailures.push(err);
      else chunksUpdated++;
    }
  }

  return jsonResponse({
    ok: true,
    slug,
    focus: nextFocus,
    citation,
    tools: nextTools ?? readScopeList(meta.tags, 'tools', (v) => normalizeKnowledgeTools(v)),
    species:
      nextSpecies ?? readScopeList(meta.tags, 'species', (v) => normalizeKnowledgeSpecies(v)),
    chunks_updated: chunksUpdated,
    chunk_failures: chunkFailures,
  });
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'knowledge.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    // Opening the Knowledge screen nudges the background sync — so an admin
    // who wonders "why is the corpus empty?" has already fixed it by looking.
    // Fire-and-forget, once per instance; it cannot affect this response.
    triggerKnowledgeSync(req);

    // ?trash=1 — the "Recently deleted" drawer. Slim payload: enough to
    // recognise a document and restore it, without shipping every body.
    if (new URL(req.url).searchParams.get('trash')) {
      const { data, error } = await ctx.sb
        .from('knowledge_documents')
        .select('slug, title, category, deleted_at')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
        .limit(50);
      if (error) return errorResponse(500, error.message);
      return jsonResponse({ documents: data ?? [] });
    }

    const { data, error } = await ctx.sb
      .from('knowledge_documents')
      .select('id, slug, title, category, source, metadata, content, updated_at, created_at')
      .is('deleted_at', null)
      .order('category')
      .order('slug');
    if (error) return errorResponse(500, error.message);
    // Chunk counts per doc (corpus size at a glance in the Knowledge screen).
    // Counted in the database: reading every chunk row's doc_id and tallying
    // here silently capped at PostgREST's 1000-row default, under-reporting
    // any corpus larger than that.
    const { data: countRows, error: countErr } = await ctx.sb
      .from('knowledge_chunk_counts')
      .select('doc_id, chunks');
    if (countErr) {
      return errorResponse(
        500,
        `Chunk counts unavailable: ${countErr.message} (is 20260816000000_knowledge_safety.sql applied?)`,
      );
    }
    const counts = new Map<string, number>();
    for (const r of countRows ?? []) counts.set(String(r.doc_id), Number(r.chunks) || 0);
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
    const slug = String(body.slug ?? '').trim();
    if (!slug) return errorResponse(400, 'slug required');
    return softDelete(ctx, slug);
  }

  if (body.op === 'restore') {
    const slug = String(body.slug ?? '').trim();
    if (!slug) return errorResponse(400, 'slug required');
    return restore(ctx, slug);
  }

  return errorResponse(400, `Unknown op: ${String(body.op)}`);
};
