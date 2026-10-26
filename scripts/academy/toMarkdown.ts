/**
 * `ArticleModel` → the snapshot file `knowledge/academy/articles/<slug>.md`.
 * Pure and deterministic (no clock: `fetchedAt` comes in as an argument).
 *
 * Layout rules (the fixture test pins them):
 *   • the lead paragraph opens the body as a blockquote ("Written by" moves
 *     to the front-matter `authors`);
 *   • "Key points" becomes `## Key points` with one bullet per point;
 *   • boxes ("Box 1. …") become blockquotes with their title in bold;
 *     one-cell layout tables are unwrapped, real tables become Markdown tables;
 *   • "Figure N." captions are kept as italic text (images are not fetched);
 *   • the conflict-of-interest statement and the author bio move to the
 *     front-matter; `## References` stays in the body (the sync does not
 *     embed it — see `chunkAcademyMarkdown`).
 * Nothing is reworded. Every sentence is the CMS's own.
 */
import { createHash } from 'node:crypto';
import type { ArticleModel, IssueRef } from './sitecore';
import { htmlToBlocks, htmlWords, markdownWords, parseHtml, quote, renderInline, stripEmphasis } from './html';

export const ACADEMY_LICENSE =
  '© Royal Canin SAS. All rights reserved. Reproduced in the PBT training corpus only under ' +
  'the permission recorded in knowledge/academy/manifest.json.';

export interface SnapshotFrontMatter {
  slug: string;
  url: string;
  title: string;
  authors: string[];
  authorBio: string;
  conflictOfInterest: string;
  publicationDate: string;
  issue: string;
  issueTitle: string;
  issuePdf: string;
  species: string[];
  lifestage: string[];
  themes: string[];
  topics: string[];
  keywords: string[];
  readingTime: string;
  fetchedAt: string;
  sourceHash: string;
  contentHash: string;
  license: string;
}

export interface Snapshot {
  frontMatter: SnapshotFrontMatter;
  /** Everything below the front-matter — what the sync stores as `content`. */
  body: string;
  /** The whole file. */
  file: string;
  coverage: CoverageReport;
}

export interface CoverageReport {
  sourceWords: number;
  snapshotWords: number;
  ratio: number;
  ok: boolean;
}

export const COVERAGE_MIN = 0.95;
export const COVERAGE_MAX = 1.05;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const FIGURE = /^(?:\*\*)?(?:Figure|Fig\.)\s*\d+[a-z]?\b/i;
const BOX = /^(?:\*\*)?(?:Box|Table)\s*\d+[a-z]?\b/i;
const COI = /^(?:\*\*)?Conflicts? of interest/i;

/** "Figure 1. …\n© …" → each line in italics. */
function italicLines(block: string): string {
  return block
    .split('\n')
    .map((l) => `*${stripEmphasis(l)}*`)
    .join('\n');
}

function plain(blocks: string[]): string {
  return blocks.map((b) => stripEmphasis(b).replace(/\n+/g, ' ')).join(' ').replace(/\s+/g, ' ').trim();
}

interface Assembled {
  body: string[];
  coi: string[];
}

/** Turn body paragraphs into the snapshot's layout, pulling COI statements out. */
function place(blocks: string[], into: Assembled): void {
  for (const b of blocks) {
    if (COI.test(b)) into.coi.push(plain([b]));
    else if (FIGURE.test(b)) into.body.push(italicLines(b));
    else into.body.push(b);
  }
}

export function renderArticleBody(a: ArticleModel): { body: string; coi: string[]; authorBio: string } {
  const out: Assembled = { body: [], coi: [] };

  // Lead: the first paragraph is "Written by …" (front-matter), the rest is
  // the stand-first.
  const lead = htmlToBlocks(a.standfirstHtml);
  if (lead.length) out.body.push(quote(lead));

  for (const block of a.blocks) {
    switch (block.kind) {
      case 'rich': {
        if (block.title) out.body.push(`${'#'.repeat(Math.max(2, Math.min(4, block.headingLevel)))} ${block.title}`);
        place(htmlToBlocks(block.html), out);
        break;
      }
      case 'keypoints': {
        out.body.push(`## ${block.title}`);
        const items = htmlToBlocks(block.html);
        const lines: string[] = [];
        for (const item of items) {
          if (/^\s*(?:-|\d+\.)\s/.test(item)) lines.push(item);
          else lines.push(`- ${item.replace(/\n+/g, ' ')}`);
        }
        if (lines.length) out.body.push(lines.join('\n'));
        break;
      }
      case 'box': {
        const inner = htmlToBlocks(block.html);
        if (inner.length === 0 && !block.title) break;
        if (inner.length && COI.test(inner[0])) {
          out.coi.push(plain(inner));
          break;
        }
        const parts = [...inner];
        if (block.title) parts.unshift(`**${block.title}**`);
        else if (parts.length && BOX.test(parts[0]) && !parts[0].startsWith('**')) {
          parts[0] = `**${stripEmphasis(parts[0]).replace(/\n+/g, ' ')}**`;
        }
        out.body.push(quote(parts));
        break;
      }
      case 'quote': {
        const text = renderInline(parseHtml(block.text).children).replace(/\s+/g, ' ').trim();
        out.body.push(quote(block.author ? [text, `— ${block.author}`] : [text]));
        break;
      }
      case 'references': {
        out.body.push(`## ${block.title}`);
        out.body.push(
          block.items
            .map((html, i) => `${i + 1}. ${renderInline(parseHtml(html).children).replace(/\s+/g, ' ').trim()}`)
            .join('\n'),
        );
        break;
      }
      case 'caption': {
        const text = renderInline(parseHtml(block.text).children).replace(/\s+/g, ' ').trim();
        if (text) out.body.push(`*${stripEmphasis(text)}*`);
        break;
      }
    }
  }

  const authorBio = a.authorBlocks.map((b) => plain(htmlToBlocks(b.bioHtml))).filter(Boolean).join('\n\n');
  return { body: out.body.join('\n\n') + '\n', coi: out.coi, authorBio };
}

/** "Name — DVM, …, Affiliation" per author block; else the "Written by" names. */
export function authorsOf(a: ArticleModel): string[] {
  if (a.authorBlocks.length) {
    return a.authorBlocks
      .filter((b) => b.name)
      .map((b) => (b.subtitle ? `${b.name} — ${b.subtitle.replace(/\s+/g, ' ')}` : b.name));
  }
  return [...a.writtenBy];
}

/**
 * Coverage: words in the snapshot (body + bio + COI, the places the CMS text
 * ends up) against words in the CMS rich text read by plain tag stripping.
 */
export function coverageOf(a: ArticleModel, body: string, coi: string[], authorBio: string): CoverageReport {
  let source = htmlWords(a.standfirstHtml).length;
  for (const b of a.blocks) {
    if (b.kind === 'references') source += htmlWords(b.title).length + b.items.reduce((n, h) => n + htmlWords(h).length, 0);
    else if (b.kind === 'quote') source += htmlWords(b.text).length + htmlWords(b.author).length;
    else if (b.kind === 'caption') source += htmlWords(b.text).length;
    else source += htmlWords(b.html).length + htmlWords(b.title).length;
  }
  for (const b of a.authorBlocks) source += htmlWords(b.bioHtml).length;
  const snapshot =
    markdownWords(body).length + markdownWords(coi.join(' ')).length + markdownWords(authorBio).length;
  const ratio = source === 0 ? 0 : snapshot / source;
  return {
    sourceWords: source,
    snapshotWords: snapshot,
    ratio: Math.round(ratio * 1000) / 1000,
    ok: source > 0 && ratio >= COVERAGE_MIN && ratio <= COVERAGE_MAX,
  };
}

const FM_ORDER: Array<keyof SnapshotFrontMatter> = [
  'slug', 'url', 'title', 'authors', 'authorBio', 'conflictOfInterest', 'publicationDate',
  'issue', 'issueTitle', 'issuePdf', 'species', 'lifestage', 'themes', 'topics', 'keywords',
  'readingTime', 'fetchedAt', 'sourceHash', 'contentHash', 'license',
];

/**
 * Front-matter as `key: <JSON value>` lines — valid YAML (JSON is a YAML
 * subset) and parseable without a YAML library (`parseSnapshot`).
 */
export function renderFrontMatter(fm: SnapshotFrontMatter): string {
  return ['---', ...FM_ORDER.map((k) => `${k}: ${JSON.stringify(fm[k])}`), '---'].join('\n');
}

export function renderSnapshot(
  a: ArticleModel,
  args: { issue?: IssueRef | null; fetchedAt: string; sourceHash: string },
): Snapshot {
  const { body, coi, authorBio } = renderArticleBody(a);
  const frontMatter: SnapshotFrontMatter = {
    slug: a.slug,
    url: a.url,
    title: a.title,
    authors: authorsOf(a),
    authorBio,
    conflictOfInterest: coi.join(' '),
    publicationDate: a.publicationDate,
    issue: args.issue?.issue ?? '',
    issueTitle: args.issue?.issueTitle ?? '',
    issuePdf: args.issue?.issuePdf ?? '',
    species: a.species,
    lifestage: a.lifestage,
    themes: a.themes,
    topics: a.topics,
    keywords: a.keywords,
    readingTime: a.readingTime,
    fetchedAt: args.fetchedAt,
    sourceHash: args.sourceHash,
    contentHash: sha256(body),
    license: ACADEMY_LICENSE,
  };
  return {
    frontMatter,
    body,
    file: `${renderFrontMatter(frontMatter)}\n\n${body}`,
    coverage: coverageOf(a, body, coi, authorBio),
  };
}
