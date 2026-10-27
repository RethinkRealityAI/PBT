/**
 * The Royal Canin Academy corpus as sync documents (group `academy`).
 *
 * The articles are CODE: `knowledge/academy/manifest.json` (the curated set
 * and the publish gate) plus one verbatim snapshot per approved article in
 * `knowledge/academy/articles/<slug>.md`, produced by `scripts/academy/` and
 * reviewed in a PR. This module turns them into `ResolvedDoc`s for
 * `runKnowledgeSync`, exactly as the study PDFs are injected: the CLI reads
 * them from the working tree, `knowledge-sync-background` from its bundle
 * (`included_files` in netlify.toml). Nothing here touches the network.
 *
 * ── Publish gate ───────────────────────────────────────────────────────────
 * The articles are © Royal Canin SAS. Reproducing them in a retrieval corpus
 * needs Royal Canin's written permission, so the group yields documents ONLY
 * when `permission.status === 'granted'` AND `publish === true`. Otherwise it
 * contributes nothing and owns nothing — rows already stored (if any) are
 * left exactly as they are, never retired. An unreadable manifest or a
 * missing snapshot is treated the same way (skip with a warning): a broken
 * bundle must never look like "the code removed these articles".
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chunkSectionedMarkdown } from '../../../src/services/ragShared';
import { isFocusAreaKey } from '../../../src/shared/knowledge/focusAreas';
import {
  isKnowledgeSpeciesKey,
  isKnowledgeToolKey,
} from '../../../src/shared/knowledge/knowledgeScopes';
import { scopeHashFor, sha256Hex } from './knowledgeSync';
import type { ResolvedDoc } from './knowledgeSyncRun';

export const ACADEMY_SLUG_PREFIX = 'academy:';
export const ACADEMY_DIR = 'knowledge/academy';

export const isAcademySlug = (slug: string) => slug.startsWith(ACADEMY_SLUG_PREFIX);

export interface AcademyPermission {
  status: 'pending' | 'granted';
  reference: string;
  grantedBy: string;
  date: string;
}

export interface AcademyManifestArticle {
  slug: string;
  approved: boolean;
  focus: string | null;
  species: string[];
  tools: string[];
  reason: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface AcademyManifest {
  permission: AcademyPermission;
  publish: boolean;
  fetcher?: { userAgent: string; minDelayMs: number };
  articles: AcademyManifestArticle[];
}

/** What the sync is handed: the manifest, and a lazy snapshot reader. */
export interface AcademyBundle {
  manifest: AcademyManifest;
  /** The snapshot file text for a site slug, or null when unreadable. */
  readSnapshot: (slug: string) => Promise<string | null>;
}

export interface AcademyFrontMatter {
  slug: string;
  url: string;
  title: string;
  authors: string[];
  publicationDate: string;
  issue: string;
  issueTitle: string;
  fetchedAt: string;
  sourceHash: string;
  contentHash: string;
  license: string;
  [key: string]: unknown;
}

/** Is the group allowed to write? The two-field switch, nothing else. */
export function isAcademyPublished(manifest: Pick<AcademyManifest, 'permission' | 'publish'> | null): boolean {
  return manifest?.permission?.status === 'granted' && manifest?.publish === true;
}

/**
 * Split a snapshot into front-matter and body. The front-matter is our own
 * `key: <JSON>` lines (valid YAML, no YAML parser needed); the body is
 * everything after the closing `---` and the blank line that follows it.
 */
export function parseSnapshot(text: string): { frontMatter: AcademyFrontMatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n\n?/.exec(text);
  if (!m) throw new Error('snapshot has no front-matter');
  const fm: Record<string, unknown> = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z][A-Za-z0-9]*): (.*)$/.exec(line);
    if (!kv) throw new Error(`bad front-matter line: ${line.slice(0, 60)}`);
    fm[kv[1]] = JSON.parse(kv[2]);
  }
  return { frontMatter: fm as AcademyFrontMatter, body: text.slice(m[0].length) };
}

/** "Kirsten M. Graham — DVM, …" → "Graham KM". */
export function citationName(author: string): string {
  const name = author.split(' — ')[0].replace(/,.*$/, '').replace(/^(Dr\.?|Prof\.?)\s+/i, '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  const surname = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => p.replace(/[^\p{L}-]/gu, ''))
    .filter(Boolean)
    .map((p) => p.split('-').map((h) => h[0]?.toUpperCase() ?? '').join(''))
    .join('');
  return initials ? `${surname} ${initials}` : surname;
}

/**
 * "Graham KM. How I approach... Pet obesity. Vet Focus 36.1 (Royal Canin
 * Academy), 2026. https://…" — names the article, its authors, its issue, its
 * year and its URL, so any passage can be traced back to the page.
 */
export function academyCitation(fm: Pick<AcademyFrontMatter, 'authors' | 'title' | 'issue' | 'publicationDate' | 'url'>): string {
  const names = (fm.authors ?? []).map(citationName).filter(Boolean);
  const who = names.length > 3 ? `${names.slice(0, 3).join(', ')}, et al` : names.join(', ');
  const year = /^\d{4}/.test(fm.publicationDate ?? '') ? fm.publicationDate.slice(0, 4) : '';
  const venue = fm.issue ? `Vet Focus ${fm.issue} (Royal Canin Academy)` : 'Royal Canin Academy';
  const title = fm.title.replace(/\s+$/, '').replace(/[.]$/, '');
  return [who ? `${who}.` : '', `${title}.`, `${venue}${year ? `, ${year}` : ''}.`, fm.url]
    .filter(Boolean)
    .join(' ');
}

/** Structural checks the sync relies on (the unit test checks much more). */
export function validateManifest(raw: unknown): AcademyManifest {
  const m = raw as AcademyManifest;
  if (!m || typeof m !== 'object') throw new Error('manifest is not an object');
  if (!m.permission || !['pending', 'granted'].includes(m.permission.status)) {
    throw new Error('manifest.permission.status must be "pending" or "granted"');
  }
  if (typeof m.publish !== 'boolean') throw new Error('manifest.publish must be a boolean');
  if (!Array.isArray(m.articles)) throw new Error('manifest.articles must be an array');
  for (const a of m.articles) {
    if (!/^[a-z0-9-]+$/.test(a.slug ?? '')) throw new Error(`bad article slug: ${String(a.slug)}`);
    if (a.focus !== null && !isFocusAreaKey(a.focus)) throw new Error(`${a.slug}: unknown focus ${a.focus}`);
    if (!Array.isArray(a.species) || a.species.length === 0 || !a.species.every(isKnowledgeSpeciesKey)) {
      throw new Error(`${a.slug}: species must be a non-empty list of knowledge species`);
    }
    if (!Array.isArray(a.tools) || a.tools.length === 0 || !a.tools.every(isKnowledgeToolKey)) {
      throw new Error(`${a.slug}: tools must be a non-empty list of knowledge tools`);
    }
    if (a.tools.includes('fecal-scan')) throw new Error(`${a.slug}: the Fecal Scan never reads Academy articles`);
  }
  return m;
}

/** Read the bundle from the first root that has a manifest; null if none. */
export async function readAcademyBundleFromDisk(roots: readonly string[]): Promise<AcademyBundle | null> {
  for (const root of roots) {
    let text: string;
    try {
      text = await readFile(join(root, ACADEMY_DIR, 'manifest.json'), 'utf8');
    } catch {
      continue;
    }
    const manifest = validateManifest(JSON.parse(text));
    return {
      manifest,
      readSnapshot: async (slug) => {
        try {
          return await readFile(join(root, ACADEMY_DIR, 'articles', `${slug}.md`), 'utf8');
        } catch {
          return null;
        }
      },
    };
  }
  return null;
}

export interface AcademyDocsResult {
  /** True only when the gate is open AND every approved snapshot was read. */
  published: boolean;
  docs: ResolvedDoc[];
  /** One line for the run log — loud when nothing will be written. */
  status: string;
}

/** The approved, published articles as sync documents. */
export async function academyDocs(bundle: AcademyBundle | null): Promise<AcademyDocsResult> {
  if (!bundle) {
    return {
      published: false,
      docs: [],
      status: 'academy: SKIPPED — knowledge/academy/manifest.json is not readable here; stored articles untouched',
    };
  }
  const { manifest } = bundle;
  const approved = manifest.articles.filter((a) => a.approved);
  if (!isAcademyPublished(manifest)) {
    return {
      published: false,
      docs: [],
      status:
        `academy: NOT PUBLISHED — permission ${manifest.permission.status}, publish=${manifest.publish}; ` +
        `${approved.length} approved article(s) ready, nothing written, nothing retired`,
    };
  }

  const docs: ResolvedDoc[] = [];
  for (const article of approved) {
    const text = await bundle.readSnapshot(article.slug);
    if (text === null) {
      return {
        published: false,
        docs: [],
        status: `academy: SKIPPED — snapshot for ${article.slug} is missing; stored articles untouched`,
      };
    }
    const { frontMatter: fm, body } = parseSnapshot(text);
    const contentHash = sha256Hex(body);
    if (fm.contentHash !== contentHash) {
      return {
        published: false,
        docs: [],
        status: `academy: SKIPPED — ${article.slug} was edited by hand (contentHash mismatch); stored articles untouched`,
      };
    }
    const tagDefaults: Record<string, unknown> = {
      ...(article.focus ? { focus: article.focus } : {}),
      tools: [...article.tools],
      species: [...article.species],
      origin: 'academy',
    };
    const units = chunkSectionedMarkdown(fm.title, body);
    docs.push({
      slug: `${ACADEMY_SLUG_PREFIX}${article.slug}`,
      group: 'academy',
      title: fm.title,
      category: 'clinical',
      content: body,
      contentHash,
      sourceHash: fm.sourceHash,
      scopeHash: scopeHashFor(tagDefaults),
      baseMetadata: {
        source: {
          kind: 'academy',
          url: fm.url,
          publicationDate: fm.publicationDate,
          issue: fm.issue,
          issueTitle: fm.issueTitle,
          authors: fm.authors,
          fetchedAt: fm.fetchedAt,
          sourceHash: fm.sourceHash,
          license: fm.license,
          permission: manifest.permission.reference,
        },
      },
      // The provenance block lives on the document; chunks carry only the
      // tags retrieval filters on (plus their section).
      chunkTagBase: {},
      tagDefaults,
      citationDefault: academyCitation(fm),
      chunks: units.map((u) => u.content),
      chunkSections: units.map((u) => u.section),
    });
  }
  return {
    published: true,
    docs,
    status: `academy: published — ${docs.length} approved article(s)`,
  };
}
