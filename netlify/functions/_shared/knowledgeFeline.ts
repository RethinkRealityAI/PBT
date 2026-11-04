/**
 * The Royal Canin feline assets as sync documents (group `feline`).
 *
 * Royal Canin Canada's Veterinary Division supplied cat-specific educational
 * assets (urinary, GI, weight, renal) for PBT. `scripts/feline/` extracts
 * each PDF / deck page by page into reviewed Markdown (text layer only, a
 * mechanical fidelity check against that layer, image-transcribed pages
 * flagged); `knowledge/feline/manifest.json` (code) holds the gate, the
 * scope and the sha256 pin of every document, and the text lives in
 * `knowledge_source_snapshots` (corpus `feline`) — never in the public repo.
 * `knowledgeExternal.ts` reads and verifies the rows.
 *
 * Scope rules (owner, 2026-11-04): feline only (`species: ['cat']`);
 * vet-facing material → scoring, coach, scenario-builder; owner-facing
 * material (brochures, owner guides) → those plus roleplay, so the AI cat
 * owner can only "know" what a real owner could have read; the US edition
 * → scoring + coach only. Never the Fecal Scan.
 */
import felineManifestJson from '../../../knowledge/feline/manifest.json';
import { chunkPagedMarkdown } from '../../../src/services/ragShared';
import { isFocusAreaKey } from '../../../src/shared/knowledge/focusAreas';
import { isKnowledgeToolKey } from '../../../src/shared/knowledge/knowledgeScopes';
import { scopeHashFor } from './knowledgeSync';
import {
  HEX64,
  SNAPSHOT_SLUG_RE,
  externalCorpusDocs,
  isGateOpen,
  metaString,
  validateGate,
  type ExternalDocsResult,
  type ExternalGate,
  type ExternalPermission,
  type PinnedEntry,
  type SnapshotReader,
  type SnapshotRow,
} from './knowledgeExternal';
import type { ResolvedDoc } from './knowledgeSyncRun';

export const FELINE_SLUG_PREFIX = 'feline:';
export const isFelineSlug = (slug: string) => slug.startsWith(FELINE_SLUG_PREFIX);

export const FELINE_ASSET_TYPES = {
  'product-guide': 'product guide',
  detailer: 'detailer',
  'sell-sheet': 'sell sheet',
  brochure: 'owner brochure',
  'owner-guide': 'pet owner guide',
  'technical-bulletin': 'technical bulletin',
  'consult-pearl': 'consult pearl',
  'clinical-trial-summary': 'clinical trial summary',
  'clinical-tips': 'clinical tips',
  presentation: 'lunch-and-learn presentation',
  'training-game': 'training game',
  'product-insert': 'product insert',
} as const;
export type FelineAssetType = keyof typeof FELINE_ASSET_TYPES;

export type FelineAudience = 'vet' | 'owner';
export type FelineRegion = 'CA' | 'US';

/** The tools each audience may feed (decision 2026-11-04). */
export const VET_TOOLS = ['scoring', 'coach', 'scenario-builder'] as const;
export const OWNER_TOOLS = ['roleplay', 'scoring', 'coach', 'scenario-builder'] as const;
export const US_EDITION_TOOLS = ['scoring', 'coach'] as const;

export function expectedFelineTools(audience: FelineAudience, region: FelineRegion): readonly string[] {
  if (region === 'US') return US_EDITION_TOOLS;
  return audience === 'owner' ? OWNER_TOOLS : VET_TOOLS;
}

/** A fidelity-check finding a human must clear before the document is approved. */
export interface FelineReviewNote {
  page: number;
  /** The value / product name that is not in the page's text layer. */
  token: string;
  status: 'open' | 'signed-off';
  note?: string;
}

export interface FelineManifestDocument extends PinnedEntry {
  /** Short asset title (the file's own name for itself). */
  title: string;
  /** The Box file id of the source (the share link lives in the DB only). */
  sourceId: string;
  assetType: FelineAssetType;
  edition: string;
  region: FelineRegion;
  audience: FelineAudience;
  focus: string | null;
  species: string[];
  tools: string[];
  /** Source pages (or slides) kept in the snapshot. */
  pages: number[];
  /** Pages left out, with why (canine-only, cover, order form, …). */
  pagesExcluded: Array<{ pages: number[]; reason: string }>;
  /** Pages transcribed from the page image (no usable text layer). */
  transcribedPages: number[];
  reviewNotes: FelineReviewNote[];
  reason: string;
  reviewedBy: string;
  reviewedAt: string;
}

export interface FelineManifest extends ExternalGate {
  corpus: 'feline';
  documents: FelineManifestDocument[];
  /** Source files not imported at all, with why. */
  excluded: Array<{ sourceId: string; title: string; reason: string }>;
}

export function validateFelineManifest(raw: unknown): FelineManifest {
  const m = validateGate(raw, 'feline') as FelineManifest;
  if (m.corpus !== 'feline') throw new Error('feline manifest.corpus must be "feline"');
  if (!Array.isArray(m.documents)) throw new Error('feline manifest.documents must be an array');
  if (!Array.isArray(m.excluded)) throw new Error('feline manifest.excluded must be an array');
  const seen = new Set<string>();
  for (const d of m.documents) {
    if (!SNAPSHOT_SLUG_RE.test(d.slug ?? '')) throw new Error(`bad feline slug: ${String(d.slug)}`);
    if (seen.has(d.slug)) throw new Error(`duplicate feline slug ${d.slug}`);
    seen.add(d.slug);
    if (!/^\d+$/.test(d.sourceId ?? '')) throw new Error(`${d.slug}: sourceId must be a Box file id`);
    if (!(d.assetType in FELINE_ASSET_TYPES)) throw new Error(`${d.slug}: unknown assetType ${d.assetType}`);
    if (d.region !== 'CA' && d.region !== 'US') throw new Error(`${d.slug}: region must be CA or US`);
    if (d.audience !== 'vet' && d.audience !== 'owner') throw new Error(`${d.slug}: audience must be vet or owner`);
    if (d.focus !== null && !isFocusAreaKey(d.focus)) throw new Error(`${d.slug}: unknown focus ${d.focus}`);
    if (!Array.isArray(d.species) || d.species.length !== 1 || d.species[0] !== 'cat') {
      throw new Error(`${d.slug}: the feline corpus is cat-only (species ["cat"])`);
    }
    if (!Array.isArray(d.tools) || !d.tools.every(isKnowledgeToolKey)) throw new Error(`${d.slug}: bad tools`);
    const expected = expectedFelineTools(d.audience, d.region);
    if (d.tools.length !== expected.length || !expected.every((t) => d.tools.includes(t))) {
      throw new Error(`${d.slug}: tools must be exactly ${expected.join(', ')} for a ${d.region} ${d.audience}-facing asset`);
    }
    if (d.contentHash !== undefined && !HEX64.test(d.contentHash)) throw new Error(`${d.slug}: bad contentHash`);
    if (d.sourceHash !== undefined && !HEX64.test(d.sourceHash)) throw new Error(`${d.slug}: bad sourceHash`);
    if (!Array.isArray(d.reviewNotes)) throw new Error(`${d.slug}: reviewNotes must be an array`);
    if (d.approved && d.reviewNotes.some((n) => n.status !== 'signed-off')) {
      throw new Error(`${d.slug}: cannot be approved with open fidelity review notes`);
    }
  }
  return m;
}

/** The manifest bundled with this code (a static import — no included_files). */
export function bundledFelineManifest(): FelineManifest {
  return validateFelineManifest(felineManifestJson);
}

export function isFelinePublished(m: Pick<FelineManifest, 'permission' | 'publish'> | null): boolean {
  return isGateOpen(m);
}

/**
 * "Royal Canin Canada. Feline urinary detailer (detailer, 2026)." — the page
 * is appended per chunk ("— p. 4"). The US edition says so.
 */
export function felineCitation(d: Pick<FelineManifestDocument, 'title' | 'assetType' | 'edition' | 'region'>): string {
  const publisher = d.region === 'US' ? 'Royal Canin USA' : 'Royal Canin Canada';
  const bits = [FELINE_ASSET_TYPES[d.assetType], d.edition, d.region === 'US' ? 'US edition' : '']
    .filter(Boolean)
    .join(', ');
  return `${publisher}. ${d.title.replace(/[.]\s*$/, '')} (${bits}).`;
}

/** A verified snapshot row → the sync document. */
export function felineDocFromRow(
  d: FelineManifestDocument,
  row: SnapshotRow,
  permission: ExternalPermission,
): ResolvedDoc {
  const tagDefaults: Record<string, unknown> = {
    ...(d.focus ? { focus: d.focus } : {}),
    tools: [...d.tools],
    species: [...d.species],
    origin: 'feline',
    region: d.region,
    audience: d.audience,
  };
  const units = chunkPagedMarkdown(d.title, row.content);
  return {
    slug: `${FELINE_SLUG_PREFIX}${d.slug}`,
    group: 'feline',
    title: d.title,
    category: 'clinical',
    content: row.content,
    contentHash: d.contentHash!,
    sourceHash: d.sourceHash ?? row.source_hash ?? undefined,
    scopeHash: scopeHashFor(tagDefaults),
    baseMetadata: {
      source: {
        kind: 'royal-canin-asset',
        corpus: 'feline',
        assetType: d.assetType,
        edition: d.edition,
        region: d.region,
        audience: d.audience,
        boxFileId: d.sourceId,
        // The share link is admin-only provenance: it comes from the
        // service-role table, never from git.
        sourceUrl: metaString(row.meta, 'sourceUrl'),
        sha256: d.sourceHash ?? row.source_hash ?? '',
        pages: d.pages,
        pagesExcluded: d.pagesExcluded,
        transcribedPages: d.transcribedPages,
        permission: permission.reference,
      },
    },
    chunkTagBase: {},
    tagDefaults,
    citationDefault: felineCitation(d),
    chunks: units.map((u) => u.content),
    chunkSections: units.map((u) => u.section),
    chunkPages: units.map((u) => u.pages ?? []),
  };
}

export function felineDocs(manifest: FelineManifest | null, read: SnapshotReader | null): Promise<ExternalDocsResult> {
  return externalCorpusDocs({
    corpus: 'feline',
    gate: manifest,
    entries: manifest?.documents ?? [],
    read,
    build: (d, row) => felineDocFromRow(d, row, manifest!.permission),
  });
}
