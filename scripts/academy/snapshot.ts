/**
 * npm run academy:snapshot [-- --only slug,slug] [--refresh]
 *
 * Writes `knowledge/academy/articles/<slug>.md` — front-matter + verbatim
 * Markdown — for every article the manifest approves (or just `--only`), and
 * removes the snapshot of any article that is no longer approved. Text comes
 * from the CMS JSON through the deterministic converter; no model is
 * involved anywhere.
 *
 * Coverage check: an article whose snapshot word count is outside 0.95–1.05
 * of the CMS rich text's is still written, but marked `"check": "coverage"`
 * in `catalogue.json` and listed in the summary for a human look.
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderSnapshot } from './toMarkdown';
import { unknownEntities } from './html';
import {
  ARTICLES_DIR,
  CATALOGUE_PATH,
  MANIFEST_PATH,
  loadArticle,
  loadIssueMap,
  readJson,
  snapshotPath,
  writeJson,
} from './load';
import type { Catalogue } from './catalogue';
import type { AcademyManifest } from '../../netlify/functions/_shared/knowledgeAcademy';

/** Snapshot one article; returns its coverage line for the summary. */
export async function snapshotArticle(
  slug: string,
  issues: Awaited<ReturnType<typeof loadIssueMap>>,
  opts: { refresh?: boolean } = {},
): Promise<{ slug: string; written: boolean; coverageOk: boolean; ratio: number; sourceHash: string; note?: string }> {
  const loaded = await loadArticle(slug, { refresh: opts.refresh, log: (l) => console.log(l) });
  if (loaded.status !== 'ok') {
    return { slug, written: false, coverageOk: false, ratio: 0, sourceHash: '', note: loaded.status };
  }
  const snap = renderSnapshot(loaded.model, {
    issue: issues.get(slug) ?? null,
    fetchedAt: loaded.fetchedAt,
    sourceHash: loaded.sourceHash,
  });
  mkdirSync(ARTICLES_DIR, { recursive: true });
  writeFileSync(snapshotPath(slug), snap.file, 'utf8');
  return {
    slug,
    written: true,
    coverageOk: snap.coverage.ok,
    ratio: snap.coverage.ratio,
    sourceHash: loaded.sourceHash,
    note: loaded.model.unknownComponents.length ? `unknown components: ${loaded.model.unknownComponents.join(', ')}` : undefined,
  };
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
  const results = [];
  for (const slug of targets) results.push(await snapshotArticle(slug, issues, { refresh }));

  // Snapshots of articles that are no longer approved go (full runs only).
  const removed: string[] = [];
  if (!only && existsSync(ARTICLES_DIR)) {
    const keep = new Set(approved);
    for (const f of readdirSync(ARTICLES_DIR)) {
      if (!f.endsWith('.md')) continue;
      const slug = f.slice(0, -3);
      if (!keep.has(slug)) {
        unlinkSync(path.join(ARTICLES_DIR, f));
        removed.push(slug);
      }
    }
  }

  // Record the coverage verdict in the catalogue.
  const catalogue = readJson<Catalogue | null>(CATALOGUE_PATH, null);
  if (catalogue) {
    const bySlug = new Map(results.map((r) => [r.slug, r]));
    for (const e of catalogue.articles) {
      const r = bySlug.get(e.slug);
      if (!r || !r.written) continue;
      if (r.coverageOk) delete e.check;
      else e.check = 'coverage';
      e.coverage = r.ratio;
    }
    writeJson(CATALOGUE_PATH, catalogue);
  }

  const failed = results.filter((r) => !r.written);
  const flagged = results.filter((r) => r.written && !r.coverageOk);
  console.log(`\nsnapshots: ${results.filter((r) => r.written).length} written, ${removed.length} removed`);
  if (failed.length) console.log(`not written: ${failed.map((r) => `${r.slug} (${r.note})`).join(', ')}`);
  if (flagged.length) console.log(`coverage check failed: ${flagged.map((r) => `${r.slug} (${r.ratio})`).join(', ')}`);
  for (const r of results) if (r.note && r.written) console.log(`  ${r.slug}: ${r.note}`);
  if (unknownEntities.size) console.log(`undecoded entities: ${[...unknownEntities].join(', ')}`);
  if (failed.length) process.exit(1);
}

if (process.argv[1]?.includes('academy-snapshot')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
