/**
 * Content hashing and the sync plan for the built-in knowledge base.
 *
 * The knowledge base is seeded automatically (Netlify deploy plugin →
 * `scripts/knowledge-sync.ts`), which means the sync runs on EVERY deploy.
 * Re-embedding ~30 documents each time would be slow and expensive, so every
 * synced document stores a fingerprint of what was written:
 *
 *   metadata.sync = { version, contentHash, sourceHash?, syncedAt }
 *
 *   contentHash  sha256 of the document body the sync would write.
 *   sourceHash   sha256 of the upstream bytes the body was DERIVED from
 *                (a study PDF). Present only for derived documents; it lets
 *                the sync decide "this PDF is unchanged" without paying for
 *                a Gemini extraction to find out.
 *   version      bump `SYNC_VERSION` to force a full re-sync when something
 *                outside the body changes shape (chunking, tag defaults).
 *
 * Pure module: no I/O, no Supabase, no Gemini. `node:crypto` only.
 */
import { createHash } from 'node:crypto';

/**
 * Fingerprint format version. Bump to invalidate every stored hash and force
 * a full re-embed on the next sync — the escape hatch for changes that alter
 * the CHUNKS or the tag defaults without touching a document's body.
 */
export const SYNC_VERSION = 1;

export interface SyncMeta {
  version: number;
  contentHash: string;
  sourceHash?: string;
  syncedAt: string;
}

/** sha256, hex. Accepts text or raw bytes (PDFs). */
export function sha256Hex(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Read `metadata.sync` leniently; anything malformed reads as "never synced". */
export function readSyncMeta(metadata: unknown): SyncMeta | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const sync = (metadata as Record<string, unknown>).sync;
  if (!sync || typeof sync !== 'object') return null;
  const bag = sync as Record<string, unknown>;
  if (typeof bag.contentHash !== 'string' || !bag.contentHash) return null;
  return {
    version: typeof bag.version === 'number' ? bag.version : 0,
    contentHash: bag.contentHash,
    sourceHash: typeof bag.sourceHash === 'string' ? bag.sourceHash : undefined,
    syncedAt: typeof bag.syncedAt === 'string' ? bag.syncedAt : '',
  };
}

/** Stamp a fresh `sync` record onto a metadata bag (never mutates the input). */
export function withSyncMeta(
  metadata: Record<string, unknown>,
  args: { contentHash: string; sourceHash?: string; syncedAt?: string },
): Record<string, unknown> {
  const sync: SyncMeta = {
    version: SYNC_VERSION,
    contentHash: args.contentHash,
    ...(args.sourceHash ? { sourceHash: args.sourceHash } : {}),
    syncedAt: args.syncedAt ?? new Date().toISOString(),
  };
  return { ...metadata, sync };
}

/** A row as the planner sees it. `chunk_count` is what makes a skip safe. */
export interface ExistingKnowledgeRow {
  slug: string;
  metadata?: unknown;
  deleted_at?: string | null;
  chunk_count?: number | null;
  /**
   * `knowledge_documents.source`. The planner ignores it; the background
   * function's cooldown uses it to time itself off built-in documents only,
   * so an admin's own upload can't hold the sync open or shut.
   */
  source?: string | null;
}

/** The minimum a desired document must carry to be planned. */
export interface PlannableDoc {
  slug: string;
  /** sha256 of the body this sync would write. */
  contentHash: string;
}

export interface KnowledgeSyncPlan<T extends PlannableDoc> {
  /** No row yet — write the document and its chunks. */
  create: T[];
  /** Row exists and is stale (hash/version differs, or it lost its chunks). */
  update: T[];
  /** Row exists, hash matches, chunks are present — write nothing. */
  skip: T[];
  /**
   * Row is soft-deleted. The body is refreshed (a sync is not an undelete)
   * and NO chunks are written, so retrieval stays blind to it — exactly what
   * the admin asked for when they deleted it.
   */
  keepDeleted: T[];
  /**
   * Slugs of LIVE `source = 'code-seed'` rows the code no longer defines (a
   * persona, pushback or study removed from the repo). They are soft-deleted
   * — never hard-deleted, never anything but `code-seed` — so retrieval stops
   * quoting knowledge the product no longer ships, and a revert of the code
   * change brings them back through the normal create/update path.
   */
  retire: string[];
}

export interface PlanOptions {
  /**
   * Does this run own `slug`? A partial run (`--only fecal`) must not retire
   * the documents of the groups it did not look at. Default: owns every slug.
   */
  owns?: (slug: string) => boolean;
}

/** The `source` value the sync writes, and the only one it ever retires. */
export const CODE_SEED = 'code-seed';

/**
 * Decide, per desired document, what the sync has to do.
 *
 * The skip rule is deliberately conservative on three axes:
 *  • hash equality — the body is byte-identical to what was last written;
 *  • fingerprint version — an older shape is always re-synced;
 *  • chunk count — a document whose chunks vanished (a failed run, a manual
 *    delete) is re-embedded even though its body never changed. Without this
 *    the corpus can silently sit at zero chunks forever and retrieval
 *    fails open into ungrounded prompts.
 */
export function planKnowledgeSync<T extends PlannableDoc>(
  desired: readonly T[],
  existing: readonly ExistingKnowledgeRow[],
  opts: PlanOptions = {},
): KnowledgeSyncPlan<T> {
  const rows = new Map<string, ExistingKnowledgeRow>();
  for (const row of existing ?? []) rows.set(row.slug, row);

  const plan: KnowledgeSyncPlan<T> = {
    create: [],
    update: [],
    skip: [],
    keepDeleted: [],
    retire: [],
  };
  for (const doc of desired) {
    const row = rows.get(doc.slug);
    if (!row) {
      plan.create.push(doc);
      continue;
    }
    if (row.deleted_at) {
      plan.keepDeleted.push(doc);
      continue;
    }
    const sync = readSyncMeta(row.metadata);
    const fresh =
      sync !== null &&
      sync.version === SYNC_VERSION &&
      sync.contentHash === doc.contentHash &&
      (row.chunk_count ?? 0) > 0;
    if (fresh) plan.skip.push(doc);
    else plan.update.push(doc);
  }

  const wanted = new Set(desired.map((d) => d.slug));
  const owns = opts.owns ?? (() => true);
  for (const row of existing ?? []) {
    if (row.source !== CODE_SEED) continue; // an admin's upload is never ours to retire
    if (row.deleted_at) continue;
    if (wanted.has(row.slug) || !owns(row.slug)) continue;
    plan.retire.push(row.slug);
  }
  plan.retire.sort();
  return plan;
}

/**
 * May the sync reuse the stored body instead of re-extracting the PDF?
 *
 * True only when the stored fingerprint was written from the SAME bytes, at
 * the current version, and the document is in a state where nothing would be
 * written anyway (live with chunks, or soft-deleted). Every other answer is
 * "extract it" — an extra Gemini call is cheaper than a corpus that silently
 * drifts from the PDFs in the repo.
 */
export function canSkipExtraction(
  row: ExistingKnowledgeRow | undefined,
  sourceHash: string,
): boolean {
  if (!row) return false;
  const sync = readSyncMeta(row.metadata);
  if (!sync || sync.version !== SYNC_VERSION || sync.sourceHash !== sourceHash) return false;
  if (row.deleted_at) return true;
  return (row.chunk_count ?? 0) > 0;
}

/** One line per document for the run summary. */
export function summarizeSync(plan: KnowledgeSyncPlan<PlannableDoc>): string {
  return (
    `knowledge sync: ${plan.create.length} created, ${plan.update.length} updated, ` +
    `${plan.skip.length} unchanged, ${plan.keepDeleted.length} left deleted` +
    (plan.retire.length > 0 ? `, ${plan.retire.length} retired` : '')
  );
}
