// @vitest-environment node
/**
 * `knowledge-sync-background` is how production seeds itself: the keys only
 * exist inside the Netlify runtime, so the deploy runs the sync on itself.
 *
 * It writes production with the service role, so this file pins the gate
 * as well as the economics:
 *   • no / wrong `x-pbt-sync-key` → 401, nothing read or written;
 *   • any deploy but the published production one → 403;
 *   • the database lease: when another sync holds it, nothing is written;
 *   • a recent sync with nothing to do exits before spending anything;
 *   • a MISSING document is still synced, cooldown or not (a deploy that
 *     changes knowledge lands minutes after the previous sync);
 *   • a code-seed document the code no longer defines is retired;
 *   • a second call from the same IP is rate-limited.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import {
  KNOWLEDGE_SYNC_KEY_HEADER,
  knowledgeSyncKey,
  type NetlifyContextLike,
} from '../_shared/knowledgeTrigger';
import type { SbCall } from './fakeSupabase';

const PROD: NetlifyContextLike = { deploy: { context: 'production', published: true } };

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

  // The lease is free unless a test says otherwise.
  sb.rpc.mockImplementation(async (fn: string) =>
    fn === 'knowledge_sync_try_lease' ? { data: true, error: null } : { data: null, error: null },
  );

  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')));
});

afterEach(() => {
  delete process.env.CONTEXT;
  delete process.env.PBT_ALLOW_DEV_SYNC;
});

const signed = () => ({ [KNOWLEDGE_SYNC_KEY_HEADER]: knowledgeSyncKey()! });

const post = (ip = '203.0.113.7', ctx: NetlifyContextLike | undefined = PROD) =>
  handler(jsonRequest('knowledge-sync-background', {}, { ip, headers: signed() }), ctx);

describe('knowledge-sync-background', () => {
  it('rejects anything but POST', async () => {
    const res = await handler(
      jsonRequest('knowledge-sync-background', null, { method: 'GET', headers: signed() }),
      PROD,
    );
    expect(res.status).toBe(405);
  });

  it('401s without the sync key, or with a wrong one — and touches nothing', async () => {
    wire([]);
    for (const headers of [
      {},
      { [KNOWLEDGE_SYNC_KEY_HEADER]: 'nope' },
      { [KNOWLEDGE_SYNC_KEY_HEADER]: 'service-key' },
      { [KNOWLEDGE_SYNC_KEY_HEADER]: knowledgeSyncKey('some-other-key')! },
    ]) {
      const res = await handler(jsonRequest('knowledge-sync-background', {}, { headers }), PROD);
      expect(res.status).toBe(401);
    }
    expect(sb.calls).toEqual([]);
    expect(sb.rpc).not.toHaveBeenCalled();
    expect(mocks.embedContent).not.toHaveBeenCalled();
  });

  it('401s when the service-role key is absent (nothing to verify against)', async () => {
    const header = signed();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await handler(
      jsonRequest('knowledge-sync-background', {}, { headers: header }),
      PROD,
    );
    expect(res.status).toBe(401);
    expect(sb.calls).toEqual([]);
  });

  it('403s outside the published production deploy', async () => {
    wire([]);
    for (const ctx of [
      { deploy: { context: 'deploy-preview' } },
      { deploy: { context: 'branch-deploy' } },
      { deploy: { context: 'production', published: false } },
      { deploy: { context: 'dev' } },
      {}, // no deploy info and no CONTEXT env → unknown → refused
    ] as NetlifyContextLike[]) {
      const res = await post('203.0.113.7', ctx);
      expect(res.status).toBe(403);
    }
    expect(sb.calls).toEqual([]);
    expect(mocks.embedContent).not.toHaveBeenCalled();
  });

  it('allows netlify dev only with PBT_ALLOW_DEV_SYNC=1', async () => {
    wire(currentRows(new Date(Date.now() - 60_000).toISOString()));
    process.env.PBT_ALLOW_DEV_SYNC = '1';
    const res = await post('203.0.113.7', { deploy: { context: 'dev' } });
    expect(res.status).toBe(202);
  });

  it('writes nothing when another sync holds the lease', async () => {
    wire([]); // everything would be a create
    sb.rpc.mockImplementation(async (fn: string) =>
      fn === 'knowledge_sync_try_lease' ? { data: false, error: null } : { data: null, error: null },
    );
    const res = await post();
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe('another sync is running');
    expect(written(sb.callsFor('knowledge_documents'), 'upsert')).toEqual([]);
    expect(sb.callsFor('knowledge_chunks')).toEqual([]);
    expect(mocks.embedContent).not.toHaveBeenCalled();
    expect(mocks.generateContent).not.toHaveBeenCalled();
    // It never held the lease, so it must not release one.
    expect(sb.rpc.mock.calls.map((c) => c[0])).toEqual(['knowledge_sync_try_lease']);
  });

  it('takes the lease before writing and releases it afterwards', async () => {
    wire([]);
    await post();
    const names = sb.rpc.mock.calls.map((c) => c[0]);
    expect(names).toEqual(['knowledge_sync_try_lease', 'knowledge_sync_release_lease']);
    const [, acquire] = sb.rpc.mock.calls[0] as [string, Record<string, unknown>];
    const [, release] = sb.rpc.mock.calls[1] as [string, Record<string, unknown>];
    expect(acquire).toMatchObject({ p_ttl_seconds: 15 * 60 });
    expect(release.p_holder).toBe(acquire.p_holder);
  });

  it('fails closed (no writes) when the lease function is missing', async () => {
    wire([]);
    sb.rpc.mockImplementation(async () => ({
      data: null,
      error: { message: 'function knowledge_sync_try_lease does not exist' },
    }));
    const res = await post();
    expect((await res.json()).status).toBe('failed (logged)');
    expect(written(sb.callsFor('knowledge_documents'), 'upsert')).toEqual([]);
    expect(logs.join('\n')).toContain('20260923000000_knowledge_sync_lease.sql');
  });

  it('retires a code-seed document the code no longer defines — and never an upload', async () => {
    const rows = currentRows(new Date(Date.now() - SYNC_COOLDOWN_MS - 1000).toISOString());
    rows.push(
      { ...rows[0], id: 'id:driver:Removed', slug: 'driver:Removed' },
      { ...rows[0], id: 'id:custom:x', slug: 'custom:x', source: 'admin' } as never,
    );
    wire(rows);
    const res = await post();
    expect((await res.json()).status).toContain('1 retired');
    const updates = sb
      .callsFor('knowledge_documents')
      .filter((c) => c.ops.some((o) => o.op === 'update'));
    expect(updates).toHaveLength(1);
    const ops = updates[0].ops;
    expect(ops.find((o) => o.op === 'update')!.args[0]).toMatchObject({
      deleted_at: expect.any(String),
    });
    expect(ops).toEqual(
      expect.arrayContaining([
        { op: 'eq', args: ['slug', 'driver:Removed'] },
        { op: 'eq', args: ['source', 'code-seed'] },
        { op: 'is', args: ['deleted_at', null] },
      ]),
    );
  });

  it('does not insert chunks when the chunk delete fails', async () => {
    const dogSlug = fecalKnowledgeSlug('dog');
    wire(currentRows(new Date(Date.now() - 60_000).toISOString(), [dogSlug]));
    sb.setHandler('knowledge_chunks', (call: SbCall) =>
      call.ops.some((o) => o.op === 'delete')
        ? { data: null, error: { message: 'delete refused' } }
        : { data: null, error: null },
    );
    const res = await post();
    expect((await res.json()).status).toBe('failed (logged)');
    expect(written(sb.callsFor('knowledge_chunks'), 'insert')).toEqual([]);
    // …and the document's fresh fingerprint is dropped so the next sync redoes it.
    const strip = sb
      .callsFor('knowledge_documents')
      .find((c) => c.ops.some((o) => o.op === 'update'));
    expect(strip).toBeTruthy();
    const meta = (strip!.ops.find((o) => o.op === 'update')!.args[0] as { metadata: object })
      .metadata;
    expect(meta).not.toHaveProperty('sync');
    // The lease is still released.
    expect(sb.rpc.mock.calls.map((c) => c[0])).toContain('knowledge_sync_release_lease');
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

  it('skips (without throwing) when the Gemini key is absent', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await post();
    expect(res.status).toBe(202);
    expect((await res.json()).status).toBe('skipped: missing env');
    expect(sb.callsFor('knowledge_documents')).toEqual([]);
  });
});
