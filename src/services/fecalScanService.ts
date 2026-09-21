/**
 * Fecal Scan — supportive stool assessment against the Royal Canin fecal
 * scoring charts.
 *
 * The browser posts the (already downscaled) photo to the `ai-fecal-scan`
 * Netlify Function, which holds the Gemini key. That function observes the
 * photo, RETRIEVES the matching chart passages from the knowledge base
 * (pgvector, falling back to the bundled chart text) and scores the stool
 * using ONLY those passages — so the answer is always traceable to a chart
 * the clinic can show the owner.
 *
 * Like Pet Vision: the raw image is NEVER persisted, there are no product
 * recommendations, and this is explicitly not a diagnosis.
 */
import type { Locale } from '../i18n/locales';
import {
  AI_ENDPOINTS,
  type FecalScanRequest,
  type FecalScanResponse,
} from '../shared/ai/contract';
import type {
  FecalBreedSize,
  FecalScanResult,
  FecalScanRetrieval,
  FecalSpecies,
} from '../shared/ai/fecalScan';
import { postAi } from './aiApi';

export type {
  FecalBand,
  FecalBreedSize,
  FecalScanResult,
  FecalScanRetrieval,
  FecalScanRetrievedChunk,
  FecalScore,
  FecalSpecies,
} from '../shared/ai/fecalScan';

/**
 * Observe → retrieve → score is three round trips inside the function, so it
 * takes noticeably longer than the single-call Pet Vision path.
 */
const FECAL_SCAN_TIMEOUT_MS = 60_000;

export interface FecalScanOptions {
  species: FecalSpecies;
  /** Puppies only — chart score 3 is banded by breed size. */
  breedSize?: FecalBreedSize;
  locale?: Locale;
}

/**
 * Analyse a stool photo against the chart for `species`. `imageBase64` is the
 * raw base64 payload (no data-URL prefix); `mimeType` is e.g. "image/jpeg".
 *
 * Throws on network / API failure — callers surface a retry affordance.
 */
export async function analyzeStoolPhoto(
  imageBase64: string,
  mimeType: string,
  options: FecalScanOptions,
): Promise<{ result: FecalScanResult; retrieval: FecalScanRetrieval }> {
  const body: FecalScanRequest = {
    imageBase64,
    mimeType,
    species: options.species,
    breedSize: options.breedSize,
    locale: options.locale,
  };
  const res = await postAi<FecalScanResponse>(AI_ENDPOINTS.fecalScan, body, {
    timeoutMs: FECAL_SCAN_TIMEOUT_MS,
  });
  if (!res || typeof res !== 'object' || !res.result || typeof res.result !== 'object') {
    throw new Error('Empty response from fecal scan model');
  }
  return { result: res.result, retrieval: res.retrieval };
}
