/**
 * Scenario Studio assistant — the action vocabulary and its gatekeepers.
 *
 * Shared by the admin Studio (which renders proposals as A2UI cards and
 * applies them to the on-screen draft) and `netlify/functions/
 * admin-scenario-agent.ts` (which asks Gemini for them). Dependency-free
 * apart from the other `src/shared` vocabularies.
 *
 * The contract, ported from PhotoBoothAR's Concierge/Copilot:
 *   • The model NEVER writes UI and NEVER writes data. It returns a reply
 *     plus a JSON-encoded list of proposed actions.
 *   • `normalizeAgentActions` is the real gate. The server runs it on the
 *     model's output; the client runs it AGAIN on every card the admin
 *     confirms (card data is two-way bound and editable, so it is untrusted
 *     twice over).
 *   • Applying an action only patches the draft on the admin's screen.
 *     Saving and publishing stay explicit clicks.
 */
import {
  DIFFICULTY_LABELS,
  LIFE_STAGES,
  PERSONAS,
  PUSHBACK_IDS,
  PUSHBACK_LABELS,
} from '../scenarios/enums';
import { SCENARIO_LIMITS, SCENARIO_PROSE_CAPS } from '../scenarios/limits';
import {
  SPECIES_LABELS,
  isScenarioSpecies,
  lifeStageLabel,
  type ScenarioSpecies,
} from '../scenarios/species';
import { FOCUS_AREAS, isFocusAreaKey } from '../knowledge/focusAreas';

// ── Vocabulary ───────────────────────────────────────────────────────────

/** The seven Studio steps, in order. */
export const STUDIO_STEP_KEYS = [
  'pet',
  'pushback',
  'customer',
  'knowledge',
  'brief',
  'test',
  'publish',
] as const;
export type StudioStepKey = (typeof STUDIO_STEP_KEYS)[number];

export const STUDIO_STEP_LABELS: Record<StudioStepKey, string> = {
  pet: 'The pet',
  pushback: 'The pushback',
  customer: 'The owner',
  knowledge: 'Knowledge',
  brief: 'AI brief',
  test: 'Test drive',
  publish: 'Publish',
};

export function isStudioStepKey(value: unknown): value is StudioStepKey {
  return typeof value === 'string' && (STUDIO_STEP_KEYS as readonly string[]).includes(value);
}

export const SCENARIO_DRIVERS = ['Activator', 'Energizer', 'Analyzer', 'Harmonizer'] as const;
export type ScenarioDriver = (typeof SCENARIO_DRIVERS)[number];

/** One-line plain-language description of each ECHO driver (UI + prompt). */
export const DRIVER_BLURBS: Record<ScenarioDriver, string> = {
  Activator: 'Blunt and results-first — interrupts, wants the bottom line.',
  Energizer: 'Chatty and emotional — tells stories, easily sidetracked.',
  Analyzer: 'Wants evidence — numbers, studies and specifics before moving.',
  Harmonizer: 'Avoids conflict — agrees out loud, resists quietly.',
};

/** What each persona means, in a sentence (UI + prompt). */
export const PERSONA_BLURBS: Record<string, string> = {
  Skeptical: 'Doubts the recommendation and needs convincing.',
  Anxious: 'Worried about doing the wrong thing for their pet.',
  Busy: 'Short on time — wants it quick and practical.',
  'Bargain-hunter': 'Price is always part of the conversation.',
  Devoted: 'Deeply attached — emotion drives every decision.',
};

/** What each difficulty level does to the AI customer (UI + prompt). */
export const DIFFICULTY_BLURBS: Record<number, string> = {
  1: 'Pushes back once, then yields to genuine listening.',
  2: 'Pushes back twice; softens visibly on solid ACT.',
  3: 'Holds pressure for at least three turns.',
  4: 'Stays difficult; only several strong, evidence-backed turns move them.',
};

/**
 * The draft as the assistant sees it — a whitelisted slice of a
 * `scenario_overrides` row. The admin's `Partial<ScenarioOverrideRow>` is
 * assignable to this.
 */
export interface ScenarioAgentDraft {
  scenario_id?: string | null;
  species?: ScenarioSpecies | null;
  breed?: string | null;
  life_stage?: string | null;
  weight_kg?: number | null;
  pushback_id?: string | null;
  pushback_notes?: string | null;
  context_override?: string | null;
  suggested_driver?: string | null;
  persona_override?: string | null;
  difficulty_override?: number | null;
  opening_line_override?: string | null;
  focus_area?: string | null;
  knowledge_slugs?: string[] | null;
  prompt_prefix?: string | null;
  prompt_suffix?: string | null;
  card_title_override?: string | null;
  card_subtitle_override?: string | null;
  start_button_label?: string | null;
  info_modal_title?: string | null;
  info_modal_body?: string | null;
  visible?: boolean | null;
}

/** Every key of `ScenarioAgentDraft`, for whitelisting request bodies. */
export const AGENT_DRAFT_KEYS: readonly (keyof ScenarioAgentDraft)[] = [
  'scenario_id',
  'species',
  'breed',
  'life_stage',
  'weight_kg',
  'pushback_id',
  'pushback_notes',
  'context_override',
  'suggested_driver',
  'persona_override',
  'difficulty_override',
  'opening_line_override',
  'focus_area',
  'knowledge_slugs',
  'prompt_prefix',
  'prompt_suffix',
  'card_title_override',
  'card_subtitle_override',
  'start_button_label',
  'info_modal_title',
  'info_modal_body',
  'visible',
];

/** Fields an `update_fields` proposal may set. */
export const AGENT_FIELDS = [
  'species',
  'breed',
  'life_stage',
  'weight_kg',
  'pushback_id',
  'pushback_notes',
  'context_override',
  'suggested_driver',
  'persona_override',
  'difficulty_override',
  'opening_line_override',
  'card_title_override',
  'card_subtitle_override',
  'start_button_label',
  'info_modal_title',
  'info_modal_body',
] as const;
export type AgentField = (typeof AGENT_FIELDS)[number];

/** Fields an `ask` card may bind its option buttons to. */
export const ASK_FIELDS = [
  'species',
  'life_stage',
  'pushback_id',
  'suggested_driver',
  'persona_override',
  'difficulty_override',
] as const;
export type AskField = (typeof ASK_FIELDS)[number];

/** Fields an `offer_options` card may fill with the option the admin picks. */
export const OFFER_FIELDS = [
  'breed',
  'pushback_notes',
  'context_override',
  'opening_line_override',
  'card_title_override',
  'card_subtitle_override',
  'prompt_prefix',
  'prompt_suffix',
] as const;
export type OfferField = (typeof OFFER_FIELDS)[number];

/** Values an `update_fields` proposal carries, already normalised. */
export type AgentFieldValues = {
  species?: ScenarioSpecies;
  breed?: string;
  life_stage?: string;
  weight_kg?: number;
  pushback_id?: string;
  pushback_notes?: string;
  context_override?: string;
  suggested_driver?: ScenarioDriver;
  persona_override?: string;
  difficulty_override?: number;
  opening_line_override?: string;
  card_title_override?: string;
  card_subtitle_override?: string;
  start_button_label?: string;
  info_modal_title?: string;
  info_modal_body?: string;
};

export type KnowledgeMode = 'library' | 'focus' | 'documents';

export interface AgentOption {
  label: string;
  value: string;
}

export type ScenarioAgentAction =
  | { tool: 'update_fields'; fields: AgentFieldValues; note?: string }
  | {
      tool: 'set_ai_notes';
      prompt_prefix?: string | null;
      prompt_suffix?: string | null;
      note?: string;
    }
  | {
      tool: 'attach_knowledge';
      mode: KnowledgeMode;
      focus_area?: string | null;
      slugs?: string[];
      note?: string;
    }
  | { tool: 'ask'; question: string; field?: AskField; options: AgentOption[] }
  | { tool: 'offer_options'; field: OfferField; options: string[]; note?: string }
  | { tool: 'go_to_step'; step: StudioStepKey; note?: string };

export type ScenarioAgentTool = ScenarioAgentAction['tool'];

export const AGENT_TOOLS: readonly ScenarioAgentTool[] = [
  'update_fields',
  'set_ai_notes',
  'attach_knowledge',
  'ask',
  'offer_options',
  'go_to_step',
];

/** One conversation turn on the wire. Tool results travel as user turns. */
export interface AgentTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const AGENT_LIMITS = {
  maxActions: 3,
  maxTurns: 24,
  maxTurnChars: 2000,
  maxSuggestions: 3,
  maxSuggestionChars: 90,
  maxQuestionChars: 240,
  maxOptionLabelChars: 80,
  minOptions: 2,
  maxOptions: 6,
  maxOfferOptions: 4,
  maxNoteChars: 240,
  maxReplyChars: 1200,
} as const;

/** Human names for every field the assistant can touch. */
export const AGENT_FIELD_LABELS: Record<AgentField | OfferField | 'focus_area' | 'knowledge_slugs', string> = {
  species: 'Species',
  breed: 'Breed',
  life_stage: 'Life stage',
  weight_kg: 'Weight (kg)',
  pushback_id: 'Pushback',
  pushback_notes: "In the owner's words",
  context_override: 'Backstory',
  suggested_driver: 'ECHO driver',
  persona_override: 'Persona',
  difficulty_override: 'Difficulty',
  opening_line_override: 'Opening line',
  card_title_override: 'Card title',
  card_subtitle_override: 'Card subtitle',
  start_button_label: 'Start button',
  info_modal_title: 'Info title',
  info_modal_body: 'Info text',
  prompt_prefix: 'Opening notes for the AI',
  prompt_suffix: 'Final reminders for the AI',
  focus_area: 'Focus topic',
  knowledge_slugs: 'Attached documents',
};

// ── Small coercions ──────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Trim, collapse runs of blank space inside a line, cap, drop empty. */
function cleanText(raw: unknown, max: number): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
  if (!text) return undefined;
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd();
}

function caseInsensitiveMatch<T extends string>(raw: string, options: readonly T[]): T | undefined {
  const lower = raw.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === lower);
}

const PROSE_CAPS: Record<string, number> = {
  pushback_notes: SCENARIO_PROSE_CAPS.pushbackNotes,
  context_override: SCENARIO_PROSE_CAPS.context,
  opening_line_override: SCENARIO_PROSE_CAPS.openingLine,
  card_title_override: SCENARIO_LIMITS.cardTitleMax,
  card_subtitle_override: SCENARIO_LIMITS.cardSubtitleMax,
  start_button_label: SCENARIO_LIMITS.startButtonMax,
  info_modal_title: SCENARIO_PROSE_CAPS.infoTitle,
  info_modal_body: SCENARIO_LIMITS.infoBodyMax,
  prompt_prefix: SCENARIO_LIMITS.promptMax,
  prompt_suffix: SCENARIO_LIMITS.promptMax,
  breed: SCENARIO_LIMITS.breedMax,
};

export function normalizeSpecies(raw: unknown): ScenarioSpecies | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase();
  if (isScenarioSpecies(v)) return v;
  if (['canine', 'puppy', 'dogs'].includes(v)) return 'dog';
  if (['feline', 'kitten', 'cats'].includes(v)) return 'cat';
  return undefined;
}

/** Accepts the stored value, any casing, or the bare stage word. */
export function normalizeLifeStage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (LIFE_STAGES.includes(v)) return v;
  const ci = caseInsensitiveMatch(v, LIFE_STAGES);
  if (ci) return ci;
  const lower = v.toLowerCase();
  if (/^(puppy|kitten)\b/.test(lower) || /\b(under|<)\s*1\b/.test(lower)) return 'Puppy (<1)';
  if (/^junior\b/.test(lower) || lower === 'young adult') return 'Junior (1-3)';
  if (/^adult\b/.test(lower)) return 'Adult (3-7)';
  if (/^(senior|geriatric|mature)\b/.test(lower)) return 'Senior (7+)';
  return undefined;
}

/** Accepts an id or its human label ("Cost / price pushback" → `cost`). */
export function normalizePushbackId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (PUSHBACK_IDS.includes(v)) return v;
  const ci = caseInsensitiveMatch(v, PUSHBACK_IDS);
  if (ci) return ci;
  const lower = v.toLowerCase();
  const byLabel = PUSHBACK_IDS.find((id) => (PUSHBACK_LABELS[id] ?? '').toLowerCase() === lower);
  return byLabel;
}

export function normalizeDriver(raw: unknown): ScenarioDriver | undefined {
  if (typeof raw !== 'string') return undefined;
  return caseInsensitiveMatch(raw, SCENARIO_DRIVERS);
}

export function normalizePersona(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (PERSONAS.includes(v)) return v;
  const ci = caseInsensitiveMatch(v, PERSONAS);
  if (ci) return ci;
  const squashed = v.toLowerCase().replace(/[\s_]+/g, '-');
  return PERSONAS.find((p) => p.toLowerCase() === squashed);
}

export function normalizeDifficulty(raw: unknown): number | undefined {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 1 && raw <= 4 ? raw : undefined;
  }
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase();
  const digit = v.match(/^[1-4]\b/)?.[0];
  if (digit) return Number(digit);
  const byLabel = Object.entries(DIFFICULTY_LABELS).find(([, label]) => label.toLowerCase() === v);
  return byLabel ? Number(byLabel[0]) : undefined;
}

export function normalizeWeightKg(raw: unknown): number | undefined {
  let n: number;
  if (typeof raw === 'number') n = raw;
  else if (typeof raw === 'string') n = Number(raw.replace(/kg|kilograms?/gi, '').trim());
  else return undefined;
  if (!Number.isFinite(n) || n <= 0 || n > SCENARIO_LIMITS.weightMaxKg) return undefined;
  return Math.round(n * 10) / 10;
}

/**
 * One field value, normalised — or `undefined` when the value is not
 * something that field can hold. The single source of truth for "is this a
 * legal value", used for model output, card edits, and option buttons.
 */
export function normalizeFieldValue(
  field: AgentField | OfferField,
  raw: unknown,
): string | number | undefined {
  switch (field) {
    case 'species':
      return normalizeSpecies(raw);
    case 'life_stage':
      return normalizeLifeStage(raw);
    case 'pushback_id':
      return normalizePushbackId(raw);
    case 'suggested_driver':
      return normalizeDriver(raw);
    case 'persona_override':
      return normalizePersona(raw);
    case 'difficulty_override':
      return normalizeDifficulty(raw);
    case 'weight_kg':
      return normalizeWeightKg(raw);
    default:
      return cleanText(raw, PROSE_CAPS[field] ?? SCENARIO_PROSE_CAPS.context);
  }
}

// ── Action normaliser (the gate) ─────────────────────────────────────────

export interface AgentNormalizeContext {
  /**
   * Document slugs the assistant may attach: live, indexed, and readable by
   * the roleplay customer. Anything else is dropped — a made-up slug would
   * silently retrieve nothing.
   */
  knownSlugs: ReadonlySet<string>;
}

const TOOL_ALIASES: Record<string, ScenarioAgentTool> = {
  update_fields: 'update_fields',
  update_scenario: 'update_fields',
  set_fields: 'update_fields',
  set_ai_notes: 'set_ai_notes',
  set_prompt_notes: 'set_ai_notes',
  attach_knowledge: 'attach_knowledge',
  set_knowledge: 'attach_knowledge',
  ask: 'ask',
  ask_choice: 'ask',
  offer_options: 'offer_options',
  pick_one: 'offer_options',
  go_to_step: 'go_to_step',
};

function note(raw: unknown): string | undefined {
  return cleanText(raw, AGENT_LIMITS.maxNoteChars);
}

function normalizeUpdateFields(a: Record<string, unknown>): ScenarioAgentAction | null {
  // Lenient on shape: `{ fields: {...} }` is the contract, but a model that
  // flattens the fields onto the action itself still means the same thing.
  const source = isRecord(a.fields) ? a.fields : a;
  const fields: Record<string, string | number> = {};
  for (const field of AGENT_FIELDS) {
    if (!(field in source)) continue;
    const value = normalizeFieldValue(field, source[field]);
    if (value !== undefined) fields[field] = value;
  }
  if (Object.keys(fields).length === 0) return null;
  return { tool: 'update_fields', fields: fields as AgentFieldValues, note: note(a.note ?? a.why) };
}

function normalizeNotes(a: Record<string, unknown>): ScenarioAgentAction | null {
  const out: { prompt_prefix?: string | null; prompt_suffix?: string | null } = {};
  for (const key of ['prompt_prefix', 'prompt_suffix'] as const) {
    if (!(key in a)) continue;
    const raw = a[key];
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      out[key] = null; // an explicit clear
      continue;
    }
    const value = cleanText(raw, SCENARIO_LIMITS.promptMax);
    if (value !== undefined) out[key] = value;
  }
  if (!('prompt_prefix' in out) && !('prompt_suffix' in out)) return null;
  return { tool: 'set_ai_notes', ...out, note: note(a.note ?? a.why) };
}

function normalizeKnowledge(
  a: Record<string, unknown>,
  ctx: AgentNormalizeContext,
): ScenarioAgentAction | null {
  const slugs = Array.isArray(a.slugs)
    ? [
        ...new Set(
          a.slugs.filter(
            (s): s is string =>
              typeof s === 'string' &&
              s.length <= SCENARIO_LIMITS.knowledgeSlugLenMax &&
              ctx.knownSlugs.has(s),
          ),
        ),
      ].slice(0, SCENARIO_LIMITS.knowledgeSlugsMax)
    : [];
  const focus = isFocusAreaKey(a.focus_area) ? (a.focus_area as string) : null;
  const requested = a.mode;
  const mode: KnowledgeMode =
    requested === 'library' || requested === 'focus' || requested === 'documents'
      ? requested
      : slugs.length > 0
        ? 'documents'
        : focus
          ? 'focus'
          : 'library';
  if (mode === 'documents') {
    if (slugs.length === 0) return null;
    return { tool: 'attach_knowledge', mode, slugs, note: note(a.note ?? a.why) };
  }
  if (mode === 'focus') {
    if (!focus) return null;
    return { tool: 'attach_knowledge', mode, focus_area: focus, note: note(a.note ?? a.why) };
  }
  return { tool: 'attach_knowledge', mode: 'library', note: note(a.note ?? a.why) };
}

function normalizeAsk(a: Record<string, unknown>): ScenarioAgentAction | null {
  const question = cleanText(a.question, AGENT_LIMITS.maxQuestionChars);
  if (!question) return null;
  const field =
    typeof a.field === 'string' && (ASK_FIELDS as readonly string[]).includes(a.field)
      ? (a.field as AskField)
      : undefined;
  const rawOptions = Array.isArray(a.options) ? a.options : [];
  const options: AgentOption[] = [];
  const seen = new Set<string>();
  for (const item of rawOptions) {
    if (options.length >= AGENT_LIMITS.maxOptions) break;
    const rawLabel = isRecord(item) ? item.label : item;
    const rawValue = isRecord(item) ? (item.value ?? item.label) : item;
    let value: string | undefined;
    if (field) {
      const v = normalizeFieldValue(field, rawValue);
      value = v === undefined ? undefined : String(v);
    } else {
      value = cleanText(rawValue, AGENT_LIMITS.maxOptionLabelChars);
    }
    if (value === undefined || seen.has(value)) continue;
    const label =
      cleanText(rawLabel, AGENT_LIMITS.maxOptionLabelChars) ??
      (field ? formatFieldValue(field, field === 'difficulty_override' ? Number(value) : value) : value);
    seen.add(value);
    options.push({ label, value });
  }
  if (options.length < AGENT_LIMITS.minOptions) return null;
  return field ? { tool: 'ask', question, field, options } : { tool: 'ask', question, options };
}

function normalizeOffer(a: Record<string, unknown>): ScenarioAgentAction | null {
  if (typeof a.field !== 'string' || !(OFFER_FIELDS as readonly string[]).includes(a.field)) {
    return null;
  }
  const field = a.field as OfferField;
  const raw = Array.isArray(a.options) ? a.options : [];
  const options: string[] = [];
  for (const item of raw) {
    if (options.length >= AGENT_LIMITS.maxOfferOptions) break;
    const v = normalizeFieldValue(field, isRecord(item) ? (item.value ?? item.label) : item);
    if (typeof v === 'string' && !options.includes(v)) options.push(v);
  }
  if (options.length === 0) return null;
  return { tool: 'offer_options', field, options, note: note(a.note ?? a.why) };
}

/**
 * Validate a model- (or card-) supplied action list. Unknown tools, illegal
 * values, made-up document slugs and empty proposals are dropped; at most
 * `AGENT_LIMITS.maxActions` survive and at most ONE of them is a question.
 */
export function normalizeAgentActions(
  raw: unknown,
  ctx: AgentNormalizeContext,
): ScenarioAgentAction[] {
  if (!Array.isArray(raw)) return [];
  const out: ScenarioAgentAction[] = [];
  let asked = false;
  for (const item of raw) {
    if (out.length >= AGENT_LIMITS.maxActions) break;
    if (!isRecord(item) || typeof item.tool !== 'string') continue;
    const tool = TOOL_ALIASES[item.tool];
    let action: ScenarioAgentAction | null = null;
    switch (tool) {
      case 'update_fields':
        action = normalizeUpdateFields(item);
        break;
      case 'set_ai_notes':
        action = normalizeNotes(item);
        break;
      case 'attach_knowledge':
        action = normalizeKnowledge(item, ctx);
        break;
      case 'ask':
        if (asked) break;
        action = normalizeAsk(item);
        if (action) asked = true;
        break;
      case 'offer_options':
        action = normalizeOffer(item);
        break;
      case 'go_to_step':
        action = isStudioStepKey(item.step)
          ? { tool: 'go_to_step', step: item.step, note: note(item.note ?? item.why) }
          : null;
        break;
      default:
        break; // unknown tool — dropped
    }
    if (action) out.push(stripUndefined(action));
  }
  return out;
}

function stripUndefined<T extends object>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) if (v === undefined) delete out[k];
  return out as T;
}

/** Follow-up chips: short, distinct, non-empty. */
export function normalizeSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= AGENT_LIMITS.maxSuggestions) break;
    const text = cleanText(item, AGENT_LIMITS.maxSuggestionChars);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

// ── Applying actions to a draft ──────────────────────────────────────────

export interface ApplyResult<D> {
  draft: D;
  /** Human labels of the fields that actually changed. */
  changed: string[];
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return (a ?? null) === (b ?? null);
}

/** Set one field (already-normalised value) on a draft, immutably. */
export function applyFieldValue<D extends ScenarioAgentDraft>(
  draft: D,
  field: AgentField | OfferField | 'focus_area' | 'knowledge_slugs',
  value: unknown,
): ApplyResult<D> {
  const current = (draft as Record<string, unknown>)[field];
  if (sameValue(current, value)) return { draft, changed: [] };
  return {
    draft: { ...draft, [field]: value } as D,
    changed: [AGENT_FIELD_LABELS[field] ?? field],
  };
}

/**
 * Apply a (normalised!) action to the draft. Only the three data tools
 * change anything; `ask`, `offer_options` and `go_to_step` are UI flows and
 * return the draft untouched — the Studio applies their chosen value with
 * `applyFieldValue`.
 */
export function applyAgentAction<D extends ScenarioAgentDraft>(
  draft: D,
  action: ScenarioAgentAction,
): ApplyResult<D> {
  let next = draft;
  const changed: string[] = [];
  const set = (field: Parameters<typeof applyFieldValue>[1], value: unknown) => {
    const r = applyFieldValue(next, field, value);
    next = r.draft;
    changed.push(...r.changed);
  };
  switch (action.tool) {
    case 'update_fields':
      for (const field of AGENT_FIELDS) {
        const value = action.fields[field];
        if (value !== undefined) set(field, value);
      }
      break;
    case 'set_ai_notes':
      if (action.prompt_prefix !== undefined) set('prompt_prefix', action.prompt_prefix);
      if (action.prompt_suffix !== undefined) set('prompt_suffix', action.prompt_suffix);
      break;
    case 'attach_knowledge':
      if (action.mode === 'library') {
        set('focus_area', null);
        set('knowledge_slugs', null);
      } else if (action.mode === 'focus') {
        set('focus_area', action.focus_area ?? null);
        set('knowledge_slugs', null);
      } else {
        set('knowledge_slugs', action.slugs && action.slugs.length ? action.slugs : null);
      }
      break;
    default:
      break;
  }
  return { draft: next, changed: [...new Set(changed)] };
}

// ── Display helpers ──────────────────────────────────────────────────────

/** A field value the way a person reads it (difficulty 3 → "3 · Hostile"). */
export function formatFieldValue(
  field: string,
  value: unknown,
  species?: unknown,
): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (field) {
    case 'species':
      return isScenarioSpecies(value) ? SPECIES_LABELS[value] : String(value);
    case 'life_stage':
      return lifeStageLabel(String(value), species);
    case 'pushback_id':
      return PUSHBACK_LABELS[String(value)] ?? String(value);
    case 'difficulty_override': {
      const n = Number(value);
      return DIFFICULTY_LABELS[n] ? `${n} · ${DIFFICULTY_LABELS[n]}` : String(value);
    }
    case 'weight_kg':
      return `${value} kg`;
    case 'focus_area':
      return FOCUS_AREAS.find((f) => f.key === value)?.label ?? String(value);
    case 'knowledge_slugs':
      return Array.isArray(value) ? `${value.length} document${value.length === 1 ? '' : 's'}` : '—';
    default:
      return String(value);
  }
}

/** One-line summary of an action, used as the `[tool_result]` turn text. */
export function describeAgentAction(action: ScenarioAgentAction): string {
  switch (action.tool) {
    case 'update_fields': {
      const labels = AGENT_FIELDS.filter((f) => action.fields[f] !== undefined).map(
        (f) => AGENT_FIELD_LABELS[f],
      );
      return `Suggested changes to ${labels.join(', ')}`;
    }
    case 'set_ai_notes':
      return 'Suggested notes for the AI customer';
    case 'attach_knowledge':
      return action.mode === 'documents'
        ? `Suggested ${action.slugs?.length ?? 0} document(s) to ground the AI`
        : action.mode === 'focus'
          ? `Suggested focusing the AI on ${formatFieldValue('focus_area', action.focus_area)}`
          : 'Suggested searching the whole knowledge library';
    case 'ask':
      return action.question;
    case 'offer_options':
      return `Offered ${action.options.length} option(s) for ${AGENT_FIELD_LABELS[action.field]}`;
    case 'go_to_step':
      return `Suggested moving to ${STUDIO_STEP_LABELS[action.step]}`;
  }
}

// ── Wire helpers ─────────────────────────────────────────────────────────

/**
 * Gemini needs alternating roles and non-empty turns: drop blanks and fold
 * consecutive same-role turns together (tool results are user turns that
 * often follow the admin's own message).
 */
export function mergeWireTurns(messages: readonly AgentTurn[]): AgentTurn[] {
  const out: AgentTurn[] = [];
  for (const m of messages) {
    if (!m.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

/**
 * Server-side validation of the request's turns. Returns null when the
 * request is malformed (empty, too many turns, or not ending on the admin).
 * Over-long turns are clamped rather than rejected — the most recent turns
 * are kept when there are too many.
 */
export function sanitizeAgentTurns(raw: unknown): AgentTurn[] | null {
  if (!Array.isArray(raw)) return null;
  const turns: AgentTurn[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const role = item.role === 'assistant' || item.role === 'model' ? 'assistant' : item.role === 'user' ? 'user' : null;
    if (!role || typeof item.content !== 'string') continue;
    const content = item.content.slice(0, AGENT_LIMITS.maxTurnChars);
    if (!content.trim()) continue;
    turns.push({ role, content });
  }
  const merged = mergeWireTurns(turns).slice(-AGENT_LIMITS.maxTurns);
  // Gemini's history must open on a user turn and the model answers the last.
  while (merged.length && merged[0].role !== 'user') merged.shift();
  if (merged.length === 0 || merged[merged.length - 1].role !== 'user') return null;
  return merged;
}

/**
 * Whitelist + clamp a client-sent draft. Values are coerced to their
 * normalised form or dropped — the draft is prompt context, so it must not
 * be a vector for arbitrary structure or unbounded text.
 */
export function pickAgentDraft(raw: unknown): ScenarioAgentDraft {
  const out: ScenarioAgentDraft = {};
  if (!isRecord(raw)) return out;
  const put = <K extends keyof ScenarioAgentDraft>(k: K, v: ScenarioAgentDraft[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  if (typeof raw.scenario_id === 'string') put('scenario_id', raw.scenario_id.slice(0, 80));
  put('species', normalizeSpecies(raw.species));
  for (const field of AGENT_FIELDS) {
    if (field === 'species') continue;
    const v = normalizeFieldValue(field, raw[field]);
    if (v !== undefined) (out as Record<string, unknown>)[field] = v;
  }
  for (const key of ['prompt_prefix', 'prompt_suffix'] as const) {
    put(key, cleanText(raw[key], SCENARIO_LIMITS.promptMax));
  }
  if (isFocusAreaKey(raw.focus_area)) put('focus_area', raw.focus_area as string);
  if (Array.isArray(raw.knowledge_slugs)) {
    put(
      'knowledge_slugs',
      raw.knowledge_slugs
        .filter(
          (s): s is string =>
            typeof s === 'string' && s.length > 0 && s.length <= SCENARIO_LIMITS.knowledgeSlugLenMax,
        )
        .slice(0, SCENARIO_LIMITS.knowledgeSlugsMax),
    );
  }
  if (typeof raw.visible === 'boolean') put('visible', raw.visible);
  return out;
}
