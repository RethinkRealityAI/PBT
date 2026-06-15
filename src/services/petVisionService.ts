import { GoogleGenAI, Type } from '@google/genai';
import { BCS_LEVELS } from '../data/bcsLevels';
import {
  estimateCostUsd,
  estimateTokens,
  recordCall,
} from './aiTelemetry';
import { MODEL_TEXT } from './geminiService';

/**
 * Pet Vision Analyzer — multimodal dog-photo analysis.
 *
 * Sends a single photo to Gemini and returns structured, override-able
 * findings: breed + life-stage estimate, a 1–9 Body Condition Score, and
 * visible dermatitis indicators, plus non-branded clinical guidance.
 *
 * Per Phase 2 scope: NO product recommendations (no Royal Canin catalogue is
 * available), and the raw image is NEVER persisted — only the structured
 * result is saved downstream. The image stays in memory for the duration of
 * the call.
 */

export type DermatitisSeverity = 'none' | 'mild' | 'moderate' | 'marked';
export type VisionLifeStage = 'puppy' | 'junior' | 'adult' | 'senior' | 'unknown';

export interface PetVisionDermatitis {
  severity: DermatitisSeverity;
  /** Visible coat/skin anomalies, e.g. "patchy hair loss on flank". */
  indicators: string[];
  note: string;
}

export interface PetVisionResult {
  /** False when the image clearly isn't a dog — UI surfaces a gentle retry. */
  isDog: boolean;
  breed: string;
  /** 0–1 model confidence in the primary breed call. */
  breedConfidence: number;
  /** Other plausible breeds, most-likely first. */
  alternativeBreeds: string[];
  lifeStage: VisionLifeStage;
  /** Free-text age estimate, e.g. "approximately 2–4 years". */
  ageEstimate: string;
  /** Body Condition Score on the standard 1–9 veterinary scale. */
  bcs: number;
  bcsRationale: string;
  dermatitis: PetVisionDermatitis;
  /** Non-branded, clinically-grounded next-step guidance. */
  guidance: string;
  /** Caveats the model couldn't assess from a single still (e.g. weight). */
  notVisible: string[];
}

function getClient(): GoogleGenAI {
  const apiKey =
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
    (process.env.GEMINI_API_KEY as string | undefined) ||
    '';
  return new GoogleGenAI({ apiKey });
}

const BCS_REFERENCE = BCS_LEVELS.map(
  (l) => `${l.score} — ${l.label}: ${l.description}`,
).join('\n');

const SYSTEM_INSTRUCTION = `
You are a veterinary visual triage assistant analysing a single still photo of
a dog. You are NOT making a diagnosis — you produce careful, hedged estimates a
veterinary professional will review and correct.

Ground every estimate in what is actually visible. If the photo angle, lighting,
or framing makes something impossible to judge, say so in notVisible and choose
the most conservative estimate. Never invent detail you cannot see.

# BODY CONDITION SCORE (WSAVA 1–9)
${BCS_REFERENCE}

# DERMATITIS / COAT INDICATORS to look for
Redness or inflammation, scaling or flaking, patchy or symmetrical hair loss,
hot spots / moist lesions, thickened or darkened skin, visible scratching
trauma, ear or periocular irritation. severity = none when the coat looks
healthy. Only report indicators you can actually see.

# RULES
- If the image is not a dog, set isDog=false and leave the other fields at safe
  defaults (breed "Unknown", bcs 5, dermatitis severity "none").
- breedConfidence is 0–1. Mixed-breed dogs are common — say "Mixed breed" with
  the most likely contributing breeds in alternativeBreeds when unsure.
- bcs is an integer 1–9.
- guidance is 1–3 sentences of NON-BRANDED, general clinical guidance (e.g.
  "A BCS of 7/9 suggests a calorie review and a recheck in 4 weeks."). Do NOT
  name or recommend any commercial product or brand.
- Weight cannot be measured from a photo — always include it in notVisible.
`.trim();

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

function clampBcs(n: unknown): number {
  const v = typeof n === 'number' ? Math.round(n) : 5;
  return Math.max(1, Math.min(9, v));
}

function clampConfidence(n: unknown): number {
  const v = typeof n === 'number' ? n : 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Analyse a dog photo. `imageBase64` is the raw base64 payload (no data-URL
 * prefix); `mimeType` is e.g. "image/jpeg".
 *
 * Throws on network / API failure — callers surface a retry affordance.
 */
export async function analyzePetPhoto(
  imageBase64: string,
  mimeType: string,
): Promise<PetVisionResult> {
  const ai = getClient();
  const t0 = performance.now();
  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            {
              text: 'Analyse this dog photo and return the structured findings.',
            },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const raw = response.text ?? '';
    if (!raw) throw new Error('Empty response from vision model');
    const parsed = JSON.parse(raw) as Partial<PetVisionResult>;

    const derm = parsed.dermatitis ?? { severity: 'none', indicators: [], note: '' };
    const result: PetVisionResult = {
      isDog: parsed.isDog !== false,
      breed: parsed.breed?.trim() || 'Unknown',
      breedConfidence: clampConfidence(parsed.breedConfidence),
      alternativeBreeds: Array.isArray(parsed.alternativeBreeds)
        ? parsed.alternativeBreeds.filter((s): s is string => typeof s === 'string')
        : [],
      lifeStage: (parsed.lifeStage as VisionLifeStage) ?? 'unknown',
      ageEstimate: parsed.ageEstimate?.trim() || 'Not determinable from photo',
      bcs: clampBcs(parsed.bcs),
      bcsRationale: parsed.bcsRationale?.trim() || '',
      dermatitis: {
        severity: (derm.severity as DermatitisSeverity) ?? 'none',
        indicators: Array.isArray(derm.indicators)
          ? derm.indicators.filter((s): s is string => typeof s === 'string')
          : [],
        note: derm.note?.trim() || '',
      },
      guidance: parsed.guidance?.trim() || '',
      notVisible: Array.isArray(parsed.notVisible)
        ? parsed.notVisible.filter((s): s is string => typeof s === 'string')
        : [],
    };

    const latency = Math.round(performance.now() - t0);
    const usage = (response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } })
      .usageMetadata;
    const tokensIn = usage?.promptTokenCount ?? estimateTokens(SYSTEM_INSTRUCTION);
    const tokensOut = usage?.candidatesTokenCount ?? estimateTokens(raw);
    void recordCall({
      callType: 'vision',
      modelId: MODEL_TEXT,
      latencyMs: latency,
      tokensIn,
      tokensOut,
      costUsd: estimateCostUsd(MODEL_TEXT, tokensIn, tokensOut),
    });

    return result;
  } catch (err) {
    void recordCall({
      callType: 'vision',
      modelId: MODEL_TEXT,
      latencyMs: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Map the vision life-stage onto the app's scenario LifeStage labels. */
export function visionLifeStageToLabel(
  stage: VisionLifeStage,
): 'Puppy (<1)' | 'Junior (1-3)' | 'Adult (3-7)' | 'Senior (7+)' {
  switch (stage) {
    case 'puppy':
      return 'Puppy (<1)';
    case 'junior':
      return 'Junior (1-3)';
    case 'senior':
      return 'Senior (7+)';
    case 'adult':
    case 'unknown':
    default:
      return 'Adult (3-7)';
  }
}
