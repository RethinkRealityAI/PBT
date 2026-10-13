/**
 * Admin Scenario Studio inspector — `ScenarioInspectRequest →
 * ScenarioInspectResponse` (contract: src/shared/ai/contract.ts).
 *
 * "What exactly will the AI customer be told, and what will it read?"
 * Read-only: builds the runtime `Scenario` from the (unsaved) draft with
 * `draftToScenario` (validated, prose kept as typed — see `inspectDraft`;
 * a `team:` pushback resolves against the team's objections, read fresh),
 * loads the live simulation config from the database (team objection
 * coaching merged in, as every AI function sees it),
 * runs the real roleplay retrieval and returns
 *   • the exact text-mode customer system prompt (`buildCustomerSystemPrompt`,
 *     the draft's own AI notes as the preview overrides — the same wrapping
 *     the Test drive's `ai-roleplay` preview call gets), and
 *   • the retrieved passages plus the scope that was actually applied.
 *
 * Retrieval mirrors `retrieveForScenario(sb, scenario, config, 'roleplay')`
 * in `_shared/ai.ts` — same query (`scenarioRetrievalQuery`), same `rag.k`,
 * same filters (`scenarioRetrievalFilters` + the `roleplay` tool, with the
 * CATEGORY's knowledge for a draft that chose none of its own) — but calls
 * `retrieveChunksDetailed` so the applied filter and the soft-focus fallback
 * can be shown. The category follows from the draft's pushback id and is
 * read FRESH (team objections + stored categories, uncached), never from the
 * request; the answer says whose knowledge was used (`knowledgeSource`,
 * `knowledgeCategory`). The species scope follows the Scenario Studio design (§5):
 * a scenario that declares a species retrieves inside it (dog + Puppy life
 * stage → `puppy`), exactly `retrievalSpeciesFor`; a legacy scenario with no
 * species stays un-scoped. `inspectRetrievalFilters` is the one place that
 * decides, and it defers to `scenarioRetrievalFilters` if that ever carries
 * the species itself.
 *
 * Nothing is written, no telemetry is recorded. `scenarios.read` — anyone who
 * can view a scenario may see what it tells the AI.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, requireAdmin } from './_shared/admin';
import {
  adaptAdminError,
  aiError,
  errorMessage,
  isPlainObject,
  loadStoredSimulationConfig,
  ok,
  parseJsonBody,
  rateLimit,
  withTeamObjections,
} from './_shared/ai';
import { readCategories, readTeamObjections } from './_shared/objectionsStore';
import { retrieveChunksDetailed, type RetrievalFilters } from './_shared/retrieval';
import { buildCustomerSystemPrompt } from '../../src/data/knowledge/promptBuilders';
import {
  resolveRag,
  type SimulationConfig,
} from '../../src/data/knowledge/simulationConfig';
import type { Scenario } from '../../src/data/scenarios';
import {
  AI_LIMITS,
  type InspectPassage,
  type ScenarioInspectRequest,
  type ScenarioInspectResponse,
} from '../../src/shared/ai/contract';
import {
  scenarioRetrievalFilters,
  scenarioRetrievalQuery,
} from '../../src/shared/ai/retrievalQuery';
import { pickAgentDraft, type ScenarioAgentDraft } from '../../src/shared/ai/scenarioAgent';
import {
  draftToScenario,
  missingScenarioFields,
} from '../../src/shared/scenarios/draftToScenario';
import { SCENARIO_LIMITS } from '../../src/shared/scenarios/limits';
import type { TeamObjection } from '../../src/shared/scenarios/objections';
import {
  categoryKnowledgeFor,
  effectiveKnowledge,
  mergeCategories,
  objectionCategoryId,
  type KnowledgeSelection,
  type ObjectionCategory,
} from '../../src/shared/scenarios/objectionCategories';
import { retrievalSpeciesFor } from '../../src/shared/scenarios/species';
import type { RetrievedChunk } from '../../src/services/ragShared';

const MAX_BODY_BYTES = 96 * 1024;
const RATE = { limit: 30, windowMs: 60_000 };
/** Display length of one retrieved passage. */
export const SNIPPET_MAX_CHARS = 700;

type KnowledgeMode = ScenarioInspectResponse['knowledge']['mode'];

/** Prose a scenario carries into the prompt as typed (see `inspectDraft`). */
const VERBATIM_FIELDS = ['breed', 'pushback_notes', 'context_override', 'opening_line_override'] as const;

/**
 * The draft to inspect. `pickAgentDraft` whitelists and validates it, but it
 * also tidies prose for the assistant (collapses runs of spaces, soft-caps a
 * backstory at 1,500 chars) — and the prompt this endpoint promises is the
 * EXACT one. The Test drive sends the draft's prose as typed and a published
 * scenario is built from the stored row, so a field that passed validation
 * keeps its raw text here; the AI notes are clamped exactly like
 * `loadPromptOverrides` clamps a preview's (`AI_LIMITS.maxOverrideChars`).
 * The body cap bounds everything.
 */
export function inspectDraft(raw: Record<string, unknown>): ScenarioAgentDraft {
  const draft = pickAgentDraft(raw);
  for (const key of VERBATIM_FIELDS) {
    const value = raw[key];
    if (draft[key] !== undefined && typeof value === 'string') draft[key] = value;
  }
  for (const key of ['prompt_prefix', 'prompt_suffix'] as const) {
    const value = raw[key];
    if (typeof value === 'string') draft[key] = value.slice(0, AI_LIMITS.maxOverrideChars);
  }
  return draft;
}

/** Trim + cap an admin note; blank → null. */
export function noteOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  return text.length <= SCENARIO_LIMITS.promptMax
    ? text
    : text.slice(0, SCENARIO_LIMITS.promptMax).trimEnd();
}

/** The draft's knowledge in `effectiveKnowledge`'s terms. */
function draftKnowledge(draft: ScenarioAgentDraft): { focusArea: string | null; knowledgeSlugs: string[] } {
  return {
    focusArea: draft.focus_area ?? null,
    knowledgeSlugs: Array.isArray(draft.knowledge_slugs) ? draft.knowledge_slugs : [],
  };
}

/**
 * Where the customer will look: attached docs > topic > all — the draft's
 * own choice, else its category's (`categoryKnowledge`), else the library.
 */
export function knowledgeModeOf(
  draft: ScenarioAgentDraft,
  categoryKnowledge: KnowledgeSelection | null = null,
): KnowledgeMode {
  const k = effectiveKnowledge(draftKnowledge(draft), categoryKnowledge);
  if (k.knowledgeSlugs.length > 0) return 'documents';
  if (k.focusArea) return 'focus';
  return 'library';
}

/**
 * The roleplay retrieval filters for a scenario (see the header): the
 * scenario's own targeting (else its category's), the HARD `roleplay` tool
 * scope, and — when the scenario declares a species — the HARD species scope.
 */
export function inspectRetrievalFilters(
  scenario: Scenario,
  categoryKnowledge: KnowledgeSelection | null = null,
): RetrievalFilters {
  const base: RetrievalFilters = { ...(scenarioRetrievalFilters(scenario, { categoryKnowledge }) ?? {}) };
  const species = base.species ?? retrievalSpeciesFor(scenario.species, scenario.age);
  return { ...base, ...(species ? { species } : {}), tool: 'roleplay' };
}

/** One retrieved chunk, shaped for display. */
export function toPassage(chunk: RetrievedChunk): InspectPassage {
  const text = String(chunk.content ?? '').replace(/\s+/g, ' ').trim();
  const snippet =
    text.length <= SNIPPET_MAX_CHARS ? text : `${text.slice(0, SNIPPET_MAX_CHARS - 1).trimEnd()}…`;
  return {
    slug: typeof chunk.docSlug === 'string' ? chunk.docSlug : null,
    title: typeof chunk.docTitle === 'string' ? chunk.docTitle : null,
    citation: typeof chunk.citation === 'string' && chunk.citation ? chunk.citation : null,
    snippet,
    similarity:
      typeof chunk.similarity === 'number' && Number.isFinite(chunk.similarity)
        ? chunk.similarity
        : null,
  };
}

/** Non-deleted team objections, uncached; [] on any failure (logged). */
export async function inspectTeamObjections(sb: SupabaseClient): Promise<TeamObjection[]> {
  const read = await readTeamObjections(sb);
  if (read.error && !read.missing) {
    console.warn('[admin-scenario-inspect] scenario_objections read failed', read.error.message);
  }
  return read.objections;
}

/**
 * Non-deleted stored categories, uncached (an admin who just attached
 * documents to a category and opens the preview must see them used);
 * [] on any failure (logged) — then only the built-ins, with no knowledge.
 */
export async function inspectCategories(sb: SupabaseClient): Promise<ObjectionCategory[]> {
  const read = await readCategories(sb);
  if (read.error && !read.missing) {
    console.warn('[admin-scenario-inspect] scenario_objection_categories read failed', read.error.message);
  }
  return read.categories;
}

/** The category a pushback belongs to, shaped for the response (null when none). */
export function knowledgeCategoryOf(
  pushbackId: string | null | undefined,
  team: readonly TeamObjection[],
  categories: readonly ObjectionCategory[],
): ScenarioInspectResponse['knowledgeCategory'] {
  const id = objectionCategoryId(pushbackId, team);
  const c = id ? categories.find((x) => x.id === id) : undefined;
  if (!c) return null;
  return { id: c.id, name: c.name, focusArea: c.focusArea, knowledgeSlugs: [...c.knowledgeSlugs] };
}

function adminNotesOf(
  draft: ScenarioAgentDraft,
  config: SimulationConfig | undefined,
): ScenarioInspectResponse['adminNotes'] {
  return {
    scenarioPrefix: noteOrNull(draft.prompt_prefix),
    scenarioSuffix: noteOrNull(draft.prompt_suffix),
    globalPrefix: noteOrNull(config?.customerPromptPrefix),
    globalSuffix: noteOrNull(config?.customerPromptSuffix),
  };
}

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'scenario-inspect', RATE);
  if (limited) return limited;

  const ctx = await requireAdmin(req, 'scenarios.read');
  if (ctx instanceof Response) return adaptAdminError(ctx);

  const parsed = await parseJsonBody<ScenarioInspectRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body as unknown as Record<string, unknown>;
  if (!isPlainObject(body.draft)) {
    return aiError(400, 'bad_request', 'draft must be an object');
  }

  const draft = inspectDraft(body.draft);
  const rawInclude = isPlainObject(body.include) ? body.include : {};
  const include = {
    prompt: rawInclude.prompt !== false,
    knowledge: rawInclude.knowledge !== false,
  };

  // `scenarios.read` gets you into the endpoint, but the two halves reveal
  // more than scenarios: the prompt carries the admin-tuned personas and the
  // GLOBAL notes (AI tuning), the passages carry document titles/citations
  // (the public rag-retrieve strips slug and title). Anyone who edits scenarios needs
  // both to do the job; a read-only role needs the matching read permission.
  const canBriefing = can(ctx, 'scenarios.write') || can(ctx, 'simulation.read');
  const canPassages = can(ctx, 'scenarios.write') || can(ctx, 'knowledge.read');
  if (include.prompt && !canBriefing) {
    return aiError(
      403,
      'unauthorized',
      'Seeing the full briefing needs permission to edit scenarios or to view AI tuning.',
    );
  }
  if (include.knowledge && !canPassages) {
    return aiError(
      403,
      'unauthorized',
      'Previewing what the AI reads needs permission to edit scenarios or to view the knowledge base.',
    );
  }

  try {
    // Team objections are read FRESH here (the AI functions cache them for a
    // minute): an admin who has just added an objection and opens the
    // briefing must see it resolve, not "Pushback missing". Retired ones are
    // included — a scenario built on one still plays. Fail-open: without
    // them only built-in pushbacks resolve. The config is the stored one with
    // the same list merged in, exactly as `loadSimulationConfig` merges it.
    // The categories are read fresh for the same reason, and are the ONLY
    // source of category knowledge here: the draft says which objection it
    // is on, the database says which category that is and what it reads.
    const [stored, team, storedCategories] = await Promise.all([
      loadStoredSimulationConfig(ctx.sb),
      inspectTeamObjections(ctx.sb),
      inspectCategories(ctx.sb),
    ]);
    const config = withTeamObjections(stored, team);
    const rag = resolveRag(config);
    const notes = adminNotesOf(draft, config);
    const adminNotes = canBriefing ? notes : { ...notes, globalPrefix: null, globalSuffix: null };
    const categories = mergeCategories(storedCategories);
    const categoryKnowledge = categoryKnowledgeFor(draft.pushback_id, team, categories);
    const mode = knowledgeModeOf(draft, categoryKnowledge);
    const knowledgeSource = effectiveKnowledge(draftKnowledge(draft), categoryKnowledge).source;
    const knowledgeCategory = knowledgeCategoryOf(draft.pushback_id, team, categories);

    const missing = missingScenarioFields(draft, team);
    const scenario = missing.length === 0 ? draftToScenario(draft, team) : null;
    if (!scenario) {
      const payload: ScenarioInspectResponse = {
        missing: missing.length ? missing : ['Scenario'],
        prompt: null,
        adminNotes,
        knowledgeSource,
        knowledgeCategory,
        knowledge: {
          enabled: rag.enabled,
          k: rag.k,
          mode,
          appliedFilter: {},
          focusRelaxed: false,
          passages: [],
        },
      };
      return ok(payload);
    }

    // The prompt embeds the passages, so retrieval runs whenever either
    // half was asked for — the prompt is only "exact" with them in it.
    let retrieved: RetrievedChunk[] = [];
    let appliedFilter: Record<string, unknown> = {};
    let focusRelaxed = false;
    let docsRelaxed = false;
    if (rag.enabled && (include.prompt || include.knowledge)) {
      const detailed = await retrieveChunksDetailed(scenarioRetrievalQuery(scenario), {
        k: rag.k,
        filters: inspectRetrievalFilters(scenario, categoryKnowledge),
        sb: ctx.sb,
      });
      retrieved = detailed.results;
      appliedFilter = detailed.appliedFilter;
      focusRelaxed = detailed.focusRelaxed;
      docsRelaxed = detailed.docsRelaxed;
    }

    const prompt = include.prompt
      ? buildCustomerSystemPrompt({
          scenario,
          overrides: { promptPrefix: draft.prompt_prefix, promptSuffix: draft.prompt_suffix },
          config,
          retrieved,
          locale: 'en',
          mode: 'text',
        })
      : null;

    const payload: ScenarioInspectResponse = {
      missing: [],
      prompt,
      adminNotes,
      knowledgeSource,
      knowledgeCategory,
      knowledge: {
        enabled: rag.enabled,
        k: rag.k,
        mode,
        appliedFilter: include.knowledge ? appliedFilter : {},
        focusRelaxed: include.knowledge ? focusRelaxed : false,
        docsRelaxed: include.knowledge ? docsRelaxed : false,
        passages: include.knowledge ? retrieved.map(toPassage) : [],
      },
    };
    return ok(payload);
  } catch (err) {
    console.error('[admin-scenario-inspect] failed', errorMessage(err));
    return aiError(500, 'server', 'The preview could not be built. Try again in a moment.');
  }
};
