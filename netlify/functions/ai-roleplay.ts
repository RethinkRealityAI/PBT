/**
 * Text role-play customer turn — `RoleplayRequest → RoleplayResponse`.
 *
 * Server-side port of the browser's `generateRoleplayMessage`: same customer
 * system prompt (`buildCustomerSystemPrompt`, mode 'text'), same structured
 * `{ emotion, text }` schema, same 2-attempt retry, same raw-prose fallback,
 * same telemetry fields (refusal heuristic, END token, retries). The Gemini
 * key never leaves this function.
 *
 * Trust boundary: the simulation config, prompt overrides and RAG grounding
 * are loaded server-side (see `_shared/ai.ts`); `scenario` / `history` /
 * `userMessage` are the trainee's own content, bounded in size.
 */
import { Type, type GoogleGenAI } from '@google/genai';
import { getGeminiClient } from './_shared/gemini';
import {
  aiError,
  errorMessage,
  isUuid,
  loadPromptOverrides,
  loadSimulationConfig,
  ok,
  parseJsonBody,
  rateLimit,
  readCaller,
  readLocale,
  readUsage,
  recordCallServer,
  retrieveForScenario,
  sanitizeScenario,
  sanitizeTurns,
  withRetry,
} from './_shared/ai';
import {
  buildCustomerSystemPrompt,
  END_SIMULATION_TOKEN,
} from '../../src/data/knowledge/promptBuilders';
import { MODEL_TEXT } from '../../src/shared/ai/models';
import {
  AI_LIMITS,
  type RoleplayRequest,
  type RoleplayResponse,
} from '../../src/shared/ai/contract';
import {
  estimateCostUsd,
  estimateTokens,
  isLikelyRefusal,
} from '../../src/shared/ai/telemetryHeuristics';
import type { AiEmotion } from '../../src/services/types';

const MAX_BODY_BYTES = 512 * 1024;

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'roleplay', { limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await parseJsonBody<RoleplayRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;

  const caller = await readCaller(req);
  if (caller instanceof Response) return caller;

  const scenario = sanitizeScenario(body.scenario);
  if (!scenario) return aiError(400, 'bad_request', 'scenario is missing required fields');

  const locale = readLocale(body.locale);
  const history = sanitizeTurns(body.history);
  const userMessage =
    typeof body.userMessage === 'string'
      ? body.userMessage.slice(0, AI_LIMITS.maxUserMessageChars)
      : undefined;
  const preview = body.preview === true;
  const allowTelemetry = body.allowTelemetry !== false;
  const sessionId = isUuid(body.sessionId) ? body.sessionId : null;

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[ai-roleplay]', errorMessage(err));
    return aiError(500, 'server', 'AI is not configured');
  }

  const config = await loadSimulationConfig(caller.sb);
  const [overrides, retrieved] = await Promise.all([
    loadPromptOverrides(caller.sb, scenario, body),
    // Scoped to the `roleplay` knowledge tool — the customer may only quote
    // documents an admin filed for roleplay (never, say, a fecal chart).
    retrieveForScenario(caller.sb, scenario, config, 'roleplay'),
  ]);

  const systemInstruction = buildCustomerSystemPrompt({
    scenario,
    overrides,
    config,
    retrieved,
    locale,
    mode: 'text',
  });

  const contents = history.map((m) => ({
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

  // Structured output: model returns { emotion, text } so the UI can render
  // the AI bubble's state border (red/yellow/green) without parsing free
  // text. Mirrors the voice mode's `updateEmotion` tool call so both modes
  // use the same vocabulary downstream.
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
        description:
          locale === 'fr'
            ? 'Ta réplique, en personnage, adressée à la personne en formation. 1 à 3 phrases, en français québécois parlé.'
            : 'Your in-character reply to the trainee. 1–3 sentences.',
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
      let parsedOut: { emotion?: string; text?: string } = {};
      try {
        parsedOut = JSON.parse(raw) as { emotion?: string; text?: string };
      } catch {
        // Fallback: model occasionally drifts and returns raw prose despite
        // the schema. Treat the whole thing as `text` and default to 'red'
        // so the UI still has something to render.
        parsedOut = { text: raw };
      }
      const text = (parsedOut.text ?? '').trim();
      if (!text) throw new Error('Empty response from AI');
      const emotion: AiEmotion =
        parsedOut.emotion === 'green' || parsedOut.emotion === 'yellow'
          ? parsedOut.emotion
          : 'red';
      return { response, text, emotion };
    });

    const latency = Math.round(performance.now() - t0);
    const usage = readUsage(value.response);
    const tokensIn =
      usage.promptTokenCount ?? estimateTokens(systemInstruction + JSON.stringify(contents));
    const tokensOut = usage.candidatesTokenCount ?? estimateTokens(value.text);

    await recordCallServer(
      caller.sb,
      {
        sessionId,
        userId: caller.userId,
        callType: 'roleplay',
        modelId: MODEL_TEXT,
        latencyMs: latency,
        tokensIn,
        tokensOut,
        costUsd: estimateCostUsd(MODEL_TEXT, tokensIn, tokensOut),
        refusal: isLikelyRefusal(value.text),
        endTokenEmitted: value.text.includes(END_SIMULATION_TOKEN),
        retries,
      },
      { allowTelemetry, preview },
    );

    const payload: RoleplayResponse = {
      message: { role: 'ai', text: value.text, emotion: value.emotion, timestamp: Date.now() },
    };
    return ok(payload);
  } catch (err) {
    console.error('[ai-roleplay] generate failed', errorMessage(err));
    await recordCallServer(
      caller.sb,
      {
        sessionId,
        userId: caller.userId,
        callType: 'roleplay',
        modelId: MODEL_TEXT,
        latencyMs: Math.round(performance.now() - t0),
        error: errorMessage(err),
      },
      { allowTelemetry, preview },
    );
    return aiError(502, 'upstream', 'The AI customer could not be reached. Please try again.');
  }
};
