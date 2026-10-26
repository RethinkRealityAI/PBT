// @vitest-environment node
/**
 * The Royal Canin Academy group of the knowledge sync. What matters most is
 * the publish gate: until Royal Canin's written permission is recorded AND
 * `publish` is true, the group writes nothing and owns nothing — stored rows
 * are never retired because the gate is closed or the bundle is unreadable.
 * Then: when it IS published, every chunk is a section chunk that carries
 * its scope, origin and section, and the references are not embedded.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ embedTexts: vi.fn() }));
vi.mock('../_shared/gemini', () => ({ embedTexts: mocks.embedTexts }));

import {
  academyCitation,
  academyDocs,
  citationName,
  isAcademyPublished,
  parseSnapshot,
  readAcademyBundleFromDisk,
  validateManifest,
  type AcademyBundle,
  type AcademyManifest,
} from '../_shared/knowledgeAcademy';
import { groupOfSlug, runKnowledgeSync } from '../_shared/knowledgeSyncRun';
import { CODE_SEED, SYNC_VERSION, sha256Hex } from '../_shared/knowledgeSync';

const FIXTURE = readFileSync(
  path.resolve(__dirname, '../../../scripts/academy/__tests__/fixtures/how-i-approach-pet-obesity.expected.md'),
  'utf8',
);
const SLUG = 'how-i-approach-pet-obesity';

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

function bundle(m: AcademyManifest, files: Record<string, string> = { [SLUG]: FIXTURE }): AcademyBundle {
  const readSnapshot = vi.fn(async (slug: string) => files[slug] ?? null);
  return { manifest: m, readSnapshot };
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

beforeEach(() => {
  mocks.embedTexts.mockReset();
  mocks.embedTexts.mockImplementation(async (texts: string[]) => texts.map(() => [1, 0, 0]));
});

describe('publish gate', () => {
  it('opens only for granted permission AND publish: true', () => {
    expect(isAcademyPublished(manifest())).toBe(false);
    expect(isAcademyPublished(manifest({ publish: true }))).toBe(false);
    expect(isAcademyPublished(manifest({ permission: GRANTED.permission }))).toBe(false);
    expect(isAcademyPublished(manifest(GRANTED))).toBe(true);
    expect(isAcademyPublished(null)).toBe(false);
  });

  it('a closed gate yields no documents, reads no snapshot, and says so loudly', async () => {
    const b = bundle(manifest());
    const res = await academyDocs(b);
    expect(res).toMatchObject({ published: false, docs: [] });
    expect(res.status).toMatch(/NOT PUBLISHED — permission pending, publish=false; 1 approved/);
    expect(b.readSnapshot).not.toHaveBeenCalled();
  });

  it('an unreadable bundle or a missing snapshot is skipped, never published half-way', async () => {
    expect((await academyDocs(null)).status).toMatch(/SKIPPED/);
    const missing = await academyDocs(bundle(manifest(GRANTED), {}));
    expect(missing).toMatchObject({ published: false, docs: [] });
    expect(missing.status).toMatch(/snapshot for how-i-approach-pet-obesity is missing/);
    const edited = await academyDocs(bundle(manifest(GRANTED), { [SLUG]: `${FIXTURE}edited by hand\n` }));
    expect(edited.status).toMatch(/contentHash mismatch/);
  });

  it('closed gate: the sync plans nothing for academy and retires none of its stored rows', async () => {
    const res = await runKnowledgeSync({
      sb: noDb,
      readStudy: noStudies,
      readAcademy: async () => bundle(manifest()),
      groups: ['academy'],
      existingRows: [storedAcademyRow],
      dryRun: true,
    });
    expect(res.plan.create).toEqual([]);
    expect(res.plan.retire).toEqual([]);
    expect(res.academy).toMatchObject({ published: false });
  });

  it('unreadable bundle: same — skipped with a warning, nothing retired', async () => {
    const log: string[] = [];
    const res = await runKnowledgeSync({
      sb: noDb,
      readStudy: noStudies,
      readAcademy: async () => {
        throw new Error('manifest.publish must be a boolean');
      },
      groups: ['academy'],
      existingRows: [storedAcademyRow],
      dryRun: true,
      log: (l) => log.push(l),
    });
    expect(res.plan.retire).toEqual([]);
    expect(log.join('\n')).toMatch(/academy: SKIPPED — manifest.publish must be a boolean/);
  });

  it('open gate: approved articles are created and academy rows the manifest dropped are retired', async () => {
    const res = await runKnowledgeSync({
      sb: noDb,
      readStudy: noStudies,
      readAcademy: async () => bundle(manifest(GRANTED)),
      groups: ['academy'],
      existingRows: [storedAcademyRow],
      dryRun: true,
    });
    expect(res.plan.create.map((d) => d.slug)).toEqual([`academy:${SLUG}`]);
    expect(res.plan.retire).toEqual(['academy:old-article']);
  });

  it('other groups never claim academy slugs', () => {
    expect(groupOfSlug('academy:how-i-approach-pet-obesity')).toBe('academy');
    expect(groupOfSlug('clinical:reference')).toBe('builtin');
  });
});

describe('published documents and chunks', () => {
  it('builds the document from the snapshot', async () => {
    const { docs } = await academyDocs(bundle(manifest(GRANTED)));
    expect(docs).toHaveLength(1);
    const [doc] = docs;
    const { frontMatter, body } = parseSnapshot(FIXTURE);
    expect(doc).toMatchObject({
      slug: `academy:${SLUG}`,
      group: 'academy',
      title: 'How I approach... Pet obesity',
      category: 'clinical',
      content: body,
      contentHash: sha256Hex(body),
      sourceHash: frontMatter.sourceHash,
      tagDefaults: {
        focus: 'weight',
        tools: ['roleplay', 'scoring', 'coach', 'scenario-builder'],
        species: ['dog', 'puppy', 'cat'],
        origin: 'academy',
      },
    });
    expect(doc.citationDefault).toBe(
      'Graham KM. How I approach... Pet obesity. Vet Focus 36.1 (Royal Canin Academy), 2026. ' +
        'https://academy.royalcanin.com/en/veterinary/how-i-approach-pet-obesity',
    );
    expect(doc.baseMetadata.source).toMatchObject({
      kind: 'academy',
      url: 'https://academy.royalcanin.com/en/veterinary/how-i-approach-pet-obesity',
      issue: '36.1',
      permission: 'RC-2026-001',
    });
  });

  it('chunks by section, with a header line, and never embeds the references', async () => {
    const [doc] = (await academyDocs(bundle(manifest(GRANTED)))).docs;
    expect(doc.chunks!.length).toBe(doc.chunkSections!.length);
    for (const [i, chunk] of doc.chunks!.entries()) {
      expect(chunk.startsWith(`How I approach... Pet obesity — ${doc.chunkSections![i]}\n\n`)).toBe(true);
      expect(chunk).not.toMatch(/Montoya M|PMID|doi:/);
    }
    expect(doc.chunkSections).not.toContain('References');
    expect(doc.chunkSections).toEqual(expect.arrayContaining(['Overview', 'Key points', 'Weight loss diets', 'Conclusion']));
  });

  it('writes chunk tags = scope + origin + section (no provenance block) and a section citation', async () => {
    const res = await runKnowledgeSync({
      sb: noDb,
      readStudy: noStudies,
      readAcademy: async () => bundle(manifest(GRANTED)),
      groups: ['academy'],
      existingRows: [],
      collectSql: true,
    });
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
    // One embedding call per document, of exactly its section chunks.
    expect(mocks.embedTexts).toHaveBeenCalledTimes(1);
  });

  it('keeps an admin focus / scope edit over the manifest default', async () => {
    const res = await runKnowledgeSync({
      sb: noDb,
      readStudy: noStudies,
      readAcademy: async () => bundle(manifest(GRANTED)),
      groups: ['academy'],
      existingRows: [
        {
          slug: `academy:${SLUG}`,
          source: CODE_SEED,
          deleted_at: null,
          chunk_count: 0,
          metadata: { tags: { focus: 'communication', species: ['cat'], tools: ['coach'] } },
        },
      ],
      collectSql: true,
    });
    expect(res.sqlDocs[0].chunks[0].tags).toMatchObject({ focus: 'communication', species: ['cat'], tools: ['coach'] });
  });
});

describe('manifest + snapshot helpers', () => {
  it('validates the manifest vocabulary', () => {
    expect(() => validateManifest(manifest())).not.toThrow();
    const bad = (patch: Record<string, unknown>) =>
      () => validateManifest({ ...manifest(), articles: [{ ...manifest().articles[0], ...patch }] });
    expect(bad({ tools: ['roleplay', 'fecal-scan'] })).toThrow(/Fecal Scan/);
    expect(bad({ species: [] })).toThrow(/species/);
    expect(bad({ species: ['horse'] })).toThrow(/species/);
    expect(bad({ focus: 'nutrition' })).toThrow(/focus/);
    expect(bad({ slug: '../etc/passwd' })).toThrow(/slug/);
    expect(() => validateManifest({ ...manifest(), publish: 'yes' })).toThrow(/publish/);
  });

  it('reads nothing from a directory without a bundle', async () => {
    expect(await readAcademyBundleFromDisk(['/nonexistent'])).toBeNull();
  });

  it('formats citation names', () => {
    expect(citationName('Kirsten M. Graham — DVM, MSc')).toBe('Graham KM');
    expect(citationName('Pascal Prélaud — DVM, Dip. ECVD')).toBe('Prélaud P');
    expect(citationName('Jean-Pierre Dupont')).toBe('Dupont JP');
    expect(
      academyCitation({ authors: ['A B', 'C D', 'E F', 'G H'], title: 'T.', issue: '', publicationDate: '2020-01-02', url: 'u' }),
    ).toBe('B A, D C, F E, et al. T. Royal Canin Academy, 2020. u');
  });
});
