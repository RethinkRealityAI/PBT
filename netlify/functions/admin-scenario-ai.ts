/**
 * Admin Scenario Builder wizard — `ScenarioSuggestRequest →
 * ScenarioSuggestResponse`. Three short suggestions for one wizard field,
 * given the partially-filled draft.
 *
 * Server-side port of `admin/src/lib/scenarioAi.ts::suggestField`: same
 * prompt (`buildWizardSystemPrompt`, shared), same `{ suggestions }` schema,
 * same slice-to-3, and the same fail-open research grounding — now via the
 * in-process `retrieveChunks` (k = 3) instead of an HTTP hop, with the same
 * 2.5 s budget the browser fetch had.
 *
 * Gated on `scenarios.write`: the wizard exists to author scenarios, and
 * the permission catalog declares `scenarios.write` (which implies
 * `scenarios.read`). Read-only roles have no scenario editor to drive.
 */
import { Type, type GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
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
import { MODEL_TEXT } from '../../src/shared/ai/models';
import type {
  ScenarioSuggestRequest,
  ScenarioSuggestResponse,
} from '../../src/shared/ai/contract';
import {
  DRAFT_KEYS,
  buildWizardSystemPrompt,
  isWizardField,
  type ScenarioDraftForAi,
} from '../../src/shared/ai/scenarioWizard';
import type { RetrievedChunk } from '../../src/services/ragShared';

const MAX_BODY_BYTES = 64 * 1024;
const GROUNDING_TIMEOUT_MS = 2500;
const MAX_DRAFT_FIELD_CHARS = 2000;

/** Whitelist the draft to the keys the prompt reads; drop everything else. */
export function pickDraft(raw: unknown): ScenarioDraftForAi {
  const out: Record<string, string | number> = {};
  if (!isPlainObject(raw)) return out;
  for (const key of DRAFT_KEYS) {
    const v = raw[key];
    if (key === 'difficulty_override') {
      if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    } else if (typeof v === 'string') {
      out[key] = v.slice(0, MAX_DRAFT_FIELD_CHARS);
    }
  }
  return out as ScenarioDraftForAi;
}

/** Fail-open fetch of study-grounded context (formatted as the wizard always did). */
async function fetchGrounding(draft: ScenarioDraftForAi, sb: SupabaseClient): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const query = [draft.pushback_id, draft.breed, draft.life_stage, 'owner pushback']
      .filter(Boolean)
      .join(' ');
    const results = await Promise.race<RetrievedChunk[]>([
      retrieveChunks(query, { k: 3, sb, filters: { tool: 'scenario-builder' } }),
      new Promise<RetrievedChunk[]>((resolve) => {
        timer = setTimeout(() => resolve([]), GROUNDING_TIMEOUT_MS);
      }),
    ]);
    if (results.length === 0) return '';
    return (
      '\n\nResearch grounding (reflect these findings in your suggestions):\n' +
      results
        .map(
          (r) =>
            `- ${r.content.replace(/\s+/g, ' ').slice(0, 400)}${r.citation ? ` [${r.citation}]` : ''}`,
        )
        .join('\n')
    );
  } catch {
    return '';
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'scenario-suggest', { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const ctx = await requireAdmin(req, 'scenarios.write');
  if (ctx instanceof Response) return adaptAdminError(ctx);

  const parsed = await parseJsonBody<ScenarioSuggestRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const { field, draft: rawDraft } = parsed.body;
  if (!isWizardField(field)) return aiError(400, 'bad_request', 'Unknown wizard field');
  const draft = pickDraft(rawDraft);

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[admin-scenario-ai]', errorMessage(err));
    return aiError(500, 'server', 'AI is not configured');
  }

  const grounding = await fetchGrounding(draft, ctx.sb);
  const systemInstruction = buildWizardSystemPrompt(field, draft, grounding);

  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: 'Generate the 3 suggestions now.',
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['suggestions'],
        },
      },
    });
    const raw = response.text ?? '';
    if (!raw) throw new Error('Empty AI response');
    const parsedOut = JSON.parse(raw) as { suggestions?: unknown };
    const suggestions = Array.isArray(parsedOut.suggestions)
      ? parsedOut.suggestions.filter((s): s is string => typeof s === 'string').slice(0, 3)
      : [];
    const payload: ScenarioSuggestResponse = { suggestions };
    return ok(payload);
  } catch (err) {
    console.error('[admin-scenario-ai] suggest failed', errorMessage(err));
    return aiError(502, 'upstream', 'The suggestion engine could not be reached.');
  }
};
