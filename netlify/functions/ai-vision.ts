/**
 * Pet Vision Analyzer — `VisionRequest → VisionResponse`.
 *
 * Server-side port of the browser's `analyzePetPhoto`: same system prompt
 * (`PET_VISION_SYSTEM_INSTRUCTION` + locale addendum, shared), same response
 * schema, same `normalizePetVisionResult`. Single attempt, as before — the
 * UI offers a retry affordance.
 *
 * The raw image is NEVER persisted: it travels browser → here → Gemini in
 * memory and only the structured result goes back. Per Phase 2 scope there
 * are NO product recommendations.
 */
import { Type, type GoogleGenAI } from '@google/genai';
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
import { MODEL_TEXT } from '../../src/shared/ai/models';
import {
  AI_LIMITS,
  type VisionRequest,
  type VisionResponse,
} from '../../src/shared/ai/contract';
import {
  PET_VISION_SYSTEM_INSTRUCTION,
  normalizePetVisionResult,
  petVisionLanguageAddendum,
  type PetVisionResult,
} from '../../src/shared/ai/petVision';
import { estimateCostUsd, estimateTokens } from '../../src/shared/ai/telemetryHeuristics';

/** Base64 of a 4.2M-char image plus JSON framing. */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const BASE64_RX = /^[A-Za-z0-9+/]+={0,2}$/;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  required: [
    'isDog',
    'breed',
    'breedConfidence',
    'alternativeBreeds',
    'lifeStage',
    'ageEstimate',
    'bcs',
    'bcsRationale',
    'dermatitis',
    'guidance',
    'notVisible',
  ],
  properties: {
    isDog: { type: Type.BOOLEAN },
    breed: { type: Type.STRING },
    breedConfidence: { type: Type.NUMBER, description: '0.0–1.0' },
    alternativeBreeds: { type: Type.ARRAY, items: { type: Type.STRING } },
    lifeStage: {
      type: Type.STRING,
      enum: ['puppy', 'junior', 'adult', 'senior', 'unknown'],
    },
    ageEstimate: { type: Type.STRING },
    bcs: { type: Type.INTEGER, description: '1–9' },
    bcsRationale: { type: Type.STRING },
    dermatitis: {
      type: Type.OBJECT,
      required: ['severity', 'indicators', 'note'],
      properties: {
        severity: {
          type: Type.STRING,
          enum: ['none', 'mild', 'moderate', 'marked'],
        },
        indicators: { type: Type.ARRAY, items: { type: Type.STRING } },
        note: { type: Type.STRING },
      },
    },
    guidance: { type: Type.STRING },
    notVisible: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
} as const;

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'vision', { limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await parseJsonBody<VisionRequest>(req, MAX_BODY_BYTES);
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

  const locale = readLocale(body.locale);
  const preview = body.preview === true;
  const allowTelemetry = body.allowTelemetry !== false;

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[ai-vision]', errorMessage(err));
    return aiError(500, 'server', 'AI is not configured');
  }

  const systemInstruction = PET_VISION_SYSTEM_INSTRUCTION + petVisionLanguageAddendum(locale);
  const t0 = performance.now();
  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: 'Analyse this dog photo and return the structured findings.' },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const raw = response.text ?? '';
    if (!raw) throw new Error('Empty response from vision model');
    const parsedOut = JSON.parse(raw) as Partial<PetVisionResult>;
    const result = normalizePetVisionResult(parsedOut, locale);

    const latency = Math.round(performance.now() - t0);
    const usage = readUsage(response);
    const tokensIn = usage.promptTokenCount ?? estimateTokens(systemInstruction);
    const tokensOut = usage.candidatesTokenCount ?? estimateTokens(raw);
    await recordCallServer(
      caller.sb,
      {
        userId: caller.userId,
        callType: 'vision',
        modelId: MODEL_TEXT,
        latencyMs: latency,
        tokensIn,
        tokensOut,
        costUsd: estimateCostUsd(MODEL_TEXT, tokensIn, tokensOut),
      },
      { allowTelemetry, preview },
    );

    const payload: VisionResponse = { result };
    return ok(payload);
  } catch (err) {
    console.error('[ai-vision] analyse failed', errorMessage(err));
    await recordCallServer(
      caller.sb,
      {
        userId: caller.userId,
        callType: 'vision',
        modelId: MODEL_TEXT,
        latencyMs: Math.round(performance.now() - t0),
        error: errorMessage(err),
      },
      { allowTelemetry, preview },
    );
    return aiError(502, 'upstream', 'The photo could not be analysed right now. Please try again.');
  }
};
