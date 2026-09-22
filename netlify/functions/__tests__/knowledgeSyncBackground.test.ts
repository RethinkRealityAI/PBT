// @vitest-environment node
/**
 * `knowledge-sync-background` is how production seeds itself: the keys only
 * exist inside the Netlify runtime, so the deploy runs the sync on itself.
 *
 * It takes no auth, which makes three properties load-bearing, and they are
 * what this file pins:
 *   • a recent sync with nothing to do exits before spending anything;
 *   • a MISSING document is still synced, cooldown or not (a deploy that
 *     changes knowledge lands minutes after the previous sync);
 *   • a second call from the same IP is rate-limited.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  embedContent: vi.fn(),
  generateContent: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { embedContent: mocks.embedContent, generateContent: mocks.generateContent };
    constructor(_opts: unknown) {}
  }
  return { GoogleGenAI: MockGoogleGenAI, Type: {}, Modality: {} };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler, { SYNC_COOLDOWN_MS } from '../knowledge-sync-background';
import { __resetRateLimits } from '../_shared/ai';
import { SYNC_VERSION, sha256Hex } from '../_shared/knowledgeSync';
import { buildSeedDocs } from '../_shared/knowledgeSeed';
import { BUNDLED_STUDIES } from '../_shared/knowledgeIngest';
import { fecalKnowledgeSlug } from '../../../src/data/knowledge/fecalCharts';
import type { SbCall } from './fakeSupabase';

let sb: FakeSupabase;
let logs: string[];

/** Rows for a corpus that is fully in sync, as of `syncedAt`. */
function currentRows(syncedAt: string, omit: string[] = []) {
  const docs = buildSeedDocs()
    .filter((d) => !omit.includes(d.slug))
    .map((d) => ({
      id: `id:${d.slug}`,
      slug: d.slug,
      deleted_at: null,
      source: 'code-seed',
      metadata: {
        tags: { tools: ['roleplay'] },
        sync: { version: SYNC_VERSION, contentHash: sha256Hex(d.content), syncedAt },
      },
    }));
  // The five bundled studies, fingerprinted against the real PDF bytes that
  // `fetch` is mocked to return below.
  for (const study of BUNDLED_STUDIES) {
    if (omit.includes(study.slug)) continue;
    docs.push({
      id: `id:${study.slug}`,
      slug: study.slug,
      deleted_at: null,
      source: 'code-seed',
      metadata: {
        tags: { tools: ['roleplay'] },
        sync: {
          version: SYNC_VERSION,
          contentHash: 'study-body-hash',
          sourceHash: sha256Hex(new Uint8Array([1, 2, 3])),
          syncedAt,
        },
      },
    } as never);
  }
  return docs;
}

function wire(docs: ReturnType<typeof currentRows>) {
  sb.setHandler('knowledge_documents', (call: SbCall) => {
    if (call.ops.some((o) => o.op === 'upsert')) {
      return { data: { id: `id:${String((call.ops[0].args[0] as { slug?: string })?.slug)}` }, error: null };
    }
    return { data: docs, error: null };
  });
  sb.setHandler('knowledge_chunk_counts', () => ({
    data: docs.map((d) => ({ doc_id: d.id, chunks: 3 })),
    error: null,
  }));
  sb.setHandler('knowledge_chunks', () => ({ data: null, error: null }));
}

/** Rows a `.insert(...)`/`.upsert(...)` carried, flattened. */
function written(calls: SbCall[], op: 'insert' | 'upsert'): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const call of calls) {
    for (const o of call.ops) {
      if (o.op !== op) continue;
      const arg = o.args[0];
      out.push(...((Array.isArray(arg) ? arg : [arg]) as Array<Record<string, unknown>>));
    }
  }
  return out;
}

beforeEach(() => {
  setFunctionEnv();
  __resetRateLimits();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.embedContent.mockReset();
  mocks.embedContent.mockImplementation((req: { contents: string[] }) => ({
    embeddings: req.contents.map(() => ({ values: Array(768).fill(0.5) })),
  }));
  mocks.generateContent.mockReset();
  mocks.generateContent.mockReturnValue({
    text: JSON.stringify({ title: 'Study', citation: 'A, 2024', markdown: '# S\n\nBody.' }),
  });

  // The deploy's own origin serves the study PDFs.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
  );

  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
});

const post = (ip = '203.0.113.7') =>
  handler(jsonRequest('knowledge-sync-background', {}, { ip }));

describe('knowledge-sync-background', () => {
  it('rejects anything but POST', async () => {
    const res = await handler(
      jsonRequest('knowledge-sync-background', null, { method: 'GET' }),
    );
    expect(res.status).toBe(405);
  });

  it('exits on cooldown when a recent sync left nothing to do', async () => {
    wire(currentRows(new Date(Date.now() - 60_000).toISOString()));
    const res = await post();

    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe('cooldown');
    expect(logs.join('\n')).toMatch(/cooldown — last sync \d+s ago and nothing changed/);
    // The point of the cooldown: nothing was written and nothing was embedded.
    expect(written(sb.callsFor('knowledge_documents'), 'upsert')).toEqual([]);
    expect(mocks.embedContent).not.toHaveBeenCalled();
    // …and a dry run never extracts a PDF either.
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('syncs anyway, inside the cooldown, when a document is missing', async () => {
    const dogSlug = fecalKnowledgeSlug('dog');
    wire(currentRows(new Date(Date.now() - 60_000).toISOString(), [dogSlug]));

    const res = await post();
    expect(res.status).toBe(202);

    const docs = written(sb.callsFor('knowledge_documents'), 'upsert');
    expect(docs.map((d) => d.slug)).toEqual([dogSlug]);
    expect(docs[0]).toMatchObject({ source: 'code-seed', deleted_at: null });
    expect((docs[0].metadata as Record<string, unknown>).sync).toMatchObject({
      version: SYNC_VERSION,
    });

    // One chunk per score, embedded and inserted.
    const chunks = written(sb.callsFor('knowledge_chunks'), 'insert');
    expect(chunks).toHaveLength(8);
    expect(chunks.every((c) => c.doc_id === `id:${dogSlug}`)).toBe(true);
    expect(mocks.embedContent).toHaveBeenCalledTimes(1);

    expect(logs.join('\n')).toContain('knowledge sync: 1 created, 0 updated');
    // The other 22 documents were untouched — this is a targeted repair.
    expect(logs.join('\n')).toContain('22 unchanged');
  });

  it('runs without a cooldown check when nothing has ever been synced', async () => {
    wire([]);
    const res = await post();
    expect(res.status).toBe(202);
    const docs = written(sb.callsFor('knowledge_documents'), 'upsert');
    // 18 code-seed documents + 5 bundled studies.
    expect(docs).toHaveLength(23);
    expect(mocks.generateContent).toHaveBeenCalledTimes(BUNDLED_STUDIES.length);
    expect(logs.join('\n')).toContain('knowledge sync: 23 created');
  });

  it('skips the cooldown entirely once the last sync is older than the window', async () => {
    wire(currentRows(new Date(Date.now() - SYNC_COOLDOWN_MS - 1000).toISOString()));
    const res = await post();
    expect((await res.json()).status).toContain('0 created, 0 updated, 23 unchanged');
    // Still cheap: everything hashed the same, so nothing was embedded.
    expect(mocks.embedContent).not.toHaveBeenCalled();
  });

  it('rate-limits a second call from the same IP', async () => {
    wire(currentRows(new Date(Date.now() - 60_000).toISOString()));
    expect((await post()).status).toBe(202);
    const second = await post();
    expect(second.status).toBe(429);
    expect(second.headers.get('retry-after')).toBeTruthy();
    // A different caller is unaffected.
    expect((await post('198.51.100.9')).status).toBe(202);
  });

  it('never throws — a database failure is logged and swallowed', async () => {
    sb.setHandler('knowledge_documents', () => ({ data: null, error: { message: 'boom' } }));
    const res = await post();
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe('failed (logged)');
    expect(logs.join('\n')).toContain('boom');
  });

  it('skips (without throwing) when the keys are absent', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await post();
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe('skipped: missing env');
    expect(sb.callsFor('knowledge_documents')).toEqual([]);
  });
});
