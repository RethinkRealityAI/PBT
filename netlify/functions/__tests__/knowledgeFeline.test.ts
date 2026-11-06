// @vitest-environment node
/**
 * The Royal Canin feline assets (group `feline`). Same gate + pin engine as
 * the Academy (knowledgeExternal.ts); what is specific here: the corpus is
 * cat-only, the tools follow the audience (owner-facing material is the only
 * thing the AI cat owner may "know"), the US edition feeds the scorer and
 * coach only, a document with open fidelity notes cannot be approved, and
 * chunks are page-aware ("(p. N)" header, "— p. N" citation, `pages` tag).
 * All text below is SYNTHETIC — the repository is public.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ embedTexts: vi.fn() }));
vi.mock('../_shared/gemini', () => ({ embedTexts: mocks.embedTexts }));

import {
  bundledFelineManifest,
  expectedFelineTools,
  felineCitation,
  felineDocs,
  isFelinePublished,
  validateFelineManifest,
  type FelineManifest,
  type FelineManifestDocument,
} from '../_shared/knowledgeFeline';
import type { SnapshotReader, SnapshotRow } from '../_shared/knowledgeExternal';
import { groupOfSlug, runKnowledgeSync } from '../_shared/knowledgeSyncRun';
import { CODE_SEED, SYNC_VERSION, sha256Hex } from '../_shared/knowledgeSync';

const BODY = [
  '<!-- page 2 -->',
  '',
  '## Invented heading',
  '',
  'Placeholder prose on page two about a made-up diet.',
  '',
  '- Made-up product dry — Protein: 1.0 g [/1000 kcal]; Fat: 2.0 g [/1000 kcal].',
  '',
  '<!-- page 3 -->',
  '',
  'The invented section continues on page three.',
  '',
  '<!-- page 9 -->',
  '',
  '## References',
  '',
  '- Doe J. An imaginary paper. 2020.',
  '',
].join('\n');

function doc(over: Partial<FelineManifestDocument> = {}): FelineManifestDocument {
  return {
    slug: 'synthetic-detailer',
    approved: true,
    title: 'Synthetic urinary detailer',
    sourceId: '1234567890',
    assetType: 'detailer',
    edition: '2026',
    region: 'CA',
    audience: 'vet',
    focus: 'urinary',
    species: ['cat'],
    tools: ['scoring', 'coach', 'scenario-builder'],
    pages: [2, 3, 9],
    pagesExcluded: [{ pages: [1], reason: 'cover' }],
    transcribedPages: [],
    reviewNotes: [],
    reason: 'test',
    reviewedBy: 'test',
    reviewedAt: '2026-11-04',
    contentHash: sha256Hex(BODY),
    sourceHash: 'a'.repeat(64),
    ...over,
  };
}

function manifest(over: Partial<FelineManifest> = {}, docs = [doc()]): FelineManifest {
  return {
    corpus: 'feline',
    permission: { status: 'granted', reference: 'RC-CA-TEST', grantedBy: 'Royal Canin Canada', date: '2026-11-02' },
    publish: false,
    documents: docs,
    excluded: [],
    ...over,
  };
}

const ROW: SnapshotRow = {
  corpus: 'feline',
  slug: 'synthetic-detailer',
  content: BODY,
  content_hash: sha256Hex(BODY),
  source_hash: 'a'.repeat(64),
  meta: { title: 'Synthetic urinary detailer', sourceUrl: 'https://example.app.box.com/s/test/file/1234567890' },
};

const reader = (rows: SnapshotRow[] = [ROW]) =>
  vi.fn<SnapshotReader>(async (corpus, slugs) => rows.filter((r) => r.corpus === corpus && slugs.includes(r.slug)));

const noDb = { from: () => { throw new Error('no database in this test'); } } as never;
const noStudies = async () => { throw new Error('studies are not part of this test'); };
const stored = {
  slug: 'feline:old-asset',
  source: CODE_SEED,
  deleted_at: null,
  chunk_count: 2,
  metadata: { sync: { version: SYNC_VERSION, contentHash: 'x', syncedAt: '2026-11-01T00:00:00Z' } },
};

beforeEach(() => {
  mocks.embedTexts.mockReset();
  mocks.embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0, 0]));
});

describe('feline manifest rules', () => {
  it('maps audience and region to tools (owner-facing = + roleplay; US = scoring + coach)', () => {
    expect(expectedFelineTools('vet', 'CA')).toEqual(['scoring', 'coach', 'scenario-builder']);
    expect(expectedFelineTools('owner', 'CA')).toEqual(['roleplay', 'scoring', 'coach', 'scenario-builder']);
    expect(expectedFelineTools('vet', 'US')).toEqual(['scoring', 'coach']);
  });

  it('refuses a dog, a vet document the AI owner could read, a wrong US scope and an approved document with open notes', () => {
    const bad = (over: Partial<FelineManifestDocument>) => () => validateFelineManifest(manifest({}, [doc(over)]));
    expect(() => validateFelineManifest(manifest())).not.toThrow();
    expect(bad({ species: ['cat', 'dog'] })).toThrow(/cat-only/);
    expect(bad({ tools: ['roleplay', 'scoring', 'coach', 'scenario-builder'] })).toThrow(/tools must be exactly/);
    expect(bad({ region: 'US' })).toThrow(/scoring, coach/);
    expect(bad({ tools: ['scoring', 'coach', 'scenario-builder', 'fecal-scan'] })).toThrow(/tools/);
    expect(bad({ reviewNotes: [{ page: 2, token: '12.5', status: 'open' }] })).toThrow(/open fidelity review notes/);
    expect(() =>
      validateFelineManifest(manifest({}, [doc({ approved: false, reviewNotes: [{ page: 2, token: '12.5', status: 'open' }] })])),
    ).not.toThrow();
    expect(bad({ slug: 'Bad Slug' })).toThrow(/slug/);
    expect(bad({ assetType: 'poster' as never })).toThrow(/assetType/);
  });

  it('cites the publisher, asset type, edition and the US edition', () => {
    expect(felineCitation(doc())).toBe('Royal Canin Canada. Synthetic urinary detailer (detailer, 2026).');
    expect(felineCitation(doc({ region: 'US', edition: '' }))).toBe('Royal Canin USA. Synthetic urinary detailer (detailer, US edition).');
  });

  it('ships closed: the bundled manifest is valid and its gate is shut', () => {
    const m = bundledFelineManifest();
    expect(m.documents.length).toBeGreaterThan(0);
    expect(isFelinePublished(m)).toBe(false);
    expect(groupOfSlug('feline:anything')).toBe('feline');
  });
});

describe('feline group in the sync', () => {
  function sync(m: FelineManifest | null, read: SnapshotReader | null, extra: Record<string, unknown> = {}) {
    return runKnowledgeSync({
      sb: noDb,
      readStudy: noStudies,
      readSnapshots: read,
      manifests: { feline: m },
      groups: ['feline'],
      existingRows: [stored],
      dryRun: true,
      ...extra,
    });
  }

  it('closed gate (permission granted, publish false): nothing read, nothing written, nothing retired', async () => {
    const read = reader();
    const res = await sync(manifest(), read);
    expect(res.plan.create).toEqual([]);
    expect(res.plan.retire).toEqual([]);
    expect(res.external.feline?.status).toMatch(/NOT PUBLISHED — permission granted, publish=false/);
    expect(read).not.toHaveBeenCalled();
  });

  it('open gate but an edited row: skipped, nothing retired', async () => {
    const res = await sync(manifest({ publish: true }), reader([{ ...ROW, content: `${BODY}x` }]));
    expect(res.plan.retire).toEqual([]);
    expect(res.external.feline?.status).toMatch(/contentHash mismatch/);
  });

  it('a held (unapproved) document is never read or written', async () => {
    const read = reader();
    const res = await sync(manifest({ publish: true }, [doc({ approved: false })]), read);
    expect(res.plan.create).toEqual([]);
    expect(read).toHaveBeenCalledWith('feline', []);
  });

  it('open gate: page-aware chunks with page citations, scope tags and DB-only provenance', async () => {
    const res = await sync(manifest({ publish: true }), reader(), { existingRows: [], dryRun: false, collectSql: true });
    expect(res.sqlDocs).toHaveLength(1);
    const [sql] = res.sqlDocs;
    expect(sql.slug).toBe('feline:synthetic-detailer');
    expect(sql.metadata.citation).toBe('Royal Canin Canada. Synthetic urinary detailer (detailer, 2026).');
    expect(sql.metadata.source).toMatchObject({
      kind: 'royal-canin-asset',
      corpus: 'feline',
      assetType: 'detailer',
      region: 'CA',
      audience: 'vet',
      boxFileId: '1234567890',
      sourceUrl: 'https://example.app.box.com/s/test/file/1234567890',
      permission: 'RC-CA-TEST',
    });
    expect(sql.chunks.map((c) => c.tags.pages)).toEqual([[2], [3]]);
    expect(sql.chunks[0].content.startsWith('Synthetic urinary detailer — Invented heading (p. 2)\n\n')).toBe(true);
    expect(sql.chunks[1].citation).toBe('Royal Canin Canada. Synthetic urinary detailer (detailer, 2026). — p. 3');
    for (const c of sql.chunks) {
      expect(c.tags).toMatchObject({
        species: ['cat'],
        tools: ['scoring', 'coach', 'scenario-builder'],
        origin: 'feline',
        region: 'CA',
        audience: 'vet',
        focus: 'urinary',
      });
      expect(c.tags).not.toHaveProperty('source');
      expect(c.content).not.toMatch(/imaginary paper/);
    }
  });

  it('an owner-facing document is the only kind that reaches roleplay', async () => {
    const owner = doc({ audience: 'owner', tools: ['roleplay', 'scoring', 'coach', 'scenario-builder'], assetType: 'brochure' });
    const { docs } = await felineDocs(manifest({ publish: true }, [owner]), reader());
    expect(docs[0].tagDefaults.tools).toContain('roleplay');
    const vet = (await felineDocs(manifest({ publish: true }), reader())).docs[0];
    expect(vet.tagDefaults.tools).not.toContain('roleplay');
  });
});
