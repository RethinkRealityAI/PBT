// @vitest-environment node
/**
 * `admin-knowledge-ingest` — every path that writes a document must write a
 * knowledge SCOPE with it. A chunk with no `tools` tag is invisible to scoped
 * retrieval, so "uploaded, embedded, and silently unreachable" is the failure
 * these pin against.
 *
 * Only the text-ingestion path is exercised for op=ingest (the PDF path is
 * the same code after `extractPdf`, which is a model call).
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

import ingestFn from '../admin-knowledge-ingest';
import {
  ALL_KNOWLEDGE_SPECIES,
  DEFAULT_KNOWLEDGE_TOOLS,
} from '../../../src/shared/knowledge/knowledgeScopes';
import type { SbCall } from './fakeSupabase';

let sb: FakeSupabase;

type Bag = Record<string, unknown>;

const TEXT = 'Photograph the sample on a neutral background.\n\nDaylight reads truest.';

/** The row handed to `knowledge_documents.upsert`. */
function upsertedDoc(): Bag {
  for (const call of sb.callsFor('knowledge_documents')) {
    const op = call.ops.find((o) => o.op === 'upsert');
    if (op) return op.args[0] as Bag;
  }
  throw new Error('no document upsert');
}

/** The rows handed to `knowledge_chunks.insert`. */
function insertedChunks(): Bag[] {
  for (const call of sb.callsFor('knowledge_chunks')) {
    const op = call.ops.find((o) => o.op === 'insert');
    if (op) return op.args[0] as Bag[];
  }
  throw new Error('no chunk insert');
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
  sb.setHandler('knowledge_documents', (call: SbCall) =>
    call.ops.some((o) => o.op === 'upsert')
      ? { data: { id: 'doc-1' }, error: null }
      : {
          data: {
            id: 'doc-1',
            slug: 'custom:existing',
            title: 'Existing handout',
            category: 'clinical',
            content: TEXT,
            source: 'admin',
            metadata: {
              citation: 'Clinic, 2026',
              tags: { focus: 'gi', tools: ['fecal-scan'], species: ['cat'] },
            },
          },
          error: null,
        },
  );
  sb.setHandler('knowledge_chunks', () => ({ data: null, error: null }));
});

const post = (body: Record<string, unknown>) =>
  ingestFn(
    jsonRequest('admin-knowledge-ingest', body, { headers: { authorization: 'Bearer admin' } }),
  );

describe('admin-knowledge-ingest — knowledge scope', () => {
  it('defaults an untagged upload to the training tools and every species', async () => {
    const res = await post({ op: 'ingest', text: TEXT, title: 'Handout' });
    expect(res.status).toBe(200);

    expect((upsertedDoc().metadata as Bag).tags).toMatchObject({
      tools: DEFAULT_KNOWLEDGE_TOOLS,
      species: ALL_KNOWLEDGE_SPECIES,
    });
    const chunks = insertedChunks();
    expect(chunks.length).toBeGreaterThan(0);
    for (const c of chunks) {
      expect(c.tags).toMatchObject({
        category: 'custom',
        tools: DEFAULT_KNOWLEDGE_TOOLS,
        species: ALL_KNOWLEDGE_SPECIES,
      });
    }
  });

  it('keeps an explicit scope, including a Fecal-Scan-only upload', async () => {
    const res = await post({
      op: 'ingest',
      text: TEXT,
      title: 'Cat stool photo tips',
      category: 'clinical',
      tags: { focus: 'gi', tools: ['fecal-scan'], species: ['cat'] },
    });
    expect(res.status).toBe(200);
    expect((upsertedDoc().metadata as Bag).tags).toMatchObject({
      focus: 'gi',
      tools: ['fecal-scan'],
      species: ['cat'],
    });
    for (const c of insertedChunks()) {
      expect(c.tags).toMatchObject({ tools: ['fecal-scan'], species: ['cat'] });
    }
  });

  it('drops unknown scope keys and falls back to the defaults on an empty list', async () => {
    await post({
      op: 'ingest',
      text: TEXT,
      title: 'Handout',
      tags: { tools: ['roleplay', 'exfiltrate'], species: [] },
    });
    expect((upsertedDoc().metadata as Bag).tags).toMatchObject({
      tools: ['roleplay'],
      species: ALL_KNOWLEDGE_SPECIES,
    });
  });

  it('still rejects an unknown focus area', async () => {
    const res = await post({
      op: 'ingest',
      text: TEXT,
      title: 'Handout',
      tags: { focus: 'astrology' },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/astrology/);
  });

  it('re-embed preserves the stored scope', async () => {
    const res = await post({ op: 're-embed', slug: 'custom:existing' });
    expect(res.status).toBe(200);
    expect((upsertedDoc().metadata as Bag).tags).toMatchObject({
      focus: 'gi',
      tools: ['fecal-scan'],
      species: ['cat'],
    });
    for (const c of insertedChunks()) {
      expect(c.tags).toMatchObject({ tools: ['fecal-scan'], species: ['cat'] });
    }
  });
});
