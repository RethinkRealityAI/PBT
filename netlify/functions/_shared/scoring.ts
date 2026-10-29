/**
 * The scorer, shared by `ai-evaluate` (a trainee's own request) and
 * `sessions-recover` (the hourly job that scores sessions which were saved
 * but never scored — an interrupted tab, a dropped connection, a trainee who
 * left mid-conversation). One implementation so a recovered score is graded
 * exactly like a live one: the same server-loaded simulation config, the same
 * scoring retrieval, the same per-scenario success criteria, the same schema.
 */
import { Type, type GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  errorMessage,
  loadPromptOverrides,
  loadSimulationConfig,
  readUsage,
  recordCallServer,
  retrieveForScenario,
  withRetry,
} from './ai';
import { buildScoringSystemPrompt } from '../../../src/data/knowledge/promptBuilders';
import {
  bandFor,
  weightedOverall,
  type DimensionKey,
} from '../../../src/data/knowledge/scoringRubric';
import { resolveWeights } from '../../../src/data/knowledge/simulationConfig';
import type { Scenario } from '../../../src/data/scenarios';
import { MODEL_TEXT } from '../../../src/shared/ai/models';
import type { EndedEarly } from '../../../src/shared/ai/contract';
import { estimateCostUsd, estimateTokens } from '../../../src/shared/ai/telemetryHeuristics';
import { DEFAULT_LOCALE, type Locale } from '../../../src/i18n/locales';
import type { ChatMessage, ScoreReport } from '../../../src/services/types';

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
export function unavailableReport(): ScoreReport {
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

/**
 * A fixed, server-written note for a conversation that stopped before its
 * natural close. Never client text — the request only picks one of these.
 * It tells the scorer to grade what the staff member did, not to read the
 * missing close as a failure; it does not soften the rubric itself.
 */
const ENDED_EARLY_NOTE: Record<EndedEarly, string> = {
  time_limit:
    'Note: this conversation was stopped by the session time limit, not by either party. Score the staff turns that happened; do not mark down the absence of a final resolution on its own.',
  interrupted:
    'Note: this conversation was interrupted before it finished (the app was closed or the connection dropped). Score the staff turns that happened; do not mark down the absence of a final resolution on its own.',
};

/** Trainee (staff) turns in a transcript — the only turns the scorer grades. */
export function staffTurnCount(transcript: ChatMessage[]): number {
  return transcript.filter((m) => m.role === 'user' && m.text.trim().length > 0).length;
}

export interface ScoreTranscriptArgs {
  scenario: Scenario;
  transcript: ChatMessage[];
  locale: Locale;
  sessionId: string | null;
  userId: string | null;
  /** The request body — only read for `preview` success criteria. */
  body?: { preview?: unknown; promptOverrides?: unknown };
  allowTelemetry: boolean;
  preview: boolean;
  endedEarly?: EndedEarly | null;
}

/**
 * Score one transcript. Throws when the model call fails or returns nothing
 * usable — the caller decides between the honest "unavailable" fallback
 * (`ai-evaluate`) and leaving the row for the next run (`sessions-recover`).
 * Records one `evaluate` telemetry row either way.
 */
export async function scoreTranscript(
  sb: SupabaseClient,
  ai: GoogleGenAI,
  args: ScoreTranscriptArgs,
): Promise<ScoreReport> {
  const { scenario, transcript, locale, sessionId, userId, allowTelemetry, preview } = args;
  const config = await loadSimulationConfig(sb);
  const retrieved = await retrieveForScenario(sb, scenario, config, 'scoring');
  // Only `successCriteria` reaches the scorer — the customer's AI notes are
  // not read here (they shape the role-play, never the grade).
  const overrides = await loadPromptOverrides(sb, scenario, args.body ?? {});
  const systemInstruction = buildScoringSystemPrompt({
    scenario,
    config,
    retrieved,
    locale,
    overrides: { successCriteria: overrides?.successCriteria ?? null },
  });

  const formatted = transcript
    .map((m, i) => `${i + 1}. ${m.role === 'user' ? 'STAFF' : 'CUSTOMER'}: ${m.text}`)
    .join('\n');
  const note = args.endedEarly ? `\n\n${ENDED_EARLY_NOTE[args.endedEarly]}` : '';

  const evalT0 = performance.now();
  try {
    // Same retry budget as the roleplay call — a single transient network
    // blip must not turn a finished session into an unscorable one.
    const { value: response } = await withRetry(() =>
      ai.models.generateContent({
        model: MODEL_TEXT,
        contents: `Here is the full conversation transcript. Score the staff turns.\n\n${formatted}${note}`,
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
      sb,
      {
        sessionId,
        userId,
        callType: 'evaluate',
        modelId: MODEL_TEXT,
        latencyMs: latency,
        tokensIn,
        tokensOut,
        costUsd: estimateCostUsd(MODEL_TEXT, tokensIn, tokensOut),
      },
      { allowTelemetry, preview },
    );

    // Only the model's own fields ride along. `scoreUnavailable` is OUR flag
    // (the honest-failure fallback); a model that emitted it would turn a
    // real score into "unavailable" in every consumer.
    const { scoreUnavailable: _neverFromModel, ...modelFields } = parsedOut as Record<
      string,
      unknown
    >;
    return { ...modelFields, ...dims, overall, band: bandFor(overall) } as ScoreReport;
  } catch (err) {
    await recordCallServer(
      sb,
      {
        sessionId,
        userId,
        callType: 'evaluate',
        modelId: MODEL_TEXT,
        latencyMs: Math.round(performance.now() - evalT0),
        error: errorMessage(err),
      },
      { allowTelemetry, preview },
    );
    throw err;
  }
}
