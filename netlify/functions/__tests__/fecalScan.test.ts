// @vitest-environment node
/**
 * Handler tests for `ai-fecal-scan` — the OBSERVE → RETRIEVE → GROUND → SCORE
 * pipeline. `@google/genai`, `@supabase/supabase-js` and `_shared/retrieval`
 * are mocked, so no embedding or model call leaves the process.
 *
 * The load-bearing assertions are the grounding ones: the scoring prompt must
 * contain the retrieved passages VERBATIM and ALWAYS the whole chart (every
 * score reachable whatever retrieval returned), another species' chart must
 * never reach the scorer, and the exact-reference shortcut must only ever
 * fire on the chart's own photograph.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  jsonRequest,
  makeFakeSupabase,
  setFunctionEnv,
  type FakeSupabase,
} from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  createClient: vi.fn(),
  retrieveChunks: vi.fn(),
  fetch: vi.fn(),
  decode: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mocks.generateContent };
    constructor(_opts: unknown) {}
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      INTEGER: 'INTEGER',
      NUMBER: 'NUMBER',
      ARRAY: 'ARRAY',
      BOOLEAN: 'BOOLEAN',
    },
    Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
    ThinkingLevel: { MINIMAL: 'MINIMAL', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' },
  };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../_shared/retrieval', () => ({ retrieveChunks: mocks.retrieveChunks }));
vi.mock('jpeg-js', () => ({ decode: mocks.decode }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fecalScan, {
  __setReferenceDiskRoots,
  assembleFecalGrounding,
} from '../ai-fecal-scan';
import { __resetAiCaches, __resetRateLimits } from '../_shared/ai';
import { AI_LIMITS } from '../../../src/shared/ai/contract';
import { MODEL_EMBEDDING, MODEL_TEXT } from '../../../src/shared/ai/models';
import {
  fecalChartChunks,
  fecalChartScores,
  fecalEntryParagraph,
  FECAL_CHARTS,
  type FecalSpecies,
} from '../../../src/data/knowledge/fecalCharts';

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const OBSERVATIONS = {
  form: 'distinct cylindrical shape',
  moisture: 'moist',
  surface: 'no visible cracks',
  residue: 'would leave some residue',
  homogeneity: 'homogeneous',
};

const observeOk = (over: Record<string, unknown> = {}) => ({
  text: JSON.stringify({
    isStool: true,
    observations: OBSERVATIONS,
    notVisible: ['odour'],
    ...over,
  }),
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
});

const scoreOk = (over: Record<string, unknown> = {}) => ({
  text: JSON.stringify({
    score: 3.5,
    mostSimilarReference: 0,
    confidence: 0.82,
    rationale: 'Moist stool with no cracks; the components stick to one another.',
    alternates: [{ score: 3, confidence: 0.3 }],
    notVisible: ['odour', 'volume'],
    caution: 'Involve the veterinarian if this persists.',
    ...over,
  }),
  usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 60 },
});

const paragraph = (species: FecalSpecies, score: number) =>
  fecalEntryParagraph(species, FECAL_CHARTS[species].entries.find((e) => e.score === score)!);
const dogParagraph = (score: number) => paragraph('dog', score);

const DOG_SCORES = [1, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/**
 * Each chart photo is stubbed as a tiny "JPEG" (the real FF D8 FF magic, then
 * one byte that identifies the score: 3.5 → 35), so the decoder stub below
 * can turn it into a distinct image and the exact-reference guard can be
 * exercised for real.
 */
const seedOf = (score: number) => Math.round(score * 10);
const jpegFor = (score: number) => Uint8Array.from([0xff, 0xd8, 0xff, seedOf(score)]);
const b64For = (score: number) => Buffer.from(jpegFor(score)).toString('base64');
/** An upload whose dHash equals the 3.5 photo's but whose pixels do not. */
const HASH_TWIN_OF_35 = Buffer.from(Uint8Array.from([0xff, 0xd8, 0xff, 235])).toString('base64');

type FetchMode = 'ok' | 'missing' | 'html' | 'bad-bytes';

/** Serves every /fecal-scan/**.jpg request; `modes` overrides per path suffix. */
function stubFetch(modes: Record<string, FetchMode> = {}) {
  mocks.fetch.mockImplementation((url: string) => {
    const score = Number(new URL(url).pathname.split('/').pop()!.replace('.jpg', ''));
    const mode = Object.entries(modes).find(([suffix]) => url.endsWith(suffix))?.[1] ?? 'ok';
    if (mode === 'missing') {
      return Promise.resolve(new Response(new Uint8Array(0), { status: 404 }));
    }
    if (mode === 'html') {
      // What the SPA fallback really does for a missing static file.
      return Promise.resolve(
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
      );
    }
    const bytes = mode === 'bad-bytes' ? Uint8Array.from([0x3c, 0x21, 0x64, 0x6f]) : jpegFor(score);
    return Promise.resolve(
      new Response(bytes, { status: 200, headers: { 'content-type': 'image/jpeg' } }),
    );
  });
}

/** Deterministic 32×32 noise for a seed. */
function noiseImage(seed: number): { width: number; height: number; data: Uint8Array } {
  const width = 32;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  let s = (seed * 2654435761) >>> 0;
  for (let i = 0; i < width * height; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const v = s >>> 24;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

/**
 * Fake JPEG decoder: the LAST byte of the buffer seeds deterministic noise,
 * so two different stub images are far apart and the same stub image
 * fingerprints identically. Seed 235 is the 3.5 photo with its contrast
 * halved — the same dHash, different pixels. Keeps the real dHash + pixel
 * check in the loop — only the decode is faked.
 */
function stubDecode() {
  mocks.decode.mockImplementation((buf: Uint8Array | Buffer) => {
    const bytes = Uint8Array.from(buf);
    if (bytes.length === 0) throw new Error('not a JPEG');
    const seed = bytes[bytes.length - 1];
    if (seed === 235) {
      const img = noiseImage(35);
      for (let i = 0; i < img.data.length; i += 4) {
        for (let c = 0; c < 3; c++) img.data[i + c] = 128 + (img.data[i + c] - 128) / 2;
      }
      return img;
    }
    return noiseImage(seed);
  });
}

type Part = { text?: string; inlineData?: { mimeType: string; data: string } };
type Turn = { role: string; parts: Part[] };

/** The `contents` turns of the Nth generateContent call. */
const turnsOf = (call: number): Turn[] =>
  mocks.generateContent.mock.calls[call][0].contents as Turn[];

/** The reference-photo turns — every turn but the last. */
const referenceTurns = (call: number): Turn[] => turnsOf(call).slice(0, -1);

/** The final turn: "PHOTO TO SCORE:" + the user image + observations. */
const scoringTurn = (call: number): Part[] => turnsOf(call).at(-1)!.parts;

/** The scorer's system prompt (the SECOND model call of a scan). */
const scorerPrompt = (call = 1): string =>
  mocks.generateContent.mock.calls[call][0].config.systemInstruction as string;

const fetchedPaths = (): string[] =>
  mocks.fetch.mock.calls.map((c) => new URL(String(c[0])).pathname);

const ragChunk = (content: string, similarity: number, over: Record<string, unknown> = {}) => ({
  content,
  citation: 'Royal Canin — Fecal Scoring System for Dogs, VGI/064/0324',
  tags: { focus: 'gi', topic: 'fecal-scoring', tools: ['fecal-scan'], species: ['dog'] },
  similarity,
  docSlug: 'fecal:dog',
  docTitle: FECAL_CHARTS.dog.title,
  ...over,
});

/** Every ai_call_telemetry row inserted, in order. */
const telemetryRows = (): Array<Record<string, unknown>> =>
  sb
    .callsFor('ai_call_telemetry')
    .flatMap((c) => c.ops.filter((o) => o.op === 'insert').map((o) => o.args[0] as Record<string, unknown>));
const telemetryRow = (callType: string) => telemetryRows().find((r) => r.call_type === callType);

function scan(body: Record<string, unknown>, init?: Parameters<typeof jsonRequest>[2]) {
  return fecalScan(
    jsonRequest('ai-fecal-scan', { imageBase64: PNG, mimeType: 'image/jpeg', species: 'dog', ...body }, init),
  );
}

let sb: FakeSupabase;

beforeEach(() => {
  setFunctionEnv();
  delete process.env.DEPLOY_URL;
  delete process.env.URL;
  __resetRateLimits();
  __resetAiCaches();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.generateContent.mockReset();
  mocks.retrieveChunks.mockReset();
  mocks.retrieveChunks.mockResolvedValue([]);
  mocks.fetch.mockReset();
  stubFetch();
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.decode.mockReset();
  stubDecode();
  // HTTP only by default, so the stubs above are what gets loaded.
  __setReferenceDiskRoots([]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  __setReferenceDiskRoots(null);
});

describe('ai-fecal-scan — request validation', () => {
  it('rejects GET with 405', async () => {
    const res = await fecalScan(jsonRequest('ai-fecal-scan', {}, { method: 'GET' }));
    expect(res.status).toBe(405);
    expect(await res.json()).toMatchObject({ code: 'bad_request' });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('rejects an unsupported mime type and a data-URL payload with 400', async () => {
    const mime = await scan({ mimeType: 'image/gif' });
    expect(mime.status).toBe(400);
    const dataUrl = await scan({ imageBase64: `data:image/png;base64,${PNG}` });
    expect(dataUrl.status).toBe(400);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('rejects an unknown species with 400 and ignores an invalid breed size', async () => {
    const bad = await scan({ species: 'ferret' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ code: 'bad_request' });
    expect(mocks.generateContent).not.toHaveBeenCalled();

    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const ok = await scan({ breedSize: 'enormous' });
    expect(ok.status).toBe(200);
  });

  it('rejects an oversized image with 413', async () => {
    const res = await scan({ imageBase64: 'A'.repeat(AI_LIMITS.maxImageBase64Chars + 4) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: 'payload_too_large' });
  });
});

describe('ai-fecal-scan — not a stool photo', () => {
  it('returns early without retrieving or scoring', async () => {
    mocks.generateContent.mockResolvedValueOnce(
      observeOk({ isStool: false, notVisible: ['everything — this is not a stool'] }),
    );
    const res = await scan({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isStool).toBe(false);
    expect(body.retrieval).toMatchObject({
      source: 'bundled',
      query: '',
      docSlugs: ['fecal:dog'],
      chunks: [],
      scope: { tool: 'fecal-scan', species: 'dog' },
    });
    expect(mocks.retrieveChunks).not.toHaveBeenCalled();
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    // No retrieval ran, so no retrieval row.
    expect(telemetryRows().map((r) => r.call_type)).toEqual(['fecal_scan']);
  });

  it('never returns the English observer text to a French caller', async () => {
    mocks.generateContent.mockResolvedValueOnce(
      observeOk({ isStool: false, notVisible: ['everything — this is not a stool'] }),
    );
    const body = await (await scan({ locale: 'fr' })).json();
    expect(body.result.isStool).toBe(false);
    expect(body.result.observations.form).toBe('Non décrit');
    expect(body.result.notVisible).toEqual([]);
  });
});

describe('ai-fecal-scan — grounded scoring', () => {
  it('retrieves on the observation text and quotes the passages verbatim', async () => {
    const passage = dogParagraph(3.5);
    mocks.retrieveChunks.mockResolvedValueOnce([ragChunk(passage, 0.93)]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());

    const res = await scan({});
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(mocks.retrieveChunks).toHaveBeenCalledTimes(1);
    const [query, opts] = mocks.retrieveChunks.mock.calls[0];
    expect(query).toContain('no visible cracks');
    expect(query).toContain('moist');
    // Scoped by TOOL + SPECIES, not by document slug: an admin supplement
    // filed for the fecal scan must be retrievable alongside the chart.
    expect(opts).toMatchObject({ k: 8, filters: { tool: 'fecal-scan', species: 'dog' } });
    expect(opts.filters.docSlugs).toBeUndefined();
    expect(opts.sb).toBeDefined();

    // The SECOND model call is the scorer; its prompt carries the passage.
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    const scorer = mocks.generateContent.mock.calls[1][0];
    expect(scorer.model).toBe(MODEL_TEXT);
    expect(scorer.config.systemInstruction).toContain(passage);
    expect(scorer.config.systemInstruction).toContain('REFERENCE PASSAGES');
    // The observer never saw the chart.
    expect(mocks.generateContent.mock.calls[0][0].config.systemInstruction).not.toContain(passage);

    expect(body.retrieval).toMatchObject({
      source: 'rag',
      // Reported from the hits' own provenance, not hard-wired.
      docSlugs: ['fecal:dog'],
      scope: { tool: 'fecal-scan', species: 'dog' },
    });
    expect(body.retrieval.query).toBe(query);
    // The retrieved passage first (with its relevance), then the rest of the
    // chart the scorer was also given.
    expect(body.retrieval.chunks).toHaveLength(2);
    expect(body.retrieval.chunks[0]).toMatchObject({
      similarity: 0.93,
      excerpt: passage,
      scores: [3.5],
      citation: 'Royal Canin — Fecal Scoring System for Dogs, VGI/064/0324',
      docTitle: FECAL_CHARTS.dog.title,
      kind: 'chart',
    });
    expect(body.retrieval.chunks[1]).toMatchObject({
      similarity: null,
      kind: 'chart',
      scores: [1, 2, 2.5, 3, 4, 4.5, 5],
    });

    expect(body.result).toMatchObject({
      isStool: true,
      species: 'dog',
      score: 3.5,
      band: 'tooSoft',
      confidence: 0.82,
    });
    // English keeps the observer's own words.
    expect(body.result.observations).toMatchObject(OBSERVATIONS);
    // ONE source for notVisible: the scorer's.
    expect(body.result.notVisible).toEqual(['odour', 'volume']);

    const scanRow = telemetryRow('fecal_scan');
    expect(scanRow).toMatchObject({
      call_type: 'fecal_scan',
      model_id: MODEL_TEXT,
      // One row for the scan, tokens summed across both model calls…
      tokens_in: 500,
      tokens_out: 80,
    });
    // …plus the retrieval row the spec promises.
    expect(telemetryRow('retrieval')).toMatchObject({
      call_type: 'retrieval',
      model_id: MODEL_EMBEDDING,
      tokens_out: 0,
      error: null,
    });
    expect(telemetryRows()).toHaveLength(2);
  });

  it('falls back to the bundled chart when retrieval returns nothing', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const res = await scan({});
    const body = await res.json();

    const prompt = scorerPrompt();
    for (const score of DOG_SCORES) expect(prompt).toContain(dogParagraph(score));
    expect(prompt).toContain('CLEARLY DEFINED SHAPE WITH VISIBLE CRACKS');
    expect(body.retrieval.source).toBe('bundled');
    expect(body.retrieval.docSlugs).toEqual(['fecal:dog']);
    expect(body.retrieval.chunks).toHaveLength(1);
    expect(body.retrieval.chunks[0]).toMatchObject({ similarity: null, kind: 'chart', scores: DOG_SCORES });
    expect(body.retrieval.chunks[0].citation).toContain('VGI/064/0324');
  });

  it('still answers 200 bundled when retrieval throws, and records the retrieval error', async () => {
    mocks.retrieveChunks.mockRejectedValueOnce(new Error('pgvector down'));
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const res = await scan({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retrieval.source).toBe('bundled');
    expect(body.result.score).toBe(3.5);
    expect(telemetryRow('retrieval')).toMatchObject({ error: 'pgvector down' });
  });

  it('bands puppy score 3 by breed size', async () => {
    mocks.retrieveChunks.mockResolvedValue([]);
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 3 }));
    const big = await scan({ species: 'puppy', breedSize: 'large-giant' });
    expect((await big.json()).result).toMatchObject({ score: 3, band: 'normal' });
    expect(mocks.retrieveChunks.mock.calls[0][1]).toMatchObject({
      filters: { tool: 'fecal-scan', species: 'puppy' },
    });

    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 3 }));
    const small = await scan({ species: 'puppy', breedSize: 'small-medium' });
    expect((await small.json()).result).toMatchObject({ score: 3, band: 'tooSoft' });
  });
});

/**
 * The bug: retrieval (k = 6) used to decide which scores the scorer could
 * answer, so on an 8-score dog chart two scores were unreachable on EVERY
 * scan — and a right answer outside the retrieved six was "coerced" to a
 * wrong one at 0.4.
 */
describe('ai-fecal-scan — the whole chart is always offered', () => {
  const sixMiddle = () =>
    mocks.retrieveChunks.mockResolvedValueOnce(
      [2, 2.5, 3, 3.5, 4, 4.5].map((s, i) => ragChunk(dogParagraph(s), 0.9 - i * 0.05)),
    );

  it.each(DOG_SCORES)(
    'dog score %s is reachable even when retrieval returns six other passages',
    async (score) => {
      sixMiddle();
      mocks.generateContent
        .mockResolvedValueOnce(observeOk())
        .mockResolvedValueOnce(scoreOk({ score, confidence: 0.77, alternates: [] }));
      const body = await (await scan({})).json();
      expect(body.result.score).toBe(score);
      // Not treated as ungrounded: the confidence is the model's own.
      expect(body.result.confidence).toBe(0.77);

      // The scorer saw every score's wording and every chart photo.
      const prompt = scorerPrompt();
      for (const s of DOG_SCORES) expect(prompt).toContain(dogParagraph(s));
      expect(body.retrieval.referenceScores).toEqual(DOG_SCORES);
      expect(referenceTurns(1)).toHaveLength(8);
    },
  );

  it('ranks the retrieved passages in the trail and bundles only the missing scores', async () => {
    sixMiddle();
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const body = await (await scan({})).json();
    const chunks = body.retrieval.chunks as Array<{ similarity: number | null; scores: number[] }>;
    expect(chunks).toHaveLength(7);
    expect(chunks.slice(0, 6).map((c) => c.scores[0])).toEqual([2, 2.5, 3, 3.5, 4, 4.5]);
    expect(chunks.slice(0, 6).every((c) => typeof c.similarity === 'number')).toBe(true);
    expect(chunks[6]).toMatchObject({ similarity: null, scores: [1, 5] });
    expect(body.retrieval.source).toBe('rag');
  });

  it('shows the chart to the scorer as a scale, not in retrieval order', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([
      ragChunk(dogParagraph(4), 0.95),
      ragChunk(dogParagraph(2), 0.9),
    ]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    await scan({});
    const prompt = scorerPrompt();
    const at = (s: number) => prompt.indexOf(dogParagraph(s));
    for (let i = 1; i < DOG_SCORES.length; i++) {
      expect(at(DOG_SCORES[i - 1])).toBeLessThan(at(DOG_SCORES[i]));
    }
  });

  it('still snaps an answer that is not a chart score at all', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 3.2 }));
    const body = await (await scan({})).json();
    expect(body.result.score).toBe(3);
    expect(body.result.band).toBe('acceptable');
  });
});

/**
 * An admin can file a document "Fecal Scan · dog" and it is retrieved
 * alongside the chart. Those supplements must be visible to the tech, must be
 * labelled as lower authority to the scorer, and must never displace the
 * chart.
 */
describe('ai-fecal-scan — admin supplements inside the scope', () => {
  const SUPPLEMENT =
    'Clinic note: photograph the sample on a neutral background in daylight; ' +
    'consistency reads differently under warm indoor light.';

  const supplementChunk = (similarity: number) =>
    ragChunk(SUPPLEMENT, similarity, {
      citation: 'Clinic handout, 2026',
      docSlug: 'custom:photo-tips',
      docTitle: 'Photographing a stool sample',
      tags: { tools: ['fecal-scan'], species: ['dog'] },
    });

  it('reports every document the passages came from, de-duplicated, with kinds', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([
      ragChunk(dogParagraph(3.5), 0.93),
      supplementChunk(0.71),
      ragChunk(dogParagraph(3), 0.66),
    ]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());

    const body = await (await scan({})).json();
    expect(body.retrieval.docSlugs).toEqual(['fecal:dog', 'custom:photo-tips']);
    expect(body.retrieval.scope).toEqual({ tool: 'fecal-scan', species: 'dog' });
    const chunks = body.retrieval.chunks as Array<{ docTitle: string | null; kind: string }>;
    expect(chunks.map((c) => c.docTitle)).toEqual([
      FECAL_CHARTS.dog.title,
      'Photographing a stool sample',
      FECAL_CHARTS.dog.title,
      null, // the bundled rest of the chart
    ]);
    expect(chunks.map((c) => c.kind)).toEqual(['chart', 'supplement', 'chart', 'chart']);
  });

  it('labels chart and supplement passages by authority in the scoring prompt', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([
      ragChunk(dogParagraph(3.5), 0.93),
      supplementChunk(0.71),
    ]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());

    const body = await (await scan({})).json();
    const prompt = scorerPrompt();
    expect(prompt).toContain(`[ROYAL CANIN CHART]\n${dogParagraph(3.5)}`);
    expect(prompt).toContain(
      `[CLINIC SUPPLEMENT (lower authority — the chart decides) — Photographing a stool sample]\n${SUPPLEMENT}`,
    );
    // The supplement contributed context and took nothing away.
    expect(body.result.score).toBe(3.5);
    expect(body.result.confidence).toBe(0.82);
    expect(body.retrieval.referenceScores).toEqual(DOG_SCORES);
  });

  it('supplement-only retrieval still grounds on the whole chart text', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([supplementChunk(0.8)]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());

    const body = await (await scan({})).json();
    // A passage came from retrieval → 'rag'; the chart came from code.
    expect(body.retrieval.source).toBe('rag');
    expect(body.retrieval.docSlugs).toEqual(['custom:photo-tips', 'fecal:dog']);
    expect(body.retrieval.chunks.map((c: { kind: string }) => c.kind)).toEqual([
      'supplement',
      'chart',
    ]);
    const prompt = scorerPrompt();
    for (const s of DOG_SCORES) expect(prompt).toContain(`[ROYAL CANIN CHART]\n${dogParagraph(s)}`);
    expect(prompt).toContain(SUPPLEMENT);
    expect(body.retrieval.referenceScores).toEqual(DOG_SCORES);
    expect(body.result.score).toBe(3.5);
    expect(body.result.confidence).toBe(0.82);
  });
});

/**
 * An admin can re-scope the `fecal:dog` document to species ['dog','cat'];
 * retrieval then honestly returns it for a cat scan. The function must refuse
 * it anyway — a cat score must never stand on dog wording.
 */
describe('ai-fecal-scan — cross-species guard', () => {
  it("drops another species' chart chunk whatever its tags say", async () => {
    const dogWording = dogParagraph(4); // "MOIST STOOL WITH LITTLE CONSISTENCY…"
    mocks.retrieveChunks.mockResolvedValueOnce([
      ragChunk(dogWording, 0.97, { tags: { tools: ['fecal-scan'], species: ['dog', 'cat'] } }),
      ragChunk(paragraph('cat', 4), 0.8, {
        docSlug: 'fecal:cat',
        docTitle: FECAL_CHARTS.cat.title,
        citation: 'Royal Canin — Fecal Scoring System for Cats, VGI/064/0324',
      }),
    ]);
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 4 }));

    const body = await (await scan({ species: 'cat' })).json();
    expect(scorerPrompt()).not.toContain(dogWording);
    expect(scorerPrompt()).not.toContain('Fecal Scoring System for Dogs');
    expect(body.retrieval.docSlugs).toEqual(['fecal:cat']);
    expect(body.retrieval.chunks.map((c: { excerpt: string }) => c.excerpt)).not.toContain(dogWording);
    expect(body.retrieval.chunks[0]).toMatchObject({ similarity: 0.8, kind: 'chart', scores: [4] });
    expect(body.result).toMatchObject({ species: 'cat', score: 4 });
  });

  it('never grounds a puppy on the adult dog chart (or vice versa)', () => {
    const g = assembleFecalGrounding('puppy', [
      ragChunk(dogParagraph(3), 0.9) as never,
      ragChunk(paragraph('puppy', 3), 0.8, { docSlug: 'fecal:puppy' }) as never,
    ]);
    expect(g.dropped).toBe(1);
    expect(g.passages.every((p) => !p.text.includes('Fecal Scoring System for Dogs'))).toBe(true);
    expect(g.chunks[0]).toMatchObject({ similarity: 0.8, kind: 'chart' });
  });

  it('recognises a chart chunk by its title when the RPC returned no provenance', () => {
    const [dogChunk] = fecalChartChunks('dog');
    const [catChunk] = fecalChartChunks('cat');
    const g = assembleFecalGrounding('cat', [
      { content: dogChunk, citation: null, tags: null, similarity: 0.9 },
      { content: catChunk, citation: null, tags: null, similarity: 0.8 },
    ]);
    expect(g.dropped).toBe(1);
    expect(g.chunks[0]).toMatchObject({ excerpt: catChunk, kind: 'chart' });
    expect(g.docSlugs).toEqual(['fecal:cat']);
  });

  it('keeps a supplement that merely names another chart in passing', () => {
    const g = assembleFecalGrounding('cat', [
      {
        content: 'Our cats are scored on the cat chart, not the Fecal Scoring System for Dogs.',
        citation: 'Clinic SOP',
        tags: null,
        similarity: 0.5,
        docSlug: 'custom:sop',
        docTitle: 'Clinic SOP',
      },
    ]);
    expect(g.dropped).toBe(0);
    expect(g.chunks[0]).toMatchObject({ kind: 'supplement' });
  });
});

describe('ai-fecal-scan — chart reference photos', () => {
  it('sends every chart photo as its own numbered turn, labelled before AND after', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([ragChunk(dogParagraph(3.5), 0.95)]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());

    const res = await scan({});
    expect(res.status).toBe(200);
    const body = await res.json();

    // One turn per chart photo, plus the scoring turn.
    const refs = referenceTurns(1);
    expect(refs).toHaveLength(8);
    expect(turnsOf(1)).toHaveLength(9);

    DOG_SCORES.forEach((score, i) => {
      const parts = refs[i].parts;
      expect(refs[i].role).toBe('user');
      expect(parts).toHaveLength(3);
      // Label, image, label again — the model confused which caption went
      // with which image when they were all interleaved in one turn.
      expect(parts[0].text).toBe(
        `REFERENCE PHOTO ${i + 1} of 8 — Score ${score} (${
          FECAL_CHARTS.dog.entries.find((e) => e.score === score)!.label
        })`,
      );
      expect(parts[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: b64For(score) });
      expect(parts[2].text).toBe(`(end of reference ${i + 1} — Score ${score})`);
    });

    // The user's photo is alone in the final turn, announced as such.
    const scoring = scoringTurn(1);
    expect(scoring[0].text).toContain('PHOTO TO SCORE');
    expect(scoring[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: PNG });
    expect(scoring[2].text).toContain('distinct cylindrical shape');

    expect(body.retrieval.referenceScores).toEqual(DOG_SCORES);
  });

  it('omits only the photo that fails to load and still scores', async () => {
    stubFetch({ '/fecal-scan/dog/3.5.jpg': 'missing' });
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());

    const res = await scan({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retrieval.referenceScores).toEqual([1, 2, 2.5, 3, 4, 4.5, 5]);
    expect(referenceTurns(1)).toHaveLength(7);
    // 3.5 is still an allowed score — only its picture is missing.
    expect(body.result.score).toBe(3.5);
  });

  it('refuses an SPA-fallback index.html (200, text/html) and does not cache it', async () => {
    stubFetch({ '/fecal-scan/dog/4.jpg': 'html', '/fecal-scan/dog/2.jpg': 'bad-bytes' });
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk())
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk());

    const body = await (await scan({})).json();
    // Neither the HTML page nor a mislabelled non-JPEG ever reaches Gemini.
    expect(body.retrieval.referenceScores).toEqual([1, 2.5, 3, 3.5, 4.5, 5]);
    for (const turn of referenceTurns(1)) {
      expect(turn.parts[1].inlineData!.mimeType).toBe('image/jpeg');
      expect(Buffer.from(turn.parts[1].inlineData!.data, 'base64')[0]).toBe(0xff);
    }

    // The deploy is fixed; the failures were NOT remembered, so the next
    // request fetches exactly those two again (and nothing else).
    stubFetch();
    mocks.fetch.mockClear();
    const again = await (await scan({})).json();
    expect(fetchedPaths().sort()).toEqual(['/fecal-scan/dog/2.jpg', '/fecal-scan/dog/4.jpg']);
    expect(again.retrieval.referenceScores).toEqual(DOG_SCORES);
  });

  it('bounds every photo fetch with a timeout', async () => {
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    await scan({});
    expect(mocks.fetch).toHaveBeenCalledTimes(8);
    for (const call of mocks.fetch.mock.calls) {
      expect((call[1] as RequestInit | undefined)?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("fetches from the deploy's own URL and caches by pathname, never by request host", async () => {
    process.env.DEPLOY_URL = 'https://deploy-123--pbt.netlify.app';
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk())
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk());

    await scan({}, { headers: { host: 'attacker.example' } });
    expect(mocks.fetch.mock.calls.map((c) => new URL(String(c[0])).host)).toEqual(
      Array(8).fill('deploy-123--pbt.netlify.app'),
    );
    // A second request (any host) is served from the pathname-keyed cache.
    await fecalScan(
      new Request('http://other-host.example/.netlify/functions/ai-fecal-scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '203.0.113.9' },
        body: JSON.stringify({ imageBase64: PNG, mimeType: 'image/jpeg', species: 'dog' }),
      }),
    );
    expect(mocks.fetch).toHaveBeenCalledTimes(8);
  });

  it('loads the photos from the function bundle on disk when they are there', async () => {
    __setReferenceDiskRoots([process.cwd()]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const body = await (await scan({})).json();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(body.retrieval.referenceScores).toEqual(DOG_SCORES);
    const onDisk = readFileSync(join(process.cwd(), 'public/fecal-scan/dog/3.5.jpg')).toString('base64');
    expect(referenceTurns(1)[4].parts[1].inlineData!.data).toBe(onDisk);
  });

  it('prefetches the whole chart during OBSERVE and memoises it across requests', async () => {
    mocks.retrieveChunks.mockResolvedValue([ragChunk(dogParagraph(3.5), 0.9)]);
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk())
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk());

    await scan({});
    // All 8 fetched up front (overlapping the OBSERVE call), each exactly once…
    const first = fetchedPaths();
    expect(first).toHaveLength(8);
    expect(new Set(first).size).toBe(8);

    await scan({});
    expect(fetchedPaths()).toHaveLength(8); // …and nothing refetched.
    expect(referenceTurns(3)).toHaveLength(8);
  });

  it('reports no reference photos when the image is not a stool', async () => {
    mocks.generateContent.mockResolvedValueOnce(observeOk({ isStool: false }));
    const body = await (await scan({})).json();
    expect(body.retrieval).toMatchObject({
      referenceScores: [],
      exactReference: null,
      mostSimilarReference: null,
    });
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('ai-fecal-scan — exact-reference guard', () => {
  /**
   * The live failure this fixes: dog/3.5.jpg — the chart's OWN photo — came
   * back as "score 4 @ 0.99, visually identical to the reference photo for
   * Score 4". A deterministic comparison settles that without asking the
   * model. The inverse failure — the guard firing on a real clinic photo —
   * is pinned against real JPEGs in `src/shared/ai/__tests__/imageHash.test.ts`.
   */
  it('overrides the model when the photo IS a chart photo', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 4, confidence: 0.99, rationale: 'Looks like a 4.' }));

    const res = await scan({ imageBase64: b64For(3.5), mimeType: 'image/jpeg' });
    const body = await res.json();

    expect(body.result.score).toBe(3.5);
    expect(body.result.band).toBe('tooSoft');
    expect(body.result.confidence).toBeGreaterThanOrEqual(0.99);
    expect(body.result.rationale).toContain(
      "Matches the chart's own reference photo for Score 3.5.",
    );
    expect(body.result.rationale).toContain('Looks like a 4.');
    expect(body.retrieval.exactReference).toBe(3.5);

    // Latency: the score is already settled, so the scorer sees only the
    // matched photo (it still writes the rationale) — not all 8.
    expect(referenceTurns(1)).toHaveLength(1);
    expect(referenceTurns(1)[0].parts[0].text).toContain('Score 3.5');
    expect(body.retrieval.referenceScores).toEqual([3.5]);
  });

  it('raises a low model confidence rather than lowering a high one', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 1, confidence: 0.2 }));
    const body = await (await scan({ imageBase64: b64For(2), mimeType: 'image/jpeg' })).json();
    expect(body.result.score).toBe(2);
    expect(body.result.confidence).toBeGreaterThanOrEqual(0.99);
  });

  it('does not fire on a photo that is not in the chart', async () => {
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const notAChartPhoto = Buffer.from(Uint8Array.from([0xff, 0xd8, 0xff, 200])).toString('base64');
    const body = await (await scan({ imageBase64: notAChartPhoto, mimeType: 'image/jpeg' })).json();
    expect(body.retrieval.exactReference).toBeNull();
    expect(body.result.score).toBe(3.5); // the model's own answer, untouched
    expect(body.result.confidence).toBe(0.82);
    expect(body.result.rationale).not.toContain("chart's own reference photo");
  });

  it('does not fire on a dHash twin whose pixels differ (the silhouette failure)', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 4, confidence: 0.7 }));
    const body = await (await scan({ imageBase64: HASH_TWIN_OF_35, mimeType: 'image/jpeg' })).json();
    expect(body.retrieval.exactReference).toBeNull();
    expect(body.result.score).toBe(4);
    expect(body.result.confidence).toBe(0.7);
    expect(referenceTurns(1)).toHaveLength(8);
  });

  it("only ever matches inside the selected species' chart", async () => {
    // Stub photos are keyed by score, so the dog 4.5 photo exists only on
    // the dog and puppy charts — a cat scan of it must not match anything.
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 4, confidence: 0.6 }));
    const cat = await (await scan({ species: 'cat', imageBase64: b64For(4.5) })).json();
    expect(cat.retrieval.exactReference).toBeNull();
    expect(cat.result).toMatchObject({ score: 4, confidence: 0.6 });
    expect(fetchedPaths().every((p) => p.startsWith('/fecal-scan/cat/'))).toBe(true);
  });

  it('skips the guard for png and webp, which the client never sends', async () => {
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    // Same bytes as the 3.5 reference, but declared as a PNG.
    const body = await (await scan({ imageBase64: b64For(3.5), mimeType: 'image/png' })).json();
    expect(body.retrieval.exactReference).toBeNull();
    expect(body.result.score).toBe(3.5);
    expect(body.result.confidence).toBe(0.82);
  });

  it('survives an undecodable upload', async () => {
    // Decode the eight references first (cached), then break the decoder.
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    await scan({});
    mocks.decode.mockImplementation(() => {
      throw new Error('corrupt jpeg');
    });
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const res = await scan({ imageBase64: b64For(3.5), mimeType: 'image/jpeg' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retrieval.exactReference).toBeNull();
    // The guard is off, but the photos and passages still ground the scorer.
    expect(body.retrieval.referenceScores).toHaveLength(8);
    expect(body.result.score).toBe(3.5);
  });
});

describe('ai-fecal-scan — visual vs wording disagreement', () => {
  it('maps mostSimilarReference to a score and caps confidence on a split', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      // Says "reference 6" (= Score 4) but writes down 3.5.
      .mockResolvedValueOnce(scoreOk({ score: 3.5, mostSimilarReference: 6, confidence: 0.95 }));

    const body = await (await scan({})).json();
    expect(body.retrieval.mostSimilarReference).toBe(4);
    expect(body.result.score).toBe(3.5); // the model's score is kept…
    expect(body.result.confidence).toBeLessThanOrEqual(0.6); // …but not trusted
    expect(body.result.rationale).toContain(
      'The visual match pointed to Score 4; the chart wording pointed to Score 3.5.',
    );
  });

  it('leaves an agreeing answer alone', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 3.5, mostSimilarReference: 5, confidence: 0.9 }));
    const body = await (await scan({})).json();
    expect(body.retrieval.mostSimilarReference).toBe(3.5);
    expect(body.result.confidence).toBe(0.9);
    expect(body.result.rationale).not.toContain('visual match pointed');
  });

  it('compares against the SNAPPED score, so snapping cannot invent a split', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      // 3.4 is not a chart score; it snaps to 3.5, which IS reference 5.
      .mockResolvedValueOnce(scoreOk({ score: 3.4, mostSimilarReference: 5, confidence: 0.8 }));
    const body = await (await scan({})).json();
    expect(body.result.score).toBe(3.5);
    expect(body.result.confidence).toBe(0.8);
    expect(body.result.rationale).not.toContain('visual match pointed');
  });

  it('treats 0 and an out-of-range index as "no visual match"', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ mostSimilarReference: 9 }));
    const body = await (await scan({})).json();
    expect(body.retrieval.mostSimilarReference).toBeNull();
    expect(body.result.confidence).toBe(0.82);
  });

  it('asks the model for the index and thinks at low effort on both calls', async () => {
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    await scan({});
    const scorer = mocks.generateContent.mock.calls[1][0];
    expect(scorer.config.responseSchema.properties.mostSimilarReference).toMatchObject({
      type: 'INTEGER',
    });
    expect(scorer.config.responseSchema.required).toContain('mostSimilarReference');
    // English keeps the observer's words, so the scorer is not asked for them.
    expect(scorer.config.responseSchema.required).not.toContain('observations');
    // Latency: two multimodal calls must fit inside Netlify's sync timeout.
    expect(mocks.generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
      thinkingLevel: 'LOW',
    });
    expect(scorer.config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });
});

describe('ai-fecal-scan — French', () => {
  const FR_OBSERVATIONS = {
    form: 'forme cylindrique distincte',
    moisture: 'humide',
    surface: 'aucune craquelure visible',
    residue: 'laisserait des résidus',
    homogeneity: 'homogène',
  };

  it('returns localized observations and notVisible from the scorer, and keeps an English query', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(
        scoreOk({
          observations: FR_OBSERVATIONS,
          notVisible: ['odeur', 'volume'],
          rationale: 'Selles humides sans craquelures.',
        }),
      );
    const body = await (await scan({ locale: 'fr' })).json();

    // The observer ran in English — its words are the embedding query.
    const observer = mocks.generateContent.mock.calls[0][0];
    expect(observer.config.systemInstruction).not.toMatch(/FRENCH/i);
    expect(body.retrieval.query).toContain('no visible cracks');

    // The scorer was told to write French and must hand the observations back.
    const scorer = mocks.generateContent.mock.calls[1][0];
    expect(scorer.config.systemInstruction).toMatch(/CANADIAN FRENCH/);
    expect(scorer.config.responseSchema.required).toContain('observations');

    expect(body.result.observations).toEqual(FR_OBSERVATIONS);
    // One source, one language — no English 'odour' mixed in.
    expect(body.result.notVisible).toEqual(['odeur', 'volume']);
    expect(body.result.rationale).toBe('Selles humides sans craquelures.');
  });

  it('falls back to the localized default, never the English observer text', async () => {
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(
        scoreOk({ observations: { form: 'forme distincte' }, notVisible: [] }),
      );
    const body = await (await scan({ locale: 'fr' })).json();
    expect(body.result.observations.form).toBe('forme distincte');
    expect(body.result.observations.moisture).toBe('Non décrit');
    expect(Object.values(body.result.observations).join(' ')).not.toMatch(/moist|cylindrical|cracks/);
    expect(body.result.notVisible).toEqual([]);
  });
});

describe('ai-fecal-scan — failure + preview', () => {
  it('answers 502 upstream and writes an error telemetry row', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('vision down'));
    const res = await scan({});
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'upstream' });
    expect(telemetryRow('fecal_scan')).toMatchObject({ call_type: 'fecal_scan', error: 'vision down' });
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', '3.5'],
  ])('answers 502 — never a fabricated mid-chart score — when the score is %s', async (_label, score) => {
    const raw = JSON.parse(scoreOk().text);
    if (score === undefined) delete raw.score;
    else raw.score = score;
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce({ text: JSON.stringify(raw), usageMetadata: {} });
    const res = await scan({});
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'upstream' });
    expect(body.result).toBeUndefined();
    expect(telemetryRow('fecal_scan')?.error).toMatch(/no numeric score/);
    // The retrieval that did run is still accounted for.
    expect(telemetryRow('retrieval')).toBeDefined();
  });

  it('writes no telemetry in preview', async () => {
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const res = await scan({ preview: true });
    expect(res.status).toBe(200);
    expect(sb.callsFor('ai_call_telemetry')).toHaveLength(0);
  });

  it('writes no telemetry when the trainee opted out', async () => {
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const res = await scan({ allowTelemetry: false });
    expect(res.status).toBe(200);
    expect(sb.callsFor('ai_call_telemetry')).toHaveLength(0);
  });

  it('rate-limits per IP at 8/min', async () => {
    mocks.generateContent.mockResolvedValue(observeOk({ isStool: false }));
    let last: Response | null = null;
    for (let i = 0; i < 9; i++) last = await scan({}, { ip: '198.51.100.44' });
    expect(last!.status).toBe(429);
    expect(mocks.generateContent).toHaveBeenCalledTimes(8);
  });
});

describe('assembleFecalGrounding', () => {
  it.each(['dog', 'puppy', 'cat'] as const)('%s — offers every chart score with no hits', (species) => {
    const g = assembleFecalGrounding(species, []);
    expect(g.source).toBe('bundled');
    const text = g.passages.map((p) => p.text).join('\n');
    for (const s of fecalChartScores(species)) expect(text).toContain(paragraph(species, s));
    expect(g.passages.every((p) => p.kind === 'chart')).toBe(true);
  });

  it('skips a chart chunk that only repeats scores already covered', () => {
    const g = assembleFecalGrounding('dog', [
      ragChunk(dogParagraph(3), 0.9) as never,
      ragChunk(`${dogParagraph(3)} (again)`, 0.8) as never,
    ]);
    expect(g.chunks.filter((c) => c.similarity !== null)).toHaveLength(1);
  });
});
