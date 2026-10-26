// @vitest-environment node
/**
 * The Academy text path is "CMS JSON → deterministic Markdown", with no model
 * anywhere. These tests pin it byte for byte on two real articles (a current
 * layout and an older one), and pin the converter rules that keep the text
 * verbatim.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIXTURES, expectedPath, loadRoute, renderFixture } from './fixtureRender';
import { decodeEntities, htmlToBlocks, htmlWords, markdownWords, unknownEntities } from '../html';
import {
  articleSlugsFromSitemap,
  assertAllowed,
  parseSitemap,
} from '../fetch';
import { canonicalJson, parseArticle, parseIssueMap, parseWrittenBy, sourceHashOf, splitLead } from '../sitecore';
import { COVERAGE_MAX, COVERAGE_MIN } from '../toMarkdown';
import { parseSnapshot } from '../../../netlify/functions/_shared/knowledgeAcademy';
import { sha256Hex } from '../../../netlify/functions/_shared/knowledgeSync';

describe('fixture articles → snapshot (byte-compared)', () => {
  for (const { slug, issue } of FIXTURES) {
    it(`${slug} renders exactly the reviewed snapshot`, () => {
      const snap = renderFixture(slug, issue);
      expect(snap.file).toBe(readFileSync(expectedPath(slug), 'utf8'));
    });

    it(`${slug} keeps every word of the CMS text (coverage check)`, () => {
      const { coverage } = renderFixture(slug, issue);
      expect(coverage.ok).toBe(true);
      expect(coverage.ratio).toBeGreaterThanOrEqual(COVERAGE_MIN);
      expect(coverage.ratio).toBeLessThanOrEqual(COVERAGE_MAX);
    });

    it(`${slug}: contentHash is the sha256 of the body the sync stores`, () => {
      const snap = renderFixture(slug, issue);
      const parsed = parseSnapshot(snap.file);
      expect(parsed.body).toBe(snap.body);
      expect(parsed.frontMatter.contentHash).toBe(sha256Hex(parsed.body));
    });
  }

  it('moves the byline, author bio and conflict-of-interest statement out of the body', () => {
    const snap = renderFixture('how-i-approach-pet-obesity', FIXTURES[0].issue);
    expect(snap.frontMatter.authors).toEqual([
      'Kirsten M. Graham — DVM, MSc, BScH, Graham Mobile Veterinary Weight Management Services, Ontario, Canada',
    ]);
    expect(snap.frontMatter.authorBio).toMatch(/^Dr\. Graham is a Canadian general practitioner/);
    expect(snap.frontMatter.conflictOfInterest).toMatch(/^Conflict of interest statement:/);
    expect(snap.body).not.toMatch(/Written by|Conflict of interest|Dr\. Graham is a Canadian/);
    expect(snap.body).toContain('## References\n\n1. Montoya M, Péron F');
    expect(snap.body).toContain('> **Box 1. Gamifying BCS assessment.**');
    expect(snap.body).toContain('*Figure 1. Involving the client in the BCS assessment');
  });

  it('reads the older layout: styled headings, captioned tables, Sources, <h4> author box', () => {
    const snap = renderFixture('canine-atopic-dermatitis-and-the-owner', null);
    expect(snap.body).toContain('\n## Introduction\n');
    expect(snap.body).toContain('> **Table 1. Seven common mistakes when dealing with chronic skin conditions [3].**');
    expect(snap.body).toContain('> - Not controlling flare-ups\n> - Not taking client expectations into account');
    expect(snap.body).toContain('## References\n\n1. Spitznagel MB');
    // Citation tooltips are not prose: "[<strong title='Ackerman L. …'>3</strong>]" → "[3]".
    expect(snap.body).toContain('(Table 1) [3].');
    expect(snap.frontMatter.authors).toEqual(['Pascal Prélaud — DVM, Dip. ECVD']);
    expect(snap.body).not.toContain('Toulouse Vet School');
  });

  it('the source fingerprint ignores site-wide settings but sees article edits', () => {
    const route = loadRoute('how-i-approach-pet-obesity');
    const base = sourceHashOf(route);
    const withSettings = JSON.parse(JSON.stringify(route));
    withSettings.fields.SitemapUpdated = { value: '2030-01-01T00:00:00Z' };
    expect(sourceHashOf(withSettings)).toBe(base);
    const edited = JSON.parse(JSON.stringify(route));
    edited.fields.Title = { value: 'Changed' };
    expect(sourceHashOf(edited)).not.toBe(base);
  });

  it('parses the article model from the route', () => {
    const a = parseArticle(loadRoute('how-i-approach-pet-obesity'), 'how-i-approach-pet-obesity', 'u');
    expect(a.publicationDate).toBe('2026-08-10');
    expect(a.species).toEqual(['Cat', 'Dog']);
    expect(a.themes).toEqual(['Overweight / Obesity', 'Healthy Weight']);
    expect(a.writtenBy).toEqual(['Kirsten M. Graham']);
    expect(a.unknownComponents).toEqual([]);
  });
});

describe('html converter rules', () => {
  it('decodes named and numeric entities, and records the ones it cannot', () => {
    expect(decodeEntities('&ldquo;caf&eacute;&rdquo; &ndash; 5&nbsp;kg &#8805; &#x2264;')).toBe('“café” – 5 kg ≥ ≤');
    expect(decodeEntities('&notanentity;')).toBe('&notanentity;');
    expect(unknownEntities.has('notanentity')).toBe(true);
  });

  it('drops SVG icons and image alt text, keeps the words', () => {
    expect(htmlToBlocks('<p><svg><text>1</text></svg></p><p>Real text <img alt="no"/></p>')).toEqual(['Real text']);
  });

  it('keeps an attribute containing ">" inside the tag', () => {
    expect(htmlToBlocks('<p>A [<strong title="P > 0.05">3</strong>] B</p>')).toEqual(['A [3] B']);
  });

  it('unwraps one-cell layout tables and renders real tables as Markdown', () => {
    expect(htmlToBlocks('<table><tr><td><p>Inside</p></td></tr></table>')).toEqual(['Inside']);
    expect(htmlToBlocks('<table><tr><th>A</th><th>B</th></tr><tr><td>1 | 2</td><td>3</td></tr></table>')).toEqual([
      '| A | B |\n| --- | --- |\n| 1 \\| 2 | 3 |',
    ]);
  });

  it('turns a big styled span paragraph into a heading', () => {
    expect(htmlToBlocks('<p><span style="font-size: 1.875rem; color: #e2001a;">Introduction</span></p>')).toEqual([
      '## Introduction',
    ]);
    expect(htmlToBlocks('<p><span style="font-size: 0.9rem">small</span></p>')).toEqual(['small']);
  });

  it('renders lists, nested lists and emphasis with whitespace outside the markers', () => {
    expect(htmlToBlocks('<ul><li>One<strong> (Photo)</strong></li><li>Two<ol><li>a</li></ol></li></ul>')).toEqual([
      '- One **(Photo)**\n- Two\n  1. a',
    ]);
  });

  it('counts words the same way on both sides of the coverage check', () => {
    expect(htmlWords('<p>3.</p><p>Hello <em>world</em>&nbsp;– ok</p>')).toEqual(['Hello', 'world', 'ok']);
    expect(markdownWords('## Head\n\n> - **Hello** *world* – ok\n1. item')).toEqual(['Head', 'Hello', 'world', 'ok', 'item']);
  });
});

describe('sitecore helpers', () => {
  it('splits the byline from the stand-first in both lead layouts', () => {
    expect(splitLead('<p>Written by <a href="#author"><em>A B</em></a> </p>\n<p>Lead.</p>').standfirst.trim()).toBe(
      '<p>Lead.</p>',
    );
    expect(splitLead('<em>Written by <a href="#first">C D</a></em>\n<p>Lead.</p>').byline).toBe('Written by C D');
    expect(parseWrittenBy('<em>Written by <a>Marion Sarteel</a> and <a>Geoffrey Daniel</a></em><p>x</p>')).toEqual([
      'Marion Sarteel',
      'Geoffrey Daniel',
    ]);
  });

  it('maps magazine issue blocks to their articles', () => {
    const block = (title: string, content: string, href = '') => ({
      componentName: 'ContentBlocksVariant',
      fields: { Title: { value: title }, Content: { value: content }, Button1: { value: { href } } },
    });
    const route = {
      placeholders: {
        'jss-main': [
          block('Vet Focus', '<a href="/en/veterinary/not-an-issue">x</a>'),
          block('36.1 Beyond body condition', '', 'https://cdn/36-1.pdf'),
          block('', '<a href="/en/veterinary/how-i-approach-pet-obesity">x</a>'),
          block('26.S Nurse special edition', '<a href="/en/veterinary/how-i-approach-pet-obesity">dup</a>'),
        ],
      },
    };
    const map = parseIssueMap(route);
    expect(map.get('how-i-approach-pet-obesity')).toEqual({
      issue: '36.1',
      issueTitle: 'Beyond body condition',
      issuePdf: 'https://cdn/36-1.pdf',
    });
    expect(map.has('not-an-issue')).toBe(false);
  });

  it('canonical JSON sorts keys and drops volatile ones', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }], siteSettings: { x: 1 } })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
  });
});

describe('fetcher policy', () => {
  it('refuses robots-disallowed and off-site URLs', () => {
    expect(() => assertAllowed('https://academy.royalcanin.com/en/api/search')).toThrow(/robots/);
    expect(() => assertAllowed('https://academy.royalcanin.com/api/x')).toThrow(/robots/);
    expect(() => assertAllowed('https://academy.royalcanin.com/en/x/api/y')).toThrow(/robots/);
    expect(() => assertAllowed('https://example.com/en/veterinary/x')).toThrow(/off-site/);
    expect(assertAllowed('https://academy.royalcanin.com/en/veterinary/x').pathname).toBe('/en/veterinary/x');
  });

  it('reads article slugs from the sitemap', () => {
    const xml =
      '<urlset><url><loc>https://academy.royalcanin.com/en/veterinary/a-b</loc></url>' +
      '<url><loc>https://academy.royalcanin.com/en/veterinary</loc></url>' +
      '<url><loc>https://academy.royalcanin.com/en/veterinary/a-b</loc></url></urlset>';
    expect(parseSitemap(xml)).toHaveLength(3);
    expect(articleSlugsFromSitemap(xml)).toEqual(['a-b']);
  });
});
