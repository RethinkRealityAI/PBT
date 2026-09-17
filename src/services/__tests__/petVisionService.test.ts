import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AI_ENDPOINTS } from '../../shared/ai/contract';

/**
 * petVisionService is a thin client over the `ai-vision` Netlify Function
 * (which holds the key and the prompt). Mock the transport and pin the wire
 * contract; the prompt/normaliser themselves are covered where they live
 * (`src/shared/ai/petVision.ts`).
 */
const { postAi } = vi.hoisted(() => ({ postAi: vi.fn() }));

vi.mock('../aiApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../aiApi')>();
  return { ...actual, postAi };
});

import { AiApiError } from '../aiApi';
import {
  analyzePetPhoto,
  visionLifeStageToLabel,
  type PetVisionResult,
} from '../petVisionService';

beforeEach(() => {
  postAi.mockReset();
});

const validResult: PetVisionResult = {
  isDog: true,
  breed: 'Labrador Retriever',
  breedConfidence: 0.82,
  alternativeBreeds: ['Golden Retriever'],
  lifeStage: 'adult',
  ageEstimate: 'approximately 3–5 years',
  bcs: 7,
  bcsRationale: 'Waist hard to discern; fat covering over ribs.',
  dermatitis: {
    severity: 'mild',
    indicators: ['mild redness on belly'],
    note: 'Localised; monitor.',
  },
  guidance: 'Consider a calorie review and a recheck in 4 weeks.',
  notVisible: ['exact body weight'],
};

describe('analyzePetPhoto', () => {
  it('posts the image to the vision function and returns its result', async () => {
    postAi.mockResolvedValueOnce({ result: validResult });
    const r = await analyzePetPhoto('BASE64DATA', 'image/jpeg');
    expect(r).toBe(validResult);
    expect(r.breed).toBe('Labrador Retriever');
    expect(r.bcs).toBe(7);
    expect(r.dermatitis.severity).toBe('mild');

    expect(postAi).toHaveBeenCalledOnce();
    const [endpoint, body, opts] = postAi.mock.calls[0];
    expect(endpoint).toBe(AI_ENDPOINTS.vision);
    // Raw base64 (no data-URL prefix) + mime type, nothing else about the image.
    expect(body.imageBase64).toBe('BASE64DATA');
    expect(body.mimeType).toBe('image/jpeg');
    expect(body.locale).toBeUndefined();
    // A multimodal call gets the longer deadline.
    expect(opts).toEqual({ timeoutMs: 45_000 });
  });

  it('threads the app locale through to the function', async () => {
    postAi.mockResolvedValueOnce({ result: validResult });
    await analyzePetPhoto('x', 'image/png', { locale: 'fr' });
    const [, body] = postAi.mock.calls[0];
    expect(body.locale).toBe('fr');
    expect(body.mimeType).toBe('image/png');
  });

  it('rejects on transport failure so the UI can offer a retry', async () => {
    postAi.mockRejectedValueOnce(new AiApiError('vision unavailable', 503, 'upstream'));
    await expect(analyzePetPhoto('x', 'image/jpeg')).rejects.toThrow('vision unavailable');
  });

  it('rejects a malformed 200 without a result', async () => {
    postAi.mockResolvedValueOnce({});
    await expect(analyzePetPhoto('x', 'image/jpeg')).rejects.toThrow('Empty response');
  });
});

describe('visionLifeStageToLabel', () => {
  it('maps vision stages onto scenario life-stage labels', () => {
    expect(visionLifeStageToLabel('puppy')).toBe('Puppy (<1)');
    expect(visionLifeStageToLabel('junior')).toBe('Junior (1-3)');
    expect(visionLifeStageToLabel('senior')).toBe('Senior (7+)');
    expect(visionLifeStageToLabel('adult')).toBe('Adult (3-7)');
    expect(visionLifeStageToLabel('unknown')).toBe('Adult (3-7)');
  });
});
