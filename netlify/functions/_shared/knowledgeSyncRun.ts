/**
 * The knowledge sync ENGINE — transport-free, so every trigger runs the same
 * code:
 *
 *   • `scripts/knowledge-sync.ts`              — `npm run knowledge:sync`,
 *                                                 PDFs read from disk
 *   • `netlify/functions/knowledge-sync-background.ts`
 *                                               — self-seeding inside the
 *                                                 deploy, PDFs read over HTTP
 *                                                 from the deploy's own origin
 *
 * Everything that differs between them is an argument: where the study PDFs
 * come from (`readStudy`), which Supabase client to use, whether to write or
 * to collect SQL. What must NOT differ — the document set, the admin-edit
 * precedence, the hashing, the chunk tag bags — lives here once.
 *
 * Why PDFs are injected rather than fetched here: a Netlify function has no
 * `public/` on disk (only the bundled function), and a local script has no
 * origin to fetch from. Both produce the same bytes, and therefore the same
 * `sourceHash`, so a study extracted by the script is recognised as unchanged
 * by the function and vice versa.
 *
 * ── One writer at a time ───────────────────────────────────────────────────
 * Every run that WRITES (not a dry run, not `--emit-sql`) first takes the
 * single-row database lease `knowledge_sync_try_lease` (migration
 * 20260923000000_knowledge_sync_lease.sql, 15-minute TTL) and releases it in
 * `finally`. A run that cannot take it exits with `skipped: 'lease-held'`
 * and writes nothing. Without it, the cold `flags-resolve` instances of a new
 * deploy would each start a full sync — multiplied Gemini spend, and one
 * run's chunk delete-then-insert interleaving with another's. The rows are
 * (re-)read AFTER the lease is held, so the plan reflects whatever a previous
 * holder just wrote. If the lease function is missing (migration not applied)
 * the run fails closed with an error naming the migration.
 */
import { randomUUID } from 'node:crypto';
import {
  buildSeedCatalogue,
  buildSeedDocs,
  isFecalSeedSlug,
  type SeedCatalogue,
} from './knowledgeSeed';
import {
  BUNDLED_STUDIES,
  MAX_PDF_BYTES,
  extractPdf,
  writeKnowledgeDoc,
  type KnowledgeDb,
  type PreparedChunkRow,
} from './knowledgeIngest';
import {
  CODE_SEED,
  canSkipExtraction,
  planKnowledgeSync,
  readSyncMeta,
  sha256Hex,
  summarizeSync,
  withSyncMeta,
  type ExistingKnowledgeRow,
  type KnowledgeSyncPlan,
} from './knowledgeSync';
import type { SqlChunkRow, SqlDocument } from './knowledgeSql';
import { embedTexts } from './gemini';
import { chunkMarkdown } from '../../../src/services/ragShared';
import { estimateTokens } from '../../../src/shared/ai/telemetryHeuristics';

export type KnowledgeGroup = 'fecal' | 'builtin' | 'studies';
export const KNOWLEDGE_GROUPS: KnowledgeGroup[] = ['fecal', 'builtin', 'studies'];

export interface ResolvedDoc {
  slug: string;
  group: KnowledgeGroup;
  title: string;
  category: string;
  /**
   * The body this sync would write, or null when it was NOT resolved — a
   * study PDF whose bytes are unchanged is never extracted, and a dry run
   * never extracts at all. A null body is only ever legal for a document the
   * plan skips or leaves deleted.
   */
  content: string | null;
  contentHash: string;
  sourceHash?: string;
  /** Document-level metadata other than `tags` / `citation` / `sync`. */
  baseMetadata: Record<string, unknown>;
  tagDefaults: Record<string, unknown>;
  citationDefault?: string;
  /** Explicit embedding units (the fecal charts), else `chunkMarkdown`. */
  chunks?: string[];
}

export type SyncAction = 'created' | 'updated' | 'unchanged' | 'left deleted' | 'retired';

/** Lease lifetime — a background function's 15-minute ceiling. */
export const SYNC_LEASE_TTL_SECONDS = 15 * 60;

export interface SyncLine {
  slug: string;
  action: SyncAction;
  chunks: number | null;
}

export interface RunKnowledgeSyncOptions {
  /** Service-role Supabase client (reads always; writes unless collecting). */
  sb: KnowledgeDb;
  /** Bytes of a bundled study PDF, by file name under public/studies/. */
  readStudy: (file: string) => Promise<Uint8Array>;
  /** Defaults to every group. */
  groups?: readonly KnowledgeGroup[];
  /** Rows already read (saves a round-trip); otherwise read from `sb`. */
  existingRows?: ExistingKnowledgeRow[];
  /** Plan only: no PDF extraction, no embeddings, no writes. */
  dryRun?: boolean;
  /** Embed, but return `sqlDocs` instead of writing rows. */
  collectSql?: boolean;
  log?: (line: string) => void;
}

export interface RunKnowledgeSyncResult {
  plan: KnowledgeSyncPlan<ResolvedDoc>;
  lines: SyncLine[];
  /** "knowledge sync: N created, N updated, N unchanged, N left deleted" */
  summary: string;
  /** Populated only when `collectSql` is set. */
  sqlDocs: SqlDocument[];
  /** Populated only when `collectSql` is set: code-seed slugs to soft-delete. */
  retiredSlugs: string[];
  existingRows: ExistingKnowledgeRow[];
  /** Set when the run did nothing because another sync holds the lease. */
  skipped?: 'lease-held';
}

/** The group a stored slug belongs to — decides whether a partial run owns it. */
export function groupOfSlug(slug: string): KnowledgeGroup {
  if (isFecalSeedSlug(slug)) return 'fecal';
  if (slug.startsWith('study:') || BUNDLED_STUDIES.some((s) => s.slug === slug)) return 'studies';
  return 'builtin';
}

async function tryAcquireLease(sb: KnowledgeDb, holder: string): Promise<boolean> {
  if (typeof sb.rpc !== 'function') {
    throw new Error('Knowledge sync lease unavailable: this client cannot call rpc');
  }
  const { data, error } = await sb.rpc('knowledge_sync_try_lease', {
    p_holder: holder,
    p_ttl_seconds: SYNC_LEASE_TTL_SECONDS,
  });
  if (error) {
    throw new Error(
      `knowledge_sync_try_lease failed — ${error.message} ` +
        '(is 20260923000000_knowledge_sync_lease.sql applied?)',
    );
  }
  return data === true;
}

async function releaseLease(sb: KnowledgeDb, holder: string): Promise<void> {
  try {
    const res = await sb.rpc?.('knowledge_sync_release_lease', { p_holder: holder });
    if (res?.error) console.warn('[knowledge-sync] lease release failed', res.error.message);
  } catch (err) {
    // The TTL frees it anyway.
    console.warn('[knowledge-sync] lease release threw', err instanceof Error ? err.message : err);
  }
}

/**
 * Read every knowledge document plus its chunk count.
 *
 * Not filtered by `source`: a slug the sync owns may currently be stored as
 * an uploaded ('admin') document — the first bundled-study ingest wrote the
 * five studies that way — and it still has to be recognised rather than
 * duplicated.
 */
export async function readExistingRows(sb: KnowledgeDb): Promise<ExistingKnowledgeRow[]> {
  const { data, error } = await sb
    .from('knowledge_documents')
    .select('id, slug, metadata, deleted_at, source');
  if (error) throw new Error(`Reading knowledge_documents failed — ${error.message}`);
  const docs = (data ?? []) as Array<{
    id: string;
    slug: string;
    metadata: unknown;
    deleted_at: string | null;
    source: string | null;
  }>;

  const { data: countRows, error: countErr } = await sb
    .from('knowledge_chunk_counts')
    .select('doc_id, chunks');
  if (countErr) {
    throw new Error(
      `Chunk counts unavailable: ${countErr.message} ` +
        '(is 20260816000000_knowledge_safety.sql applied?)',
    );
  }
  const counts = new Map<string, number>();
  for (const r of (countRows ?? []) as Array<{ doc_id: string; chunks: number }>) {
    counts.set(String(r.doc_id), Number(r.chunks) || 0);
  }

  return docs.map((r) => ({
    slug: r.slug,
    metadata: r.metadata,
    deleted_at: r.deleted_at,
    source: r.source,
    chunk_count: counts.get(String(r.id)) ?? 0,
  }));
}

/**
 * The most recent `metadata.sync.syncedAt` across built-in documents — the
 * clock the background function's cooldown reads. Null when nothing has ever
 * been synced (the case that must NOT be rate-limited away).
 */
export function newestSyncedAt(rows: readonly ExistingKnowledgeRow[]): string | null {
  let newest: string | null = null;
  for (const row of rows) {
    if (row.source && row.source !== 'code-seed') continue;
    const sync = readSyncMeta(row.metadata);
    if (!sync?.syncedAt) continue;
    if (newest === null || sync.syncedAt > newest) newest = sync.syncedAt;
  }
  return newest;
}

/** The code-seed documents: driver / pushback / act / clinical + fecal charts. */
function seedDocsFor(groups: ReadonlySet<KnowledgeGroup>): ResolvedDoc[] {
  return buildSeedDocs()
    .map((d): ResolvedDoc => ({
      slug: d.slug,
      group: isFecalSeedSlug(d.slug) ? 'fecal' : 'builtin',
      title: d.title,
      category: d.category,
      content: d.content,
      contentHash: sha256Hex(d.content),
      baseMetadata: d.metadata,
      tagDefaults: d.tags ?? {},
      citationDefault: d.citation,
      chunks: d.chunks,
    }))
    .filter((d) => groups.has(d.group));
}

/**
 * The bundled study PDFs. Only sent to Gemini when their bytes changed — the
 * `sourceHash` is what keeps a per-deploy sync from re-extracting five papers
 * every time.
 */
async function studyDocs(
  rows: Map<string, ExistingKnowledgeRow>,
  readStudy: (file: string) => Promise<Uint8Array>,
  dryRun: boolean,
  log: (line: string) => void,
): Promise<ResolvedDoc[]> {
  const docs: ResolvedDoc[] = [];
  for (const study of BUNDLED_STUDIES) {
    const bytes = await readStudy(study.file);
    if (bytes.byteLength > MAX_PDF_BYTES) {
      throw new Error(`${study.file}: ${bytes.byteLength} bytes exceeds the 4MB extraction cap`);
    }
    const sourceHash = sha256Hex(bytes);
    const row = rows.get(study.slug);

    if (canSkipExtraction(row, sourceHash)) {
      // Unchanged PDF: carry the stored fingerprint forward so the planner
      // sees a match, and leave the body unresolved — nothing gets written.
      const sync = readSyncMeta(row!.metadata)!;
      docs.push({
        slug: study.slug,
        group: 'studies',
        title: '',
        category: 'clinical',
        content: null,
        contentHash: sync.contentHash,
        sourceHash,
        baseMetadata: {},
        tagDefaults: study.tags,
      });
      continue;
    }

    if (dryRun) {
      // A dry run must cost nothing: a changed PDF needs re-extraction, and
      // that answer does not require actually extracting it. The sentinel
      // hash can never match a stored one, so the planner reports "update".
      docs.push({
        slug: study.slug,
        group: 'studies',
        title: '',
        category: 'clinical',
        content: null,
        contentHash: `pending:${sourceHash}`,
        sourceHash,
        baseMetadata: {},
        tagDefaults: study.tags,
      });
      continue;
    }

    log(`  extracting ${study.file} (${(bytes.byteLength / 1024).toFixed(0)} KB)…`);
    const extracted = await extractPdf(Buffer.from(bytes).toString('base64'));
    docs.push({
      slug: study.slug,
      group: 'studies',
      title: extracted.title,
      category: 'clinical',
      content: extracted.markdown,
      contentHash: sha256Hex(extracted.markdown),
      sourceHash,
      baseMetadata: {},
      tagDefaults: study.tags,
      citationDefault: extracted.citation,
    });
  }
  return docs;
}

/** The final metadata a document row carries. */
function metadataFor(doc: ResolvedDoc, catalogue: SeedCatalogue): Record<string, unknown> {
  const tags = catalogue.tagsFor({ slug: doc.slug, tags: doc.tagDefaults });
  const citation = catalogue.citationFor({ slug: doc.slug, citation: doc.citationDefault });
  return withSyncMeta(
    { ...doc.baseMetadata, tags, ...(citation ? { citation } : {}) },
    { contentHash: doc.contentHash, sourceHash: doc.sourceHash },
  );
}

/**
 * Chunk + embed a document ONCE, for whichever caller is running.
 *
 * The chunk tag bag matches what `admin-knowledge { op: 'seed' }` writes
 * (`{ category, ...documentMetadata, ...catalogueTags }`) so a document is
 * byte-identical no matter which path produced it — retrieval filters on
 * these tags, so a divergence here would be invisible until a scenario
 * stopped finding its own knowledge.
 */
async function prepareChunks(
  doc: ResolvedDoc,
  catalogue: SeedCatalogue,
): Promise<PreparedChunkRow[]> {
  if (doc.content === null) throw new Error(`${doc.slug}: body was never resolved`);
  const tags = catalogue.tagsFor({ slug: doc.slug, tags: doc.tagDefaults });
  const citation = catalogue.citationFor({ slug: doc.slug, citation: doc.citationDefault });
  const units = doc.chunks ?? chunkMarkdown(doc.content);
  const embeddings = await embedTexts(units, 'RETRIEVAL_DOCUMENT');
  return units.map((content, i) => ({
    chunk_idx: i,
    content,
    token_estimate: estimateTokens(content),
    tags: { category: doc.category, ...doc.baseMetadata, ...tags },
    citation,
    embedding: embeddings[i],
  }));
}

/** Plan, then apply (or collect, or report) the built-in knowledge base. */
export async function runKnowledgeSync(
  opts: RunKnowledgeSyncOptions,
): Promise<RunKnowledgeSyncResult> {
  const writing = opts.dryRun !== true && opts.collectSql !== true;
  if (!writing) return runKnowledgeSyncUnlocked(opts, opts.existingRows);

  const holder = randomUUID();
  if (!(await tryAcquireLease(opts.sb, holder))) {
    const empty: KnowledgeSyncPlan<ResolvedDoc> = {
      create: [],
      update: [],
      skip: [],
      keepDeleted: [],
      retire: [],
    };
    (opts.log ?? (() => {}))('  another knowledge sync holds the lease — nothing to do');
    return {
      plan: empty,
      lines: [],
      summary: 'knowledge sync: skipped — another sync is running',
      sqlDocs: [],
      retiredSlugs: [],
      existingRows: opts.existingRows ?? [],
      skipped: 'lease-held',
    };
  }
  try {
    // Re-read under the lease: rows passed in were read before we held it
    // and may predate a sync that just finished.
    return await runKnowledgeSyncUnlocked(opts, undefined);
  } finally {
    await releaseLease(opts.sb, holder);
  }
}

async function runKnowledgeSyncUnlocked(
  opts: RunKnowledgeSyncOptions,
  knownRows: ExistingKnowledgeRow[] | undefined,
): Promise<RunKnowledgeSyncResult> {
  const log = opts.log ?? (() => {});
  const dryRun = opts.dryRun === true;
  const groups = new Set<KnowledgeGroup>(opts.groups ?? KNOWLEDGE_GROUPS);

  const existingRows = knownRows ?? (await readExistingRows(opts.sb));
  const rowsBySlug = new Map(existingRows.map((r) => [r.slug, r]));

  const desired: ResolvedDoc[] = seedDocsFor(groups);
  if (groups.has('studies')) {
    desired.push(...(await studyDocs(rowsBySlug, opts.readStudy, dryRun, log)));
  }
  desired.sort((a, b) => a.slug.localeCompare(b.slug));

  const plan = planKnowledgeSync(desired, existingRows, {
    owns: (slug) => groups.has(groupOfSlug(slug)),
  });
  const catalogue = buildSeedCatalogue(existingRows);
  const summary = summarizeSync(plan);
  const lines: SyncLine[] = [];
  const sqlDocs: SqlDocument[] = [];
  const retiredSlugs: string[] = [];

  if (dryRun) {
    for (const [docs, action] of [
      [plan.create, 'created'],
      [plan.update, 'updated'],
      [plan.skip, 'unchanged'],
      [plan.keepDeleted, 'left deleted'],
    ] as Array<[ResolvedDoc[], SyncAction]>) {
      for (const d of docs) lines.push({ slug: d.slug, action, chunks: null });
    }
    for (const slug of plan.retire) lines.push({ slug, action: 'retired', chunks: null });
    lines.sort((a, b) => a.slug.localeCompare(b.slug));
    return { plan, lines, summary, sqlDocs, retiredSlugs, existingRows };
  }

  const write: Array<{ doc: ResolvedDoc; action: SyncAction }> = [
    ...plan.create.map((doc) => ({ doc, action: 'created' as SyncAction })),
    ...plan.update.map((doc) => ({ doc, action: 'updated' as SyncAction })),
  ];

  for (const { doc, action } of write) {
    const metadata = metadataFor(doc, catalogue);
    const chunks = await prepareChunks(doc, catalogue);
    if (opts.collectSql) {
      sqlDocs.push({
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        content: doc.content!,
        metadata,
        source: 'code-seed',
        chunks: chunks as SqlChunkRow[],
      });
    } else {
      await writeKnowledgeDoc(
        opts.sb,
        null,
        {
          slug: doc.slug,
          title: doc.title,
          category: doc.category,
          content: doc.content!,
          citation: (metadata.citation as string | undefined) ?? '',
          tags: metadata.tags as Record<string, unknown>,
          source: 'code-seed',
          metadata,
        },
        chunks,
      );
    }
    lines.push({ slug: doc.slug, action, chunks: chunks.length });
  }

  for (const doc of plan.keepDeleted) {
    // Refresh the body so a restore brings back current text — but never the
    // chunks: the admin deleted this document, and re-embedding it would put
    // it back into retrieval behind their back.
    if (doc.content === null) {
      lines.push({ slug: doc.slug, action: 'left deleted', chunks: null });
      continue;
    }
    const metadata = metadataFor(doc, catalogue);
    if (opts.collectSql) {
      sqlDocs.push({
        slug: doc.slug,
        title: doc.title,
        category: doc.category,
        content: doc.content,
        metadata,
        source: 'code-seed',
        chunks: [],
        chunksUntouched: true,
      });
    } else {
      await writeKnowledgeDoc(
        opts.sb,
        null,
        {
          slug: doc.slug,
          title: doc.title,
          category: doc.category,
          content: doc.content,
          citation: (metadata.citation as string | undefined) ?? '',
          tags: metadata.tags as Record<string, unknown>,
          source: 'code-seed',
          metadata,
          // The tombstone the admin set, written back verbatim.
          deletedAt: catalogue.deletedAt(doc.slug),
        },
        null,
      );
    }
    lines.push({ slug: doc.slug, action: 'left deleted', chunks: null });
  }

  // Built-in documents the code no longer defines: soft-delete, exactly as an
  // admin delete would (retrieval filters `deleted_at is null`). The filter
  // repeats the planner's rule so a row that changed hands since the read is
  // never touched.
  for (const slug of plan.retire) {
    if (opts.collectSql) {
      retiredSlugs.push(slug);
    } else {
      const now = new Date().toISOString();
      const { error } = await opts.sb
        .from('knowledge_documents')
        .update({ deleted_at: now, updated_at: now })
        .eq('slug', slug)
        .eq('source', CODE_SEED)
        .is('deleted_at', null);
      if (error) throw new Error(`Retiring ${slug} failed — ${error.message}`);
    }
    lines.push({ slug, action: 'retired', chunks: null });
  }

  for (const doc of plan.skip) lines.push({ slug: doc.slug, action: 'unchanged', chunks: null });
  lines.sort((a, b) => a.slug.localeCompare(b.slug));

  return { plan, lines, summary, sqlDocs, retiredSlugs, existingRows };
}
