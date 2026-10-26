/**
 * Shared by the fixture test and by anyone regenerating the expected files
 * after an INTENDED converter change:
 *
 *   npx esbuild scripts/academy/__tests__/fixtureRender.ts --bundle --platform=node \
 *     --format=esm --packages=external --outfile=.netlify/academy-fixtures.mjs \
 *     && node .netlify/academy-fixtures.mjs --write
 *
 * Review the diff of the `.expected.md` files before committing it — that
 * diff IS the behaviour change.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArticle, sourceHashOf, type IssueRef, type SitecoreRoute } from '../sitecore';
import { renderSnapshot, type Snapshot } from '../toMarkdown';

export const FIXTURE_DIR = path.resolve(process.cwd(), 'scripts/academy/__tests__/fixtures');

export const FIXTURES: Array<{ slug: string; issue: IssueRef | null }> = [
  {
    slug: 'how-i-approach-pet-obesity',
    issue: {
      issue: '36.1',
      issueTitle: 'Beyond body condition',
      issuePdf:
        'https://marspetcareaprimocdn.petcare.global/a8fdae83-fea8-4962-a7a4-b45f00d42fa6/a8fdae83-fea8-4962-a7a4-b45f00d42fa6_Original%20file.pdf',
    },
  },
  // An older layout: styled-span headings, a captioned "Table 1", typed "•"
  // bullets, citation tooltips, a `Sources` references block and an `<h4>`
  // author box with no `id="author"`.
  { slug: 'canine-atopic-dermatitis-and-the-owner', issue: null },
];

export function loadRoute(slug: string): SitecoreRoute {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${slug}.route.json`), 'utf8')) as SitecoreRoute;
}

export function renderFixture(slug: string, issue: IssueRef | null): Snapshot {
  const route = loadRoute(slug);
  const url = `https://academy.royalcanin.com/en/veterinary/${slug}`;
  return renderSnapshot(parseArticle(route, slug, url), {
    issue,
    fetchedAt: '2026-10-26T16:15:00Z',
    sourceHash: sourceHashOf(route),
  });
}

export const expectedPath = (slug: string) => path.join(FIXTURE_DIR, `${slug}.expected.md`);

if (process.argv.includes('--write')) {
  for (const { slug, issue } of FIXTURES) {
    writeFileSync(expectedPath(slug), renderFixture(slug, issue).file, 'utf8');
    console.log(`wrote ${expectedPath(slug)}`);
  }
}
