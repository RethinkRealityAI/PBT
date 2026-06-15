import { describe, expect, it, vi, beforeEach } from 'vitest';

const { generateContent } = vi.hoisted(() => ({
  generateContent: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent };
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      INTEGER: 'INTEGER',
      STRING: 'STRING',
      ARRAY: 'ARRAY',
      BOOLEAN: 'BOOLEAN',
      NUMBER: 'NUMBER',
    },
  };
});

import {
  analyzePetPhoto,
  visionLifeStageToLabel,
} from '../petVisionService';

beforeEach(() => {
  generateContent.mockReset();
});

const validResult = {
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
  it('parses a valid multimodal response', async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify(validResult) });
    const r = await analyzePetPhoto('BASE64DATA', 'image/jpeg');
    expect(r.isDog).toBe(true);
    expect(r.breed).toBe('Labrador Retriever');
    expect(r.bcs).toBe(7);
    expect(r.dermatitis.severity).toBe('mild');
    // The image is passed as inlineData, not as text.
    const arg = generateContent.mock.calls[0][0];
    expect(arg.contents[0].parts[0].inlineData.data).toBe('BASE64DATA');
    expect(arg.contents[0].parts[0].inlineData.mimeType).toBe('image/jpeg');
  });

  it('clamps BCS into the 1–9 range and confidence into 0–1', async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ ...validResult, bcs: 14, breedConfidence: 1.8 }),
    });
    const r = await analyzePetPhoto('x', 'image/png');
    expect(r.bcs).toBe(9);
    expect(r.breedConfidence).toBe(1);
  });

  it('flags non-dog images', async () => {
    generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ ...validResult, isDog: false, breed: 'Unknown' }),
    });
    const r = await analyzePetPhoto('x', 'image/jpeg');
    expect(r.isDog).toBe(false);
  });

  it('rejects on an unparseable response', async () => {
    generateContent.mockResolvedValueOnce({ text: 'not json' });
    await expect(analyzePetPhoto('x', 'image/jpeg')).rejects.toBeTruthy();
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
