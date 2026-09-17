/**
 * In-chat coach hint — `HintRequest → HintResponse`.
 *
 * Server-side port of the browser's `generateCoachHint`: same coach system
 * prompt, same transcript formatting, same 2-attempt retry and the same
 * 320-character belt-and-braces trim. Plain text out; the caller shows a
 * soft "coach unavailable" state on a non-2xx.
 */
import type { GoogleGenAI } from '@google/genai';
import { getGeminiClient } from './_shared/gemini';
import {
  aiError,
  errorMessage,
  isUuid,
  loadSimulationConfig,
  ok,
  parseJsonBody,
  rateLimit,
  readCaller,
  readLocale,
  readUsage,
  recordCallServer,
  sanitizeScenario,
  sanitizeTurns,
  withRetry,
} from './_shared/ai';
import { buildCoachHintSystemPrompt } from '../../src/data/knowledge/promptBuilders';
import { MODEL_TEXT } from '../../src/shared/ai/models';
import type { HintRequest, HintResponse } from '../../src/shared/ai/contract';
import { estimateCostUsd, estimateTokens } from '../../src/shared/ai/telemetryHeuristics';

const MAX_BODY_BYTES = 512 * 1024;
/** Belt-and-braces length cap so a drifting model can't flood the drawer. */
const MAX_HINT_CHARS = 320;

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'hint', { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await parseJsonBody<HintRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;

  const caller = await readCaller(req);
  if (caller instanceof Response) return caller;

  const scenario = sanitizeScenario(body.scenario);
  if (!scenario) return aiError(400, 'bad_request', 'scenario is missing required fields');

  const locale = readLocale(body.locale);
  const history = sanitizeTurns(body.history);
  const preview = body.preview === true;
  const allowTelemetry = body.allowTelemetry !== false;
  const sessionId = isUuid(body.sessionId) ? body.sessionId : null;

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[ai-hint]', errorMessage(err));
    return aiError(500, 'server', 'AI is not configured');
  }

  const config = await loadSimulationConfig(caller.sb);
  const systemInstruction = buildCoachHintSystemPrompt({ scenario, config, locale });
  const formatted = history
    .map((m) => `${m.role === 'user' ? 'STAFF' : 'CUSTOMER'}: ${m.text}`)
    .join('\n');
  const contents = `Live transcript so far:\n\n${formatted}\n\nGive the trainee one nudge for their next reply.`;

  const t0 = performance.now();
  try {
    const { value, retries } = await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: MODEL_TEXT,
        contents,
        config: { systemInstruction },
      });
      const text = (response.text ?? '').trim();
      if (!text) throw new Error('Empty coach response');
      return { response, text };
    });

    const latency = Math.round(performance.now() - t0);
    const usage = readUsage(value.response);
    const tokensIn = usage.promptTokenCount ?? estimateTokens(systemInstruction + contents);
    const tokensOut = usage.candidatesTokenCount ?? estimateTokens(value.text);
    await recordCallServer(
      caller.sb,
      {
        sessionId,
        userId: caller.userId,
        callType: 'hint',
        modelId: MODEL_TEXT,
        latencyMs: latency,
        tokensIn,
        tokensOut,
        costUsd: estimateCostUsd(MODEL_TEXT, tokensIn, tokensOut),
        retries,
      },
      { allowTelemetry, preview },
    );

    const hint =
      value.text.length > MAX_HINT_CHARS
        ? `${value.text.slice(0, MAX_HINT_CHARS - 3).trimEnd()}…`
        : value.text;
    const payload: HintResponse = { hint };
    return ok(payload);
  } catch (err) {
    console.error('[ai-hint] generate failed', errorMessage(err));
    await recordCallServer(
      caller.sb,
      {
        sessionId,
        userId: caller.userId,
        callType: 'hint',
        modelId: MODEL_TEXT,
        latencyMs: Math.round(performance.now() - t0),
        error: errorMessage(err),
      },
      { allowTelemetry, preview },
    );
    return aiError(502, 'upstream', 'The coach is unavailable right now.');
  }
};
