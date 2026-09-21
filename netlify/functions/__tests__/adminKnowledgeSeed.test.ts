// @vitest-environment node
/**
 * `admin-knowledge { op: 'seed' }` — the fecal charts must arrive in the
 * corpus already filed: one `fecal:<species>` document per chart, chunks
 * carrying the Royal Canin citation and the gi / fecal-scoring / species
 * tags that `ai-fecal-scan`'s slug-filtered retrieval leans on.
 *
 * The existing seed docs must be untouched by that change, so this also pins
 * an ACT document's (absent) cataloguing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  embedContent: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { embedContent: mocks.embedContent };
    constructor(_opts: unknown) {}
  }
  return { GoogleGenAI: MockGoogleGenAI, Type: {}, Modality: {} };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import adminKnowledge from '../admin-knowledge';
import {
  FECAL_CHARTS,
  FECAL_SPECIES,
  fecalChartChunks,
  fecalChartCitation,
  fecalKnowledgeSlug,
} from '../../../src/data/knowledge/fecalCharts';
import { chunkMarkdown } from '../../../src/services/ragShared';
import type { SbCall } from './fakeSupabase';

let sb: FakeSupabase;

type Row = Record<string, unknown>;

/** The rows a `.insert(...)`/`.upsert(...)` call carried, flattened. */
function written(calls: SbCall[], op: 'insert' | 'upsert'): Row[] {
  const out: Row[] = [];
  for (const call of calls) {
    for (const o of call.ops) {
      if (o.op !== op) continue;
      const arg = o.args[0];
      out.push(...((Array.isArray(arg) ? arg : [arg]) as Row[]));
    }
  }
  return out;
}

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.embedContent.mockReset();
  mocks.embedContent.mockImplementation((req: { contents: string[] }) => ({
    embeddings: req.contents.map(() => ({ values: Array(768).fill(0.5) })),
  }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  // Empty corpus: no kept focus/citation, nothing soft-deleted. The per-doc
  // id lookup answers with a deterministic id so chunk rows are traceable.
  sb.setHandler('knowledge_documents', (call) => {
    const eqSlug = call.ops.find((o) => o.op === 'eq' && o.args[0] === 'slug');
    if (eqSlug) return { data: { id: `id:${String(eqSlug.args[1])}` }, error: null };
    if (call.ops.some((o) => o.op === 'select')) return { data: [], error: null };
    return { data: null, error: null };
  });
  sb.setHandler('knowledge_chunks', () => ({ data: null, error: null }));
});

const seed = () =>
  adminKnowledge(
    jsonRequest('admin-knowledge', { op: 'seed' }, { headers: { authorization: 'Bearer admin' } }),
  );

describe('admin-knowledge seed — fecal charts', () => {
  it('upserts one pre-filed document per chart', async () => {
    const res = await seed();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.failures).toEqual([]);

    const docs = written(sb.callsFor('knowledge_documents'), 'upsert');
    for (const species of FECAL_SPECIES) {
      const slug = fecalKnowledgeSlug(species);
      const doc = docs.find((d) => d.slug === slug);
      expect(doc, `missing seed doc ${slug}`).toBeTruthy();
      expect(doc).toMatchObject({
        slug,
        title: FECAL_CHARTS[species].title,
        category: 'clinical',
        source: 'code-seed',
        deleted_at: null,
      });
      expect(doc!.metadata).toMatchObject({
        citation: fecalChartCitation(species),
        tags: { focus: 'gi', topic: 'fecal-scoring', species },
      });
      expect(String(doc!.content)).toContain('Score 1 ');
    }
    expect(docs.map((d) => d.slug)).toEqual(
      expect.arrayContaining(['fecal:dog', 'fecal:cat', 'fecal:puppy']),
    );
  });

  it('writes chunks carrying the Royal Canin citation and the gi/species tags', async () => {
    await seed();
    const chunks = written(sb.callsFor('knowledge_chunks'), 'insert');

    for (const species of FECAL_SPECIES) {
      const slug = fecalKnowledgeSlug(species);
      const rows = chunks.filter((c) => c.doc_id === `id:${slug}`);
      expect(rows.length, `no chunks for ${slug}`).toBeGreaterThanOrEqual(1);
      for (const row of rows) {
        expect(row.citation).toBe(fecalChartCitation(species));
        expect(row.tags).toMatchObject({
          category: 'clinical',
          focus: 'gi',
          topic: 'fecal-scoring',
          species,
        });
        expect(typeof row.embedding).toBe('string');
      }
      // Every score of the chart survives into the chunk text.
      const text = rows.map((r) => String(r.content)).join('\n');
      for (const entry of FECAL_CHARTS[species].entries) {
        expect(text).toContain(`Score ${entry.score} `);
      }
    }
  });

  it('embeds ONE chunk per score, not one per chart', async () => {
    await seed();
    const chunks = written(sb.callsFor('knowledge_chunks'), 'insert');

    // The counts are the point: a chart is ~370 tokens, so chunkMarkdown's
    // 800-token packing would emit a single chunk per chart and every query
    // would retrieve the same passage at the same similarity.
    const expected: Record<string, number> = { 'fecal:dog': 8, 'fecal:cat': 6, 'fecal:puppy': 7 };
    for (const species of FECAL_SPECIES) {
      const slug = fecalKnowledgeSlug(species);
      const rows = chunks.filter((c) => c.doc_id === `id:${slug}`);
      expect(rows, slug).toHaveLength(expected[slug]);
      expect(rows.map((r) => r.chunk_idx)).toEqual(rows.map((_, i) => i));
      expect(rows.map((r) => r.content)).toEqual(fecalChartChunks(species));
    }
  });

  it('leaves the other seed documents uncatalogued, as before', async () => {
    await seed();
    const docs = written(sb.callsFor('knowledge_documents'), 'upsert');
    const act = docs.find((d) => String(d.slug).startsWith('act:'));
    expect(act).toBeTruthy();
    expect(act!.metadata).not.toHaveProperty('tags');
    expect(act!.metadata).not.toHaveProperty('citation');

    const chunks = written(sb.callsFor('knowledge_chunks'), 'insert');
    const actChunks = chunks.filter((c) => String(c.doc_id).startsWith('id:act:'));
    expect(actChunks.length).toBeGreaterThan(0);
    for (const row of actChunks) {
      expect(row.citation).toBeNull();
      expect(row.tags).not.toHaveProperty('focus');
    }
  });

  it('still chunks every non-fecal document with chunkMarkdown', async () => {
    await seed();
    const docs = written(sb.callsFor('knowledge_documents'), 'upsert');
    const chunks = written(sb.callsFor('knowledge_chunks'), 'insert');

    const others = docs.filter((d) => !String(d.slug).startsWith('fecal:'));
    expect(others.length).toBeGreaterThan(0);
    for (const doc of others) {
      const rows = chunks.filter((c) => c.doc_id === `id:${doc.slug}`);
      expect(rows.map((r) => r.content), String(doc.slug)).toEqual(
        chunkMarkdown(String(doc.content)),
      );
    }
  });
});
