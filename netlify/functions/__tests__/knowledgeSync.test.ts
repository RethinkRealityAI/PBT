// @vitest-environment node
/**
 * The sync plan is what makes automatic seeding affordable: it runs on every
 * deploy, so "nothing changed" has to cost nothing. These tests pin the four
 * outcomes and the two ways a skip can be WRONG (a stale fingerprint version,
 * a document that lost its chunks).
 */
import { describe, expect, it } from 'vitest';
import {
  SYNC_VERSION,
  canSkipExtraction,
  planKnowledgeSync,
  readSyncMeta,
  sha256Hex,
  summarizeSync,
  withSyncMeta,
  type ExistingKnowledgeRow,
} from '../_shared/knowledgeSync';

const doc = (slug: string, contentHash: string) => ({ slug, contentHash });

/** A row that a previous sync would have written for `doc`. */
function syncedRow(
  slug: string,
  contentHash: string,
  over: Partial<ExistingKnowledgeRow> & { sourceHash?: string; version?: number } = {},
): ExistingKnowledgeRow {
  const { sourceHash, version, ...rest } = over;
  return {
    slug,
    metadata: {
      tags: { tools: ['roleplay'] },
      sync: {
        version: version ?? SYNC_VERSION,
        contentHash,
        ...(sourceHash ? { sourceHash } : {}),
        syncedAt: '2026-09-01T00:00:00.000Z',
      },
    },
    deleted_at: null,
    chunk_count: 3,
    ...rest,
  };
}

describe('sha256Hex', () => {
  it('is stable, and differs for a one-character change', () => {
    expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
    expect(sha256Hex('hello')).not.toBe(sha256Hex('hellp'));
    expect(sha256Hex('hello')).toHaveLength(64);
  });

  it('hashes raw bytes too (a PDF never becomes a string)', () => {
    const bytes = new Uint8Array([0, 1, 2, 250]);
    expect(sha256Hex(bytes)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(bytes)).not.toBe(sha256Hex(new Uint8Array([0, 1, 2, 251])));
  });
});

describe('withSyncMeta / readSyncMeta', () => {
  it('round-trips the fingerprint without disturbing the rest of the bag', () => {
    const meta = withSyncMeta(
      { tags: { focus: 'gi' }, citation: 'RC' },
      { contentHash: 'abc', sourceHash: 'def', syncedAt: '2026-09-21T00:00:00.000Z' },
    );
    expect(meta.tags).toEqual({ focus: 'gi' });
    expect(meta.citation).toBe('RC');
    expect(readSyncMeta(meta)).toEqual({
      version: SYNC_VERSION,
      contentHash: 'abc',
      sourceHash: 'def',
      syncedAt: '2026-09-21T00:00:00.000Z',
    });
  });

  it('omits sourceHash for documents that are not derived from a file', () => {
    const meta = withSyncMeta({}, { contentHash: 'abc' });
    expect(readSyncMeta(meta)!.sourceHash).toBeUndefined();
  });

  it('reads anything malformed as "never synced"', () => {
    expect(readSyncMeta(null)).toBeNull();
    expect(readSyncMeta({})).toBeNull();
    expect(readSyncMeta({ sync: 'yes' })).toBeNull();
    expect(readSyncMeta({ sync: { contentHash: '' } })).toBeNull();
    // A pre-hash row (seeded by the old admin button) has no fingerprint.
    expect(readSyncMeta({ tags: { tools: ['roleplay'] } })).toBeNull();
  });
});

describe('planKnowledgeSync', () => {
  it('creates documents that have no row yet', () => {
    const plan = planKnowledgeSync([doc('act:acknowledge', 'h1')], []);
    expect(plan.create.map((d) => d.slug)).toEqual(['act:acknowledge']);
    expect(plan.update).toEqual([]);
    expect(plan.skip).toEqual([]);
    expect(plan.keepDeleted).toEqual([]);
  });

  it('skips a document whose hash matches and whose chunks are present', () => {
    const plan = planKnowledgeSync([doc('act:acknowledge', 'h1')], [syncedRow('act:acknowledge', 'h1')]);
    expect(plan.skip.map((d) => d.slug)).toEqual(['act:acknowledge']);
    expect(plan.update).toEqual([]);
  });

  it('updates a document whose content changed', () => {
    const plan = planKnowledgeSync([doc('act:acknowledge', 'h2')], [syncedRow('act:acknowledge', 'h1')]);
    expect(plan.update.map((d) => d.slug)).toEqual(['act:acknowledge']);
    expect(plan.skip).toEqual([]);
  });

  it('re-embeds a document that lost its chunks even though the body is identical', () => {
    const plan = planKnowledgeSync(
      [doc('act:acknowledge', 'h1')],
      [syncedRow('act:acknowledge', 'h1', { chunk_count: 0 })],
    );
    expect(plan.update.map((d) => d.slug)).toEqual(['act:acknowledge']);
  });

  it('re-syncs everything when the fingerprint version is bumped', () => {
    const plan = planKnowledgeSync(
      [doc('act:acknowledge', 'h1')],
      [syncedRow('act:acknowledge', 'h1', { version: SYNC_VERSION - 1 })],
    );
    expect(plan.update.map((d) => d.slug)).toEqual(['act:acknowledge']);
  });

  it('treats a pre-hash row (old admin seed) as stale', () => {
    const plan = planKnowledgeSync(
      [doc('act:acknowledge', 'h1')],
      [{ slug: 'act:acknowledge', metadata: { tags: {} }, deleted_at: null, chunk_count: 4 }],
    );
    expect(plan.update.map((d) => d.slug)).toEqual(['act:acknowledge']);
  });

  it('leaves a soft-deleted document deleted, whatever its hash says', () => {
    const fresh = syncedRow('fecal:cat', 'h1', { deleted_at: '2026-09-01T00:00:00.000Z' });
    const stale = syncedRow('fecal:dog', 'h9', { deleted_at: '2026-09-01T00:00:00.000Z' });
    const plan = planKnowledgeSync([doc('fecal:cat', 'h1'), doc('fecal:dog', 'h1')], [fresh, stale]);
    expect(plan.keepDeleted.map((d) => d.slug).sort()).toEqual(['fecal:cat', 'fecal:dog']);
    expect(plan.create).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.skip).toEqual([]);
  });

  it('classifies a whole corpus in one pass', () => {
    const plan = planKnowledgeSync(
      [doc('a', 'h1'), doc('b', 'h2'), doc('c', 'h3'), doc('d', 'h4')],
      [
        syncedRow('b', 'h2'),
        syncedRow('c', 'old'),
        syncedRow('d', 'h4', { deleted_at: '2026-01-01T00:00:00.000Z' }),
      ],
    );
    expect(plan.create.map((d) => d.slug)).toEqual(['a']);
    expect(plan.skip.map((d) => d.slug)).toEqual(['b']);
    expect(plan.update.map((d) => d.slug)).toEqual(['c']);
    expect(plan.keepDeleted.map((d) => d.slug)).toEqual(['d']);
    expect(summarizeSync(plan)).toBe(
      'knowledge sync: 1 created, 1 updated, 1 unchanged, 1 left deleted',
    );
  });
});

describe('planKnowledgeSync — retiring removed built-ins', () => {
  const seedRow = (slug: string, over: Partial<ExistingKnowledgeRow> = {}) =>
    syncedRow(slug, 'h', { source: 'code-seed', ...over });

  it('retires a live code-seed row the code no longer defines', () => {
    const plan = planKnowledgeSync([doc('act:acknowledge', 'h')], [
      seedRow('act:acknowledge'),
      seedRow('driver:Removed'),
    ]);
    expect(plan.retire).toEqual(['driver:Removed']);
    expect(summarizeSync(plan)).toBe(
      'knowledge sync: 0 created, 0 updated, 1 unchanged, 0 left deleted, 1 retired',
    );
  });

  it('never retires an admin upload, a legacy row without source, or an already-deleted row', () => {
    const plan = planKnowledgeSync([], [
      syncedRow('custom:abc', 'h', { source: 'admin' }),
      syncedRow('study:legacy', 'h', { source: null }),
      seedRow('driver:Gone', { deleted_at: '2026-09-01T00:00:00.000Z' }),
    ]);
    expect(plan.retire).toEqual([]);
  });

  it('a partial run only retires slugs it owns', () => {
    const plan = planKnowledgeSync([doc('fecal:dog', 'h')], [
      seedRow('fecal:dog'),
      seedRow('fecal:hamster'),
      seedRow('driver:Activator'),
    ], { owns: (slug) => slug.startsWith('fecal:') });
    expect(plan.retire).toEqual(['fecal:hamster']);
  });

  it('keeps the summary unchanged when nothing is retired', () => {
    const plan = planKnowledgeSync([doc('a', 'h')], []);
    expect(plan.retire).toEqual([]);
    expect(summarizeSync(plan)).toBe('knowledge sync: 1 created, 0 updated, 0 unchanged, 0 left deleted');
  });
});

describe('canSkipExtraction', () => {
  it('is false when the slug has never been synced', () => {
    expect(canSkipExtraction(undefined, 'src')).toBe(false);
  });

  it('is true when the PDF bytes are unchanged and the document has chunks', () => {
    expect(canSkipExtraction(syncedRow('study:x', 'h1', { sourceHash: 'src' }), 'src')).toBe(true);
  });

  it('is false when the PDF changed — even if the extracted body once matched', () => {
    expect(canSkipExtraction(syncedRow('study:x', 'h1', { sourceHash: 'old' }), 'src')).toBe(false);
  });

  it('is false when the document exists but lost its chunks', () => {
    const row = syncedRow('study:x', 'h1', { sourceHash: 'src', chunk_count: 0 });
    expect(canSkipExtraction(row, 'src')).toBe(false);
  });

  it('is true for a soft-deleted document — nothing would be written anyway', () => {
    const row = syncedRow('study:x', 'h1', {
      sourceHash: 'src',
      chunk_count: 0,
      deleted_at: '2026-01-01T00:00:00.000Z',
    });
    expect(canSkipExtraction(row, 'src')).toBe(true);
  });

  it('is false for a row synced with no sourceHash at all', () => {
    expect(canSkipExtraction(syncedRow('study:x', 'h1'), 'src')).toBe(false);
  });
});
