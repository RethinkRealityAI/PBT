/**
 * npm run academy:catalogue [-- --refresh]
 *
 * Reads the Academy's English sitemap, every `/en/veterinary/<slug>` article
 * on it and the Vet Focus magazine page, and writes
 * `knowledge/academy/catalogue.json`: metadata for EVERY article (no bodies),
 * the triage proposal and its reason, and the coverage figure — the audit
 * trail of what was considered and why each article is in or out.
 *
 * It then MERGES the proposal into `manifest.json`: an approved proposal for
 * a slug the manifest does not mention is added with `reviewedBy: "triage"`.
 * Entries already in the manifest — a human's approval, edit or rejection
 * (`approved: false`) — are never overwritten, so re-running is safe.
 *
 * Fetching goes through `fetch.ts` (honest User-Agent, ≥ 1.5 s apart, cached
 * in `.cache/academy/`); `--refresh` ignores the cache. A whole cold run is
 * ~460 requests, ~15 minutes.
 */
import { SITEMAP_URL, articleSlugsFromSitemap, fetchPage } from './fetch';
import { htmlToBlocks, stripEmphasis } from './html';
import { renderSnapshot, authorsOf } from './toMarkdown';
import { triage, unmappedThemes, type TriageProposal } from './triage';
import {
  CATALOGUE_PATH,
  EMPTY_MANIFEST,
  MANIFEST_PATH,
  loadArticle,
  loadIssueMap,
  readJson,
  today,
  writeJson,
} from './load';
import { DEFAULT_KNOWLEDGE_TOOLS } from '../../src/shared/knowledge/knowledgeScopes';
import type { AcademyManifest } from '../../netlify/functions/_shared/knowledgeAcademy';

export interface CatalogueEntry {
  slug: string;
  url: string;
  status: 'ok' | 'gone' | 'unparseable';
  title: string;
  publicationDate: string;
  species: string[];
  lifestage: string[];
  themes: string[];
  topics: string[];
  keywords: string[];
  description: string;
  authors: string[];
  issue: string;
  issueTitle: string;
  readingTime: string;
  editorialTag: string;
  /** Words in the rendered snapshot (body + bio + COI). */
  wordCount: number;
  /** Words in the CMS rich text, by plain tag stripping. */
  sourceWords: number;
  coverage: number;
  /** Set when the coverage check failed — needs a human look. */
  check?: 'coverage';
  sourceHash: string;
  fetchedAt: string;
  /** What `triage.ts` proposed (deterministic). */
  proposed: TriageProposal;
  /** What the manifest decided (the reviewed outcome), or null if undecided. */
  decision: { approved: boolean; focus: string | null; reason: string; reviewedBy: string } | null;
}

export interface Catalogue {
  source: string;
  generatedAt: string;
  count: number;
  /** Site themes with no PBT focus mapping, with how many articles carry each. */
  unmappedThemes: Record<string, number>;
  articles: CatalogueEntry[];
}

async function main(): Promise<void> {
  const refresh = process.argv.includes('--refresh');
  const log = (l: string) => console.log(l);

  const sitemap = await fetchPage(SITEMAP_URL, { refresh, log });
  if (sitemap.status !== 200) throw new Error(`sitemap answered ${sitemap.status}`);
  const slugs = articleSlugsFromSitemap(sitemap.body);
  console.log(`sitemap: ${slugs.length} articles`);
  const issues = await loadIssueMap({ refresh, log });

  const entries: CatalogueEntry[] = [];
  const unmapped: Record<string, number> = {};
  let i = 0;
  for (const slug of slugs) {
    i += 1;
    const loaded = await loadArticle(slug, { refresh, log });
    if (loaded.status !== 'ok') {
      entries.push({
        slug,
        url: loaded.url,
        status: loaded.status,
        title: '',
        publicationDate: '',
        species: [],
        lifestage: [],
        themes: [],
        topics: [],
        keywords: [],
        description: '',
        authors: [],
        issue: '',
        issueTitle: '',
        readingTime: '',
        editorialTag: '',
        wordCount: 0,
        sourceWords: 0,
        coverage: 0,
        sourceHash: '',
        fetchedAt: loaded.fetchedAt,
        proposed: {
          focus: null,
          species: [],
          approved: false,
          reason:
            loaded.status === 'gone'
              ? `Rejected: page answers ${loaded.httpStatus} on the site`
              : 'Rejected: no article body on the site (link to an external publication)',
        },
        decision: null,
      });
      console.log(`  ${i}/${slugs.length} ${slug} — ${loaded.status}`);
      continue;
    }
    const a = loaded.model;
    const issue = issues.get(slug) ?? null;
    const snap = renderSnapshot(a, { issue, fetchedAt: loaded.fetchedAt, sourceHash: loaded.sourceHash });
    const description = htmlToBlocks(a.descriptionHtml).map(stripEmphasis).join(' ').replace(/\s+/g, ' ').trim();
    const proposed = triage({
      title: a.title,
      description,
      themes: a.themes,
      topics: a.topics,
      keywords: a.keywords,
      species: a.species,
    });
    for (const t of unmappedThemes(a.themes)) unmapped[t] = (unmapped[t] ?? 0) + 1;
    entries.push({
      slug,
      url: a.url,
      status: 'ok',
      title: a.title,
      publicationDate: a.publicationDate,
      species: a.species,
      lifestage: a.lifestage,
      themes: a.themes,
      topics: a.topics,
      keywords: a.keywords,
      description,
      authors: authorsOf(a),
      issue: issue?.issue ?? '',
      issueTitle: issue?.issueTitle ?? '',
      readingTime: a.readingTime,
      editorialTag: a.editorialTag,
      wordCount: snap.coverage.snapshotWords,
      sourceWords: snap.coverage.sourceWords,
      coverage: snap.coverage.ratio,
      ...(snap.coverage.ok ? {} : { check: 'coverage' as const }),
      sourceHash: loaded.sourceHash,
      fetchedAt: loaded.fetchedAt,
      proposed,
      decision: null,
    });
    if (i % 50 === 0) console.log(`  ${i}/${slugs.length}`);
  }
  entries.sort((a, b) => a.slug.localeCompare(b.slug));

  // Merge the proposals into the manifest without touching reviewed entries.
  const manifest = readJson<AcademyManifest>(MANIFEST_PATH, EMPTY_MANIFEST);
  const known = new Set(manifest.articles.map((a) => a.slug));
  let added = 0;
  for (const e of entries) {
    if (!e.proposed.approved || known.has(e.slug)) continue;
    manifest.articles.push({
      slug: e.slug,
      approved: true,
      focus: e.proposed.focus,
      species: e.proposed.species,
      tools: [...DEFAULT_KNOWLEDGE_TOOLS],
      reason: e.proposed.reason,
      reviewedBy: 'triage',
      reviewedAt: today(),
    });
    added += 1;
  }
  manifest.articles.sort((a, b) => a.slug.localeCompare(b.slug));
  writeJson(MANIFEST_PATH, manifest);

  // The catalogue mirrors the decision, so it is the one audit table.
  const decided = new Map(manifest.articles.map((a) => [a.slug, a]));
  for (const e of entries) {
    const d = decided.get(e.slug);
    e.decision = d ? { approved: d.approved, focus: d.focus, reason: d.reason, reviewedBy: d.reviewedBy } : null;
  }

  const catalogue: Catalogue = {
    source: SITEMAP_URL,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    count: entries.length,
    unmappedThemes: Object.fromEntries(Object.entries(unmapped).sort((a, b) => b[1] - a[1])),
    articles: entries,
  };
  writeJson(CATALOGUE_PATH, catalogue);

  const ok = entries.filter((e) => e.status === 'ok');
  const gone = entries.filter((e) => e.status !== 'ok');
  const flagged = ok.filter((e) => e.check === 'coverage');
  console.log(`\ncatalogue: ${entries.length} articles (${ok.length} readable, ${gone.length} gone)`);
  console.log(`triage: ${ok.filter((e) => e.proposed.approved).length} proposed for approval; ${added} new manifest entries`);
  console.log(`manifest: ${manifest.articles.filter((a) => a.approved).length} approved, ${manifest.articles.filter((a) => !a.approved).length} rejected on review`);
  if (gone.length) console.log(`gone: ${gone.map((e) => e.slug).join(', ')}`);
  if (flagged.length) {
    console.log(`coverage check failed (${flagged.length}):`);
    for (const e of flagged) console.log(`  ${e.slug} — ${e.wordCount}/${e.sourceWords} words (${e.coverage})`);
  }
  console.log(`unmapped themes: ${Object.entries(catalogue.unmappedThemes).map(([t, n]) => `${t} (${n})`).join(', ')}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
