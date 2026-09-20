/**
 * Pet Vision Analyzer — multimodal dog-photo analysis.
 *
 * The browser posts the (already downscaled) photo to the `ai-vision`
 * Netlify Function, which holds the Gemini key, runs the multimodal call
 * with the shared prompt + schema (`src/shared/ai/petVision.ts`) and returns
 * structured, override-able findings: breed + life-stage estimate, a 1–9
 * Body Condition Score, and visible dermatitis indicators, plus non-branded
 * clinical guidance.
 *
 * Per Phase 2 scope: NO product recommendations, and the raw image is NEVER
 * persisted — it travels browser → function → Gemini in memory and only the
 * structured result is saved downstream.
 */
import type { Locale } from '../i18n/locales';
import { AI_ENDPOINTS, type VisionRequest, type VisionResponse } from '../shared/ai/contract';
import type { PetVisionResult, VisionLifeStage } from '../shared/ai/petVision';
import { postAi } from './aiApi';

export type {
  DermatitisSeverity,
  PetVisionDermatitis,
  PetVisionResult,
  VisionLifeStage,
} from '../shared/ai/petVision';

/** Multimodal calls carry a photo and take longer than a text turn. */
const VISION_TIMEOUT_MS = 45_000;

/**
 * Analyse a dog photo. `imageBase64` is the raw base64 payload (no data-URL
 * prefix); `mimeType` is e.g. "image/jpeg".
 *
 * Throws on network / API failure — callers surface a retry affordance.
 */
export async function analyzePetPhoto(
  imageBase64: string,
  mimeType: string,
  options: { locale?: Locale } = {},
): Promise<PetVisionResult> {
  const body: VisionRequest = { imageBase64, mimeType, locale: options.locale };
  const { result } = await postAi<VisionResponse>(AI_ENDPOINTS.vision, body, {
    timeoutMs: VISION_TIMEOUT_MS,
  });
  if (!result || typeof result !== 'object') {
    throw new Error('Empty response from vision model');
  }
  return result;
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
