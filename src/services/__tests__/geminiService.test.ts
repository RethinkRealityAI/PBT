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

import {
  generateRoleplayMessage,
  evaluateConversation,
  generateCoachHint,
  MODEL_TEXT,
} from '../geminiService';

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
    acknowledge: 92,
    clarify: 80,
    transform: 78,
    empathy: 88,
    rapport: 70,
    critique: 'Solid handling.',
    betterAlternative: 'You could have...',
    perDimensionNotes: {
      acknowledge: 'Warm.',
      clarify: 'Could ask more.',
      transform: 'Bit defensive.',
      empathy: 'Genuinely kind.',
      rapport: 'A little fast.',
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
    expect(result.acknowledge).toBe(92);
    expect(result.critique).toBe('Solid handling.');
  });

  it('returns a zero-band fallback on parse error, flagged unavailable', async () => {
    generateContent.mockResolvedValueOnce({ text: 'not json' });
    const result = await evaluateConversation(SEED_SCENARIOS[0], []);
    expect(result.overall).toBe(0);
    expect(result.band).toBe('poor');
    expect(result.scoreUnavailable).toBe(true);
  });

  it('retries the scorer once before falling back', async () => {
    generateContent.mockRejectedValue(new Error('network'));
    const result = await evaluateConversation(SEED_SCENARIOS[0], [
      { role: 'user', text: 'hi', timestamp: 1 },
    ]);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.scoreUnavailable).toBe(true);
  });

  it('applies admin-tuned scoring weights to the overall', async () => {
    // Weight acknowledge at 1.0 and everything else at 0 → overall == acknowledge.
    generateContent.mockResolvedValueOnce({ text: JSON.stringify(validScores) });
    const result = await evaluateConversation(
      SEED_SCENARIOS[0],
      [{ role: 'user', text: 'hi', timestamp: 1 }],
      {
        config: {
          scoring: {
            dimensions: [
              { key: 'acknowledge', weight: 1 },
              { key: 'clarify', weight: 0 },
              { key: 'transform', weight: 0 },
              { key: 'empathy', weight: 0 },
              { key: 'rapport', weight: 0 },
            ],
          },
        },
      },
    );
    expect(result.overall).toBe(validScores.acknowledge); // 92
  });

  it('coerces a missing/invalid dimension to 0 instead of NaN/undefined', async () => {
    // Model drifts and omits `transform`, returns a non-number for `rapport`.
    const partial = { ...validScores } as Record<string, unknown>;
    delete partial.transform;
    partial.rapport = 'n/a';
    generateContent.mockResolvedValueOnce({ text: JSON.stringify(partial) });
    const result = await evaluateConversation(SEED_SCENARIOS[0], [
      { role: 'user', text: 'hi', timestamp: 1 },
    ]);
    expect(result.transform).toBe(0);
    expect(result.rapport).toBe(0);
    expect(Number.isNaN(result.overall)).toBe(false);
    expect(result.acknowledge).toBe(92);
  });
});

describe('locale threading', () => {
  it('roleplay defaults to the English customer prompt and schema description', async () => {
    generateContent.mockResolvedValueOnce({ text: 'Why is it so expensive?' });
    await generateRoleplayMessage(SEED_SCENARIOS[0], []);
    const arg = generateContent.mock.calls[0][0];
    expect(arg.config.systemInstruction).toContain('Speak conversational AMERICAN ENGLISH');
    expect(arg.config.responseSchema.properties.text.description).toBe(
      'Your in-character reply to the trainee. 1–3 sentences.',
    );
  });

  it('roleplay with locale "fr" swaps the dialect block and the text description', async () => {
    generateContent.mockResolvedValueOnce({ text: 'Ben, c\'est cher.' });
    await generateRoleplayMessage(SEED_SCENARIOS[0], [], undefined, { locale: 'fr' });
    const arg = generateContent.mock.calls[0][0];
    expect(arg.config.systemInstruction).toContain('FRANÇAIS QUÉBÉCOIS');
    expect(arg.config.responseSchema.properties.text.description).toContain(
      'français québécois',
    );
    // Machine values are untouched by locale.
    expect(arg.config.responseSchema.properties.emotion.enum).toEqual([
      'red',
      'yellow',
      'green',
    ]);
  });

  it('scorer keeps English schema descriptions off free-text fields by default', async () => {
    generateContent.mockResolvedValueOnce({ text: '{}' });
    await evaluateConversation(SEED_SCENARIOS[0], [
      { role: 'user', text: 'hi', timestamp: 1 },
    ]);
    const schema = generateContent.mock.calls[0][0].config.responseSchema;
    expect(schema.properties.critique).toEqual({ type: 'STRING' });
    expect(schema.properties.betterAlternative).toEqual({ type: 'STRING' });
  });

  it('scorer with locale "fr" adds French free-text directives but no key changes', async () => {
    generateContent.mockResolvedValueOnce({ text: '{}' });
    await evaluateConversation(
      SEED_SCENARIOS[0],
      [{ role: 'user', text: 'hi', timestamp: 1 }],
      { locale: 'fr' },
    );
    const call = generateContent.mock.calls[0][0];
    expect(call.config.systemInstruction).toContain('# OUTPUT LANGUAGE — CANADIAN FRENCH');
    const schema = call.config.responseSchema;
    expect(schema.properties.critique.description).toContain('français canadien');
    expect(schema.properties.keyMoments.items.properties.quote.description).toContain(
      'MOT POUR MOT',
    );
    // The typed ScoreReport contract is fixed — keys and required list stay put.
    expect(schema.required).toEqual([
      'acknowledge',
      'clarify',
      'transform',
      'empathy',
      'rapport',
      'critique',
      'betterAlternative',
      'perDimensionNotes',
      'keyMoments',
      'turnSentiment',
    ]);
    expect(Object.keys(schema.properties.perDimensionNotes.properties)).toEqual([
      'acknowledge',
      'clarify',
      'transform',
      'empathy',
      'rapport',
    ]);
  });

  it('coach hint follows the app locale', async () => {
    generateContent.mockResolvedValueOnce({ text: 'Nommez sa crainte avant d\'expliquer.' });
    await generateCoachHint(SEED_SCENARIOS[0], [], { locale: 'fr' });
    expect(generateContent.mock.calls[0][0].config.systemInstruction).toContain(
      '# OUTPUT LANGUAGE — CANADIAN FRENCH',
    );
  });
});

describe('generateCoachHint', () => {
  it('returns the coach nudge text', async () => {
    generateContent.mockResolvedValueOnce({
      text: 'Name her worry before you explain — try reflecting the cost concern back first.',
    });
    const hint = await generateCoachHint(SEED_SCENARIOS[0], [
      { role: 'ai', text: 'Why is it so expensive?', timestamp: 1 },
    ]);
    expect(hint).toContain('cost concern');
    const callArg = generateContent.mock.calls[0][0];
    expect(callArg.model).toBe(MODEL_TEXT);
    expect(callArg.contents).toContain('CUSTOMER: Why is it so expensive?');
  });

  it('hard-caps runaway hint length', async () => {
    generateContent.mockResolvedValueOnce({ text: 'x'.repeat(500) });
    const hint = await generateCoachHint(SEED_SCENARIOS[0], []);
    expect(hint.length).toBeLessThanOrEqual(320);
  });

  it('propagates failures after retries so the UI can show a soft error', async () => {
    generateContent.mockRejectedValue(new Error('offline'));
    await expect(generateCoachHint(SEED_SCENARIOS[0], [])).rejects.toThrow('offline');
    expect(generateContent).toHaveBeenCalledTimes(2);
  });
});
