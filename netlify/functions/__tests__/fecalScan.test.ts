// @vitest-environment node
/**
 * Handler tests for `ai-fecal-scan` — the OBSERVE → RETRIEVE → GROUND → SCORE
 * pipeline. `@google/genai`, `@supabase/supabase-js` and `_shared/retrieval`
 * are mocked, so no embedding or model call leaves the process.
 *
 * The load-bearing assertions are the grounding ones: the scoring prompt must
 * contain the retrieved passages VERBATIM, and a score the passages never
 * mentioned must come back coerced with a capped confidence.
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

import fecalScan, { __resetReferenceImageCache } from '../ai-fecal-scan';
import { __resetAiCaches, __resetRateLimits } from '../_shared/ai';
import { AI_LIMITS } from '../../../src/shared/ai/contract';
import { MODEL_TEXT } from '../../../src/shared/ai/models';
import { fecalEntryParagraph, FECAL_CHARTS } from '../../../src/data/knowledge/fecalCharts';

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
    notVisible: ['volume'],
    caution: 'Involve the veterinarian if this persists.',
    ...over,
  }),
  usageMetadata: { promptTokenCount: 400, candidatesTokenCount: 60 },
});

const dogParagraph = (score: number) =>
  fecalEntryParagraph('dog', FECAL_CHARTS.dog.entries.find((e) => e.score === score)!);

/**
 * Each chart photo is stubbed as a one-byte JPEG whose byte identifies the
 * score (3.5 → 35), so the decoder stub below can turn it into a distinct
 * image and the perceptual-hash guard can be exercised for real.
 */
const seedOf = (score: number) => Math.round(score * 10);
const jpegFor = (score: number) => Uint8Array.from([seedOf(score)]);
const b64For = (score: number) => Buffer.from(jpegFor(score)).toString('base64');

/** Serves every /fecal-scan/**.jpg request; `missing` 404s instead. */
function stubFetch(missing: string[] = []) {
  mocks.fetch.mockImplementation((url: string) => {
    const score = Number(new URL(url).pathname.split('/').pop()!.replace('.jpg', ''));
    if (missing.some((m) => url.endsWith(m))) {
      return Promise.resolve({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      arrayBuffer: async () => jpegFor(score).buffer,
    });
  });
}

/**
 * Fake JPEG decoder: byte 0 of the buffer seeds deterministic noise, so two
 * different stub images are ~32 bits apart and the same stub image hashes
 * identically. Keeps the real dHash in the loop — only the decode is faked.
 */
function stubDecode() {
  mocks.decode.mockImplementation((buf: Uint8Array | Buffer) => {
    const bytes = Uint8Array.from(buf);
    if (bytes.length === 0) throw new Error('not a JPEG');
    const width = 32;
    const height = 32;
    const data = new Uint8Array(width * height * 4);
    let s = (bytes[0] * 2654435761) >>> 0;
    for (let i = 0; i < width * height; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const v = s >>> 24;
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    return { width, height, data };
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

const fetchedPaths = (): string[] =>
  mocks.fetch.mock.calls.map((c) => new URL(String(c[0])).pathname);

const ragChunk = (content: string, similarity: number) => ({
  content,
  citation: 'Royal Canin — Fecal Scoring System for Dogs, VGI/064/0324',
  tags: { focus: 'gi', topic: 'fecal-scoring', species: 'dog' },
  similarity,
});

function scan(body: Record<string, unknown>, init?: Parameters<typeof jsonRequest>[2]) {
  return fecalScan(
    jsonRequest('ai-fecal-scan', { imageBase64: PNG, mimeType: 'image/jpeg', species: 'dog', ...body }, init),
  );
}

let sb: FakeSupabase;

beforeEach(() => {
  setFunctionEnv();
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
  __resetReferenceImageCache();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    });
    expect(mocks.retrieveChunks).not.toHaveBeenCalled();
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ call_type: 'fecal_scan' });
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
    expect(opts).toMatchObject({ k: 6, filters: { docSlugs: ['fecal:dog'] } });
    expect(opts.sb).toBeDefined();

    // The SECOND model call is the scorer; its prompt carries the passage.
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    const scorer = mocks.generateContent.mock.calls[1][0];
    expect(scorer.model).toBe(MODEL_TEXT);
    expect(scorer.config.systemInstruction).toContain(passage);
    expect(scorer.config.systemInstruction).toContain('REFERENCE PASSAGES');
    // The observer never saw the chart.
    expect(mocks.generateContent.mock.calls[0][0].config.systemInstruction).not.toContain(passage);

    expect(body.retrieval).toMatchObject({ source: 'rag', docSlugs: ['fecal:dog'] });
    expect(body.retrieval.query).toBe(query);
    expect(body.retrieval.chunks).toHaveLength(1);
    expect(body.retrieval.chunks[0]).toMatchObject({
      similarity: 0.93,
      excerpt: passage,
      scores: [3.5],
      citation: 'Royal Canin — Fecal Scoring System for Dogs, VGI/064/0324',
    });

    expect(body.result).toMatchObject({
      isStool: true,
      species: 'dog',
      score: 3.5,
      band: 'tooSoft',
      confidence: 0.82,
    });
    expect(body.result.observations).toMatchObject(OBSERVATIONS);
    expect(body.result.notVisible).toEqual(expect.arrayContaining(['odour', 'volume']));

    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({
      call_type: 'fecal_scan',
      model_id: MODEL_TEXT,
      // One row for the whole request, tokens summed across both calls.
      tokens_in: 500,
      tokens_out: 80,
    });
    expect(sb.callsFor('ai_call_telemetry')).toHaveLength(1);
  });

  it('falls back to the bundled chart when retrieval returns nothing', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const res = await scan({});
    const body = await res.json();

    const scorer = mocks.generateContent.mock.calls[1][0];
    expect(scorer.config.systemInstruction).toContain('Score 2.5');
    expect(scorer.config.systemInstruction).toContain('CLEARLY DEFINED SHAPE WITH VISIBLE CRACKS');
    expect(body.retrieval.source).toBe('bundled');
    expect(body.retrieval.chunks).toHaveLength(1);
    expect(body.retrieval.chunks[0].similarity).toBeNull();
    expect(body.retrieval.chunks[0].citation).toContain('VGI/064/0324');
  });

  it('still answers 200 bundled when retrieval throws', async () => {
    mocks.retrieveChunks.mockRejectedValueOnce(new Error('pgvector down'));
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const res = await scan({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retrieval.source).toBe('bundled');
    expect(body.result.score).toBe(3.5);
  });

  it('coerces a score the passages never mentioned and caps the confidence', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([ragChunk(dogParagraph(3.5), 0.9)]);
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 1, confidence: 0.97 }));
    const res = await scan({});
    const body = await res.json();
    expect(body.result.score).toBe(3.5);
    expect(body.result.confidence).toBeLessThanOrEqual(0.4);
    expect(body.result.band).toBe('tooSoft');
  });

  it('bands puppy score 3 by breed size', async () => {
    mocks.retrieveChunks.mockResolvedValue([]);
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 3 }));
    const big = await scan({ species: 'puppy', breedSize: 'large-giant' });
    expect((await big.json()).result).toMatchObject({ score: 3, band: 'normal' });
    expect(mocks.retrieveChunks.mock.calls[0][1]).toMatchObject({
      filters: { docSlugs: ['fecal:puppy'] },
    });

    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 3 }));
    const small = await scan({ species: 'puppy', breedSize: 'small-medium' });
    expect((await small.json()).result).toMatchObject({ score: 3, band: 'tooSoft' });
  });
});

describe('ai-fecal-scan — chart reference photos', () => {
  /**
   * The bug this pins: scanning the chart's OWN 3.5 photo came back as a 4 at
   * 0.9. Chart text alone can't settle a visual judgement, so the scorer now
   * sees the reference photographs for the grounded scores.
   */
  const threeScores = [dogParagraph(3), dogParagraph(3.5), dogParagraph(4)];

  const threeHits = () =>
    mocks.retrieveChunks.mockResolvedValueOnce([
      ragChunk(threeScores[1], 0.95),
      ragChunk(threeScores[0], 0.8),
      ragChunk(threeScores[2], 0.7),
    ]);

  it('sends each reference as its own numbered turn, labelled before AND after', async () => {
    threeHits();
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());

    const res = await scan({});
    expect(res.status).toBe(200);
    const body = await res.json();

    // One turn per reference, plus the scoring turn.
    const refs = referenceTurns(1);
    expect(refs).toHaveLength(3);
    expect(turnsOf(1)).toHaveLength(4);

    [3, 3.5, 4].forEach((score, i) => {
      const parts = refs[i].parts;
      expect(refs[i].role).toBe('user');
      expect(parts).toHaveLength(3);
      // Label, image, label again — the model confused which caption went
      // with which image when they were all interleaved in one turn.
      expect(parts[0].text).toBe(
        `REFERENCE PHOTO ${i + 1} of 3 — Score ${score} (${
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

    expect(body.retrieval.referenceScores).toEqual([3, 3.5, 4]);
  });

  it('shows the whole chart on the bundled path, capped at 8 photos', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const body = await (await scan({})).json();
    // The dog chart has exactly 8 scores — the cap, not a coincidence.
    expect(body.retrieval.referenceScores).toEqual([1, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
    expect(referenceTurns(1)).toHaveLength(8);
  });

  it('omits only the photo that fails to load and still scores', async () => {
    stubFetch(['/fecal-scan/dog/3.5.jpg']);
    mocks.retrieveChunks.mockResolvedValueOnce([
      ragChunk(threeScores[0], 0.9),
      ragChunk(threeScores[1], 0.85),
      ragChunk(threeScores[2], 0.7),
    ]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());

    const res = await scan({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.retrieval.referenceScores).toEqual([3, 4]);
    expect(referenceTurns(1)).toHaveLength(2);
    // 3.5 is still a grounded, allowed score — only its picture is missing.
    expect(body.result.score).toBe(3.5);
  });

  it('prefetches the whole chart during OBSERVE and memoises it across requests', async () => {
    mocks.retrieveChunks.mockResolvedValue([ragChunk(threeScores[1], 0.9)]);
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
    // Only the grounded score's photo is actually shown to the scorer.
    expect(referenceTurns(3)).toHaveLength(1);
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

describe('ai-fecal-scan — near-duplicate guard', () => {
  /**
   * The live failure this fixes: dog/3.5.jpg — the chart's OWN photo — came
   * back as "score 4 @ 0.99, visually identical to the reference photo for
   * Score 4". A perceptual hash settles that without asking the model.
   */
  const allEight = () => mocks.retrieveChunks.mockResolvedValueOnce([]);

  it('overrides the model when the photo IS a chart photo', async () => {
    allEight();
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
    allEight();
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 1, confidence: 0.2 }));
    const body = await (await scan({ imageBase64: b64For(2), mimeType: 'image/jpeg' })).json();
    expect(body.result.score).toBe(2);
    expect(body.result.confidence).toBeGreaterThanOrEqual(0.99);
  });

  it('does not fire on a photo that is not in the chart', async () => {
    allEight();
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const notAChartPhoto = Buffer.from(Uint8Array.from([200])).toString('base64');
    const body = await (await scan({ imageBase64: notAChartPhoto, mimeType: 'image/jpeg' })).json();
    expect(body.retrieval.exactReference).toBeNull();
    expect(body.result.score).toBe(3.5); // the model's own answer, untouched
    expect(body.result.confidence).toBe(0.82);
  });

  it('skips the guard for png and webp, which the client never sends', async () => {
    allEight();
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    // Same bytes as the 3.5 reference, but declared as a PNG.
    const body = await (await scan({ imageBase64: b64For(3.5), mimeType: 'image/png' })).json();
    expect(body.retrieval.exactReference).toBeNull();
    expect(body.result.score).toBe(3.5);
    expect(body.result.confidence).toBe(0.82);
  });

  it('survives an undecodable upload', async () => {
    allEight();
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
    mocks.retrieveChunks.mockResolvedValueOnce([
      ragChunk(dogParagraph(3), 0.9),
      ragChunk(dogParagraph(3.5), 0.85),
      ragChunk(dogParagraph(4), 0.7),
    ]);
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      // Says "reference 3" (= Score 4) but writes down 3.5.
      .mockResolvedValueOnce(scoreOk({ score: 3.5, mostSimilarReference: 3, confidence: 0.95 }));

    const body = await (await scan({})).json();
    expect(body.retrieval.mostSimilarReference).toBe(4);
    expect(body.result.score).toBe(3.5); // the model's score is kept…
    expect(body.result.confidence).toBeLessThanOrEqual(0.6); // …but not trusted
    expect(body.result.rationale).toContain(
      'The visual match pointed to Score 4; the chart wording pointed to Score 3.5.',
    );
  });

  it('leaves an agreeing answer alone', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([
      ragChunk(dogParagraph(3), 0.9),
      ragChunk(dogParagraph(3.5), 0.85),
    ]);
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ score: 3.5, mostSimilarReference: 2, confidence: 0.9 }));
    const body = await (await scan({})).json();
    expect(body.retrieval.mostSimilarReference).toBe(3.5);
    expect(body.result.confidence).toBe(0.9);
    expect(body.result.rationale).not.toContain('visual match pointed');
  });

  it('treats 0 and an out-of-range index as "no visual match"', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([ragChunk(dogParagraph(3.5), 0.9)]);
    mocks.generateContent
      .mockResolvedValueOnce(observeOk())
      .mockResolvedValueOnce(scoreOk({ mostSimilarReference: 9 }));
    const body = await (await scan({})).json();
    expect(body.retrieval.mostSimilarReference).toBeNull();
    expect(body.result.confidence).toBe(0.82);
  });

  it('asks the model for the index and thinks at low effort on both calls', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([]);
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    await scan({});
    const scorer = mocks.generateContent.mock.calls[1][0];
    expect(scorer.config.responseSchema.properties.mostSimilarReference).toMatchObject({
      type: 'INTEGER',
    });
    expect(scorer.config.responseSchema.required).toContain('mostSimilarReference');
    // Latency: two multimodal calls must fit inside Netlify's sync timeout.
    expect(mocks.generateContent.mock.calls[0][0].config.thinkingConfig).toEqual({
      thinkingLevel: 'LOW',
    });
    expect(scorer.config.thinkingConfig).toEqual({ thinkingLevel: 'LOW' });
  });
});

describe('ai-fecal-scan — failure + preview', () => {
  it('answers 502 upstream and writes an error telemetry row', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('vision down'));
    const res = await scan({});
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'upstream' });
    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ call_type: 'fecal_scan', error: 'vision down' });
  });

  it('writes no telemetry in preview', async () => {
    mocks.generateContent.mockResolvedValueOnce(observeOk()).mockResolvedValueOnce(scoreOk());
    const res = await scan({ preview: true });
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
