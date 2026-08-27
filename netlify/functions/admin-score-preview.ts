/**
 * Admin: score a sample conversation with an UNSAVED rubric draft.
 *
 *   POST /admin-score-preview → body: { config, transcript? }
 *                             → { scenario, transcript, dimensions[], overall, band, critique }
 *
 * The Simulation screen's weights and band examples only take effect once they
 * are saved, and a save is live for every trainee within a minute. This gives
 * the admin a dry run first: the draft config posted here is the one used to
 * build the scoring prompt, so the numbers that come back are the numbers that
 * rubric would produce.
 *
 * It is READ-ONLY in the strictest sense — no table is touched, no telemetry
 * row is written, and nothing about the saved config changes. The only side
 * effect is one Gemini call.
 *
 * The consumer app's `evaluateConversation` can't be reused here: it reads the
 * API key through `import.meta.env` and records telemetry from the browser. We
 * call the same prompt builder and the same weighting helpers instead, so the
 * preview and production stay in step by construction.
 */
import { errorResponse, jsonResponse, requireAdmin } from './_shared/admin';
import { getGeminiClient } from './_shared/gemini';
import { buildScoringSystemPrompt } from '../../src/data/knowledge/promptBuilders';
import {
  bandFor,
  DIMENSIONS,
  weightedOverall,
  type DimensionKey,
} from '../../src/data/knowledge/scoringRubric';
import {
  resolveDimensions,
  resolveWeights,
  type SimulationConfig,
} from '../../src/data/knowledge/simulationConfig';
import { SEED_SCENARIOS } from '../../src/data/scenarios';

/** Matches MODEL_TEXT in src/services/geminiService.ts — the scorer the app uses. */
const SCORING_MODEL = 'gemini-3-flash-preview';

/** Bounds on a pasted transcript, so a preview can't become an expensive call. */
const MAX_TURNS = 40;
const MAX_TURN_CHARS = 2000;

interface PreviewTurn {
  role: 'user' | 'ai';
  text: string;
}

/**
 * The scenario the built-in sample belongs to — the weight-denial Lab from the
 * scenario library, so the sample reads like a real session rather than a lorem
 * ipsum. The sample transcript below is written against it; changing one means
 * changing the other.
 */
const SAMPLE_SCENARIO = SEED_SCENARIOS[0];

const SAMPLE_TRANSCRIPT: PreviewTurn[] = [
  {
    role: 'ai',
    text: "Look, Buddy's not fat — he's just a big Lab. All my friends' Labs look exactly the same.",
  },
  {
    role: 'user',
    text: "I hear you, Labs really are a solid breed and he's clearly well looked after. Can I ask what a normal day of food looks like for him?",
  },
  {
    role: 'ai',
    text: "Whatever's on special, two scoops morning and night. And yes, he gets treats. He's a dog.",
  },
  {
    role: 'user',
    text: "That's helpful, thank you. The thing on my mind is the stiffness you mentioned after his long walks — his joints are carrying about eight kilos more than his frame was built for, and that's usually where it comes from.",
  },
  {
    role: 'ai',
    text: "He does slow down on the long ones, I'll give you that. But I'm not putting him on diet food for the rest of his life.",
  },
  {
    role: 'user',
    text: "Completely fair, and I wouldn't ask you to. What I'd suggest is a twelve-week trial — we weigh him here every three weeks, and if he isn't moving better by the end of it we stop. Would you be up for booking the first check?",
  },
  {
    role: 'ai',
    text: "Alright. If it's only twelve weeks and I can see the numbers myself, I'll give it a go.",
  },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Accept only well-formed turns; anything else means the caller sent junk. */
function parseTranscript(value: unknown): PreviewTurn[] | null {
  if (!Array.isArray(value)) return null;
  const turns: PreviewTurn[] = [];
  for (const raw of value.slice(0, MAX_TURNS)) {
    if (!isPlainObject(raw)) return null;
    const role = raw.role === 'user' || raw.role === 'ai' ? raw.role : null;
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!role || !text) return null;
    turns.push({ role, text: text.slice(0, MAX_TURN_CHARS) });
  }
  return turns.length > 0 ? turns : null;
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'simulation.read');
  if (ctx instanceof Response) return ctx;

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: { config?: unknown; transcript?: unknown };
  try {
    body = (await req.json()) as { config?: unknown; transcript?: unknown };
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }
  if (!isPlainObject(body.config)) {
    return errorResponse(400, 'config must be a plain object');
  }
  const config = body.config as SimulationConfig;

  // An absent transcript is the normal case: the panel runs the built-in
  // sample. A present-but-malformed one is a caller bug and must not silently
  // fall back, or the admin would score a conversation they never wrote.
  let transcript = SAMPLE_TRANSCRIPT;
  if (body.transcript !== undefined && body.transcript !== null) {
    const parsed = parseTranscript(body.transcript);
    if (!parsed) return errorResponse(400, 'transcript must be a non-empty array of { role, text }');
    transcript = parsed;
  }

  const systemInstruction = buildScoringSystemPrompt({
    scenario: SAMPLE_SCENARIO,
    config,
  });
  const formatted = transcript
    .map((m, i) => `${i + 1}. ${m.role === 'user' ? 'STAFF' : 'CUSTOMER'}: ${m.text}`)
    .join('\n');

  const dimensionKeys = DIMENSIONS.map((d) => d.key);
  let raw: Record<string, unknown>;
  try {
    const ai = getGeminiClient();
    const res = await ai.models.generateContent({
      model: SCORING_MODEL,
      contents: `Here is the full conversation transcript. Score the staff turns.\n\n${formatted}`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          required: [...dimensionKeys, 'critique'],
          properties: {
            ...Object.fromEntries(
              dimensionKeys.map((k) => [k, { type: 'integer', description: '0-100' }]),
            ),
            critique: {
              type: 'string',
              description: 'Two or three sentences on how the staff member handled the pushback.',
            },
          },
        },
      },
    });
    const parsed: unknown = JSON.parse(res.text ?? '{}');
    if (!isPlainObject(parsed)) throw new Error('Scorer returned an unexpected shape');
    raw = parsed;
  } catch (error) {
    console.error('[admin-score-preview] scoring failed', error);
    return errorResponse(
      502,
      error instanceof Error ? error.message : 'The scorer could not be reached',
    );
  }

  // Weights come from the DRAFT the admin is editing, resolved exactly the way
  // a real session resolves them (normalised, with the all-zero fallback).
  const weights = resolveWeights(config);
  const resolved = resolveDimensions(config);
  const scores = {} as Record<DimensionKey, number>;
  for (const key of dimensionKeys) {
    const n = raw[key];
    scores[key] = typeof n === 'number' && Number.isFinite(n)
      ? Math.max(0, Math.min(100, Math.round(n)))
      : 0;
  }
  const overall = weightedOverall(scores, weights);

  return jsonResponse({
    scenario: {
      breed: SAMPLE_SCENARIO.breed,
      pushback: SAMPLE_SCENARIO.pushback.title,
      persona: SAMPLE_SCENARIO.persona,
      driver: SAMPLE_SCENARIO.suggestedDriver,
      difficulty: SAMPLE_SCENARIO.difficulty,
    },
    transcript,
    dimensions: resolved.map((d) => ({
      key: d.key,
      label: d.label,
      score: scores[d.key],
      /** Share of the overall this dimension carried, as a whole percent. */
      sharePct: Math.round((weights[d.key] ?? 0) * 100),
    })),
    overall,
    band: bandFor(overall),
    critique: typeof raw.critique === 'string' ? raw.critique : '',
  });
};
