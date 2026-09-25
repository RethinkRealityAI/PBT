/**
 * Admin Scenario Studio assistant — `ScenarioAgentRequest →
 * ScenarioAgentResponse` (contract: src/shared/ai/contract.ts; action
 * vocabulary + normaliser: src/shared/ai/scenarioAgent.ts).
 *
 * The chat behind the Studio's assistant panel. One Gemini JSON call returns
 * a short reply plus PROPOSED actions; this function never writes anything
 * and records no telemetry (mirrors `admin-scenario-ai`). The admin sees each
 * proposal as a card and applies it to the on-screen draft; saving and
 * publishing stay explicit clicks.
 *
 * Trust boundary:
 *   • The conversation and the draft are admin-authored prompt context,
 *     whitelisted (`sanitizeAgentTurns`, `pickAgentDraft`) and bounded.
 *   • The document catalogue is loaded HERE, from the database: live
 *     (not soft-deleted) documents the roleplay customer may read and that
 *     have at least one indexed chunk. It is the `knownSlugs` the normaliser
 *     checks — a slug the model invents, or one the client claims exists, is
 *     dropped before it reaches a card.
 *   • The model's output is untrusted: `normalizeAgentActions` is the gate
 *     (unknown tools, illegal enum values, over-long prose, made-up slugs and
 *     extra questions are dropped), and the client runs it again on confirm.
 *
 * Actions ride in a JSON-encoded STRING field (`actionsJson`), never an
 * ARRAY-of-OBJECT response schema — the PhotoBoothAR lesson: that shape hung
 * constrained decoding.
 *
 * Grounding is fail-open (like `fetchGrounding` in admin-scenario-ai): the
 * catalogue, the "likely relevant" roleplay search and the scenario-builder
 * research search each fall back to empty on error or timeout, so a RAG
 * outage degrades the assistant, never breaks it.
 *
 * Gated on `scenarios.write` (the assistant exists to author scenarios),
 * 30 calls / minute / IP.
 */
import { ThinkingLevel, Type, type GoogleGenAI } from '@google/genai';
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
  ScenarioAgentRequest,
  ScenarioAgentResponse,
} from '../../src/shared/ai/contract';
import {
  AGENT_FIELDS,
  AGENT_LIMITS,
  isStudioStepKey,
  normalizeAgentActions,
  normalizeSuggestions,
  pickAgentDraft,
  sanitizeAgentTurns,
  type AgentFieldValues,
  type AgentTurn,
  type ScenarioAgentAction,
  type ScenarioAgentDraft,
  type StudioStepKey,
} from '../../src/shared/ai/scenarioAgent';
import {
  buildScenarioAgentSystemPrompt,
  type AgentCatalogueDoc,
  type AgentRelevantDoc,
  type AgentResearchSnippet,
} from '../../src/shared/ai/scenarioAgentPrompt';
import { readKnowledgeScope } from '../../src/shared/knowledge/knowledgeScopes';
import { focusAreaLabel, isFocusAreaKey } from '../../src/shared/knowledge/focusAreas';
import { PUSHBACK_LABELS } from '../../src/shared/scenarios/enums';
import { retrievalSpeciesFor } from '../../src/shared/scenarios/species';
import type { RetrievedChunk } from '../../src/services/ragShared';

const MAX_BODY_BYTES = 96 * 1024;
const RATE = { limit: 30, windowMs: 60_000 };

/** Budget for each retrieval (same as admin-scenario-ai's grounding). */
export const GROUNDING_TIMEOUT_MS = 2500;
/** Budget for the document catalogue read. */
const CATALOGUE_TIMEOUT_MS = 4000;
/** Documents offered to the model (most recently updated first). */
export const CATALOGUE_MAX_DOCS = 80;
/** Rows scanned before the roleplay-scope + indexed filters narrow them. */
const CATALOGUE_SCAN_ROWS = 500;
const RELEVANT_K = 6;
const RESEARCH_K = 3;
const MAX_QUERY_CHARS = 1000;
const RESEARCH_SNIPPET_CHARS = 400;
/** No second attempt once the first has eaten this much of the budget. */
const RETRY_BUDGET_MS = 15_000;
const RETRY_DELAY_MS = 400;

const UPSTREAM_MESSAGE =
  'The assistant could not be reached. Your draft is unchanged — keep building with the steps, or try again.';

// ── Fail-open helpers ────────────────────────────────────────────────────

/** Resolve to `fallback` on rejection or when `ms` elapses first. */
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

// ── Knowledge catalogue (server-trusted) ─────────────────────────────────

interface DocRow {
  id: unknown;
  slug: unknown;
  title: unknown;
  category: unknown;
  metadata: unknown;
}

function focusOf(metadata: unknown): string | null {
  const bag = isPlainObject(metadata) ? metadata : {};
  const tags = isPlainObject(bag.tags) ? bag.tags : bag;
  return isFocusAreaKey(tags.focus) ? (tags.focus as string) : null;
}

/**
 * Live documents the roleplay customer can read AND that have at least one
 * indexed chunk — the only slugs an `attach_knowledge` card may carry. A
 * document with no chunks would retrieve nothing, so attaching it would
 * silently strip the scenario of grounding. Throws on a database error (the
 * caller treats that as an empty catalogue).
 */
export async function loadRoleplayCatalogue(sb: SupabaseClient): Promise<AgentCatalogueDoc[]> {
  const { data, error } = await sb
    .from('knowledge_documents')
    .select('id, slug, title, category, metadata, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(CATALOGUE_SCAN_ROWS);
  if (error) throw new Error(error.message);

  const docs = ((data ?? []) as DocRow[]).filter(
    (d) =>
      typeof d.slug === 'string' &&
      d.slug.trim() !== '' &&
      readKnowledgeScope(d.metadata).tools.includes('roleplay'),
  );
  if (docs.length === 0) return [];

  // Chunk counts are aggregated in the database (see admin-knowledge: a
  // client-side tally of chunk rows silently capped at 1000).
  const { data: countRows, error: countErr } = await sb
    .from('knowledge_chunk_counts')
    .select('doc_id, chunks');
  if (countErr) throw new Error(countErr.message);
  const counts = new Map<string, number>();
  for (const r of (countRows ?? []) as Array<{ doc_id: unknown; chunks: unknown }>) {
    counts.set(String(r.doc_id), Number(r.chunks) || 0);
  }

  return docs
    .filter((d) => (counts.get(String(d.id)) ?? 0) > 0)
    .slice(0, CATALOGUE_MAX_DOCS)
    .map((d) => ({
      slug: d.slug as string,
      title: typeof d.title === 'string' && d.title.trim() ? d.title : (d.slug as string),
      category: typeof d.category === 'string' ? d.category : null,
      focus: focusOf(d.metadata),
      species: readKnowledgeScope(d.metadata).species,
    }));
}

/**
 * The catalogue a scenario of this species scope can actually retrieve from.
 * `scope` undefined (no species declared) keeps everything — legacy
 * scenarios retrieve un-scoped. A document with no species tags reads as
 * "every species" (the knowledge vocabulary's default).
 */
export function catalogueForSpecies(
  catalogue: readonly AgentCatalogueDoc[],
  scope: string | undefined,
): AgentCatalogueDoc[] {
  if (!scope) return [...catalogue];
  return catalogue.filter((d) => !d.species || d.species.length === 0 || d.species.includes(scope));
}

// ── Retrieval ────────────────────────────────────────────────────────────

/**
 * What to search the knowledge base for: the admin's latest words (minus
 * `[tool_result]` bookkeeping lines) plus a one-line summary of the draft,
 * so "make it about kidneys" still finds renal documents for a cat draft.
 */
export function agentRetrievalQuery(turns: readonly AgentTurn[], draft: ScenarioAgentDraft): string {
  const lastAdmin = [...turns].reverse().find((t) => t.role === 'user')?.content ?? '';
  const said = lastAdmin
    .split('\n')
    .filter((line) => !line.trim().startsWith('[tool_result]'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
  const summary = [
    draft.species,
    draft.breed,
    draft.life_stage,
    draft.pushback_id ? PUSHBACK_LABELS[draft.pushback_id] : null,
    draft.focus_area ? focusAreaLabel(draft.focus_area) : null,
    draft.pushback_notes ? draft.pushback_notes.slice(0, 160) : null,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .join(' · ');
  return [said, summary].filter(Boolean).join(' — ').slice(0, MAX_QUERY_CHARS);
}

/** Distinct catalogue documents behind the retrieved chunks, in rank order. */
export function relevantFromChunks(
  chunks: readonly RetrievedChunk[],
  catalogue: readonly AgentCatalogueDoc[],
): AgentRelevantDoc[] {
  const bySlug = new Map(catalogue.map((d) => [d.slug, d]));
  const out: AgentRelevantDoc[] = [];
  for (const chunk of chunks) {
    const doc = chunk.docSlug ? bySlug.get(chunk.docSlug) : undefined;
    if (!doc || out.some((r) => r.slug === doc.slug)) continue;
    out.push({ slug: doc.slug, title: doc.title });
  }
  return out;
}

function researchFromChunks(chunks: readonly RetrievedChunk[]): AgentResearchSnippet[] {
  return chunks
    .map((c) => ({
      text: String(c.content ?? '').replace(/\s+/g, ' ').trim().slice(0, RESEARCH_SNIPPET_CHARS),
      citation: c.citation ?? null,
    }))
    .filter((s) => s.text !== '')
    .slice(0, RESEARCH_K);
}

// ── Model answer ─────────────────────────────────────────────────────────

/** JSON.parse that tolerates a ```json fence and never throws. */
function safeParse(raw: unknown): unknown {
  if (typeof raw !== 'string') return undefined;
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A string field that should hold a JSON array (lenient on shape). */
function readJsonList(value: unknown): unknown[] {
  const parsed = typeof value === 'string' ? safeParse(value) : value;
  if (Array.isArray(parsed)) return parsed;
  if (isPlainObject(parsed)) return [parsed]; // one action, unwrapped
  return [];
}

function plainReply(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
  return text.length <= AGENT_LIMITS.maxReplyChars
    ? text
    : text.slice(0, AGENT_LIMITS.maxReplyChars).trimEnd();
}

/**
 * Drop what would be a no-op card: `update_fields` values the draft already
 * holds (a card whose every row reads "Dog → Dog" is noise), and a
 * `go_to_step` to the step the admin is already on.
 */
export function pruneNoOpActions(
  actions: readonly ScenarioAgentAction[],
  draft: ScenarioAgentDraft,
  step: StudioStepKey | undefined,
): ScenarioAgentAction[] {
  const out: ScenarioAgentAction[] = [];
  for (const action of actions) {
    if (action.tool === 'go_to_step' && action.step === step) continue;
    if (action.tool === 'update_fields') {
      const fields: AgentFieldValues = {};
      for (const field of AGENT_FIELDS) {
        const value = action.fields[field];
        if (value === undefined) continue;
        if ((draft as Record<string, unknown>)[field] === value) continue;
        (fields as Record<string, unknown>)[field] = value;
      }
      if (Object.keys(fields).length === 0) continue;
      out.push({ ...action, fields });
      continue;
    }
    out.push(action);
  }
  return out;
}

/**
 * Parse + normalise one model answer, or null when it is unusable (empty,
 * not JSON, or no reply) — the caller retries once on null.
 */
export function parseAgentAnswer(
  text: unknown,
  ctx: { knownSlugs: ReadonlySet<string>; draft: ScenarioAgentDraft; step?: StudioStepKey },
): ScenarioAgentResponse | null {
  const obj = safeParse(text);
  if (!isPlainObject(obj)) return null;
  const reply = plainReply(obj.reply);
  if (!reply) return null;
  const rawActions = readJsonList(obj.actionsJson ?? obj.actions);
  const actions = pruneNoOpActions(
    normalizeAgentActions(rawActions, { knownSlugs: ctx.knownSlugs }),
    ctx.draft,
    ctx.step,
  );
  const suggestions = normalizeSuggestions(readJsonList(obj.suggestionsJson ?? obj.suggestions));
  return { reply, actions, suggestions };
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    actionsJson: { type: Type.STRING },
    suggestionsJson: { type: Type.STRING },
  },
  required: ['reply', 'actionsJson'],
  propertyOrdering: ['reply', 'actionsJson', 'suggestionsJson'],
};

// ── Handler ──────────────────────────────────────────────────────────────

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'scenario-agent', RATE);
  if (limited) return limited;

  const ctx = await requireAdmin(req, 'scenarios.write');
  if (ctx instanceof Response) return adaptAdminError(ctx);

  const parsed = await parseJsonBody<ScenarioAgentRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body as unknown as Record<string, unknown>;

  const turns = sanitizeAgentTurns(body.messages);
  if (!turns) {
    return aiError(
      400,
      'bad_request',
      "messages must be a non-empty conversation that ends on the admin's turn",
    );
  }
  const draft = pickAgentDraft(body.draft);
  const step = isStudioStepKey(body.step) ? body.step : undefined;

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[admin-scenario-agent]', errorMessage(err));
    return aiError(500, 'server', 'AI is not configured');
  }

  // ── Grounding (all fail-open, run together) ─────────────────────────
  const query = agentRetrievalQuery(turns, draft);
  const species = retrievalSpeciesFor(draft.species, draft.life_stage);
  const speciesFilter = species ? { species } : {};
  const [fullCatalogue, relevantChunks, researchChunks] = await Promise.all([
    withTimeout(loadRoleplayCatalogue(ctx.sb), CATALOGUE_TIMEOUT_MS, [] as AgentCatalogueDoc[]),
    withTimeout(
      retrieveChunks(query, {
        k: RELEVANT_K,
        sb: ctx.sb,
        filters: { tool: 'roleplay', ...speciesFilter },
      }),
      GROUNDING_TIMEOUT_MS,
      [] as RetrievedChunk[],
    ),
    withTimeout(
      retrieveChunks(query, {
        k: RESEARCH_K,
        sb: ctx.sb,
        filters: { tool: 'scenario-builder', ...speciesFilter },
      }),
      GROUNDING_TIMEOUT_MS,
      [] as RetrievedChunk[],
    ),
  ]);
  // Species is a HARD retrieval scope and attached documents never widen, so
  // a dog-only document attached to a cat scenario would retrieve NOTHING.
  // The assistant only ever sees (and may only attach) documents this
  // scenario's species can actually read.
  const catalogue = catalogueForSpecies(fullCatalogue, species);
  const knownSlugs = new Set(catalogue.map((d) => d.slug));

  const systemInstruction = buildScenarioAgentSystemPrompt({
    draft,
    step,
    catalogue,
    relevant: relevantFromChunks(relevantChunks, catalogue),
    research: researchFromChunks(researchChunks),
  });
  const contents = turns.map((t) => ({
    role: t.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: t.content }],
  }));

  // ── One model call, retried once ────────────────────────────────────
  const startedAt = Date.now();
  let answer: ScenarioAgentResponse | null = null;
  for (let attempt = 0; attempt < 2 && !answer; attempt++) {
    if (attempt > 0 && Date.now() - startedAt > RETRY_BUDGET_MS) break;
    try {
      const response = await ai.models.generateContent({
        model: MODEL_TEXT,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.4,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
      answer = parseAgentAnswer(response.text, { knownSlugs, draft, step });
      if (!answer) console.warn('[admin-scenario-agent] unusable answer', { attempt });
    } catch (err) {
      console.error('[admin-scenario-agent] generate failed', { attempt, error: errorMessage(err) });
      if (attempt === 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  if (!answer) return aiError(502, 'upstream', UPSTREAM_MESSAGE);
  return ok<ScenarioAgentResponse>(answer);
};
