/**
 * External knowledge corpora behind a publish gate (the Royal Canin Academy
 * articles — group `academy` — and the Royal Canin feline assets — group
 * `feline`). ONE implementation for both.
 *
 * ── Where the text lives ───────────────────────────────────────────────────
 * The repository is public and the text is © Royal Canin, so git holds only
 * `knowledge/<corpus>/manifest.json`: the gate (permission + `publish`) and,
 * per document, its scope and the sha256 of its reviewed text
 * (`contentHash`). The text itself sits in the service-role-only table
 * `knowledge_source_snapshots` (migration
 * 20261104000000_knowledge_source_snapshots.sql), written by
 * `npm run academy:snapshot -- --upload` / `feline:snapshot -- --upload`.
 *
 * ── Git pins, the table holds ──────────────────────────────────────────────
 * A row is accepted only when sha256(content) equals the manifest pin. A
 * closed gate, an approved document with no pin, a missing row, a hash
 * mismatch or an unreadable table all SKIP THE WHOLE CORPUS with one loud
 * status line: the group contributes nothing and owns nothing, so rows
 * already stored are never retired (a broken read must never look like "the
 * code removed these documents"). Nothing here touches the network beyond
 * the one table read.
 */
import { sha256Hex } from './knowledgeSync';
import type { ResolvedDoc } from './knowledgeSyncRun';

export type ExternalCorpus = 'academy' | 'feline';
export const EXTERNAL_CORPORA: readonly ExternalCorpus[] = ['academy', 'feline'];

export const SNAPSHOT_TABLE = 'knowledge_source_snapshots';

export interface ExternalPermission {
  status: 'pending' | 'granted';
  reference: string;
  grantedBy: string;
  date: string;
}

/** The two fields that open a corpus to the sync. */
export interface ExternalGate {
  permission: ExternalPermission;
  publish: boolean;
}

/** What every manifest entry carries, whatever the corpus. */
export interface PinnedEntry {
  slug: string;
  approved: boolean;
  /** sha256 hex of the reviewed text in `knowledge_source_snapshots`. */
  contentHash?: string;
  /** sha256 hex of the source (canonical CMS JSON / file bytes). */
  sourceHash?: string;
}

/** One row of `knowledge_source_snapshots`. */
export interface SnapshotRow {
  corpus: string;
  slug: string;
  content: string;
  content_hash: string;
  source_hash: string | null;
  meta: Record<string, unknown>;
}

/** Reads the rows of one corpus for the given slugs; throws when the table is unreadable. */
export type SnapshotReader = (corpus: ExternalCorpus, slugs: readonly string[]) => Promise<SnapshotRow[]>;

export const HEX64 = /^[0-9a-f]{64}$/;
/** The table's slug CHECK (without the corpus prefix). */
export const SNAPSHOT_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,199}$/;

export function isGateOpen(gate: Partial<ExternalGate> | null | undefined): boolean {
  return gate?.permission?.status === 'granted' && gate?.publish === true;
}

/** Shape checks shared by both manifests' validators. */
export function validateGate(raw: unknown, corpus: ExternalCorpus): ExternalGate {
  const m = raw as ExternalGate;
  if (!m || typeof m !== 'object') throw new Error(`${corpus} manifest is not an object`);
  if (!m.permission || !['pending', 'granted'].includes(m.permission.status)) {
    throw new Error(`${corpus} manifest.permission.status must be "pending" or "granted"`);
  }
  if (typeof m.publish !== 'boolean') throw new Error(`${corpus} manifest.publish must be a boolean`);
  return m;
}

/** The service-role table read, in slices (an `in()` list stays short). */
export function snapshotReaderFor(sb: { from(table: string): any }): SnapshotReader {
  return async (corpus, slugs) => {
    const rows: SnapshotRow[] = [];
    for (let i = 0; i < slugs.length; i += 50) {
      const slice = slugs.slice(i, i + 50);
      const { data, error } = await sb
        .from(SNAPSHOT_TABLE)
        .select('corpus, slug, content, content_hash, source_hash, meta')
        .eq('corpus', corpus)
        .in('slug', slice);
      if (error) throw new Error(`${SNAPSHOT_TABLE} unreadable — ${error.message}`);
      rows.push(...((data ?? []) as SnapshotRow[]));
    }
    return rows;
  };
}

export interface ExternalDocsResult {
  /** True only when the gate is open AND every approved document was read and verified. */
  published: boolean;
  docs: ResolvedDoc[];
  /** One line for the run log — loud when nothing will be written. */
  status: string;
}

const skipped = (corpus: ExternalCorpus, why: string): ExternalDocsResult => ({
  published: false,
  docs: [],
  status: `${corpus}: SKIPPED — ${why}; stored documents untouched`,
});

/**
 * The approved, published documents of one corpus as sync documents, or a
 * skip. `build` turns a verified row into a `ResolvedDoc` (corpus-specific
 * citation, tags and chunker); a throw there skips the corpus too.
 */
export async function externalCorpusDocs<E extends PinnedEntry>(args: {
  corpus: ExternalCorpus;
  gate: ExternalGate | null;
  entries: readonly E[];
  read: SnapshotReader | null;
  build: (entry: E, row: SnapshotRow) => ResolvedDoc;
}): Promise<ExternalDocsResult> {
  const { corpus, gate, entries, read, build } = args;
  if (!gate) return skipped(corpus, `knowledge/${corpus}/manifest.json is not readable`);
  const approved = entries.filter((e) => e.approved);
  if (!isGateOpen(gate)) {
    return {
      published: false,
      docs: [],
      status:
        `${corpus}: NOT PUBLISHED — permission ${gate.permission.status}, publish=${gate.publish}; ` +
        `${approved.length} approved document(s) ready, nothing written, nothing retired`,
    };
  }
  const unpinned = approved.find((e) => !HEX64.test(e.contentHash ?? ''));
  if (unpinned) return skipped(corpus, `${unpinned.slug} has no contentHash pin in the manifest`);
  if (!read) return skipped(corpus, `${SNAPSHOT_TABLE} is not reachable here`);

  let rows: SnapshotRow[];
  try {
    rows = await read(corpus, approved.map((e) => e.slug));
  } catch (err) {
    return skipped(corpus, err instanceof Error ? err.message : String(err));
  }
  const bySlug = new Map(rows.filter((r) => r.corpus === corpus).map((r) => [r.slug, r]));

  const docs: ResolvedDoc[] = [];
  for (const entry of approved) {
    const row = bySlug.get(entry.slug);
    if (!row || typeof row.content !== 'string') {
      return skipped(corpus, `no ${SNAPSHOT_TABLE} row for ${entry.slug}`);
    }
    if (sha256Hex(row.content) !== entry.contentHash) {
      return skipped(corpus, `${entry.slug} does not match its manifest pin (contentHash mismatch)`);
    }
    try {
      docs.push(build(entry, { ...row, meta: row.meta && typeof row.meta === 'object' ? row.meta : {} }));
    } catch (err) {
      return skipped(corpus, `${entry.slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { published: true, docs, status: `${corpus}: published — ${docs.length} approved document(s)` };
}

/** `meta[key]` as a string ('' otherwise) — the rows are data, read defensively. */
export function metaString(meta: Record<string, unknown>, key: string): string {
  const v = meta[key];
  return typeof v === 'string' ? v : '';
}

export function metaStrings(meta: Record<string, unknown>, key: string): string[] {
  const v = meta[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
