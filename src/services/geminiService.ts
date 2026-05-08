import { GoogleGenAI, Type } from '@google/genai';
import type { Scenario } from '../data/scenarios';
import type { ChatMessage, ScoreReport } from './types';
import {
  buildCustomerSystemPrompt,
  buildScoringSystemPrompt,
  type PromptOverrides,
} from '../data/knowledge/promptBuilders';
import {
  bandFor,
  weightedOverall,
  type DimensionKey,
} from '../data/knowledge/scoringRubric';
import {
  estimateCostUsd,
  estimateTokens,
  isLikelyRefusal,
  recordCall,
} from './aiTelemetry';

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

async function withRetry<T>(fn: () => Promise<T>, attempts = 2, delayMs = 1200): Promise<{ value: T; retries: number }> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const value = await fn();
      return { value, retries: i };
    } catch (e) {
      last = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw last;
}

const END_TOKEN = '[END_SIMULATION]';

interface CallOptions {
  /** PBT session id (training_sessions.id). Telemetry rows attribute to it. */
  sessionId?: string | null;
  /** Bounded admin overrides (prompt prefix/suffix). Scoring prompt is never touched. */
  promptOverrides?: PromptOverrides;
}

interface UsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

function readUsage(response: unknown): UsageMetadata {
  if (!response || typeof response !== 'object') return {};
  const meta = (response as { usageMetadata?: UsageMetadata }).usageMetadata;
  return meta ?? {};
}

/**
 * Customer voice in text mode. Returns the next AI message.
 * Throws on failure — callers decide how to surface the error.
 */
export async function generateRoleplayMessage(
  scenario: Scenario,
  history: ChatMessage[],
  userMessage?: string,
  options: CallOptions = {},
): Promise<ChatMessage> {
  const ai = getClient();
  const systemInstruction = buildCustomerSystemPrompt(scenario, options.promptOverrides);

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

  // Structured output: model returns { emotion, text } so we can render
  // the AI bubble's state border (red/yellow/green) without parsing free
  // text. Mirrors the voice mode's `updateEmotion` tool call so both
  // modes use the same vocabulary downstream.
  const responseSchema = {
    type: Type.OBJECT,
    required: ['emotion', 'text'],
    properties: {
      emotion: {
        type: Type.STRING,
        enum: ['red', 'yellow', 'green'],
        description:
          "The customer's resolution state for this turn. red = defensive/resistant, yellow = listening/receptive, green = convinced/resolved. Start at red. Move to yellow when the trainee shows real empathy or asks a clarifying question. Move to green only after the trainee has clarified the root concern AND offered a credible solution.",
      },
      text: {
        type: Type.STRING,
        description: 'Your in-character reply to the trainee. 1–3 sentences.',
      },
    },
  } as const;

  const t0 = performance.now();
  try {
    const { value, retries } = await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: MODEL_TEXT,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });
      const raw = response.text ?? '';
      if (!raw) throw new Error('Empty response from AI');
      let parsed: { emotion?: string; text?: string } = {};
      try {
        parsed = JSON.parse(raw) as { emotion?: string; text?: string };
      } catch {
        // Fallback: model occasionally drifts and returns raw prose
        // despite the schema. Treat the whole thing as `text` and
        // default to 'red' so the UI still has something to render.
        parsed = { text: raw };
      }
      const text = (parsed.text ?? '').trim();
      if (!text) throw new Error('Empty response from AI');
      const emotion: 'red' | 'yellow' | 'green' =
        parsed.emotion === 'green' || parsed.emotion === 'yellow' ? parsed.emotion : 'red';
      return { response, text, emotion };
    });

    const latency = Math.round(performance.now() - t0);
    const usage = readUsage(value.response);
    const tokensIn = usage.promptTokenCount ?? estimateTokens(systemInstruction + JSON.stringify(contents));
    const tokensOut = usage.candidatesTokenCount ?? estimateTokens(value.text);
    const refusal = isLikelyRefusal(value.text);
    const endTokenEmitted = value.text.includes(END_TOKEN);

    void recordCall({
      sessionId: options.sessionId ?? null,
      callType: 'roleplay',
      modelId: MODEL_TEXT,
      latencyMs: latency,
      tokensIn,
      tokensOut,
      costUsd: estimateCostUsd(MODEL_TEXT, tokensIn, tokensOut),
      refusal,
      endTokenEmitted,
      retries,
    });

    return { role: 'ai' as const, text: value.text, emotion: value.emotion, timestamp: Date.now() };
  } catch (err) {
    const latency = Math.round(performance.now() - t0);
    void recordCall({
      sessionId: options.sessionId ?? null,
      callType: 'roleplay',
      modelId: MODEL_TEXT,
      latencyMs: latency,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
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
  options: CallOptions = {},
): Promise<ScoreReport> {
  const ai = getClient();
  const systemInstruction = buildScoringSystemPrompt(scenario);
  const evalT0 = performance.now();

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
            // Per-turn sentiment arc — drives the sentiment chart in the
            // admin session modal. One entry per transcript turn.
            turnSentiment: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  idx: { type: Type.INTEGER },
                  speaker: { type: Type.STRING },
                  sentiment: { type: Type.NUMBER },
                },
                required: ['idx', 'speaker', 'sentiment'],
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
            'turnSentiment',
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

    const latency = Math.round(performance.now() - evalT0);
    const usage = readUsage(response);
    const tokensIn = usage.promptTokenCount ?? estimateTokens(formatted);
    const tokensOut = usage.candidatesTokenCount ?? estimateTokens(raw);
    void recordCall({
      sessionId: options.sessionId ?? null,
      callType: 'evaluate',
      modelId: MODEL_TEXT,
      latencyMs: latency,
      tokensIn,
      tokensOut,
      costUsd: estimateCostUsd(MODEL_TEXT, tokensIn, tokensOut),
    });

    return { ...parsed, overall, band: bandFor(overall) };
  } catch (error) {
    console.error('[geminiService] evaluateConversation failed', error);
    void recordCall({
      sessionId: options.sessionId ?? null,
      callType: 'evaluate',
      modelId: MODEL_TEXT,
      latencyMs: Math.round(performance.now() - evalT0),
      error: error instanceof Error ? error.message : String(error),
    });
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
