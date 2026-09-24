/**
 * ACT-first scoring — `EvaluateRequest → EvaluateResponse`.
 *
 * Server-side port of the browser's `evaluateConversation`: same scoring
 * prompt (`buildScoringSystemPrompt`), same JSON schema (with the French
 * field descriptions when the locale is `fr`), same 2-attempt retry, same
 * dimension clamping and the same config-weighted `overall`.
 *
 * Honest failure: when the scorer cannot be reached after the retry, the
 * response is HTTP 200 with a report flagged `scoreUnavailable: true` — the
 * exact placeholder the browser used to build — so `isScoreUnavailable()`
 * and the Retry-scoring affordance keep working unchanged. Never a fake 0.
 *
 * Persistence: the score is written into the caller's OWN `training_sessions`
 * row (service role, ownership-guarded) when the caller is signed in, the
 * call is not an admin preview, the score is real and `sessionId` is a UUID.
 * The client never writes score columns — a database trigger
 * (`20260911000000_server_authoritative_scores.sql`) rejects it. This
 * function is the only writer of `score_report` / `score_overall`.
 */
import { Type, type GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  retrieveForScenario,
  sanitizeScenario,
  sanitizeTurns,
  withRetry,
} from './_shared/ai';
import { buildScoringSystemPrompt } from '../../src/data/knowledge/promptBuilders';
import {
  bandFor,
  weightedOverall,
  type DimensionKey,
} from '../../src/data/knowledge/scoringRubric';
import { resolveWeights } from '../../src/data/knowledge/simulationConfig';
import { scenarioSummaryLine } from '../../src/data/scenarioSummary';
import type { Scenario } from '../../src/data/scenarios';
import { MODEL_LIVE, MODEL_TEXT } from '../../src/shared/ai/models';
import type { EvaluateRequest, EvaluateResponse } from '../../src/shared/ai/contract';
import { estimateCostUsd, estimateTokens } from '../../src/shared/ai/telemetryHeuristics';
import { DEFAULT_LOCALE, type Locale } from '../../src/i18n/locales';
import type { ChatMessage, ScoreReport } from '../../src/services/types';

const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Localized `description` for a structured-output field whose VALUE is
 * free-form prose the trainee will read. Empty for English so the English
 * schema literal is byte-identical to what it always was.
 */
function frDescription(locale: Locale | undefined, french: string): { description?: string } {
  return (locale ?? DEFAULT_LOCALE) === 'fr' ? { description: french } : {};
}

const ZERO_DIMENSIONS: Record<DimensionKey, number> = {
  acknowledge: 0,
  clarify: 0,
  transform: 0,
  empathy: 0,
  rapport: 0,
};

/** The placeholder the browser used to build — text identical. */
function unavailableReport(): ScoreReport {
  return {
    ...ZERO_DIMENSIONS,
    overall: 0,
    band: 'poor',
    critique:
      'We could not score this session right now. Please try again, or check your network.',
    betterAlternative: '—',
    perDimensionNotes: {
      acknowledge: '',
      clarify: '',
      transform: '',
      empathy: '',
      rapport: '',
    },
    keyMoments: [],
    turnSentiment: [],
    scoreUnavailable: true,
  };
}

function buildResponseSchema(locale: Locale) {
  return {
    type: Type.OBJECT,
    properties: {
      acknowledge: { type: Type.INTEGER, description: '0-100' },
      clarify: { type: Type.INTEGER, description: '0-100' },
      transform: { type: Type.INTEGER, description: '0-100' },
      empathy: { type: Type.INTEGER, description: '0-100' },
      rapport: { type: Type.INTEGER, description: '0-100' },
      critique: {
        type: Type.STRING,
        ...frDescription(
          locale,
          'Critique en plusieurs paragraphes, rédigée en français canadien. Les extraits du dialogue sont cités mot pour mot dans la langue où ils ont été dits.',
        ),
      },
      betterAlternative: {
        type: Type.STRING,
        ...frDescription(locale, 'Exemple de réplique améliorée, en français canadien.'),
      },
      perDimensionNotes: {
        type: Type.OBJECT,
        properties: {
          acknowledge: {
            type: Type.STRING,
            ...frDescription(locale, 'Note de coaching en français canadien.'),
          },
          clarify: {
            type: Type.STRING,
            ...frDescription(locale, 'Note de coaching en français canadien.'),
          },
          transform: {
            type: Type.STRING,
            ...frDescription(locale, 'Note de coaching en français canadien.'),
          },
          empathy: {
            type: Type.STRING,
            ...frDescription(locale, 'Note de coaching en français canadien.'),
          },
          rapport: {
            type: Type.STRING,
            ...frDescription(locale, 'Note de coaching en français canadien.'),
          },
        },
        required: ['acknowledge', 'clarify', 'transform', 'empathy', 'rapport'],
      },
      keyMoments: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            ts: { type: Type.STRING },
            // `type` stays a machine value (win|miss) in every locale.
            type: { type: Type.STRING },
            label: {
              type: Type.STRING,
              ...frDescription(locale, 'Titre court du moment, en français canadien.'),
            },
            quote: {
              type: Type.STRING,
              ...frDescription(
                locale,
                "Extrait du dialogue cité MOT POUR MOT, dans la langue où il a été dit — ne jamais traduire une citation.",
              ),
            },
          },
          required: ['ts', 'type', 'label', 'quote'],
        },
      },
      // Per-turn sentiment arc — drives the sentiment chart in the admin
      // session modal. One entry per transcript turn.
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
    ],
  };
}

interface PersistArgs {
  userId: string;
  sessionId: string;
  scenario: Scenario;
  transcript: ChatMessage[];
  report: ScoreReport;
  mode: 'text' | 'voice';
}

/**
 * Write the score into the caller's own row. Ownership guard first: a
 * client-supplied `sessionId` must never let one user overwrite another's
 * session. `duration_seconds` is deliberately not sent — the client fills it
 * with its own upsert (which omits the score columns).
 */
async function persistScore(sb: SupabaseClient, args: PersistArgs): Promise<boolean> {
  const { data: existing, error: readErr } = await sb
    .from('training_sessions')
    .select('user_id')
    .eq('id', args.sessionId)
    .maybeSingle();
  if (readErr) {
    console.warn('[ai-evaluate] ownership lookup failed', readErr.message);
    return false;
  }
  const owner = (existing as { user_id?: string } | null)?.user_id;
  if (existing && owner !== args.userId) {
    console.warn('[ai-evaluate] refusing to write a score into another user\'s session', {
      sessionId: args.sessionId,
    });
    return false;
  }

  const { error } = await sb.from('training_sessions').upsert(
    {
      id: args.sessionId,
      user_id: args.userId,
      scenario: args.scenario as unknown as Record<string, unknown>,
      transcript: args.transcript as unknown as Record<string, unknown>[],
      score_report: args.report as unknown as Record<string, unknown>,
      score_overall: args.report.overall,
      mode: args.mode,
      model_id: args.mode === 'voice' ? MODEL_LIVE : MODEL_TEXT,
      turns: args.transcript.length,
      completed: true,
      ended_reason: 'completed',
      pushback_id: args.scenario.pushback.id,
      driver: args.scenario.suggestedDriver,
      scenario_summary: scenarioSummaryLine(args.scenario),
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.warn('[ai-evaluate] score upsert failed', error.message);
    return false;
  }
  return true;
}

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'evaluate', { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await parseJsonBody<EvaluateRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;

  const caller = await readCaller(req);
  if (caller instanceof Response) return caller;

  const scenario = sanitizeScenario(body.scenario);
  if (!scenario) return aiError(400, 'bad_request', 'scenario is missing required fields');
  const mode = body.mode === 'voice' ? 'voice' : body.mode === 'text' ? 'text' : null;
  if (!mode) return aiError(400, 'bad_request', 'mode must be "text" or "voice"');

  const locale = readLocale(body.locale);
  const transcript = sanitizeTurns(body.transcript);
  const preview = body.preview === true;
  const allowTelemetry = body.allowTelemetry !== false;
  const sessionId = isUuid(body.sessionId) ? body.sessionId : null;

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[ai-evaluate]', errorMessage(err));
    return aiError(500, 'server', 'AI is not configured');
  }

  const config = await loadSimulationConfig(caller.sb);
  const retrieved = await retrieveForScenario(caller.sb, scenario, config, 'scoring');
  const systemInstruction = buildScoringSystemPrompt({ scenario, config, retrieved, locale });

  const formatted = transcript
    .map((m, i) => `${i + 1}. ${m.role === 'user' ? 'STAFF' : 'CUSTOMER'}: ${m.text}`)
    .join('\n');

  const evalT0 = performance.now();
  let report: ScoreReport;
  try {
    // Same retry budget as the roleplay call — a single transient network
    // blip must not turn a finished session into an unscorable one.
    const { value: response } = await withRetry(() =>
      ai.models.generateContent({
        model: MODEL_TEXT,
        contents: `Here is the full conversation transcript. Score the staff turns.\n\n${formatted}`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: buildResponseSchema(locale),
        },
      }),
    );

    const raw = response.text ?? '';
    if (!raw) throw new Error('Empty score response');
    const parsedOut = JSON.parse(raw) as Omit<ScoreReport, 'overall' | 'band'>;
    // Coerce each dimension to a clamped 0–100 integer. The schema marks them
    // required, but a drifting model can still omit one or return a
    // non-number; without this the canonical report would carry NaN bars.
    const dim = (v: unknown): number =>
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(0, Math.min(100, Math.round(v)))
        : 0;
    const dims: Record<DimensionKey, number> = {
      acknowledge: dim(parsedOut.acknowledge),
      clarify: dim(parsedOut.clarify),
      transform: dim(parsedOut.transform),
      empathy: dim(parsedOut.empathy),
      rapport: dim(parsedOut.rapport),
    };
    const overall = weightedOverall(dims, resolveWeights(config));

    const latency = Math.round(performance.now() - evalT0);
    const usage = readUsage(response);
    const tokensIn = usage.promptTokenCount ?? estimateTokens(formatted);
    const tokensOut = usage.candidatesTokenCount ?? estimateTokens(raw);
    await recordCallServer(
      caller.sb,
      {
        sessionId,
        userId: caller.userId,
        callType: 'evaluate',
        modelId: MODEL_TEXT,
        latencyMs: latency,
        tokensIn,
        tokensOut,
        costUsd: estimateCostUsd(MODEL_TEXT, tokensIn, tokensOut),
      },
      { allowTelemetry, preview },
    );

    report = { ...parsedOut, ...dims, overall, band: bandFor(overall) };
  } catch (err) {
    console.error('[ai-evaluate] evaluateConversation failed', errorMessage(err));
    await recordCallServer(
      caller.sb,
      {
        sessionId,
        userId: caller.userId,
        callType: 'evaluate',
        modelId: MODEL_TEXT,
        latencyMs: Math.round(performance.now() - evalT0),
        error: errorMessage(err),
      },
      { allowTelemetry, preview },
    );
    const payload: EvaluateResponse = { report: unavailableReport(), persisted: false };
    return ok(payload);
  }

  let persisted = false;
  if (caller.userId && !preview && sessionId) {
    try {
      persisted = await persistScore(caller.sb, {
        userId: caller.userId,
        sessionId,
        scenario,
        transcript,
        report,
        mode,
      });
    } catch (err) {
      console.warn('[ai-evaluate] persist threw', errorMessage(err));
      persisted = false;
    }
  }

  const payload: EvaluateResponse = { report, persisted };
  return ok(payload);
};
