/**
 * npm run academy:snapshot [-- --only slug,slug] [--refresh] [--upload] [--emit-sql <file>]
 *
 * Renders the verbatim snapshot (Markdown body + front-matter) of every
 * article the manifest approves (or just `--only`), from the CMS JSON through
 * the deterministic converter — no model anywhere — and:
 *
 *   • PINS it: writes the body's sha256 (`contentHash`) and the CMS JSON's
 *     (`sourceHash`) into `knowledge/academy/manifest.json`. That diff is what
 *     a PR shows when an article changes.
 *   • keeps the row locally in `.cache/academy/snapshots/<slug>.json`
 *     (gitignored — the repo is public and the text is © Royal Canin SAS);
 *   • `--upload` upserts the rows into `knowledge_source_snapshots` (service
 *     role); `--emit-sql <file>` writes SQL parts instead (scripts/knowledgeSnapshots.ts).
 *
 * Coverage check: an article whose snapshot word count is outside 0.95–1.05
 * of the CMS rich text's is still rendered, but marked `"check": "coverage"`
 * in `catalogue.json` and listed in the summary for a human look.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderSnapshot, snapshotRow } from './toMarkdown';
import { unknownEntities } from './html';
import { CATALOGUE_PATH, MANIFEST_PATH, loadArticle, loadIssueMap, readJson, writeJson } from './load';
import { CACHE_DIR } from './fetch';
import type { Catalogue } from './catalogue';
import type { AcademyManifest } from '../../netlify/functions/_shared/knowledgeAcademy';
import { publishSnapshotRows, type SnapshotUploadRow } from '../knowledgeSnapshots';

export const SNAPSHOT_CACHE = path.join(CACHE_DIR, 'snapshots');

export interface SnapshotResult {
  slug: string;
  row: SnapshotUploadRow | null;
  coverageOk: boolean;
  ratio: number;
  note?: string;
}

/** Render one article; the row is also kept in the local cache. */
export async function snapshotArticle(
  slug: string,
  issues: Awaited<ReturnType<typeof loadIssueMap>>,
  opts: { refresh?: boolean } = {},
): Promise<SnapshotResult> {
  const loaded = await loadArticle(slug, { refresh: opts.refresh, log: (l) => console.log(l) });
  if (loaded.status !== 'ok') return { slug, row: null, coverageOk: false, ratio: 0, note: loaded.status };
  const snap = renderSnapshot(loaded.model, {
    issue: issues.get(slug) ?? null,
    fetchedAt: loaded.fetchedAt,
    sourceHash: loaded.sourceHash,
  });
  const row = snapshotRow(snap);
  mkdirSync(SNAPSHOT_CACHE, { recursive: true });
  writeFileSync(path.join(SNAPSHOT_CACHE, `${slug}.json`), JSON.stringify(row), 'utf8');
  return {
    slug,
    row,
    coverageOk: snap.coverage.ok,
    ratio: snap.coverage.ratio,
    note: loaded.model.unknownComponents.length
      ? `unknown components: ${loaded.model.unknownComponents.join(', ')}`
      : undefined,
  };
}

/** Write each rendered article's pins into the manifest. */
export function pinManifest(manifest: AcademyManifest, results: SnapshotResult[]): number {
  const bySlug = new Map(results.filter((r) => r.row).map((r) => [r.slug, r.row!]));
  let changed = 0;
  for (const a of manifest.articles) {
    const row = bySlug.get(a.slug);
    if (!row) continue;
    if (a.contentHash !== row.content_hash || a.sourceHash !== (row.source_hash ?? undefined)) changed += 1;
    a.contentHash = row.content_hash;
    if (row.source_hash) a.sourceHash = row.source_hash;
  }
  return changed;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const refresh = args.includes('--refresh');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set((args[onlyIdx + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)) : null;

  const manifest = readJson<AcademyManifest | null>(MANIFEST_PATH, null);
  if (!manifest) throw new Error('No manifest — run `npm run academy:catalogue` first');
  const approved = manifest.articles.filter((a) => a.approved).map((a) => a.slug);
  const targets = only ? approved.filter((s) => only.has(s)) : approved;
  if (only) {
    for (const s of only) if (!approved.includes(s)) console.warn(`  ${s} is not approved in the manifest — skipped`);
  }

  const issues = await loadIssueMap({ refresh });
  const results: SnapshotResult[] = [];
  for (const slug of targets) results.push(await snapshotArticle(slug, issues, { refresh }));

  const pinned = pinManifest(manifest, results);
  writeJson(MANIFEST_PATH, manifest);

  // Record the coverage verdict in the catalogue.
  const catalogue = readJson<Catalogue | null>(CATALOGUE_PATH, null);
  if (catalogue) {
    const bySlug = new Map(results.map((r) => [r.slug, r]));
    for (const e of catalogue.articles) {
      const r = bySlug.get(e.slug);
      if (!r || !r.row) continue;
      if (r.coverageOk) delete e.check;
      else e.check = 'coverage';
      e.coverage = r.ratio;
    }
    writeJson(CATALOGUE_PATH, catalogue);
  }

  const rows = results.flatMap((r) => (r.row ? [r.row] : []));
  await publishSnapshotRows(args, rows);

  const failed = results.filter((r) => !r.row);
  const flagged = results.filter((r) => r.row && !r.coverageOk);
  console.log(`\nsnapshots: ${rows.length} rendered, ${pinned} pin(s) changed in the manifest`);
  if (failed.length) console.log(`not rendered: ${failed.map((r) => `${r.slug} (${r.note})`).join(', ')}`);
  if (flagged.length) console.log(`coverage check failed: ${flagged.map((r) => `${r.slug} (${r.ratio})`).join(', ')}`);
  for (const r of results) if (r.note && r.row) console.log(`  ${r.slug}: ${r.note}`);
  if (unknownEntities.size) console.log(`undecoded entities: ${[...unknownEntities].join(', ')}`);
  if (pinned && !args.includes('--upload') && !args.includes('--emit-sql')) {
    console.log('Pins changed: upload the rows (--upload / --emit-sql) before the manifest ships, or the sync skips the corpus.');
  }
  if (failed.length) process.exit(1);
}

if (process.argv[1]?.includes('academy-snapshot')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
