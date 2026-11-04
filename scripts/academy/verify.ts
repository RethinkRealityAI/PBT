/**
 * npm run academy:verify [-- --update [--upload | --emit-sql <file>]]
 *
 * Drift check for the approved articles: re-fetches each one from the site
 * (bypassing the cache — this run is the one that SHOULD reach the site),
 * recomputes its `sourceHash` and compares it with the manifest's pin:
 *
 *   unchanged — same CMS content as the pinned snapshot
 *   changed   — Royal Canin edited the article; re-snapshot with `--update`
 *   gone      — the page no longer exists (decide in the manifest)
 *   missing   — approved but never pinned (run academy:snapshot)
 *
 * Without `--update` nothing is written, so the PR that refreshes the corpus
 * shows exactly what changed upstream (the manifest's hash moves). With it,
 * changed / missing articles are re-rendered, re-pinned and — with
 * `--upload` / `--emit-sql` — sent to knowledge_source_snapshots. Exits 1
 * when anything is not `unchanged`, so it can gate a scheduled refresh.
 */
import { loadArticle, loadIssueMap, MANIFEST_PATH, readJson, writeJson } from './load';
import { pinManifest, snapshotArticle, type SnapshotResult } from './snapshot';
import type { AcademyManifest } from '../../netlify/functions/_shared/knowledgeAcademy';
import { publishSnapshotRows } from '../knowledgeSnapshots';

type Verdict = 'unchanged' | 'changed' | 'gone' | 'missing';

async function main(): Promise<void> {
  const update = process.argv.includes('--update');
  const manifest = readJson<AcademyManifest | null>(MANIFEST_PATH, null);
  if (!manifest) throw new Error('No manifest — run `npm run academy:catalogue` first');
  const approved = manifest.articles.filter((a) => a.approved);

  const verdicts: Array<{ slug: string; verdict: Verdict }> = [];
  for (const { slug, sourceHash: stored, contentHash } of approved) {
    if (!contentHash || !stored) {
      verdicts.push({ slug, verdict: 'missing' });
      continue;
    }
    const live = await loadArticle(slug, { refresh: true, log: (l) => console.log(l) });
    const verdict: Verdict = live.status !== 'ok' ? 'gone' : live.sourceHash === stored ? 'unchanged' : 'changed';
    verdicts.push({ slug, verdict });
    if (verdict !== 'unchanged') console.log(`  ${slug} — ${verdict}`);
  }

  const changed = verdicts.filter((v) => v.verdict === 'changed' || v.verdict === 'missing');
  if (update && changed.length) {
    // The fresh pages are in the cache now, so this re-uses them.
    const issues = await loadIssueMap({ refresh: true });
    const results: SnapshotResult[] = [];
    for (const { slug } of changed) {
      const r = await snapshotArticle(slug, issues);
      results.push(r);
      console.log(`  re-snapshotted ${slug}${r.coverageOk ? '' : ` (coverage ${r.ratio} — check it)`}`);
    }
    pinManifest(manifest, results);
    writeJson(MANIFEST_PATH, manifest);
    await publishSnapshotRows(process.argv.slice(2), results.flatMap((r) => (r.row ? [r.row] : [])));
  }

  const count = (v: Verdict) => verdicts.filter((x) => x.verdict === v).length;
  console.log(
    `\nverify: ${count('unchanged')} unchanged, ${count('changed')} changed, ` +
      `${count('gone')} gone, ${count('missing')} missing${update ? ' (changed/missing re-snapshotted)' : ''}`,
  );
  if (verdicts.some((v) => v.verdict !== 'unchanged') && !update) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
