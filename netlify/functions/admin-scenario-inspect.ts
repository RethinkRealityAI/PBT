/**
 * Admin Scenario Studio inspector — `ScenarioInspectRequest →
 * ScenarioInspectResponse` (contract: src/shared/ai/contract.ts).
 *
 * "What exactly will the AI customer be told, and what will it read?"
 * Read-only: builds the runtime `Scenario` from the (unsaved) draft with
 * `draftToScenario` (validated, prose kept as typed — see `inspectDraft`),
 * loads the live simulation config from the database,
 * runs the real roleplay retrieval and returns
 *   • the exact text-mode customer system prompt (`buildCustomerSystemPrompt`,
 *     the draft's own AI notes as the preview overrides — the same wrapping
 *     the Test drive's `ai-roleplay` preview call gets), and
 *   • the retrieved passages plus the scope that was actually applied.
 *
 * Retrieval mirrors `retrieveForScenario(sb, scenario, config, 'roleplay')`
 * in `_shared/ai.ts` — same query (`scenarioRetrievalQuery`), same `rag.k`,
 * same filters (`scenarioRetrievalFilters` + the `roleplay` tool) — but calls
 * `retrieveChunksDetailed` so the applied filter and the soft-focus fallback
 * can be shown. The species scope follows the Scenario Studio design (§5):
 * a scenario that declares a species retrieves inside it (dog + Puppy life
 * stage → `puppy`), exactly `retrievalSpeciesFor`; a legacy scenario with no
 * species stays un-scoped. `inspectRetrievalFilters` is the one place that
 * decides, and it defers to `scenarioRetrievalFilters` if that ever carries
 * the species itself.
 *
 * Nothing is written, no telemetry is recorded. `scenarios.read` — anyone who
 * can view a scenario may see what it tells the AI.
 */
import { requireAdmin } from './_shared/admin';
import {
  adaptAdminError,
  aiError,
  errorMessage,
  isPlainObject,
  loadSimulationConfig,
  ok,
  parseJsonBody,
  rateLimit,
} from './_shared/ai';
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

/** Where the draft tells the customer to look: attached docs > topic > all. */
export function knowledgeModeOf(draft: ScenarioAgentDraft): KnowledgeMode {
  if (Array.isArray(draft.knowledge_slugs) && draft.knowledge_slugs.length > 0) return 'documents';
  if (draft.focus_area) return 'focus';
  return 'library';
}

/**
 * The roleplay retrieval filters for a scenario (see the header): the
 * scenario's own targeting, the HARD `roleplay` tool scope, and — when the
 * scenario declares a species — the HARD species scope.
 */
export function inspectRetrievalFilters(scenario: Scenario): RetrievalFilters {
  const base: RetrievalFilters = { ...(scenarioRetrievalFilters(scenario) ?? {}) };
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
  const mode = knowledgeModeOf(draft);

  try {
    const config = await loadSimulationConfig(ctx.sb);
    const rag = resolveRag(config);
    const adminNotes = adminNotesOf(draft, config);

    const missing = missingScenarioFields(draft);
    const scenario = missing.length === 0 ? draftToScenario(draft) : null;
    if (!scenario) {
      const payload: ScenarioInspectResponse = {
        missing: missing.length ? missing : ['Scenario'],
        prompt: null,
        adminNotes,
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
    if (rag.enabled && (include.prompt || include.knowledge)) {
      const detailed = await retrieveChunksDetailed(scenarioRetrievalQuery(scenario), {
        k: rag.k,
        filters: inspectRetrievalFilters(scenario),
        sb: ctx.sb,
      });
      retrieved = detailed.results;
      appliedFilter = detailed.appliedFilter;
      focusRelaxed = detailed.focusRelaxed;
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
      knowledge: {
        enabled: rag.enabled,
        k: rag.k,
        mode,
        appliedFilter: include.knowledge ? appliedFilter : {},
        focusRelaxed: include.knowledge ? focusRelaxed : false,
        passages: include.knowledge ? retrieved.map(toPassage) : [],
      },
    };
    return ok(payload);
  } catch (err) {
    console.error('[admin-scenario-inspect] failed', errorMessage(err));
    return aiError(500, 'server', 'The preview could not be built. Try again in a moment.');
  }
};
