/**
 * Scenario Studio — the pure model behind the guided builder.
 *
 * Steps, per-step completeness, the publish-readiness checklist, and the
 * draft rules the old Scenario Builder grew (moved here verbatim so their
 * tests keep guarding them). No React, no fetches — everything here is
 * unit-tested in ./__tests__.
 */
import type { ScenarioOverrideRow } from '../data/types';
import {
  STUDIO_STEP_KEYS,
  type StudioStepKey,
} from '../../../src/shared/ai/scenarioAgent';
import { SCENARIO_LIMITS } from '../../../src/shared/scenarios/limits';
import type { ScenarioSpecies } from '../../../src/shared/scenarios/species';
import { missingScenarioFields } from '../../../src/shared/scenarios/draftToScenario';

export type { StudioStepKey } from '../../../src/shared/ai/scenarioAgent';

/** The editor's working copy: a (possibly partial) override row. */
export type StudioDraft = Partial<ScenarioOverrideRow>;

/** Where a scenario comes from. */
export type StudioSource = 'library' | 'admin' | 'user';

/**
 * Where a scenario came from, said rather than named. `library` / `admin` /
 * `user` are the shapes of our own data; nobody outside the codebase knows
 * that an "admin" scenario is one somebody wrote in the Studio.
 */
export const SOURCE_LABELS: Record<StudioSource, string> = {
  library: 'Ships with the app',
  admin: 'Written in the Studio',
  user: 'Built by a trainee',
};

// ─────────────────────────────────────────────────────────────
// Steps
// ─────────────────────────────────────────────────────────────

export interface StudioStepDef {
  key: StudioStepKey;
  /** Short name for the stepper rail. */
  label: string;
  /** The question the step answers — the step's headline. */
  title: string;
  /** One sentence under the headline. */
  hint: string;
  /**
   * Draft columns edited on this step. Together the steps cover every
   * editable column of `ScenarioOverrideRow` exactly once (unit-tested), so
   * no saved value is ever invisible in the Studio.
   */
  fields: Array<keyof ScenarioOverrideRow>;
}

export const STUDIO_STEPS: StudioStepDef[] = [
  {
    key: 'pet',
    label: 'The pet',
    title: 'Who is the patient?',
    hint: 'Pick the species, then the breed and age. Weight is optional.',
    fields: ['species', 'breed', 'life_stage', 'weight_kg'],
  },
  {
    key: 'pushback',
    label: 'The pushback',
    title: 'What is the owner pushing back on?',
    hint: 'Choose the kind of objection, then say it the way the owner would.',
    fields: ['pushback_id', 'pushback_notes', 'context_override', 'title_override'],
  },
  {
    key: 'customer',
    label: 'The owner',
    title: 'Who is the owner?',
    hint: 'Their personality, their situation, and how hard they are to move.',
    fields: [
      'suggested_driver',
      'persona_override',
      'difficulty_override',
      'opening_line_override',
    ],
  },
  {
    key: 'knowledge',
    label: 'Knowledge',
    title: 'What should the AI know?',
    hint: 'Choose the research and reference material the AI customer draws on.',
    fields: ['focus_area', 'knowledge_slugs'],
  },
  {
    key: 'brief',
    label: 'AI brief',
    title: 'How is the AI customer briefed?',
    hint: 'Your notes are added to the standard briefing built from your answers.',
    fields: ['prompt_prefix', 'prompt_suffix'],
  },
  {
    key: 'test',
    label: 'Test drive',
    title: 'Try it before your trainees do',
    hint: 'Have a real conversation with the AI customer. Nothing is recorded.',
    fields: [],
  },
  {
    key: 'publish',
    label: 'Publish',
    title: 'How trainees will see it',
    hint: 'Polish the card, check everything is ready, then publish.',
    fields: [
      'visible',
      'sort_order',
      'card_driver_override',
      'card_title_override',
      'card_subtitle_override',
      'start_button_label',
      'info_modal_title',
      'info_modal_body',
    ],
  },
];

export function stepIndex(key: StudioStepKey): number {
  return Math.max(0, STUDIO_STEP_KEYS.indexOf(key));
}

export function stepDef(key: StudioStepKey): StudioStepDef {
  return STUDIO_STEPS[stepIndex(key)];
}

export function nextStep(key: StudioStepKey): StudioStepKey | null {
  return STUDIO_STEP_KEYS[stepIndex(key) + 1] ?? null;
}

export function previousStep(key: StudioStepKey): StudioStepKey | null {
  const i = stepIndex(key);
  return i > 0 ? STUDIO_STEP_KEYS[i - 1] : null;
}

// ─────────────────────────────────────────────────────────────
// Completeness + readiness
// ─────────────────────────────────────────────────────────────

/** What the stepper shows next to a step. */
export type StepStatus = 'done' | 'todo' | 'attention' | 'optional';

export interface StudioContext {
  source: StudioSource;
  /** A full simulated conversation ran against the current draft this session. */
  tested: boolean;
  /** Attached slugs with no live document behind them. */
  missingSlugs: string[];
  /** Titles of attached documents that have no search index yet. */
  unindexedTitles: string[];
  /** Titles of attached documents the roleplay customer may not read. */
  notRoleplayTitles: string[];
}

export function hasText(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * Per-step status for the rail. "done" means the step's required answers
 * are in; optional steps read "optional" until touched, then "done".
 */
export function stepStatus(
  key: StudioStepKey,
  draft: StudioDraft,
  ctx: StudioContext,
): { status: StepStatus; detail?: string } {
  switch (key) {
    case 'pet': {
      const missing = [
        !hasText(draft.breed) && 'breed',
        !hasText(draft.life_stage) && 'life stage',
      ].filter(Boolean) as string[];
      return missing.length
        ? { status: 'todo', detail: `Still needs ${missing.join(' and ')}` }
        : { status: 'done' };
    }
    case 'pushback': {
      if (!hasText(draft.pushback_id)) return { status: 'todo', detail: 'Pick a pushback' };
      if (draft.pushback_id === 'custom' && !hasText(draft.pushback_notes)) {
        return { status: 'attention', detail: 'Describe the objection in the owner’s words' };
      }
      return { status: 'done' };
    }
    case 'customer':
      return hasText(draft.suggested_driver)
        ? { status: 'done' }
        : { status: 'todo', detail: 'Pick the owner’s ECHO driver' };
    case 'knowledge': {
      const issues = ctx.missingSlugs.length + ctx.unindexedTitles.length + ctx.notRoleplayTitles.length;
      if (issues > 0) return { status: 'attention', detail: 'Some attached documents can’t be used' };
      return hasText(draft.focus_area) || (draft.knowledge_slugs?.length ?? 0) > 0
        ? { status: 'done' }
        : { status: 'optional', detail: 'Using the whole knowledge library' };
    }
    case 'brief':
      return hasText(draft.prompt_prefix) || hasText(draft.prompt_suffix)
        ? { status: 'done' }
        : { status: 'optional', detail: 'Standard briefing only' };
    case 'test':
      return ctx.tested ? { status: 'done' } : { status: 'todo', detail: 'Not tested yet' };
    case 'publish':
      return draft.visible ? { status: 'done', detail: 'Live for trainees' } : { status: 'todo', detail: 'Not published' };
  }
}

export interface ReadinessItem {
  key: string;
  label: string;
  ok: boolean;
  /** Required items block publishing; recommended ones only warn. */
  level: 'required' | 'recommended';
  detail?: string;
  /** Where to fix it. */
  step: StudioStepKey;
}

/** The publish checklist, in the order the admin should read it. */
export function readiness(draft: StudioDraft, ctx: StudioContext): ReadinessItem[] {
  const missing = missingScenarioFields(draft);
  const knowledgeIssues = [
    ...ctx.missingSlugs.map((s) => `“${s}” no longer exists`),
    ...ctx.unindexedTitles.map((t) => `“${t}” isn’t searchable yet`),
    ...ctx.notRoleplayTitles.map((t) => `“${t}” isn’t readable by the roleplay`),
  ];
  const problems = draftProblems(draft);
  return [
    {
      key: 'core',
      label: 'The scenario has everything the AI needs',
      ok: missing.length === 0,
      level: 'required',
      detail: missing.length ? `Missing: ${missing.join(', ')}` : undefined,
      step:
        missing.includes('Breed') || missing.includes('Life stage')
          ? 'pet'
          : missing.includes('Pushback')
            ? 'pushback'
            : 'customer',
    },
    {
      key: 'custom-pushback',
      label: 'A custom objection is described',
      ok: draft.pushback_id !== 'custom' || hasText(draft.pushback_notes),
      level: 'required',
      detail:
        draft.pushback_id === 'custom' && !hasText(draft.pushback_notes)
          ? 'Say what the owner is objecting to in “In the owner’s words”.'
          : undefined,
      step: 'pushback',
    },
    {
      key: 'limits',
      label: 'Every field is within its limit',
      ok: problems.length === 0,
      level: 'required',
      detail: problems[0],
      step: 'publish',
    },
    {
      key: 'knowledge',
      label: 'Attached knowledge can be read by the AI',
      ok: knowledgeIssues.length === 0,
      level: 'recommended',
      detail: knowledgeIssues[0],
      step: 'knowledge',
    },
    {
      key: 'tested',
      label: 'You have test-driven this version',
      ok: ctx.tested,
      level: 'recommended',
      detail: ctx.tested ? undefined : 'Run one conversation on the Test drive step.',
      step: 'test',
    },
  ];
}

export function canPublish(items: readonly ReadinessItem[]): boolean {
  return items.every((i) => i.ok || i.level !== 'required');
}

// ─────────────────────────────────────────────────────────────
// Draft rules (moved from the old ScenarioBuilderScreen)
// ─────────────────────────────────────────────────────────────

/** Fields an admin-authored scenario cannot ship without. */
export const REQUIRED_ADMIN_FIELDS: Array<{
  key: keyof ScenarioOverrideRow;
  label: string;
}> = [
  { key: 'breed', label: 'Breed' },
  { key: 'life_stage', label: 'Life stage' },
  { key: 'pushback_id', label: 'Pushback' },
  { key: 'suggested_driver', label: 'ECHO driver' },
];

/** Would this value be written as an override (vs. "inherit the base")? */
export function hasOverrideValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return !Number.isNaN(value);
  if (typeof value === 'boolean') return value;
  return true;
}

/**
 * Human names for the draft columns, used wherever a list of fields is shown
 * to a person — the revert confirmation above all.
 */
export const FIELD_LABELS: Partial<Record<keyof ScenarioOverrideRow, string>> = {
  species: 'Species',
  breed: 'Breed',
  life_stage: 'Life stage',
  pushback_id: 'Pushback',
  pushback_notes: 'In the owner’s words',
  suggested_driver: 'ECHO driver',
  persona_override: 'Persona',
  difficulty_override: 'Difficulty',
  weight_kg: 'Weight (kg)',
  opening_line_override: 'Opening line',
  context_override: 'Backstory',
  title_override: 'Legacy title',
  focus_area: 'Focus topic',
  knowledge_slugs: 'Attached documents',
  prompt_prefix: 'Opening notes for the AI',
  prompt_suffix: 'Final reminders for the AI',
  visible: 'Visible in app',
  sort_order: 'Sort order',
  card_driver_override: 'Card colour',
  card_title_override: 'Card title',
  card_subtitle_override: 'Card subtitle',
  start_button_label: 'Start button label',
  info_modal_title: 'Info title',
  info_modal_body: 'Info text',
};

/**
 * Which fields a revert would actually give back to the built-in scenario.
 * Takes the SPARSE row (what a save would write).
 */
export function overriddenFieldLabels(
  sparse: StudioDraft,
  opts: { baseVisible?: boolean } = {},
): string[] {
  const out: string[] = [];
  for (const step of STUDIO_STEPS) {
    for (const field of step.fields) {
      if (field === 'visible') {
        const baseVisible = opts.baseVisible ?? true;
        if (sparse.visible !== undefined && sparse.visible !== baseVisible) {
          out.push(
            sparse.visible
              ? 'Visible in app (currently forced on)'
              : 'Visible in app (currently hidden)',
          );
        }
        continue;
      }
      if (hasOverrideValue(sparse[field])) {
        out.push(FIELD_LABELS[field] ?? String(field));
      }
    }
  }
  return out;
}

/**
 * Everything the server would refuse this draft for, written as a sentence
 * the admin can act on. Mirrors `validateOverride` in
 * netlify/functions/admin-scenario-overrides.ts.
 */
export function draftProblems(draft: StudioDraft): string[] {
  const out: string[] = [];
  const L = SCENARIO_LIMITS;
  const tooLong = (value: string | null | undefined, max: number, label: string) => {
    const len = (value ?? '').length;
    if (len > max) out.push(`${label} is ${len} characters — the limit is ${max}.`);
  };

  tooLong(draft.breed, L.breedMax, 'Breed');
  tooLong(draft.card_title_override, L.cardTitleMax, 'Card title');
  tooLong(draft.card_subtitle_override, L.cardSubtitleMax, 'Card subtitle');
  tooLong(draft.start_button_label, L.startButtonMax, 'Start button label');
  tooLong(draft.info_modal_body, L.infoBodyMax, 'Info text');
  tooLong(draft.prompt_prefix, L.promptMax, 'Opening notes');
  tooLong(draft.prompt_suffix, L.promptMax, 'Final reminders');

  const difficulty = draft.difficulty_override;
  if (difficulty != null && !L.difficultyLevels.includes(difficulty)) {
    out.push('Difficulty has to be one of the four levels (1–4).');
  }

  const weight = draft.weight_kg;
  if (weight != null) {
    if (!Number.isFinite(weight) || weight <= 0 || weight > L.weightMaxKg) {
      out.push(
        `Weight has to be more than 0 and at most ${L.weightMaxKg} kg — leave it empty if it doesn’t matter.`,
      );
    }
  }

  const slugs = draft.knowledge_slugs ?? [];
  if (slugs.length > L.knowledgeSlugsMax) {
    out.push(
      `${slugs.length} documents are attached — at most ${L.knowledgeSlugsMax} can be. Untick the ones this scenario doesn't need.`,
    );
  }

  return out;
}

/** Attached slugs with no live document behind them. */
export function missingKnowledgeSlugs(
  selected: string[] | null | undefined,
  liveSlugs: readonly string[],
): string[] {
  if (!selected || selected.length === 0) return [];
  const live = new Set(liveSlugs);
  return selected.filter((slug) => !live.has(slug));
}

/**
 * A client-side copy of a scenario, as an unsaved admin draft. Duplicating a
 * library/user scenario server-side would copy its (possibly empty) override
 * ROW, not the scenario — the copy is made from the hydrated draft instead.
 */
export function buildDuplicateDraft(
  draft: StudioDraft,
  newId: string,
  baseTitle?: string | null,
): StudioDraft {
  const title =
    (draft.card_title_override ?? '').trim() || (baseTitle ?? '').trim() || 'scenario';
  return {
    ...draft,
    scenario_id: newId,
    card_title_override: `(copy) ${title}`.slice(0, SCENARIO_LIMITS.cardTitleMax),
    // A copy is never live until someone looks at it and says so.
    visible: false,
    sort_order: null,
  };
}

export interface VisibilityEntry {
  id: string;
  source: StudioSource;
  override: Pick<ScenarioOverrideRow, 'visible'> | null;
}

/**
 * How many library + admin scenarios the consumer app would show. User-built
 * scenarios are excluded: they belong to one account.
 */
export function visibleScenarioCount(
  entries: readonly VisibilityEntry[],
  excludeId?: string,
): number {
  let n = 0;
  for (const e of entries) {
    if (e.id === excludeId) continue;
    if (e.source === 'user') continue;
    const visible = e.override ? e.override.visible : e.source === 'library';
    if (visible) n += 1;
  }
  return n;
}

/** A fresh, hidden, admin-authored draft. */
export function emptyAdminDraft(
  id: string,
  species: ScenarioSpecies | null = null,
): StudioDraft {
  return {
    scenario_id: id,
    visible: false,
    sort_order: null,
    title_override: null,
    context_override: null,
    opening_line_override: null,
    difficulty_override: 2,
    persona_override: 'Skeptical',
    prompt_prefix: null,
    prompt_suffix: null,
    card_title_override: null,
    card_subtitle_override: null,
    info_modal_title: null,
    info_modal_body: null,
    start_button_label: null,
    card_driver_override: null,
    species,
    breed: null,
    life_stage: null,
    pushback_id: null,
    pushback_notes: null,
    suggested_driver: null,
    weight_kg: null,
    focus_area: null,
    knowledge_slugs: null,
  };
}

/** Blank strings → null so an emptied field means "inherit / unset". */
export function blankToNull(draft: StudioDraft): StudioDraft {
  const out: Record<string, unknown> = { ...draft };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && v.trim() === '') out[k] = null;
  }
  return out as StudioDraft;
}
