// @vitest-environment node
/**
 * The Royal Canin Academy group of the knowledge sync. What matters most is
 * the publish gate and the pin: until Royal Canin's written permission is
 * recorded AND `publish` is true, the group writes nothing and owns nothing;
 * when it is open, the text comes from `knowledge_source_snapshots` and is
 * accepted only when it matches the manifest's sha256 — a missing row, an
 * edited row or an unreadable table skips the group and retires nothing.
 * Then: every chunk is a section chunk that carries its scope, origin and
 * section, and the references are not embedded.
 *
 * Fixtures are SYNTHETIC (scripts/academy/__tests__/fixtures) — the repo is
 * public and holds no Royal Canin text.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ embedTexts: vi.fn() }));
vi.mock('../_shared/gemini', () => ({ embedTexts: mocks.embedTexts }));

import {
  academyCitation,
  academyDocs,
  bundledAcademyManifest,
  citationName,
  isAcademyPublished,
  validateManifest,
  type AcademyManifest,
} from '../_shared/knowledgeAcademy';
import { snapshotReaderFor, type SnapshotReader, type SnapshotRow } from '../_shared/knowledgeExternal';
import { groupOfSlug, runKnowledgeSync } from '../_shared/knowledgeSyncRun';
import { CODE_SEED, SYNC_VERSION, sha256Hex } from '../_shared/knowledgeSync';
import { parseSnapshot } from '../../../scripts/academy/toMarkdown';

const SLUG = 'synthetic-modern-article';
const FIXTURE = parseSnapshot(
  readFileSync(path.resolve(__dirname, `../../../scripts/academy/__tests__/fixtures/${SLUG}.expected.md`), 'utf8'),
);
const BODY = FIXTURE.body;
const { contentHash: _c, sourceHash: _s, ...META } = FIXTURE.frontMatter;
const ROW: SnapshotRow = {
  corpus: 'academy',
  slug: SLUG,
  content: BODY,
  content_hash: sha256Hex(BODY),
  source_hash: FIXTURE.frontMatter.sourceHash,
  meta: META as unknown as Record<string, unknown>,
};

function manifest(over: Partial<AcademyManifest> = {}): AcademyManifest {
  return {
    permission: { status: 'pending', reference: '', grantedBy: '', date: '' },
    publish: false,
    articles: [
      {
        slug: SLUG,
        approved: true,
        focus: 'weight',
        species: ['dog', 'puppy', 'cat'],
        tools: ['roleplay', 'scoring', 'coach', 'scenario-builder'],
        reason: 'test',
        reviewedBy: 'test',
        reviewedAt: '2026-10-26',
        contentHash: sha256Hex(BODY),
        sourceHash: FIXTURE.frontMatter.sourceHash,
      },
      {
        slug: 'rejected-one',
        approved: false,
        focus: null,
        species: ['cat'],
        tools: ['roleplay'],
        reason: 'test',
        reviewedBy: 'test',
        reviewedAt: '2026-10-26',
      },
    ],
    ...over,
  };
}

const GRANTED = {
  permission: { status: 'granted' as const, reference: 'RC-2026-001', grantedBy: 'Royal Canin', date: '2026-11-01' },
  publish: true,
};

function reader(rows: SnapshotRow[] = [ROW]) {
  return vi.fn<SnapshotReader>(async (corpus, slugs) => rows.filter((r) => r.corpus === corpus && slugs.includes(r.slug)));
}

/** A live academy row the sync wrote earlier (e.g. before the gate was closed again). */
const storedAcademyRow = {
  slug: 'academy:old-article',
  source: CODE_SEED,
  deleted_at: null,
  chunk_count: 4,
  metadata: { sync: { version: SYNC_VERSION, contentHash: 'x', syncedAt: '2026-10-01T00:00:00Z' } },
};

const noDb = { from: () => { throw new Error('no database in this test'); } } as never;
const noStudies = async () => { throw new Error('studies are not part of this test'); };

function sync(m: AcademyManifest | null, read: SnapshotReader | null, extra: Record<string, unknown> = {}) {
  return runKnowledgeSync({
    sb: noDb,
    readStudy: noStudies,
    readSnapshots: read,
    manifests: { academy: m },
    groups: ['academy'],
    existingRows: [storedAcademyRow],
    dryRun: true,
    ...extra,
  });
}

beforeEach(() => {
  mocks.embedTexts.mockReset();
  mocks.embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0, 0]));
});

describe('publish gate + pin', () => {
  it('opens only for granted permission AND publish: true', () => {
    expect(isAcademyPublished(manifest())).toBe(false);
    expect(isAcademyPublished(manifest({ publish: true }))).toBe(false);
    expect(isAcademyPublished(manifest({ permission: GRANTED.permission }))).toBe(false);
    expect(isAcademyPublished(manifest(GRANTED))).toBe(true);
    expect(isAcademyPublished(null)).toBe(false);
  });

  it('a closed gate yields no documents, reads no row, and says so loudly', async () => {
    const read = reader();
    const res = await academyDocs(manifest(), read);
    expect(res).toMatchObject({ published: false, docs: [] });
    expect(res.status).toMatch(/NOT PUBLISHED — permission pending, publish=false; 1 approved/);
    expect(read).not.toHaveBeenCalled();
  });

  it('skips the whole corpus for a missing row, an edited row, an unpinned entry or an unreadable table', async () => {
    expect((await academyDocs(null, reader())).status).toMatch(/SKIPPED/);
    expect((await academyDocs(manifest(GRANTED), null)).status).toMatch(/SKIPPED — knowledge_source_snapshots is not reachable/);
    const missing = await academyDocs(manifest(GRANTED), reader([]));
    expect(missing).toMatchObject({ published: false, docs: [] });
    expect(missing.status).toMatch(/no knowledge_source_snapshots row for synthetic-modern-article/);
    const edited = await academyDocs(manifest(GRANTED), reader([{ ...ROW, content: `${BODY}edited in the table\n` }]));
    expect(edited.status).toMatch(/contentHash mismatch/);
    const m = manifest(GRANTED);
    delete m.articles[0].contentHash;
    expect((await academyDocs(m, reader())).status).toMatch(/no contentHash pin/);
    const broken = await academyDocs(manifest(GRANTED), async () => {
      throw new Error('knowledge_source_snapshots unreadable — permission denied');
    });
    expect(broken.status).toMatch(/SKIPPED — knowledge_source_snapshots unreadable/);
  });

  it('closed gate: the sync plans nothing for academy and retires none of its stored rows', async () => {
    const res = await sync(manifest(), reader());
    expect(res.plan.create).toEqual([]);
    expect(res.plan.retire).toEqual([]);
    expect(res.external.academy).toMatchObject({ published: false });
  });

  it('unreadable manifest or table: skipped with a warning, nothing retired', async () => {
    const log: string[] = [];
    const res = await sync(null, reader(), { log: (l: string) => log.push(l) });
    expect(res.plan.retire).toEqual([]);
    expect(log.join('\n')).toMatch(/academy: SKIPPED — knowledge\/academy\/manifest.json is not readable/);
    const res2 = await sync(manifest(GRANTED), reader([]));
    expect(res2.plan.retire).toEqual([]);
  });

  it('open gate: approved articles are created and academy rows the manifest dropped are retired', async () => {
    const res = await sync(manifest(GRANTED), reader());
    expect(res.plan.create.map((d) => d.slug)).toEqual([`academy:${SLUG}`]);
    expect(res.plan.retire).toEqual(['academy:old-article']);
  });

  it('other groups never claim academy slugs', () => {
    expect(groupOfSlug('academy:how-i-approach-pet-obesity')).toBe('academy');
    expect(groupOfSlug('clinical:reference')).toBe('builtin');
  });

  it('by default reads the rows through the service-role client', async () => {
    const calls: unknown[][] = [];
    const sb = {
      from(table: string) {
        calls.push(['from', table]);
        const q = {
          select: () => q,
          eq: (...a: unknown[]) => (calls.push(['eq', ...a]), q),
          in: (...a: unknown[]) => (calls.push(['in', ...a]), Promise.resolve({ data: [ROW], error: null })),
        };
        return q;
      },
    };
    const rows = await snapshotReaderFor(sb)('academy', [SLUG]);
    expect(rows).toEqual([ROW]);
    expect(calls).toEqual([['from', 'knowledge_source_snapshots'], ['eq', 'corpus', 'academy'], ['in', 'slug', [SLUG]]]);
  });
});

describe('published documents and chunks', () => {
  it('builds the document from the verified row', async () => {
    const { docs } = await academyDocs(manifest(GRANTED), reader());
    expect(docs).toHaveLength(1);
    const [doc] = docs;
    expect(doc).toMatchObject({
      slug: `academy:${SLUG}`,
      group: 'academy',
      title: 'How I approach... a synthetic consult',
      category: 'clinical',
      content: BODY,
      contentHash: sha256Hex(BODY),
      sourceHash: FIXTURE.frontMatter.sourceHash,
      tagDefaults: {
        focus: 'weight',
        tools: ['roleplay', 'scoring', 'coach', 'scenario-builder'],
        species: ['dog', 'puppy', 'cat'],
        origin: 'academy',
      },
    });
    expect(doc.citationDefault).toBe(
      'Example AQ. How I approach... a synthetic consult. Vet Focus 36.1 (Royal Canin Academy), 2026. ' +
        `https://academy.royalcanin.com/en/veterinary/${SLUG}`,
    );
    expect(doc.baseMetadata.source).toMatchObject({
      kind: 'academy',
      url: `https://academy.royalcanin.com/en/veterinary/${SLUG}`,
      issue: '36.1',
      permission: 'RC-2026-001',
    });
  });

  it('chunks by section, with a header line, and never embeds the references', async () => {
    const [doc] = (await academyDocs(manifest(GRANTED), reader())).docs;
    expect(doc.chunks!.length).toBe(doc.chunkSections!.length);
    for (const [i, chunk] of doc.chunks!.entries()) {
      expect(chunk.startsWith(`How I approach... a synthetic consult — ${doc.chunkSections![i]}\n\n`)).toBe(true);
      expect(chunk).not.toMatch(/An imaginary paper/);
    }
    expect(doc.chunkSections).not.toContain('References');
    expect(doc.chunkSections).toEqual(expect.arrayContaining(['Overview', 'Key points', 'Introduction', 'Conclusion']));
  });

  it('writes chunk tags = scope + origin + section (no provenance block) and a section citation', async () => {
    const res = await sync(manifest(GRANTED), reader(), { existingRows: [], dryRun: false, collectSql: true });
    expect(res.sqlDocs).toHaveLength(1);
    const [sql] = res.sqlDocs;
    expect(sql.source).toBe('code-seed');
    expect((sql.metadata.source as { kind: string }).kind).toBe('academy');
    expect(sql.metadata.tags).toMatchObject({ focus: 'weight', origin: 'academy' });
    for (const chunk of sql.chunks) {
      expect(chunk.tags).toMatchObject({
        category: 'clinical',
        focus: 'weight',
        origin: 'academy',
        tools: ['roleplay', 'scoring', 'coach', 'scenario-builder'],
        species: ['dog', 'puppy', 'cat'],
      });
      expect(typeof chunk.tags.section).toBe('string');
      expect(chunk.tags).not.toHaveProperty('source');
      expect(chunk.citation).toBe(`${sql.metadata.citation} — "${chunk.tags.section}"`);
    }
    expect(mocks.embedTexts).toHaveBeenCalledTimes(1);
  });

  it('keeps an admin focus / scope edit over the manifest default', async () => {
    const res = await sync(manifest(GRANTED), reader(), {
      dryRun: false,
      collectSql: true,
      existingRows: [
        {
          slug: `academy:${SLUG}`,
          source: CODE_SEED,
          deleted_at: null,
          chunk_count: 0,
          metadata: { tags: { focus: 'communication', species: ['cat'], tools: ['coach'] } },
        },
      ],
    });
    expect(res.sqlDocs[0].chunks[0].tags).toMatchObject({ focus: 'communication', species: ['cat'], tools: ['coach'] });
  });
});

describe('manifest helpers', () => {
  it('validates the manifest vocabulary and pins', () => {
    expect(() => validateManifest(manifest())).not.toThrow();
    const bad = (patch: Record<string, unknown>) =>
      () => validateManifest({ ...manifest(), articles: [{ ...manifest().articles[0], ...patch }] });
    expect(bad({ tools: ['roleplay', 'fecal-scan'] })).toThrow(/Fecal Scan/);
    expect(bad({ species: [] })).toThrow(/species/);
    expect(bad({ species: ['horse'] })).toThrow(/species/);
    expect(bad({ focus: 'nutrition' })).toThrow(/focus/);
    expect(bad({ slug: '../etc/passwd' })).toThrow(/slug/);
    expect(bad({ contentHash: 'abc' })).toThrow(/contentHash/);
    expect(() => validateManifest({ ...manifest(), publish: 'yes' })).toThrow(/publish/);
  });

  it('bundles the shipped manifest with the code (gate closed in this release)', () => {
    const m = bundledAcademyManifest();
    expect(m.articles.length).toBeGreaterThan(0);
    expect(isAcademyPublished(m)).toBe(false);
  });

  it('formats citation names', () => {
    expect(citationName('Alex Q. Example — DVM, MSc')).toBe('Example AQ');
    expect(citationName('Émile Zéphyr — DVM')).toBe('Zéphyr É');
    expect(citationName('Jean-Pierre Dupont')).toBe('Dupont JP');
    expect(
      academyCitation({ authors: ['A B', 'C D', 'E F', 'G H'], title: 'T.', issue: '', publicationDate: '2020-01-02', url: 'u' }),
    ).toBe('B A, D C, F E, et al. T. Royal Canin Academy, 2020. u');
  });
});
