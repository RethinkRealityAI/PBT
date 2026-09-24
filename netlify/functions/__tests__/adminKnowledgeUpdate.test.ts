// @vitest-environment node
/**
 * `admin-knowledge { op: 'update' }` — the cheap "file it correctly" path.
 *
 * Scope (`tools` / `species`) is editable on EVERY document, built-ins
 * included, exactly like focus: the admin who files a document decides which
 * tools may retrieve it. And because retrieval filters on CHUNK tags, an edit
 * that stopped at the document row would be invisible at query time — so the
 * chunk rewrite is the assertion that matters here.
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
import type { SbCall } from './fakeSupabase';

let sb: FakeSupabase;

type Bag = Record<string, unknown>;

const DOC = {
  id: 'doc-1',
  slug: 'custom:handout',
  title: 'Stool photo handout',
  category: 'clinical',
  source: 'admin',
  metadata: { citation: 'Clinic, 2026', tags: { focus: 'gi' } },
  deleted_at: null,
};

const CHUNKS = [
  { id: 'c1', tags: { category: 'clinical', focus: 'gi' } },
  { id: 'c2', tags: { category: 'clinical', focus: 'gi' } },
];

/** The patch of the document `update` call. */
function docPatch(): Bag {
  const call = sb
    .callsFor('knowledge_documents')
    .find((c) => c.ops.some((o) => o.op === 'update'));
  return call?.ops.find((o) => o.op === 'update')?.args[0] as Bag;
}

/** Every patch written to `knowledge_chunks`. */
function chunkPatches(): Bag[] {
  const out: Bag[] = [];
  for (const call of sb.callsFor('knowledge_chunks')) {
    for (const op of call.ops) if (op.op === 'update') out.push(op.args[0] as Bag);
  }
  return out;
}

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  sb.setHandler('knowledge_documents', (call: SbCall) =>
    call.ops.some((o) => o.op === 'update')
      ? { data: null, error: null }
      : { data: DOC, error: null },
  );
  sb.setHandler('knowledge_chunks', (call: SbCall) =>
    call.ops.some((o) => o.op === 'update')
      ? { data: null, error: null }
      : { data: CHUNKS, error: null },
  );
});

const update = (body: Record<string, unknown>) =>
  adminKnowledge(
    jsonRequest(
      'admin-knowledge',
      { op: 'update', slug: DOC.slug, ...body },
      { headers: { authorization: 'Bearer admin' } },
    ),
  );

describe('admin-knowledge update — knowledge scope', () => {
  it('writes tools + species onto the document AND every chunk', async () => {
    const res = await update({ tools: ['fecal-scan', 'coach'], species: ['dog', 'puppy'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      slug: DOC.slug,
      tools: ['coach', 'fecal-scan'], // vocabulary order, de-duplicated
      species: ['dog', 'puppy'],
      chunks_updated: 2,
      chunk_failures: [],
    });

    expect((docPatch().metadata as Bag).tags).toMatchObject({
      focus: 'gi',
      tools: ['coach', 'fecal-scan'],
      species: ['dog', 'puppy'],
    });
    const patches = chunkPatches();
    expect(patches).toHaveLength(2);
    for (const p of patches) {
      expect(p.tags).toMatchObject({
        category: 'clinical',
        focus: 'gi',
        tools: ['coach', 'fecal-scan'],
        species: ['dog', 'puppy'],
      });
    }
  });

  it('rejects an empty list rather than silently un-scoping a document', async () => {
    for (const body of [{ tools: [] }, { species: [] }]) {
      const res = await update(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/choose at least one/i);
    }
    expect(sb.callsFor('knowledge_chunks')).toHaveLength(0);
  });

  it('rejects an unknown tool or species key', async () => {
    const badTool = await update({ tools: ['roleplay', 'exfiltrate'] });
    expect(badTool.status).toBe(400);
    expect((await badTool.json()).error).toMatch(/exfiltrate/);

    const badSpecies = await update({ species: ['dragon'] });
    expect(badSpecies.status).toBe(400);
    expect((await badSpecies.json()).error).toMatch(/dragon/);
  });

  it('leaves the stored scope alone when the fields are absent', async () => {
    const res = await update({ focus: 'weight' });
    expect(res.status).toBe(200);
    const tags = (docPatch().metadata as Bag).tags as Bag;
    expect(tags.focus).toBe('weight');
    expect(tags).not.toHaveProperty('tools');
    for (const p of chunkPatches()) expect(p.tags).not.toHaveProperty('tools');
  });

  it('scopes a built-in document too — the seeder is not the only filer', async () => {
    sb.setHandler('knowledge_documents', (call: SbCall) =>
      call.ops.some((o) => o.op === 'update')
        ? { data: null, error: null }
        : { data: { ...DOC, slug: 'act:acknowledge', source: 'code-seed' }, error: null },
    );
    const res = await adminKnowledge(
      jsonRequest(
        'admin-knowledge',
        { op: 'update', slug: 'act:acknowledge', tools: ['scoring'] },
        { headers: { authorization: 'Bearer admin' } },
      ),
    );
    expect(res.status).toBe(200);
    expect((docPatch().metadata as Bag).tags).toMatchObject({ tools: ['scoring'] });
  });
});
