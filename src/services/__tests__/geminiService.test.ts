import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SEED_SCENARIOS } from '../../data/scenarios';

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
    },
  };
});

import { generateRoleplayMessage, evaluateConversation, MODEL_TEXT } from '../geminiService';

beforeEach(() => {
  generateContent.mockReset();
});

describe('generateRoleplayMessage', () => {
  it('opens the conversation when no prior history and no user message', async () => {
    generateContent.mockResolvedValueOnce({ text: 'Why is it so expensive?' });
    const result = await generateRoleplayMessage(SEED_SCENARIOS[0], []);
    expect(result.role).toBe('ai');
    expect(result.text).toContain('expensive');
    expect(generateContent).toHaveBeenCalledOnce();
    const callArg = generateContent.mock.calls[0][0];
    expect(callArg.model).toBe(MODEL_TEXT);
    expect(callArg.contents[0].parts[0].text).toContain('Please begin');
  });

  it('passes prior history to the AI', async () => {
    generateContent.mockResolvedValueOnce({ text: 'Sure, but...' });
    await generateRoleplayMessage(
      SEED_SCENARIOS[0],
      [
        { role: 'ai', text: 'Hello?', timestamp: 1 },
        { role: 'user', text: 'Hi.', timestamp: 2 },
      ],
      'How can I help?',
    );
    const callArg = generateContent.mock.calls[0][0];
    expect(callArg.contents).toHaveLength(3);
    expect(callArg.contents[0].role).toBe('model');
    expect(callArg.contents[2].parts[0].text).toBe('How can I help?');
  });

  it('propagates errors after retries (callers surface UI fallback)', async () => {
    generateContent.mockRejectedValue(new Error('boom'));
    await expect(generateRoleplayMessage(SEED_SCENARIOS[0], [])).rejects.toThrow('boom');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
});

describe('evaluateConversation', () => {
  const validScores = {
    empathyTone: 92,
    activeListening: 80,
    productKnowledge: 85,
    objectionHandling: 78,
    confidence: 75,
    closingEffectiveness: 90,
    pacing: 70,
    acknowledgeScore: 8,
    clarifyScore: 7,
    takeActionScore: 9,
    critique: 'Solid handling.',
    betterAlternative: 'You could have...',
    perDimensionNotes: {
      empathyTone: 'Warm.',
      activeListening: 'Could ask more.',
      productKnowledge: 'Good citing.',
      objectionHandling: 'Bit defensive.',
      confidence: 'Hedged once.',
      closingEffectiveness: 'Strong close.',
      pacing: 'A little fast.',
    },
    keyMoments: [{ ts: '0:30', type: 'win', label: 'Acknowledge', quote: '...' }],
  };

  it('parses JSON and computes overall + band', async () => {
    generateContent.mockResolvedValueOnce({ text: JSON.stringify(validScores) });
    const result = await evaluateConversation(SEED_SCENARIOS[0], [
      { role: 'ai', text: 'Why is it expensive?', timestamp: 1 },
      { role: 'user', text: 'Let me explain.', timestamp: 2 },
    ]);
    expect(result.overall).toBeGreaterThan(0);
    expect(['good', 'ok', 'poor']).toContain(result.band);
    expect(result.empathyTone).toBe(92);
    expect(result.critique).toBe('Solid handling.');
  });

  it('returns a zero-band fallback on parse error', async () => {
    generateContent.mockResolvedValueOnce({ text: 'not json' });
    const result = await evaluateConversation(SEED_SCENARIOS[0], []);
    expect(result.overall).toBe(0);
    expect(result.band).toBe('poor');
  });
});
