/**
 * The Royal Canin Academy corpus as sync documents (group `academy`).
 *
 * `knowledge/academy/manifest.json` (code, reviewed in PRs) is the curated
 * set, the publish gate and the sha256 pin of every approved article. The
 * article text — verbatim Markdown made by `scripts/academy/` from the CMS
 * JSON — lives in `knowledge_source_snapshots` (corpus `academy`), never in
 * the public repo. `knowledgeExternal.ts` reads and verifies the rows; this
 * module only knows how an Academy article becomes a document: citation,
 * provenance, tags and section-aware chunks.
 *
 * ── Publish gate ───────────────────────────────────────────────────────────
 * The articles are © Royal Canin SAS. The group yields documents ONLY when
 * `permission.status === 'granted'` AND `publish === true`; otherwise it
 * contributes nothing and owns nothing (see knowledgeExternal.ts).
 */
import academyManifestJson from '../../../knowledge/academy/manifest.json';
import { chunkSectionedMarkdown } from '../../../src/services/ragShared';
import { isFocusAreaKey } from '../../../src/shared/knowledge/focusAreas';
import {
  isKnowledgeSpeciesKey,
  isKnowledgeToolKey,
} from '../../../src/shared/knowledge/knowledgeScopes';
import { scopeHashFor } from './knowledgeSync';
import {
  HEX64,
  externalCorpusDocs,
  isGateOpen,
  metaString,
  metaStrings,
  validateGate,
  type ExternalDocsResult,
  type ExternalGate,
  type ExternalPermission,
  type PinnedEntry,
  type SnapshotReader,
  type SnapshotRow,
} from './knowledgeExternal';
import type { ResolvedDoc } from './knowledgeSyncRun';

export const ACADEMY_SLUG_PREFIX = 'academy:';
export const isAcademySlug = (slug: string) => slug.startsWith(ACADEMY_SLUG_PREFIX);

export type AcademyPermission = ExternalPermission;

export interface AcademyManifestArticle extends PinnedEntry {
  focus: string | null;
  species: string[];
  tools: string[];
  reason: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface AcademyManifest extends ExternalGate {
  fetcher?: { userAgent: string; minDelayMs: number };
  articles: AcademyManifestArticle[];
}

/** Is the group allowed to write? The two-field switch, nothing else. */
export function isAcademyPublished(manifest: Pick<AcademyManifest, 'permission' | 'publish'> | null): boolean {
  return isGateOpen(manifest);
}

/** "Alex Q. Example — DVM, …" → "Example AQ". */
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
 * "Example AQ. How I approach... Pet obesity. Vet Focus 36.1 (Royal Canin
 * Academy), 2026. https://…" — names the article, its authors, its issue, its
 * year and its URL, so any passage can be traced back to the page.
 */
export function academyCitation(fm: {
  authors: string[];
  title: string;
  issue: string;
  publicationDate: string;
  url: string;
}): string {
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
  const m = validateGate(raw, 'academy') as AcademyManifest;
  if (!Array.isArray(m.articles)) throw new Error('manifest.articles must be an array');
  for (const a of m.articles) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(a.slug ?? '')) throw new Error(`bad article slug: ${String(a.slug)}`);
    if (a.focus !== null && !isFocusAreaKey(a.focus)) throw new Error(`${a.slug}: unknown focus ${a.focus}`);
    if (!Array.isArray(a.species) || a.species.length === 0 || !a.species.every(isKnowledgeSpeciesKey)) {
      throw new Error(`${a.slug}: species must be a non-empty list of knowledge species`);
    }
    if (!Array.isArray(a.tools) || a.tools.length === 0 || !a.tools.every(isKnowledgeToolKey)) {
      throw new Error(`${a.slug}: tools must be a non-empty list of knowledge tools`);
    }
    if (a.tools.includes('fecal-scan')) throw new Error(`${a.slug}: the Fecal Scan never reads Academy articles`);
    if (a.contentHash !== undefined && !HEX64.test(a.contentHash)) throw new Error(`${a.slug}: bad contentHash`);
    if (a.sourceHash !== undefined && !HEX64.test(a.sourceHash)) throw new Error(`${a.slug}: bad sourceHash`);
  }
  return m;
}

/** The manifest bundled with this code (a static import — no included_files). */
export function bundledAcademyManifest(): AcademyManifest {
  return validateManifest(academyManifestJson);
}

/** A verified snapshot row → the sync document. */
export function academyDocFromRow(
  article: AcademyManifestArticle,
  row: SnapshotRow,
  permission: AcademyPermission,
): ResolvedDoc {
  const meta = row.meta;
  const title = metaString(meta, 'title').trim();
  const url = metaString(meta, 'url');
  if (!title) throw new Error('snapshot meta has no title');
  const tagDefaults: Record<string, unknown> = {
    ...(article.focus ? { focus: article.focus } : {}),
    tools: [...article.tools],
    species: [...article.species],
    origin: 'academy',
  };
  const units = chunkSectionedMarkdown(title, row.content);
  const fm = {
    authors: metaStrings(meta, 'authors'),
    title,
    issue: metaString(meta, 'issue'),
    publicationDate: metaString(meta, 'publicationDate'),
    url,
  };
  return {
    slug: `${ACADEMY_SLUG_PREFIX}${article.slug}`,
    group: 'academy',
    title,
    category: 'clinical',
    content: row.content,
    contentHash: article.contentHash!,
    sourceHash: article.sourceHash ?? row.source_hash ?? undefined,
    scopeHash: scopeHashFor(tagDefaults),
    baseMetadata: {
      source: {
        kind: 'academy',
        url,
        publicationDate: fm.publicationDate,
        issue: fm.issue,
        issueTitle: metaString(meta, 'issueTitle'),
        authors: fm.authors,
        fetchedAt: metaString(meta, 'fetchedAt'),
        sourceHash: article.sourceHash ?? row.source_hash ?? '',
        license: metaString(meta, 'license'),
        permission: permission.reference,
      },
    },
    // The provenance block lives on the document; chunks carry only the
    // tags retrieval filters on (plus their section).
    chunkTagBase: {},
    tagDefaults,
    citationDefault: academyCitation(fm),
    chunks: units.map((u) => u.content),
    chunkSections: units.map((u) => u.section),
  };
}

/** The approved, published articles as sync documents (or a loud skip). */
export function academyDocs(
  manifest: AcademyManifest | null,
  read: SnapshotReader | null,
): Promise<ExternalDocsResult> {
  return externalCorpusDocs({
    corpus: 'academy',
    gate: manifest,
    entries: manifest?.articles ?? [],
    read,
    build: (article, row) => academyDocFromRow(article, row, manifest!.permission),
  });
}
