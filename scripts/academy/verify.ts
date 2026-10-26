/**
 * npm run academy:verify [-- --update]
 *
 * Drift check for the approved articles: re-fetches each one from the site
 * (bypassing the cache — this run is the one that SHOULD reach the site),
 * recomputes its `sourceHash` and compares it with the snapshot's:
 *
 *   unchanged — same CMS content as the snapshot
 *   changed   — Royal Canin edited the article; re-snapshot with `--update`
 *   gone      — the page no longer exists (decide in the manifest)
 *   missing   — approved but no snapshot file yet (run academy:snapshot)
 *
 * Without `--update` nothing is written, so the PR that refreshes the corpus
 * shows exactly what changed upstream. Exits 1 when anything is not
 * `unchanged`, so it can gate a scheduled refresh.
 */
import { existsSync, readFileSync } from 'node:fs';
import { loadArticle, loadIssueMap, MANIFEST_PATH, readJson, snapshotPath } from './load';
import { snapshotArticle } from './snapshot';
import { parseSnapshot, type AcademyManifest } from '../../netlify/functions/_shared/knowledgeAcademy';

type Verdict = 'unchanged' | 'changed' | 'gone' | 'missing';

async function main(): Promise<void> {
  const update = process.argv.includes('--update');
  const manifest = readJson<AcademyManifest | null>(MANIFEST_PATH, null);
  if (!manifest) throw new Error('No manifest — run `npm run academy:catalogue` first');
  const approved = manifest.articles.filter((a) => a.approved).map((a) => a.slug);

  const verdicts: Array<{ slug: string; verdict: Verdict }> = [];
  for (const slug of approved) {
    if (!existsSync(snapshotPath(slug))) {
      verdicts.push({ slug, verdict: 'missing' });
      continue;
    }
    const stored = parseSnapshot(readFileSync(snapshotPath(slug), 'utf8')).frontMatter.sourceHash;
    const live = await loadArticle(slug, { refresh: true, log: (l) => console.log(l) });
    const verdict: Verdict = live.status !== 'ok' ? 'gone' : live.sourceHash === stored ? 'unchanged' : 'changed';
    verdicts.push({ slug, verdict });
    if (verdict !== 'unchanged') console.log(`  ${slug} — ${verdict}`);
  }

  const changed = verdicts.filter((v) => v.verdict === 'changed' || v.verdict === 'missing');
  if (update && changed.length) {
    // The fresh pages are in the cache now, so this re-uses them.
    const issues = await loadIssueMap({ refresh: true });
    for (const { slug } of changed) {
      const r = await snapshotArticle(slug, issues);
      console.log(`  re-snapshotted ${slug}${r.coverageOk ? '' : ` (coverage ${r.ratio} — check it)`}`);
    }
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
