/**
 * Admin objection coaching — `ObjectionCoachingRequest →
 * ObjectionCoachingResponse` (contract + prompt + normaliser:
 * src/shared/ai/objectionCoaching.ts).
 *
 * "Suggest with AI" in the objection editor: drafts the five coaching lists
 * (the owner's hidden worries first) from the objection's name, the owner's
 * line, its animals and its category. Before this existed the only AI in
 * reach was the Studio assistant, which edits the SCENARIO draft — asked for
 * hidden concerns it could only offer a backstory (Mark, 2026-11-17).
 *
 * Trust boundary:
 *   • The category is resolved HERE from `categoryId` (stored rows merged
 *     with the built-ins) — its name, description and knowledge never come
 *     from the request body.
 *   • Grounding reads the category's documents inside the roleplay scope
 *     (what the AI owner itself can read), species HARD when the objection
 *     is for one animal; inherited documents are SOFT (zero rows retries in
 *     the scope), exactly like a scenario in that category. Fail-open.
 *   • The answer is normalised with the same `cleanCoaching` a save runs.
 *   • Nothing is written and no telemetry is recorded (mirrors
 *     `admin-scenario-agent`); the admin edits the boxes and presses Save.
 *
 * Gated on `scenarios.write` (writing an objection needs it), 20 calls /
 * minute / IP.
 */
import { ThinkingLevel, Type, type GoogleGenAI } from '@google/genai';
import { requireAdmin } from './_shared/admin';
import { getGeminiClient } from './_shared/gemini';
import { retrieveChunks } from './_shared/retrieval';
import {
  adaptAdminError,
  aiError,
  errorMessage,
  isPlainObject,
  ok,
  parseJsonBody,
  rateLimit,
} from './_shared/ai';
import { readCategories } from './_shared/objectionsStore';
import { MODEL_TEXT } from '../../src/shared/ai/models';
import {
  SUGGESTED_ITEMS,
  buildObjectionCoachingSystemPrompt,
  coachingRetrievalQuery,
  coachingSpecies,
  normalizeCoachingAnswer,
  type CoachingPromptPassage,
  type ObjectionCoachingResponse,
} from '../../src/shared/ai/objectionCoaching';
import { COACHING_KEYS, OBJECTION_LIMITS, cleanCoaching } from '../../src/shared/scenarios/objections';
import { mergeCategories, type ObjectionCategory } from '../../src/shared/scenarios/objectionCategories';
import type { RetrievedChunk } from '../../src/services/ragShared';

const MAX_BODY_BYTES = 32 * 1024;
const RATE = { limit: 20, windowMs: 60_000 };
const CATEGORY_TIMEOUT_MS = 4000;
const GROUNDING_TIMEOUT_MS = 3000;
const PASSAGES_K = 5;
const RETRY_BUDGET_MS = 15_000;

const UPSTREAM_MESSAGE =
  'The AI could not suggest coaching right now. Nothing was changed — write your own, or try again.';

async function withTimeout<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      work.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function text(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: Object.fromEntries(
    COACHING_KEYS.map((k) => [k, { type: Type.ARRAY, items: { type: Type.STRING } }]),
  ),
  required: [...COACHING_KEYS],
  propertyOrdering: [...COACHING_KEYS],
};

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'objection-coaching', RATE);
  if (limited) return limited;

  const ctx = await requireAdmin(req, 'scenarios.write');
  if (ctx instanceof Response) return adaptAdminError(ctx);

  const parsed = await parseJsonBody<Record<string, unknown>>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body as unknown;
  if (!isPlainObject(body)) return aiError(400, 'bad_request', 'Expected a JSON object');

  const title = text(body.title, OBJECTION_LIMITS.titleMax);
  const example = text(body.example, OBJECTION_LIMITS.exampleMax);
  if (!title || !example) {
    return aiError(
      400,
      'bad_request',
      'Give the objection a name and what an owner typically says first — the suggestions are built from them.',
    );
  }
  const species = coachingSpecies(body.species);
  const existing = cleanCoaching(body.existing);
  const categoryId = typeof body.categoryId === 'string' ? body.categoryId : null;

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[admin-objection-coaching]', errorMessage(err));
    return aiError(500, 'server', 'AI is not configured');
  }

  // ── The category, server-side (fail-open: built-ins only) ────────────
  const categories = await withTimeout(
    readCategories(ctx.sb).then((r) => mergeCategories(r.categories)),
    CATEGORY_TIMEOUT_MS,
    mergeCategories([]),
  );
  const category: ObjectionCategory | null = categoryId
    ? (categories.find((c) => c.id === categoryId) ?? null)
    : null;

  // ── Grounding: the category's documents, as the AI owner reads them ──
  const docSlugs = category?.knowledgeSlugs?.length ? [...category.knowledgeSlugs] : undefined;
  const chunks = await withTimeout(
    retrieveChunks(coachingRetrievalQuery({ title, example, category }), {
      k: PASSAGES_K,
      sb: ctx.sb,
      filters: {
        tool: 'roleplay',
        ...(species.length === 1 ? { species: species[0] } : {}),
        ...(docSlugs ? { docSlugs, inheritedDocs: true } : {}),
        ...(category?.focusArea ? { focus: category.focusArea } : {}),
      },
    }),
    GROUNDING_TIMEOUT_MS,
    [] as RetrievedChunk[],
  );
  const passages: CoachingPromptPassage[] = chunks
    .map((c) => ({ text: String(c.content ?? ''), citation: c.citation ?? null }))
    .filter((p) => p.text.trim() !== '');

  const systemInstruction = buildObjectionCoachingSystemPrompt({
    title,
    example,
    species,
    category: category ? { name: category.name, description: category.description } : null,
    existing,
    passages,
  });

  const startedAt = Date.now();
  let coaching = null as ReturnType<typeof normalizeCoachingAnswer>;
  for (let attempt = 0; attempt < 2 && !coaching; attempt++) {
    if (attempt > 0 && Date.now() - startedAt > RETRY_BUDGET_MS) break;
    try {
      const response = await ai.models.generateContent({
        model: MODEL_TEXT,
        contents: [
          {
            role: 'user',
            parts: [{ text: `Write ${SUGGESTED_ITEMS} items for each of the five lists for this objection.` }],
          },
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.7,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      coaching = normalizeCoachingAnswer(response.text, existing);
      if (!coaching) console.warn('[admin-objection-coaching] unusable answer', { attempt });
    } catch (err) {
      console.error('[admin-objection-coaching] generate failed', { attempt, error: errorMessage(err) });
    }
  }

  if (!coaching) return aiError(502, 'upstream', UPSTREAM_MESSAGE);
  return ok<ObjectionCoachingResponse>({ coaching, groundedOn: passages.length });
};
