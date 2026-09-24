/**
 * Fecal Scan — `FecalScanRequest → FecalScanResponse`.
 *
 * Mirrors `ai-vision` (same limits, same error codes, same telemetry shape)
 * and adds the retrieval stage that makes the RAG loop visible:
 *
 *   1. OBSERVE   multimodal JSON → neutral visual observations, in English
 *                (they are the embedding query). The observer never sees the
 *                chart, so its words are an independent description rather
 *                than a rationalisation of a score.
 *   2. RETRIEVE  the observation text is embedded and matched inside the
 *                `fecal-scan` × species scope. Retrieval RANKS the chart
 *                passages (the relevance shown in the grounding trail) and
 *                ADDS admin supplements; it never decides which scores the
 *                scorer may answer. A chunk from ANOTHER species' chart is
 *                dropped here whatever its tags say.
 *   3. GROUND    the scorer ALWAYS gets the whole chart for the species:
 *                retrieved chart chunks verbatim, the code module's paragraph
 *                for every score retrieval did not return, and every chart
 *                photo. Each passage is labelled ROYAL CANIN CHART or
 *                CLINIC SUPPLEMENT (lower authority — the chart decides).
 *                source 'rag' = at least one passage was retrieved.
 *   4. SCORE     multimodal JSON with the image + observations + passages,
 *                then `normalizeFecalScanResult` snaps the answer onto the
 *                chart and re-derives the band. No score → 502, never a
 *                fabricated mid-chart one.
 *
 * The raw image is NEVER persisted: browser → here → Gemini in memory, and
 * only the structured result comes back. No product recommendations; the
 * result is a discussion aid, not a diagnosis.
 *
 * Telemetry: one `'fecal_scan'` row per request (tokens summed across both
 * model calls — a scan is one user-visible action) plus one `'retrieval'` row
 * for the embed + search, both gated on allowTelemetry / preview.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
import { MODEL_EMBEDDING, MODEL_TEXT } from '../../src/shared/ai/models';
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
  type FecalScorePassage,
  type RawFecalScanResult,
} from '../../src/shared/ai/fecalScan';
import {
  compareFingerprints,
  fingerprint,
  type ImageFingerprint,
  type RgbaImage,
} from '../../src/shared/ai/imageHash';
import {
  FECAL_CHARTS,
  fecalChartCitation,
  fecalChartScores,
  fecalChartSlugSpecies,
  fecalChartSpeciesInText,
  fecalEntryParagraph,
  fecalKnowledgeSlug,
  isFecalBreedSize,
  isFecalSpecies,
  nearestFecalScore,
  scoresMentionedIn,
  type FecalBreedSize,
  type FecalScore,
  type FecalSpecies,
} from '../../src/data/knowledge/fecalCharts';
import {
  estimateCostUsd,
  estimateTokens,
  type AiCallRecord,
} from '../../src/shared/ai/telemetryHeuristics';
import type { RetrievedChunk } from '../../src/services/ragShared';

/** Base64 of a 4.2M-char image plus JSON framing (same as `ai-vision`). */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const BASE64_RX = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Chunks to retrieve. The charts are seeded ONE CHUNK PER SCORE (see
 * `fecalChartChunks`), and the retrieval module caps k at 8. Retrieval no
 * longer bounds what the scorer may answer — the whole chart is always
 * supplied — so k only decides how many passages get a relevance ranking
 * and how much room admin supplements have.
 */
const RETRIEVAL_K = 8;

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

const SCORE_PROPERTIES = {
  mostSimilarReference: {
    type: Type.INTEGER,
    description:
      'The NUMBER of the REFERENCE PHOTO the PHOTO TO SCORE most resembles (1-based), or 0 if none of them does.',
  },
  score: {
    type: Type.NUMBER,
    description: 'A score that appears in the ROYAL CANIN CHART passages.',
  },
  confidence: {
    type: Type.NUMBER,
    description: '0.0–1.0, calibrated — lower when the photo sits between neighbouring scores.',
  },
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
} as const;

const SCORE_REQUIRED = [
  'mostSimilarReference',
  'score',
  'confidence',
  'rationale',
  'alternates',
  'notVisible',
  'caution',
] as const;

/**
 * The scorer's schema. English keeps the observer's own (independent)
 * observations, so it is not asked for them; every other locale needs the
 * scorer to hand them back in the output language — the observer describes
 * in English because its words are the embedding query.
 */
function scoreSchemaFor(locale: string) {
  if (locale === 'en') {
    return { type: Type.OBJECT, required: [...SCORE_REQUIRED], properties: SCORE_PROPERTIES };
  }
  return {
    type: Type.OBJECT,
    required: [...SCORE_REQUIRED, 'observations'],
    properties: {
      ...SCORE_PROPERTIES,
      observations: OBSERVE_SCHEMA.properties.observations,
    },
  };
}

// ─── Reference photos ──────────────────────────────────────────────────────

/** A JPEG starts FF D8 FF — an HTML SPA fallback never does. */
function isJpegBytes(buf: Uint8Array): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

/** Budget for one same-origin reference-photo fetch (the HTTP fallback). */
const REFERENCE_FETCH_TIMEOUT_MS = 4000;

/**
 * Chart reference photos, keyed by the photo's URL PATHNAME only (never the
 * request host, so a spoofed Host header cannot address the cache). Only a
 * photo that loaded as a real, decodable JPEG is cached — a failure is
 * retried on the next request rather than remembered.
 *
 * These are a handful of small JPEGs that ship with the deploy and cannot
 * change under a running instance, so one load per path per instance is both
 * safe and worth it.
 */
const referenceImageCache = new Map<string, { data: string; fp: ImageFingerprint }>();

/** Test hook — the reference-photo memo is module state. */
export function __resetReferenceImageCache(): void {
  referenceImageCache.clear();
}

/**
 * Directories whose `public/fecal-scan/**` are tried before HTTP. On Netlify
 * the photos are bundled with the function via `included_files`
 * (netlify.toml); `netlify dev` runs from the repo root, where `public/`
 * exists as-is. null = the defaults.
 */
let referenceDiskRootsOverride: string[] | null = null;

/** Test hook — point the disk loader somewhere else ([] = HTTP only). */
export function __setReferenceDiskRoots(roots: string[] | null): void {
  referenceDiskRootsOverride = roots;
  referenceImageCache.clear();
}

function referenceDiskRoots(): string[] {
  if (referenceDiskRootsOverride) return referenceDiskRootsOverride;
  const roots = [process.cwd()];
  const taskRoot = process.env.LAMBDA_TASK_ROOT;
  if (taskRoot) roots.push(taskRoot);
  return [...new Set(roots)];
}

/**
 * The deploy's own origin for the HTTP fallback. `DEPLOY_URL` / `URL` are set
 * by Netlify, so the fetch goes to THIS deploy's static files whatever Host
 * the request carried; `req.url` is only the last resort (local tests).
 */
function referenceOrigin(req: Request): string {
  return process.env.DEPLOY_URL || process.env.URL || req.url;
}

interface ReferenceImage {
  species: FecalSpecies;
  score: FecalScore;
  label: string;
  /** base64, no data-URL prefix. */
  data: string;
  /** Aspect / dHash / thumbnail — what the exact-reference check compares. */
  fp: ImageFingerprint;
}

/**
 * Decode a JPEG and fingerprint it, or null if it will not decode.
 *
 * `maxMemoryUsageInMB` bounds a decompression bomb: the payload is already
 * size-limited as base64, but a small JPEG can declare enormous dimensions.
 */
function fingerprintJpeg(buf: Buffer, label: string): ImageFingerprint | null {
  try {
    const raw = decodeJpeg(buf, { useTArray: true, maxMemoryUsageInMB: 64 });
    return fingerprint(raw as RgbaImage);
  } catch (err) {
    console.warn(`[ai-fecal-scan] could not decode ${label}`, errorMessage(err));
    return null;
  }
}

/** Logged once per instance, so a missing `included_files` is visible. */
let loggedHttpFallback = false;

/** The bytes of one chart photo: disk first, then this deploy over HTTP. */
async function readReferenceBytes(req: Request, pathname: string): Promise<Buffer> {
  const relative = pathname.replace(/^\/+/, '');
  for (const root of referenceDiskRoots()) {
    try {
      const buf = await readFile(join(root, 'public', relative));
      if (isJpegBytes(buf)) return buf;
    } catch {
      // not bundled here — try the next root, then HTTP
    }
  }
  if (!loggedHttpFallback) {
    loggedHttpFallback = true;
    console.info(
      `[ai-fecal-scan] chart photos not bundled (tried ${referenceDiskRoots().join(', ') || 'no roots'}); ` +
        'loading over HTTP',
    );
  }
  const res = await fetch(new URL(pathname, referenceOrigin(req)).toString(), {
    signal: AbortSignal.timeout(REFERENCE_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  // A missing photo is answered by the SPA fallback with index.html and a
  // 200 — that must never reach Gemini labelled image/jpeg.
  const type = (res.headers?.get('content-type') ?? '').toLowerCase();
  if (!type.startsWith('image/jpeg')) throw new Error(`unexpected content-type "${type}"`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!isJpegBytes(buf)) throw new Error('not a JPEG');
  return buf;
}

/**
 * Load the selected chart's own photographs — ALL of them (a chart has at
 * most 8, and every score must stay reachable).
 *
 * Fail-soft per image: a photo that will not load (or is not a decodable
 * JPEG) is simply left out and the scorer still gets that score's text
 * passage. Losing every photo degrades the feature to text-only grounding —
 * worse, but never broken.
 */
async function loadReferenceImages(req: Request, species: FecalSpecies): Promise<ReferenceImage[]> {
  const entries = [...FECAL_CHARTS[species].entries].sort((a, b) => a.score - b.score);
  const loaded = await Promise.all(
    entries.map(async (entry): Promise<ReferenceImage | null> => {
      const pathname = new URL(entry.imagePath, 'http://reference.invalid').pathname;
      try {
        let cached = referenceImageCache.get(pathname);
        if (cached === undefined) {
          const buf = await readReferenceBytes(req, pathname);
          const fp = fingerprintJpeg(buf, pathname);
          if (!fp) throw new Error('undecodable JPEG');
          cached = { data: buf.toString('base64'), fp };
          referenceImageCache.set(pathname, cached);
        }
        return { species, score: entry.score, label: entry.label, data: cached.data, fp: cached.fp };
      } catch (err) {
        console.warn(`[ai-fecal-scan] reference photo ${pathname} unavailable`, errorMessage(err));
        return null;
      }
    }),
  );
  return loaded.filter((r): r is ReferenceImage => r !== null);
}

/**
 * Is the submitted photo one of the SELECTED chart's own photographs?
 *
 * The deterministic fix for: shown `dog/3.5.jpg`, the model answered "Score
 * 4, visually identical to the reference photo for Score 4" at 0.99. It
 * exists so a demo that uploads the chart's photos scores correctly — and it
 * must be impossible to trigger with a real clinic photo, because it then
 * overrides the model at 0.99. So a match needs ALL of: same aspect ratio
 * (±10 %), a dHash near-duplicate, AND a pixel-level thumbnail match (see
 * `compareFingerprints` for the measured thresholds). A dHash alone matched
 * half of a corpus of plain dark ellipses on white.
 *
 * Only ever compared within `species`: the dog 4.5 and cat 5 chart photos
 * are the same picture.
 *
 * Only JPEG is checked: the client always re-encodes to JPEG before upload,
 * so png/webp means a caller we do not control and the guard stays out of it.
 * Returns null whenever anything is unknown — it may only ever ADD certainty.
 */
function matchExactReference(
  imageBase64: string,
  mimeType: string,
  species: FecalSpecies,
  references: readonly ReferenceImage[],
): FecalScore | null {
  if (mimeType !== 'image/jpeg') return null;
  const upload = fingerprintJpeg(Buffer.from(imageBase64, 'base64'), 'the submitted photo');
  if (!upload) return null;

  let best: { score: FecalScore; pixelMad: number; hashDistance: number } | null = null;
  for (const ref of references) {
    if (ref.species !== species) continue;
    const verdict = compareFingerprints(upload, ref.fp);
    if (!verdict.match) continue;
    if (!best || verdict.pixelMad < best.pixelMad) {
      best = { score: ref.score, pixelMad: verdict.pixelMad, hashDistance: verdict.hashDistance };
    }
  }
  if (!best) return null;
  console.log(
    `[ai-fecal-scan] exact reference match: ${species} score ${best.score} ` +
      `(dHash ${best.hashDistance}, pixel MAD ${best.pixelMad.toFixed(2)})`,
  );
  return best.score;
}

// ─── Grounding ─────────────────────────────────────────────────────────────

export interface FecalGrounding {
  source: FecalScanRetrieval['source'];
  /** What the scorer is given, chart first (in scale order), then supplements. */
  passages: FecalScorePassage[];
  /** The grounding trail: retrieved (relevance order), then the bundled rest. */
  chunks: FecalScanRetrievedChunk[];
  docSlugs: string[];
  /** Chunks refused because they belong to ANOTHER species' chart. */
  dropped: number;
}

/**
 * Which chart a retrieved chunk belongs to: the `x` of a `fecal:<x>` slug;
 * null for any other slug (an admin supplement); and, only when the RPC
 * returned no provenance, the chart whose title the text carries.
 */
function chartOfHit(hit: RetrievedChunk): string | null {
  const fromSlug = fecalChartSlugSpecies(hit.docSlug);
  if (fromSlug !== null) return fromSlug;
  if (typeof hit.docSlug === 'string' && hit.docSlug.trim()) return null;
  return fecalChartSpeciesInText(hit.content);
}

/**
 * Turn retrieval hits into what the scorer sees. Pure, exported for tests.
 *
 *  • HARD species guard: a chunk from another species' chart is dropped,
 *    whatever its tags say — an admin can re-scope `fecal:dog` to
 *    `species: ['dog','cat']`, and a cat score must never stand on dog
 *    wording. (Puppy is its own chart: `fecal:dog` never grounds a puppy.)
 *  • The WHOLE chart is always present: retrieved chart chunks verbatim, the
 *    code module's paragraph for every score they did not cover.
 *  • Supplements ride along, labelled as lower authority.
 */
export function assembleFecalGrounding(
  species: FecalSpecies,
  hits: readonly RetrievedChunk[],
): FecalGrounding {
  const chartSlug = fecalKnowledgeSlug(species);
  const covered = new Set<FecalScore>();
  const chartPassages: Array<{ text: string; scores: FecalScore[] }> = [];
  const supplementPassages: FecalScorePassage[] = [];
  const chunks: FecalScanRetrievedChunk[] = [];
  const docSlugs: string[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const hit of hits) {
    if (!hit || typeof hit.content !== 'string' || !hit.content.trim()) continue;
    const chartOf = chartOfHit(hit);
    if (chartOf !== null && chartOf !== species) {
      dropped++;
      console.warn(
        `[ai-fecal-scan] dropped a ${chartOf} chart chunk from a ${species} scan ` +
          `(doc ${hit.docSlug ?? 'unknown'}) — check that document's species scope`,
      );
      continue;
    }
    const text = hit.content;
    if (seen.has(text)) continue;
    const kind: 'chart' | 'supplement' = chartOf === species ? 'chart' : 'supplement';
    const scores = scoresMentionedIn(text, species);
    if (kind === 'chart') {
      // A chunk that only repeats scores already covered adds nothing.
      if (scores.length > 0 && scores.every((s) => covered.has(s))) continue;
      scores.forEach((s) => covered.add(s));
      chartPassages.push({ text, scores });
    } else {
      supplementPassages.push({
        kind,
        text,
        source: hit.docTitle ?? hit.citation ?? null,
      });
    }
    seen.add(text);
    chunks.push({
      citation: hit.citation,
      similarity: hit.similarity,
      excerpt: text,
      scores,
      docTitle: hit.docTitle ?? null,
      kind,
    });
    const slug = typeof hit.docSlug === 'string' && hit.docSlug ? hit.docSlug : kind === 'chart' ? chartSlug : null;
    if (slug && !docSlugs.includes(slug)) docSlugs.push(slug);
  }

  const retrieved = chunks.length > 0;

  // Every score retrieval did not bring back comes from the code module.
  const missing = FECAL_CHARTS[species].entries.filter((e) => !covered.has(e.score));
  if (missing.length > 0) {
    const paragraphs = missing.map((e) => fecalEntryParagraph(species, e));
    missing.forEach((e, i) => chartPassages.push({ text: paragraphs[i], scores: [e.score] }));
    chunks.push({
      citation: fecalChartCitation(species),
      similarity: null,
      excerpt: paragraphs.join('\n\n'),
      scores: missing.map((e) => e.score),
      docTitle: null,
      kind: 'chart',
    });
  }
  // The chart is always part of the grounding, retrieved or bundled.
  if (!docSlugs.includes(chartSlug)) docSlugs.push(chartSlug);

  // The scorer reads the chart as a scale (1 → 5), not in retrieval order:
  // relevance is shown to the tech, not used to anchor the model.
  const lowest = (p: { scores: FecalScore[] }) => (p.scores.length ? Math.min(...p.scores) : 0);
  chartPassages.sort((a, b) => lowest(a) - lowest(b));

  return {
    source: retrieved ? 'rag' : 'bundled',
    passages: [
      ...chartPassages.map((p): FecalScorePassage => ({ kind: 'chart', text: p.text })),
      ...supplementPassages,
    ],
    chunks,
    docSlugs,
    dropped,
  };
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
   * The knowledge scope this scan retrieves in. HARD on both axes inside
   * `retrieveChunks`: only documents an admin filed for the Fecal Scan AND
   * for this species can be returned. Tags are admin-editable, so
   * `assembleFecalGrounding` re-checks the one thing that must never slip —
   * another species' chart — by document slug.
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
  // The retrieval row is written concurrently with the scoring call and
  // awaited before responding (a serverless instance may freeze after).
  let retrievalTelemetry: Promise<void> = Promise.resolve();

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
    // Start loading the chart's photos now, so the loads overlap the OBSERVE
    // call instead of sitting in front of SCORE. They are memoised, so this
    // costs nothing from the second request on.
    const referencesPromise = loadReferenceImages(req, species);

    // ── 1. OBSERVE ────────────────────────────────────────────────────────
    // Always in English, whatever the locale: these words are the retrieval
    // query, and the chart corpus is English. The scorer hands localized
    // observations back to a non-English caller.
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
    const english = locale === 'en';

    // Not a stool photo → no point retrieving or scoring; the UI asks for a
    // clearer photo. The observer wrote English, so a non-English caller gets
    // the normaliser's localized defaults rather than mixed languages.
    if (observed.isStool === false) {
      const result = normalizeFecalScanResult(
        english
          ? { isStool: false, observations, notVisible: observedNotVisible }
          : { isStool: false },
        { species, breedSize, allowedScores: [], locale },
      );
      await record();
      // The prefetch is already in flight; let it finish into the cache so
      // the retry (the UI asks for a clearer photo) is fast.
      void referencesPromise;
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
    let hits: RetrievedChunk[] = [];
    const retrievalT0 = performance.now();
    let retrievalError: string | null = null;
    try {
      hits = await retrieveChunks(query, {
        k: RETRIEVAL_K,
        filters: { ...scope },
        sb: caller.sb,
      });
    } catch (err) {
      // retrieveChunks fails open already; this is belt-and-braces so a RAG
      // outage can never fail a scan.
      retrievalError = errorMessage(err);
      console.warn('[ai-fecal-scan] retrieval failed', retrievalError);
      hits = [];
    }
    const retrievalTokens = estimateTokens(query);
    retrievalTelemetry = recordCallServer(
      caller.sb,
      {
        userId: caller.userId,
        callType: 'retrieval',
        modelId: MODEL_EMBEDDING,
        latencyMs: Math.round(performance.now() - retrievalT0),
        tokensIn: retrievalTokens,
        tokensOut: 0,
        costUsd: estimateCostUsd(MODEL_EMBEDDING, retrievalTokens, 0),
        error: retrievalError,
      },
      { allowTelemetry, preview },
    );

    // ── 3. GROUND ─────────────────────────────────────────────────────────
    const grounding = assembleFecalGrounding(species, Array.isArray(hits) ? hits : []);
    // The whole chart, always: retrieval ranks and supplements, it never
    // narrows what the scorer may answer.
    const allowedScores = fecalChartScores(species);

    // ── 4. SCORE ──────────────────────────────────────────────────────────
    const systemInstruction = buildFecalScoreSystemInstruction(
      species,
      breedSize,
      grounding.passages,
      locale,
    );
    // Every chart photograph for this species. Text alone cannot settle a
    // visual judgement — without these, the chart's OWN 3.5 photo came back
    // as a 4.
    const allReferences = (await referencesPromise).filter((r) => r.species === species);

    // Run the exact-reference check BEFORE the scoring call, because it
    // changes what that call needs. When the upload IS a chart photograph
    // the score is already settled, so the scorer is shown that one photo
    // (it still writes the rationale) instead of the whole chart — which is
    // the difference between ~19 s and fitting inside the function timeout.
    const exactReference = matchExactReference(imageBase64, mimeType, species, allReferences);
    const references =
      exactReference === null
        ? allReferences
        : allReferences.filter((r) => r.score === exactReference);

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
        responseSchema: scoreSchemaFor(locale),
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
    // A stool photo with no numeric score is a failed call, not a result:
    // defaulting it onto the chart would present a fabricated mid-chart score
    // with the model's confidence attached. Honest failure → 502 → retry.
    if (typeof scored.score !== 'number' || !Number.isFinite(scored.score)) {
      throw new Error('The scoring model returned no numeric score');
    }
    // Snap first, so every comparison below is between chart scores.
    let score: FecalScore = nearestFecalScore(species, scored.score);
    let confidence = typeof scored.confidence === 'number' ? scored.confidence : 0;
    const rationaleParts = [typeof scored.rationale === 'string' ? scored.rationale.trim() : ''];

    // (a) The model's own "which photo does this look like" answer, mapped
    //     from a 1-based index onto a score. Out of range / 0 → no match.
    const refIndex =
      typeof scored.mostSimilarReference === 'number' ? Math.round(scored.mostSimilarReference) : 0;
    const mostSimilarReference: FecalScore | null =
      refIndex >= 1 && refIndex <= references.length ? references[refIndex - 1].score : null;

    // (b) The exact-reference check (computed above, before the scoring
    //     call). It beats everything: if the upload IS the chart's
    //     photograph, there is nothing left to judge.
    if (exactReference !== null) {
      score = exactReference;
      confidence = Math.max(confidence, EXACT_REFERENCE_CONFIDENCE);
      rationaleParts.unshift(exactReferenceNote(exactReference, locale));
    } else if (mostSimilarReference !== null && mostSimilarReference !== score) {
      // The model's eyes and its reading disagree. Keep what it wrote down,
      // but a split verdict must not reach the tech as near-certainty.
      confidence = Math.min(confidence, DISAGREEMENT_CONFIDENCE_CAP);
      rationaleParts.push(visualDisagreementNote(mostSimilarReference, score, locale));
    }

    // Observations: English keeps the observer's independent words; any
    // other locale takes the scorer's translation (never a mix — a field the
    // scorer left out falls back to the localized "not described").
    // notVisible: ONE source, the scorer's (it was shown the observer's list
    // and told to carry it over, in the output language).
    const scorerNotVisible = strings(scored.notVisible);
    const result = normalizeFecalScanResult(
      {
        ...scored,
        score,
        confidence,
        rationale: rationaleParts.filter(Boolean).join(' '),
        observations: english ? observations : scored.observations,
        notVisible:
          scorerNotVisible.length > 0 || !english ? scorerNotVisible : observedNotVisible,
      },
      { species, breedSize, allowedScores, locale },
    );

    await Promise.all([record(), retrievalTelemetry]);
    const payload: FecalScanResponse = {
      result,
      retrieval: {
        source: grounding.source,
        query,
        scope,
        docSlugs: grounding.docSlugs,
        chunks: grounding.chunks,
        referenceScores: references.map((r) => r.score),
        exactReference,
        mostSimilarReference,
      },
    };
    return ok(payload);
  } catch (err) {
    console.error('[ai-fecal-scan] scan failed', errorMessage(err));
    await Promise.all([record(errorMessage(err)), retrievalTelemetry]);
    return aiError(502, 'upstream', 'The photo could not be scored right now. Please try again.');
  }
};
