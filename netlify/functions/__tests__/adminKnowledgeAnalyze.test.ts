// @vitest-environment node
/**
 * `admin-knowledge-analyze` — the tag assistant. One Gemini call reads a
 * document and proposes title / summary / focus / tools / species / citation.
 *
 * What these pin: the model is only ever offered the REAL vocabularies (every
 * focus, tool and species key with its description is in the prompt), and
 * whatever it answers is normalised back INTO those vocabularies before the
 * UI sees it — an invented tool is dropped, an invented focus becomes null,
 * a confidence of 7 becomes 1. A PDF is extracted exactly once and the
 * markdown handed back so ingest never extracts it again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mocks.generateContent };
    constructor(_opts: unknown) {}
  }
  return { GoogleGenAI: MockGoogleGenAI, Type: {}, Modality: {} };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import analyzeFn from '../admin-knowledge-analyze';
import { EXTRACT_MODEL } from '../_shared/knowledgeIngest';
import { FOCUS_AREA_KEYS } from '../../../src/shared/knowledge/focusAreas';
import {
  ALL_KNOWLEDGE_SPECIES,
  DEFAULT_KNOWLEDGE_TOOLS,
  KNOWLEDGE_SPECIES_KEYS,
  KNOWLEDGE_TOOL_KEYS,
} from '../../../src/shared/knowledge/knowledgeScopes';
import { ANALYZE_MODEL_CHARS } from '../../../src/shared/knowledge/knowledgeAnalyze';
import { MODEL_TEXT } from '../../../src/shared/ai/models';
import type { SbCall } from './fakeSupabase';

let sb: FakeSupabase;

const TEXT =
  'Score 3.5 stools are moist, hold their shape and leave residue on pickup. ' +
  'Photograph the sample on a neutral background in daylight.';

const STORED_TEXT = 'A stored handout about sensitive stomachs in adult dogs.';

/** A well-formed model answer; individual tests override fields. */
function modelAnswer(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Fecal scoring: the 3.5 stool',
    summary: 'Describes what a 3.5 stool looks like. Useful when scoring photos.',
    category: 'clinical',
    focus: 'gi',
    tools: ['fecal-scan'],
    species: ['dog', 'puppy'],
    citation: 'Royal Canin — Fecal Scoring System for Dogs',
    topics: ['stool consistency', 'fecal chart'],
    confidence: 0.9,
    reasons: {
      focus: 'It is about stool and digestion.',
      tools: 'Mentions the Royal Canin fecal chart, so it belongs with Fecal Scan.',
      species: 'The chart covers dogs and puppies.',
    },
    warnings: [],
    ...overrides,
  };
}

function answerWith(payload: unknown) {
  mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(payload) });
}

/** The generateContent call at `index`. */
function geminiCall(index = 0): {
  model: string;
  contents: unknown;
  config: { systemInstruction?: string; responseMimeType?: string };
} {
  const call = mocks.generateContent.mock.calls[index];
  if (!call) throw new Error(`no generateContent call #${index}`);
  return call[0] as ReturnType<typeof geminiCall>;
}

function adminHeaders() {
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  return { authorization: 'Bearer admin' };
}

const post = (body: unknown, headers?: Record<string, string>) =>
  analyzeFn(jsonRequest('admin-knowledge-analyze', body, { headers }));

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.generateContent.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  sb.setHandler('knowledge_documents', (call: SbCall) => {
    const eq = call.ops.find((o) => o.op === 'eq');
    if (eq && eq.args[1] === 'custom:existing') {
      return {
        data: {
          slug: 'custom:existing',
          title: 'Existing handout',
          content: STORED_TEXT,
          metadata: { citation: 'Clinic, 2026', tags: { focus: 'gi' } },
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
});

describe('admin-knowledge-analyze — auth + input', () => {
  it('401s without a bearer token', async () => {
    const res = await post({ text: TEXT });
    expect(res.status).toBe(401);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('400s when no input is given', async () => {
    const res = await post({ title: 'Just a title' }, adminHeaders());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.stringMatching(/pdfBase64|text|slug/) });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('400s when two inputs are given', async () => {
    const res = await post({ text: TEXT, slug: 'custom:existing' }, adminHeaders());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/exactly one/i);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('400s on text over the request cap', async () => {
    const res = await post({ text: 'x'.repeat(200_001) }, adminHeaders());
    expect(res.status).toBe(400);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('400s on a PDF over the 4MB limit', async () => {
    const res = await post({ pdfBase64: 'A'.repeat(6 * 1024 * 1024) }, adminHeaders());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/4MB/);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('405s a GET', async () => {
    adminHeaders();
    const res = await analyzeFn(
      jsonRequest('admin-knowledge-analyze', null, {
        method: 'GET',
        headers: { authorization: 'Bearer admin' },
      }),
    );
    expect(res.status).toBe(405);
  });
});

describe('admin-knowledge-analyze — text path', () => {
  it('offers the model every focus, tool and species key with its description', async () => {
    answerWith(modelAnswer());
    const res = await post({ text: TEXT, title: 'Admin typed this' }, adminHeaders());
    expect(res.status).toBe(200);

    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    const call = geminiCall();
    expect(call.model).toBe(MODEL_TEXT);
    expect(call.config.responseMimeType).toBe('application/json');
    const prompt = call.config.systemInstruction ?? '';
    for (const key of FOCUS_AREA_KEYS) expect(prompt).toContain(`\`${key}\``);
    for (const key of KNOWLEDGE_TOOL_KEYS) expect(prompt).toContain(`\`${key}\``);
    for (const key of KNOWLEDGE_SPECIES_KEYS) expect(prompt).toContain(`\`${key}\``);
    // Descriptions, not just keys — the model decides FROM these.
    expect(prompt).toContain('Stool-photo scoring against the Royal Canin fecal charts.');
    expect(prompt).toContain('Obesity, weight-loss diets, body condition scoring, weight denial.');
    expect(prompt).toContain('Dogs from one year of age.');
    // The document and the admin's title hint reach the model.
    expect(JSON.stringify(call.contents)).toContain(TEXT);
    expect(JSON.stringify(call.contents)).toContain('Admin typed this');
  });

  it('returns the normalised analysis and no extraction fields', async () => {
    answerWith(modelAnswer());
    const res = await post({ text: TEXT }, adminHeaders());
    const body = await res.json();
    expect(body.extractedMarkdown).toBeUndefined();
    expect(body.extractedCitation).toBeUndefined();
    expect(body.analysis).toEqual({
      title: 'Fecal scoring: the 3.5 stool',
      summary: 'Describes what a 3.5 stool looks like. Useful when scoring photos.',
      category: 'clinical',
      focus: 'gi',
      tools: ['fecal-scan'],
      species: ['dog', 'puppy'],
      citation: 'Royal Canin — Fecal Scoring System for Dogs',
      topics: ['stool consistency', 'fecal chart'],
      confidence: 0.9,
      reasons: {
        focus: 'It is about stool and digestion.',
        tools: 'Mentions the Royal Canin fecal chart, so it belongs with Fecal Scan.',
        species: 'The chart covers dogs and puppies.',
      },
      warnings: [],
    });
  });

  it('drops an unknown tool, nulls a bad focus and clamps confidence', async () => {
    answerWith(
      modelAnswer({
        focus: 'astrology',
        tools: ['roleplay', 'exfiltrate', 'coach'],
        species: ['dog', 'hamster'],
        confidence: 7,
        category: 'marketing',
        topics: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      }),
    );
    const res = await post({ text: TEXT }, adminHeaders());
    const { analysis } = await res.json();
    expect(analysis.focus).toBeNull();
    expect(analysis.tools).toEqual(['roleplay', 'coach']);
    expect(analysis.species).toEqual(['dog']);
    expect(analysis.confidence).toBe(1);
    expect(analysis.category).toBe('custom');
    expect(analysis.topics).toHaveLength(6);
  });

  it('falls back to the default scope when the model returns nothing usable', async () => {
    answerWith(
      modelAnswer({
        tools: ['nonsense'],
        species: [],
        confidence: -3,
        citation: '',
        reasons: null,
        warnings: 'not an array',
      }),
    );
    const res = await post({ text: TEXT }, adminHeaders());
    const { analysis } = await res.json();
    expect(analysis.tools).toEqual(DEFAULT_KNOWLEDGE_TOOLS);
    expect(analysis.species).toEqual(ALL_KNOWLEDGE_SPECIES);
    expect(analysis.confidence).toBe(0);
    expect(analysis.citation).toBeNull();
    expect(analysis.reasons).toEqual({ focus: '', tools: '', species: '' });
    expect(analysis.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/species/i)]),
    );
  });

  it('cuts long content for the model and says so in warnings', async () => {
    answerWith(modelAnswer());
    const long = 'stool '.repeat(20_000); // 120k chars — over the model window
    const res = await post({ text: long }, adminHeaders());
    const { analysis } = await res.json();
    const sent = JSON.stringify(geminiCall().contents);
    expect(sent.length).toBeLessThan(ANALYZE_MODEL_CHARS + 2_000);
    expect(analysis.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/first 40/i)]),
    );
  });

  it('502s with the admin error shape when Gemini fails', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('upstream down'));
    const res = await post({ text: TEXT }, adminHeaders());
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });

  it('502s when Gemini answers with something that is not JSON', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: 'not json' });
    const res = await post({ text: TEXT }, adminHeaders());
    expect(res.status).toBe(502);
  });
});

describe('admin-knowledge-analyze — pdf path', () => {
  it('extracts once, analyses the markdown and hands the extraction back', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Extracted paper',
        citation: 'Davies et al., 2024 — JAVMA',
        markdown: '# Extracted\n\nOwners prefer weight-loss plans framed as health.',
      }),
    });
    answerWith(modelAnswer({ focus: 'weight', tools: DEFAULT_KNOWLEDGE_TOOLS, citation: null }));

    const res = await post({ pdfBase64: 'JVBERi0xLjQ=' }, adminHeaders());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    const extract = geminiCall(0);
    expect(extract.model).toBe(EXTRACT_MODEL);
    expect(JSON.stringify(extract.contents)).toContain('JVBERi0xLjQ=');
    const analyse = geminiCall(1);
    expect(analyse.model).toBe(MODEL_TEXT);
    expect(JSON.stringify(analyse.contents)).toContain('Owners prefer weight-loss plans');
    expect(JSON.stringify(analyse.contents)).not.toContain('JVBERi0xLjQ=');

    expect(body.extractedMarkdown).toBe(
      '# Extracted\n\nOwners prefer weight-loss plans framed as health.',
    );
    expect(body.extractedCitation).toBe('Davies et al., 2024 — JAVMA');
    // The model said null, but the extraction found a citation — keep it.
    expect(body.analysis.citation).toBe('Davies et al., 2024 — JAVMA');
    expect(body.analysis.focus).toBe('weight');
  });

  it('502s when the extraction itself fails', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('extract failed'));
    const res = await post({ pdfBase64: 'JVBERi0xLjQ=' }, adminHeaders());
    expect(res.status).toBe(502);
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('admin-knowledge-analyze — slug path', () => {
  it('reads the stored document and analyses its content', async () => {
    answerWith(modelAnswer());
    const res = await post({ slug: 'custom:existing' }, adminHeaders());
    expect(res.status).toBe(200);

    expect(sb.firstOp('knowledge_documents', 'eq')?.args).toEqual(['slug', 'custom:existing']);
    const sent = JSON.stringify(geminiCall().contents);
    expect(sent).toContain(STORED_TEXT);
    expect(sent).toContain('Existing handout');
    const body = await res.json();
    expect(body.extractedMarkdown).toBeUndefined();
    expect(body.analysis.tools).toEqual(['fecal-scan']);
  });

  it('404s an unknown slug without calling the model', async () => {
    const res = await post({ slug: 'custom:missing' }, adminHeaders());
    expect(res.status).toBe(404);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });
});
