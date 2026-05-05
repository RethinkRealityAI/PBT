import { GoogleGenAI, Type } from '@google/genai';
import type { Scenario } from '../data/scenarios';
import type { ChatMessage, ScoreReport } from './types';
import {
  buildCustomerSystemPrompt,
  buildScoringSystemPrompt,
} from '../data/knowledge/promptBuilders';
import {
  bandFor,
  weightedOverall,
  type DimensionKey,
} from '../data/knowledge/scoringRubric';

/** Text / scoring */
export const MODEL_TEXT = 'gemini-3-flash-preview';
/** Live voice WebSocket session */
export const MODEL_LIVE = 'gemini-3.1-flash-live-preview';

function getClient(): GoogleGenAI {
  const apiKey =
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
    (process.env.GEMINI_API_KEY as string | undefined) ||
    '';
  return new GoogleGenAI({ apiKey });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 1200): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw last;
}

/**
 * Customer voice in text mode. Returns the next AI message.
 * Throws on failure — callers decide how to surface the error.
 */
export async function generateRoleplayMessage(
  scenario: Scenario,
  history: ChatMessage[],
  userMessage?: string,
): Promise<ChatMessage> {
  const ai = getClient();
  const systemInstruction = buildCustomerSystemPrompt(scenario);

  // Strip any transient error messages from history before sending to the model
  const cleanHistory = history.filter((m) => !m._transientError);

  const contents = cleanHistory.map((m) => ({
    role: m.role === 'ai' ? 'model' : 'user',
    parts: [{ text: m.text }],
  }));

  if (userMessage) {
    contents.push({ role: 'user', parts: [{ text: userMessage }] });
  }

  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: 'Please begin the simulation by opening with your pushback in character.' }],
    });
  }

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents,
      config: { systemInstruction },
    });
    const text = response.text ?? '';
    if (!text) throw new Error('Empty response from AI');
    return { role: 'ai' as const, text, timestamp: Date.now() };
  });
}

const ZERO_DIMENSIONS: Record<DimensionKey, number> = {
  empathyTone: 0,
  activeListening: 0,
  productKnowledge: 0,
  objectionHandling: 0,
  confidence: 0,
  closingEffectiveness: 0,
  pacing: 0,
};

/**
 * Score the staff side of a conversation. Returns the full 7-dimension scorecard.
 */
export async function evaluateConversation(
  scenario: Scenario,
  transcript: ChatMessage[],
): Promise<ScoreReport> {
  const ai = getClient();
  const systemInstruction = buildScoringSystemPrompt(scenario);

  const formatted = transcript
    .map(
      (m, i) =>
        `${i + 1}. ${m.role === 'user' ? 'STAFF' : 'CUSTOMER'}: ${m.text}`,
    )
    .join('\n');

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: `Here is the full conversation transcript. Score the staff turns.\n\n${formatted}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            empathyTone: { type: Type.INTEGER },
            activeListening: { type: Type.INTEGER },
            productKnowledge: { type: Type.INTEGER },
            objectionHandling: { type: Type.INTEGER },
            confidence: { type: Type.INTEGER },
            closingEffectiveness: { type: Type.INTEGER },
            pacing: { type: Type.INTEGER },
            acknowledgeScore: { type: Type.INTEGER, description: '1-10' },
            clarifyScore: { type: Type.INTEGER, description: '1-10' },
            takeActionScore: { type: Type.INTEGER, description: '1-10' },
            critique: { type: Type.STRING },
            betterAlternative: { type: Type.STRING },
            perDimensionNotes: {
              type: Type.OBJECT,
              properties: {
                empathyTone: { type: Type.STRING },
                activeListening: { type: Type.STRING },
                productKnowledge: { type: Type.STRING },
                objectionHandling: { type: Type.STRING },
                confidence: { type: Type.STRING },
                closingEffectiveness: { type: Type.STRING },
                pacing: { type: Type.STRING },
              },
              required: [
                'empathyTone',
                'activeListening',
                'productKnowledge',
                'objectionHandling',
                'confidence',
                'closingEffectiveness',
                'pacing',
              ],
            },
            keyMoments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  ts: { type: Type.STRING },
                  type: { type: Type.STRING },
                  label: { type: Type.STRING },
                  quote: { type: Type.STRING },
                },
                required: ['ts', 'type', 'label', 'quote'],
              },
            },
          },
          required: [
            'empathyTone',
            'activeListening',
            'productKnowledge',
            'objectionHandling',
            'confidence',
            'closingEffectiveness',
            'pacing',
            'acknowledgeScore',
            'clarifyScore',
            'takeActionScore',
            'critique',
            'betterAlternative',
            'perDimensionNotes',
            'keyMoments',
          ],
        },
      },
    });

    const raw = response.text ?? '';
    if (!raw) throw new Error('Empty score response');
    const parsed = JSON.parse(raw) as Omit<ScoreReport, 'overall' | 'band'>;
    const dims: Record<DimensionKey, number> = {
      empathyTone: parsed.empathyTone,
      activeListening: parsed.activeListening,
      productKnowledge: parsed.productKnowledge,
      objectionHandling: parsed.objectionHandling,
      confidence: parsed.confidence,
      closingEffectiveness: parsed.closingEffectiveness,
      pacing: parsed.pacing,
    };
    const overall = weightedOverall(dims);
    return { ...parsed, overall, band: bandFor(overall) };
  } catch (error) {
    console.error('[geminiService] evaluateConversation failed', error);
    return {
      ...ZERO_DIMENSIONS,
      overall: 0,
      band: 'poor',
      acknowledgeScore: 0,
      clarifyScore: 0,
      takeActionScore: 0,
      critique:
        'We could not score this session right now. Please try again, or check your network.',
      betterAlternative: '—',
      perDimensionNotes: {
        empathyTone: '',
        activeListening: '',
        productKnowledge: '',
        objectionHandling: '',
        confidence: '',
        closingEffectiveness: '',
        pacing: '',
      },
      keyMoments: [],
    };
  }
}
