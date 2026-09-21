/**
 * Fecal Scan — `FecalScanRequest → FecalScanResponse`.
 *
 * Mirrors `ai-vision` (same limits, same error codes, same telemetry shape)
 * and adds the retrieval stage that makes the RAG loop visible:
 *
 *   1. OBSERVE   multimodal JSON → neutral visual observations. The observer
 *                never sees the chart, so its words are an independent
 *                description rather than a rationalisation of a score.
 *   2. RETRIEVE  the observation text is embedded and matched against the
 *                `fecal:<species>` knowledge document only.
 *   3. GROUND    hits → source 'rag'. Nothing (corpus not seeded, embedder
 *                down) → the SAME chart text from the code module, source
 *                'bundled'. The model is never left to its priors.
 *   4. SCORE     multimodal JSON with the image + observations + ONLY those
 *                passages, then `normalizeFecalScanResult` snaps the answer
 *                back onto the passages' scores and re-derives the band.
 *
 * The raw image is NEVER persisted: browser → here → Gemini in memory, and
 * only the structured result comes back. No product recommendations; the
 * result is a discussion aid, not a diagnosis.
 *
 * ONE telemetry row per request (`call_type: 'fecal_scan'`), tokens summed
 * across both model calls — a scan is one user-visible action.
 */
import { ThinkingLevel, Type, type GoogleGenAI, type ThinkingConfig } from '@google/genai';
import { decode as decodeJpeg } from 'jpeg-js';
import { getGeminiClient } from './_shared/gemini';
import {
  aiError,
  errorMessage,
  ok,
  parseJsonBody,
  rateLimit,
  readCaller,
  readLocale,
  readUsage,
  recordCallServer,
} from './_shared/ai';
import { retrieveChunks } from './_shared/retrieval';
import { MODEL_TEXT } from '../../src/shared/ai/models';
import {
  AI_LIMITS,
  type FecalScanRequest,
  type FecalScanResponse,
} from '../../src/shared/ai/contract';
import {
  DISAGREEMENT_CONFIDENCE_CAP,
  EXACT_REFERENCE_CONFIDENCE,
  FECAL_OBSERVE_SYSTEM_INSTRUCTION,
  buildFecalScoreSystemInstruction,
  exactReferenceNote,
  normalizeFecalScanResult,
  observationsToQuery,
  visualDisagreementNote,
  type FecalObservations,
  type FecalScanRetrieval,
  type FecalScanRetrievedChunk,
  type RawFecalScanResult,
} from '../../src/shared/ai/fecalScan';
import {
  EXACT_REFERENCE_MAX_DISTANCE,
  dHash,
  hammingDistance,
  type RgbaImage,
} from '../../src/shared/ai/imageHash';
import {
  buildFecalChartMarkdown,
  fecalChartCitation,
  fecalChartEntry,
  fecalChartScores,
  fecalKnowledgeSlug,
  isFecalBreedSize,
  isFecalSpecies,
  scoresMentionedIn,
  type FecalBreedSize,
  type FecalScore,
  type FecalSpecies,
} from '../../src/data/knowledge/fecalCharts';
import { estimateCostUsd, estimateTokens } from '../../src/shared/ai/telemetryHeuristics';

/** Base64 of a 4.2M-char image plus JSON framing (same as `ai-vision`). */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const BASE64_RX = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Chunks to ground on. The charts are seeded ONE CHUNK PER SCORE (see
 * `fecalChartChunks`), so this returns the 6 scores nearest the observation
 * text rather than "the chart" — and `normalizeFecalScanResult` coercing the
 * answer onto exactly those scores is what makes the grounding real rather
 * than decorative.
 */
const RETRIEVAL_K = 6;

const OBSERVE_SCHEMA = {
  type: Type.OBJECT,
  required: ['isStool', 'observations', 'notVisible'],
  properties: {
    isStool: { type: Type.BOOLEAN },
    observations: {
      type: Type.OBJECT,
      required: ['form', 'moisture', 'surface', 'residue', 'homogeneity'],
      properties: {
        form: { type: Type.STRING },
        moisture: { type: Type.STRING },
        surface: { type: Type.STRING },
        residue: { type: Type.STRING },
        homogeneity: { type: Type.STRING },
      },
    },
    notVisible: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
} as const;

/**
 * Both calls are structured extraction against material already in the
 * prompt, not open-ended reasoning, so low thinking costs nothing in quality
 * and buys the latency headroom two sequential multimodal calls need to fit
 * inside Netlify's synchronous function timeout. Typed through the SDK's own
 * enum so an SDK change is a compile error, not a silent runtime no-op.
 */
const THINKING: ThinkingConfig = { thinkingLevel: ThinkingLevel.LOW };

const SCORE_SCHEMA = {
  type: Type.OBJECT,
  required: [
    'mostSimilarReference',
    'score',
    'confidence',
    'rationale',
    'alternates',
    'notVisible',
    'caution',
  ],
  properties: {
    mostSimilarReference: {
      type: Type.INTEGER,
      description:
        'The NUMBER of the REFERENCE PHOTO the PHOTO TO SCORE most resembles (1-based), or 0 if none of them does.',
    },
    score: {
      type: Type.NUMBER,
      description: 'A score that appears in REFERENCE PASSAGES.',
    },
    confidence: { type: Type.NUMBER, description: '0.0–1.0' },
    rationale: { type: Type.STRING },
    alternates: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        required: ['score', 'confidence'],
        properties: {
          score: { type: Type.NUMBER },
          confidence: { type: Type.NUMBER, description: '0.0–1.0' },
        },
      },
    },
    notVisible: { type: Type.ARRAY, items: { type: Type.STRING } },
    caution: { type: Type.STRING },
  },
} as const;

/**
 * Cap on reference photos put in front of the scorer. `RETRIEVAL_K` already
 * bounds the RAG path at 6; the bundled path would otherwise send a whole
 * chart, and the dog chart has 8 scores.
 */
const MAX_REFERENCE_IMAGES = 8;

/**
 * Chart reference photos, base64, keyed by served path.
 *
 * These are a handful of small JPEGs that ship with the deploy and cannot
 * change under a running instance, so one fetch per path per instance is
 * both safe and worth it — a cold scan would otherwise pay 6–8 same-origin
 * round trips before the scoring call.
 */
const referenceImageCache = new Map<string, { data: string; hash: string | null }>();

/** Test hook — the reference-photo memo is module state. */
export function __resetReferenceImageCache(): void {
  referenceImageCache.clear();
}

interface ReferenceImage {
  score: FecalScore;
  label: string;
  /** base64, no data-URL prefix. */
  data: string;
  /** Perceptual hash, or null when the JPEG would not decode. */
  hash: string | null;
}

/**
 * Perceptual hash of a JPEG, or null if it will not decode.
 *
 * `maxMemoryUsageInMB` bounds a decompression bomb: the payload is already
 * size-limited as base64, but a small JPEG can declare enormous dimensions.
 */
function hashJpeg(buf: Buffer, label: string): string | null {
  try {
    const raw = decodeJpeg(buf, { useTArray: true, maxMemoryUsageInMB: 64 });
    return dHash(raw as RgbaImage);
  } catch (err) {
    console.warn(`[ai-fecal-scan] could not decode ${label}`, errorMessage(err));
    return null;
  }
}

/**
 * Load the chart's own photographs for `scores` from this deploy's origin
 * (same trick `admin-knowledge-ingest` uses for `/studies/*`).
 *
 * Fail-soft per image: a photo that will not load is simply left out and the
 * scorer still gets that score's text passage. Losing every photo degrades
 * the feature to text-only grounding — worse, but never broken.
 */
async function loadReferenceImages(
  req: Request,
  species: FecalSpecies,
  scores: readonly FecalScore[],
): Promise<ReferenceImage[]> {
  const wanted = [...scores].sort((a, b) => a - b).slice(0, MAX_REFERENCE_IMAGES);
  const out: ReferenceImage[] = [];
  for (const score of wanted) {
    const entry = fecalChartEntry(species, score);
    if (!entry) continue;
    try {
      let cached = referenceImageCache.get(entry.imagePath);
      if (cached === undefined) {
        const res = await fetch(new URL(entry.imagePath, req.url).toString());
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        cached = { data: buf.toString('base64'), hash: hashJpeg(buf, entry.imagePath) };
        referenceImageCache.set(entry.imagePath, cached);
      }
      out.push({ score, label: entry.label, data: cached.data, hash: cached.hash });
    } catch (err) {
      console.warn(
        `[ai-fecal-scan] reference photo ${entry.imagePath} unavailable`,
        errorMessage(err),
      );
    }
  }
  return out;
}

/**
 * Is the submitted photo one of the chart's OWN photographs?
 *
 * This is the deterministic fix for the failure that motivated the whole
 * guard: shown `dog/3.5.jpg`, the model answered "Score 4, visually identical
 * to the reference photo for Score 4" at 0.99. A perceptual hash settles the
 * question without asking anyone, and the threshold is tight enough that a
 * real clinic photo can never trip it (see `EXACT_REFERENCE_MAX_DISTANCE`).
 *
 * Only JPEG is checked: the client always re-encodes to JPEG before upload,
 * so png/webp means a caller we do not control and the guard stays out of it.
 * Returns null whenever anything is unknown — it may only ever ADD certainty.
 */
function matchExactReference(
  imageBase64: string,
  mimeType: string,
  references: readonly ReferenceImage[],
): FecalScore | null {
  if (mimeType !== 'image/jpeg') return null;
  const hash = hashJpeg(Buffer.from(imageBase64, 'base64'), 'the submitted photo');
  if (!hash) return null;

  let best: { score: FecalScore; distance: number } | null = null;
  for (const ref of references) {
    if (!ref.hash) continue;
    const distance = hammingDistance(hash, ref.hash);
    if (!best || distance < best.distance) best = { score: ref.score, distance };
  }
  if (!best || best.distance > EXACT_REFERENCE_MAX_DISTANCE) return null;
  console.log(
    `[ai-fecal-scan] exact reference match: score ${best.score} (distance ${best.distance})`,
  );
  return best.score;
}

/** One part of a score-call turn: a caption or an inline image. */
type ScorePart = { text: string } | { inlineData: { mimeType: string; data: string } };

interface ObserveOut {
  isStool?: unknown;
  observations?: Partial<FecalObservations>;
  notVisible?: unknown;
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'fecal_scan', { limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await parseJsonBody<FecalScanRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;

  const caller = await readCaller(req);
  if (caller instanceof Response) return caller;

  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim().toLowerCase() : '';
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return aiError(400, 'bad_request', 'mimeType must be image/jpeg, image/png or image/webp');
  }
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  if (!imageBase64) return aiError(400, 'bad_request', 'imageBase64 is required');
  if (imageBase64.length > AI_LIMITS.maxImageBase64Chars) {
    return aiError(413, 'payload_too_large', 'Image is too large — downscale it before sending');
  }
  if (!BASE64_RX.test(imageBase64)) {
    return aiError(400, 'bad_request', 'imageBase64 must be raw base64 (no data-URL prefix)');
  }

  // The species picks the chart, the knowledge document AND the band table —
  // an unknown one has no safe default, so it is a 400. An unknown breed size
  // only loses the puppy score-3 split, so it is ignored rather than rejected.
  if (!isFecalSpecies(body.species)) {
    return aiError(400, 'bad_request', 'species must be dog, puppy or cat');
  }
  const species: FecalSpecies = body.species;
  const breedSize: FecalBreedSize | null = isFecalBreedSize(body.breedSize)
    ? body.breedSize
    : null;

  const locale = readLocale(body.locale);
  const preview = body.preview === true;
  const allowTelemetry = body.allowTelemetry !== false;
  const docSlug = fecalKnowledgeSlug(species);
  /**
   * The knowledge scope this scan retrieves in. HARD on both axes: only
   * documents an admin filed for the Fecal Scan AND for this species can be
   * returned, on every fallback path inside `retrieveChunks`. It replaces the
   * old hard-wired `docSlugs: ['fecal:<species>']`, so an admin supplement
   * ("photograph the sample in daylight") is retrievable beside the chart
   * while a cat passage still cannot reach a dog scan.
   */
  const scope = { tool: 'fecal-scan', species } as const;

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[ai-fecal-scan]', errorMessage(err));
    return aiError(500, 'server', 'AI is not configured');
  }

  const imagePart = { inlineData: { mimeType, data: imageBase64 } };
  const t0 = performance.now();
  let tokensIn = 0;
  let tokensOut = 0;

  const record = (error?: string) =>
    recordCallServer(
      caller.sb,
      {
        userId: caller.userId,
        callType: 'fecal_scan',
        modelId: MODEL_TEXT,
        latencyMs: Math.round(performance.now() - t0),
        tokensIn,
        tokensOut,
        costUsd: estimateCostUsd(MODEL_TEXT, tokensIn, tokensOut),
        error: error ?? null,
      },
      { allowTelemetry, preview },
    );

  try {
    // Start loading the WHOLE chart's photos now, so the fetches overlap the
    // OBSERVE call instead of sitting in front of SCORE. They are memoised,
    // so this costs nothing from the second request on, and the set is
    // narrowed to the grounded scores once retrieval has run.
    const allReferences = loadReferenceImages(req, species, fecalChartScores(species));

    // ── 1. OBSERVE ────────────────────────────────────────────────────────
    const observeRes = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [
        {
          role: 'user',
          parts: [
            imagePart,
            { text: 'Describe what is visible in this stool photo. Do not score it.' },
          ],
        },
      ],
      config: {
        systemInstruction: FECAL_OBSERVE_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: OBSERVE_SCHEMA,
        thinkingConfig: THINKING,
      },
    });
    const observeRaw = observeRes.text ?? '';
    if (!observeRaw) throw new Error('Empty response from the observation model');
    const observeUsage = readUsage(observeRes);
    tokensIn += observeUsage.promptTokenCount ?? estimateTokens(FECAL_OBSERVE_SYSTEM_INSTRUCTION);
    tokensOut += observeUsage.candidatesTokenCount ?? estimateTokens(observeRaw);

    const observed = JSON.parse(observeRaw) as ObserveOut;
    const observations = (observed.observations ?? {}) as Partial<FecalObservations>;
    const observedNotVisible = strings(observed.notVisible);

    // Not a stool photo → no point retrieving or scoring; the UI asks for a
    // clearer photo. Everything else is defaulted by the normaliser.
    if (observed.isStool === false) {
      const result = normalizeFecalScanResult(
        { isStool: false, observations, notVisible: observedNotVisible },
        { species, breedSize, allowedScores: [], locale },
      );
      await record();
      // The prefetch is already in flight; let it finish into the cache so
      // the retry (the UI asks for a clearer photo) is fast.
      void allReferences;
      const payload: FecalScanResponse = {
        result,
        retrieval: {
          source: 'bundled',
          query: '',
          scope,
          docSlugs: [docSlug],
          chunks: [],
          referenceScores: [],
          exactReference: null,
          mostSimilarReference: null,
        },
      };
      return ok(payload);
    }

    // ── 2. RETRIEVE ───────────────────────────────────────────────────────
    const query = observationsToQuery(observations as FecalObservations);
    let hits: Awaited<ReturnType<typeof retrieveChunks>> = [];
    try {
      hits = await retrieveChunks(query, {
        k: RETRIEVAL_K,
        filters: { ...scope },
        sb: caller.sb,
      });
    } catch (err) {
      // retrieveChunks fails open already; this is belt-and-braces so a RAG
      // outage can never fail a scan.
      console.warn('[ai-fecal-scan] retrieval failed', errorMessage(err));
      hits = [];
    }

    // ── 3. GROUND ─────────────────────────────────────────────────────────
    let source: FecalScanRetrieval['source'];
    let passages: string[];
    let chunks: FecalScanRetrievedChunk[];
    // The documents the answer is actually standing on. Derived from the hits
    // rather than assumed, because the scope can now return an admin
    // supplement as well as (or instead of) the chart.
    let docSlugs: string[];
    if (hits.length > 0) {
      source = 'rag';
      passages = hits.map((h) => h.content);
      chunks = hits.map((h) => ({
        citation: h.citation,
        similarity: h.similarity,
        excerpt: h.content,
        scores: scoresMentionedIn(h.content, species),
        docTitle: h.docTitle ?? null,
      }));
      docSlugs = [...new Set(hits.map((h) => h.docSlug).filter((s): s is string => !!s))];
      // A pre-scopes RPC returns no provenance; naming the chart is still
      // truer than naming nothing.
      if (docSlugs.length === 0) docSlugs = [docSlug];
    } else {
      source = 'bundled';
      const markdown = buildFecalChartMarkdown(species);
      passages = [markdown];
      chunks = [
        {
          citation: fecalChartCitation(species),
          similarity: null,
          excerpt: markdown,
          scores: scoresMentionedIn(markdown, species),
          docTitle: null,
        },
      ];
      docSlugs = [docSlug];
    }
    const mentioned = new Set<FecalScore>(passages.flatMap((p) => scoresMentionedIn(p, species)));
    const allowedScores: FecalScore[] = mentioned.size
      ? [...mentioned].sort((a, b) => a - b)
      : fecalChartScores(species);

    // ── 4. SCORE ──────────────────────────────────────────────────────────
    const systemInstruction = buildFecalScoreSystemInstruction(
      species,
      breedSize,
      passages,
      locale,
    );
    // The chart's own photographs for the grounded scores. Text alone cannot
    // settle a visual judgement — without these, the chart's OWN 3.5 photo
    // came back as a 4.
    const grounded = (await allReferences).filter((r) => allowedScores.includes(r.score));

    // Run the near-duplicate guard BEFORE the scoring call, because it
    // changes what that call needs. When the upload IS a chart photograph
    // the score is already settled, so the scorer is shown that one photo
    // (it still writes the rationale) instead of the whole chart — which is
    // the difference between ~19 s and fitting inside the function timeout.
    const exactReference = matchExactReference(imageBase64, mimeType, grounded);
    const references =
      exactReference === null ? grounded : grounded.filter((r) => r.score === exactReference);

    // Each reference gets its OWN user turn, captioned before and after the
    // image. Interleaving all of them in one turn made the model attach the
    // wrong caption to the wrong photo — it called the 3.5 photo "Score 4".
    const contents: Array<{ role: string; parts: ScorePart[] }> = references.map((ref, i) => ({
      role: 'user',
      parts: [
        { text: `REFERENCE PHOTO ${i + 1} of ${references.length} — Score ${ref.score} (${ref.label})` },
        { inlineData: { mimeType: 'image/jpeg', data: ref.data } },
        { text: `(end of reference ${i + 1} — Score ${ref.score})` },
      ],
    }));
    contents.push({
      role: 'user',
      parts: [
        { text: 'PHOTO TO SCORE:' },
        imagePart,
        {
          text: [
            'Observations of this same photo:',
            JSON.stringify(observations),
            observedNotVisible.length
              ? `Already noted as not visible: ${observedNotVisible.join(', ')}`
              : '',
            'Score it against the REFERENCE PHOTOS and REFERENCE PASSAGES.',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    });

    const scoreRes = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: SCORE_SCHEMA,
        thinkingConfig: THINKING,
      },
    });
    const scoreRaw = scoreRes.text ?? '';
    if (!scoreRaw) throw new Error('Empty response from the scoring model');
    const scoreUsage = readUsage(scoreRes);
    tokensIn += scoreUsage.promptTokenCount ?? estimateTokens(systemInstruction);
    tokensOut += scoreUsage.candidatesTokenCount ?? estimateTokens(scoreRaw);

    const scored = JSON.parse(scoreRaw) as RawFecalScanResult & {
      mostSimilarReference?: unknown;
    };

    // ── 5. RECONCILE ──────────────────────────────────────────────────────
    // Three sources can disagree about the score; they are settled in order
    // of how much they can be trusted.
    let score = typeof scored.score === 'number' ? scored.score : Number.NaN;
    let confidence = typeof scored.confidence === 'number' ? scored.confidence : 0;
    const rationaleParts = [typeof scored.rationale === 'string' ? scored.rationale.trim() : ''];

    // (a) The model's own "which photo does this look like" answer, mapped
    //     from a 1-based index onto a score. Out of range / 0 → no match.
    const refIndex =
      typeof scored.mostSimilarReference === 'number' ? Math.round(scored.mostSimilarReference) : 0;
    const mostSimilarReference: FecalScore | null =
      refIndex >= 1 && refIndex <= references.length ? references[refIndex - 1].score : null;

    // (b) The deterministic near-duplicate check (computed above, before the
    //     scoring call). It beats everything: if the upload IS the chart's
    //     photograph, there is nothing left to judge.
    if (exactReference !== null) {
      score = exactReference;
      confidence = Math.max(confidence, EXACT_REFERENCE_CONFIDENCE);
      rationaleParts.unshift(exactReferenceNote(exactReference, locale));
    } else if (mostSimilarReference !== null && mostSimilarReference !== score) {
      // The model's eyes and its reading disagree. Keep what it wrote down,
      // but a split verdict must not reach the tech as near-certainty.
      confidence = Math.min(confidence, DISAGREEMENT_CONFIDENCE_CAP);
      rationaleParts.push(
        visualDisagreementNote(mostSimilarReference, score as FecalScore, locale),
      );
    }

    const result = normalizeFecalScanResult(
      {
        ...scored,
        score,
        confidence,
        rationale: rationaleParts.filter(Boolean).join(' '),
        observations,
        notVisible: [...new Set([...observedNotVisible, ...strings(scored.notVisible)])],
      },
      { species, breedSize, allowedScores, locale },
    );

    await record();
    const payload: FecalScanResponse = {
      result,
      retrieval: {
        source,
        query,
        scope,
        docSlugs,
        chunks,
        referenceScores: references.map((r) => r.score),
        exactReference,
        mostSimilarReference,
      },
    };
    return ok(payload);
  } catch (err) {
    console.error('[ai-fecal-scan] scan failed', errorMessage(err));
    await record(errorMessage(err));
    return aiError(502, 'upstream', 'The photo could not be scored right now. Please try again.');
  }
};
