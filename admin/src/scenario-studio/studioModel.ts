/**
 * Scenario Studio — the pure model behind the guided builder.
 *
 * Steps, per-step completeness, the publish-readiness checklist, and the
 * draft rules the old Scenario Builder grew (moved here verbatim so their
 * tests keep guarding them). No React, no fetches — everything here is
 * unit-tested in ./__tests__.
 */
import type { KnowledgeDocument, ScenarioOverrideRow, UserScenario } from '../data/types';
import {
  LIBRARY_MANIFEST,
  SERVER_MANAGED_COLUMNS,
  buildBaseLayer,
  buildInitialDraft,
  type SeedScenarioManifest,
} from '../data/scenarioManifest';
import {
  STUDIO_STEP_KEYS,
  type StudioStepKey,
} from '../../../src/shared/ai/scenarioAgent';
import { SCENARIO_LIMITS } from '../../../src/shared/scenarios/limits';
import {
  lifeStageLabel,
  retrievalSpeciesFor,
  speciesOf,
  type ScenarioSpecies,
} from '../../../src/shared/scenarios/species';
import { DIFFICULTY_LABELS } from '../../../src/shared/scenarios/enums';
import { readKnowledgeScope } from '../../../src/shared/knowledge/knowledgeScopes';
import { isScenarioSpecies } from '../../../src/shared/scenarios/species';
import { isTeamObjectionId, type TeamObjection } from '../../../src/shared/scenarios/objections';
import {
  categoryKnowledgeFor,
  objectionCategoryId,
  type ObjectionCategory,
} from '../../../src/shared/scenarios/objectionCategories';
import {
  animalsInSentence,
  checkObjection,
  missingCoreFields,
  objectionLabel,
  objectionMisfits,
  objectionMissing,
  type ObjectionCheck,
  type ObjectionRef,
} from './objections/objectionsModel';
import {
  categoryScoringReach,
  categoryScoringReadiness,
  objectionConcernsFor,
  objectionConcernsReadiness,
  type CategoryScoringReach,
  type ObjectionConcerns,
} from './readinessWarnings';

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
    fields: ['prompt_prefix', 'prompt_suffix', 'success_criteria'],
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
  /**
   * Titles of attached documents filed for another species. Species is a
   * HARD retrieval scope and attached documents never widen, so these
   * retrieve nothing for this scenario.
   */
  wrongSpeciesTitles?: string[];
  /**
   * The database can't store `species` (a project that has not run the
   * species migration): a cat scenario would reach trainees as a dog.
   */
  speciesUnsupported?: boolean;
  /**
   * Where the draft's objection stands, when it is a TEAM objection (null for
   * a built-in, "Something else" or none): retired, deleted, for the other
   * animal… See `checkObjection`.
   */
  objection?: ObjectionCheck | null;
  /**
   * The category whose knowledge this scenario reads when it picks none of
   * its own (null: no category, or the category has no knowledge attached).
   */
  categoryKnowledge?: { id: string; name: string } | null;
  /**
   * The draft's TEAM objection and how many hidden concerns (root concerns)
   * it carries — none means the AI owner and the scorer go generic. Null for
   * a built-in, "Something else", none, or an objection not in the list.
   * See ./readinessWarnings.
   */
  objectionConcerns?: ObjectionConcerns | null;
  /**
   * Whether session scoring can read the documents this scenario INHERITS
   * from its category, for its animal. Null when it doesn't inherit
   * documents, or while the library isn't loaded. See ./readinessWarnings.
   */
  categoryScoring?: CategoryScoringReach | null;
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
      if (objectionMissing(ctx.objection)) return { status: 'attention', detail: 'Its objection was deleted' };
      if (objectionMisfits(ctx.objection)) return { status: 'attention', detail: 'The objection is for another animal' };
      return { status: 'done' };
    }
    case 'customer':
      return hasText(draft.suggested_driver)
        ? { status: 'done' }
        : { status: 'todo', detail: 'Pick the owner’s ECHO driver' };
    case 'knowledge': {
      const issues =
        ctx.missingSlugs.length +
        ctx.unindexedTitles.length +
        ctx.notRoleplayTitles.length +
        (ctx.wrongSpeciesTitles?.length ?? 0);
      if (issues > 0) return { status: 'attention', detail: 'Some attached documents can’t be used' };
      if (hasText(draft.focus_area) || (draft.knowledge_slugs?.length ?? 0) > 0) return { status: 'done' };
      return ctx.categoryKnowledge
        ? { status: 'optional', detail: `Using the ${ctx.categoryKnowledge.name} knowledge` }
        : { status: 'optional', detail: 'Using the whole knowledge library' };
    }
    case 'brief':
      if (hasText(draft.prompt_prefix) || hasText(draft.prompt_suffix)) {
        return hasText(draft.success_criteria)
          ? { status: 'done', detail: 'Notes + scoring criteria' }
          : { status: 'done' };
      }
      return hasText(draft.success_criteria)
        ? { status: 'done', detail: 'Scoring criteria added' }
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
  // A team objection counts as an answer here; whether it still exists is
  // the objection item's job below, so it is said once, in words.
  const missing = missingCoreFields(draft);
  const knowledgeIssues = [
    ...ctx.missingSlugs.map((s) => `“${s}” no longer exists`),
    ...ctx.unindexedTitles.map((t) => `“${t}” isn’t searchable yet`),
    ...ctx.notRoleplayTitles.map((t) => `“${t}” isn’t readable by the roleplay`),
    ...(ctx.wrongSpeciesTitles ?? []).map(
      (t) => `“${t}” is filed for another species, so this scenario never reads it`,
    ),
  ];
  const problems = draftProblems(draft);
  const catBlocked = draft.species === 'cat' && ctx.speciesUnsupported === true;
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
    // Only relevant to "Something else" — a ticked row about a custom
    // objection the admin never chose just reads as noise.
    ...(draft.pushback_id === 'custom'
      ? [
          {
            key: 'custom-pushback',
            label: 'The custom objection is described',
            ok: hasText(draft.pushback_notes),
            level: 'required' as const,
            detail: hasText(draft.pushback_notes)
              ? undefined
              : 'Say what the owner is objecting to in “In the owner’s words”.',
            step: 'pushback' as const,
          },
        ]
      : []),
    ...objectionReadiness(draft, ctx.objection ?? null),
    // Advisory: a team objection with nothing under the surface.
    ...objectionConcernsReadiness(ctx),
    // A cat scenario can't go live while the species column is missing: the
    // save would drop `species` and trainees would get a DOG roleplay with a
    // cat's backstory. Saving it as a hidden draft is fine.
    ...(catBlocked
      ? [
          {
            key: 'species-storage',
            label: 'Cat scenarios can be stored',
            ok: false,
            level: 'required' as const,
            detail:
              'A database update is still pending, so this scenario would reach trainees as a dog. Save it as a draft for now — it can go live once the update is applied.',
            step: 'pet' as const,
          },
        ]
      : []),
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
    // Advisory: inherited category documents the scorer can't read.
    ...categoryScoringReadiness(ctx),
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

/**
 * Checklist rows for a scenario built on a TEAM objection (none otherwise —
 * a ticked row about something the admin never chose is noise):
 *   • it must still exist (a deleted objection can't be played) — required;
 *   • it should be meant for this scenario's animal — recommended;
 *   • a retired one still plays, but nobody can pick it any more — said.
 */
function objectionReadiness(draft: StudioDraft, check: ObjectionCheck | null): ReadinessItem[] {
  if (!check || check.state === 'unchecked') return [];
  if (check.state === 'deleted' || check.state === 'unknown') {
    return [
      {
        key: 'objection',
        label: 'Its objection still exists',
        ok: false,
        level: 'required',
        detail:
          check.state === 'deleted'
            ? `“${check.title}” was deleted. Pick another objection, or restore it on the Categories tab.`
            : 'The objection this scenario was built on can’t be found any more. Pick another one.',
        step: 'pushback',
      },
    ];
  }
  const animal = speciesOfDraft(draft);
  const fits = check.state === 'ok' || (check.state === 'retired' && check.fits);
  const items: ReadinessItem[] = [
    {
      key: 'objection-species',
      label: `The objection is meant for ${animal === 'cat' ? 'cats' : 'dogs'}`,
      ok: fits,
      level: 'recommended',
      detail: fits
        ? undefined
        : `“${check.title}” is set up for ${animalsInSentence(check.species)} only. Pick another objection, or add ${animal === 'cat' ? 'cats' : 'dogs'} to it on the Categories tab.`,
      step: 'pushback',
    },
  ];
  if (check.state === 'retired') {
    items.push({
      key: 'objection-retired',
      label: 'The objection is active',
      ok: false,
      level: 'recommended',
      detail: `“${check.title}” is retired: this scenario still plays, but nobody can pick it for a new one. Reactivate it on the Categories tab if that wasn’t intended.`,
      step: 'pushback',
    });
  }
  return items;
}

function speciesOfDraft(draft: StudioDraft): ScenarioSpecies {
  return speciesOf(draft.species);
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
  success_criteria: 'What a great answer includes (scoring)',
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
  tooLong(draft.success_criteria, L.successCriteriaMax, 'What a great answer includes');

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
    // Where it came from — stored with the copy's FIRST save (display only).
    copied_from: isCopySource(draft.scenario_id) ? draft.scenario_id : null,
  };
}

/** An id a copy may name as its source: `user:` / `seed:` / `admin:`. */
export function isCopySource(id: unknown): id is string {
  return typeof id === 'string' && /^(user|seed|admin):\S+$/.test(id);
}

/**
 * "Add to library" on a trainee's scenario: an unsaved, HIDDEN `admin:` copy
 * of everything the trainee built, under the trainee's own title (it is the
 * same scenario, now offered to everyone — not a "(copy)"). The species comes
 * from the trainee's row (none = dog, every row from before trainees could
 * choose). `copied_from` rides along so the copy's first save records it, and
 * the trainee's card then reads "In the library".
 *
 * Starts from the entry's effective draft, so a stray Studio edit saved over
 * the trainee's scenario in the past (the old "Edit" flow) isn't lost.
 */
export function buildTraineeLibraryDraft(entry: StudioEntry, newId: string): StudioDraft {
  const trainee = entry.userScenario;
  const source = entry.draft;
  const title =
    (source.card_title_override ?? '').trim() || (trainee?.title ?? '').trim() || null;
  return {
    ...emptyAdminDraft(newId),
    ...source,
    scenario_id: newId,
    species: isScenarioSpecies(trainee?.species) ? trainee.species : 'dog',
    card_title_override: title ? title.slice(0, SCENARIO_LIMITS.cardTitleMax) : null,
    visible: false,
    sort_order: null,
    copied_from: entry.id,
  };
}

/**
 * Library copies of each trainee scenario, by the trainee entry's id
 * (`user:<uuid>`): the saved `admin:` scenarios whose `copied_from` names it.
 */
export function libraryCopiesByTrainee(entries: readonly StudioEntry[]): Map<string, StudioEntry[]> {
  const out = new Map<string, StudioEntry[]>();
  for (const e of entries) {
    if (e.source !== 'admin') continue;
    const from = e.override?.copied_from;
    if (typeof from !== 'string' || !from.startsWith('user:') || e.override?.deleted_at) continue;
    const list = out.get(from) ?? [];
    list.push(e);
    out.set(from, list);
  }
  // Newest first: "Open library version" opens the one edited last.
  for (const list of out.values()) list.sort((a, b) => (b.editedAt ?? 0) - (a.editedAt ?? 0));
  return out;
}

/** The step a promoted copy should open on: the first that still needs an answer. */
export function firstStepNeeding(draft: StudioDraft): StudioStepKey {
  const missing = missingCoreFields(draft);
  if (missing.includes('Breed') || missing.includes('Life stage')) return 'pet';
  if (missing.includes('Pushback')) return 'pushback';
  if (missing.includes('ECHO driver')) return 'customer';
  return 'pet';
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
    success_criteria: null,
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

// ─────────────────────────────────────────────────────────────
// Studio shell — change tracking, "tested", gallery entries
// ─────────────────────────────────────────────────────────────

/** A value that saves as nothing: null, undefined, a blank string, []. */
function isBlankValue(v: unknown): boolean {
  return (
    v === null ||
    v === undefined ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.length === 0)
  );
}

function fingerprintOf(draft: StudioDraft, skip: ReadonlySet<string>): string {
  const src = draft as Record<string, unknown>;
  const keys = Object.keys(src)
    .filter((k) => !skip.has(k) && !isBlankValue(src[k]))
    .sort();
  // Document lists are sets: re-ticking the same documents in another order
  // is not a change (the Test drive's stale check compares them sorted too).
  const value = (v: unknown) =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? [...(v as string[])].sort() : v;
  return JSON.stringify(keys.map((k) => [k, value(src[k])]));
}

const SKIP_NOTHING: ReadonlySet<string> = new Set();

/**
 * The draft as trainees would receive it: a library / trainee-built scenario
 * inherits the built-in value wherever the draft is blank (that is exactly
 * what `diffAgainstBase` + `applyScenarioOverride` do at save and play
 * time). Used for the Test drive, the readiness check and "What you're
 * testing", so an admin who clears the opening line tests the SEED line the
 * trainees will hear — not an owner improvising one. `visible` and
 * `scenario_id` are the draft's own.
 */
export function withBaseFallback(draft: StudioDraft, base: StudioDraft): StudioDraft {
  const out: Record<string, unknown> = { ...draft };
  const src = draft as Record<string, unknown>;
  const from = base as Record<string, unknown>;
  for (const key of Object.keys(from)) {
    if (key === 'scenario_id' || key === 'visible') continue;
    if (isBlankValue(src[key]) && !isBlankValue(from[key])) out[key] = from[key];
  }
  return out as StudioDraft;
}

/**
 * A stable identity for what a draft would save. Key order doesn't matter and
 * a blank field equals an absent one, so typing into a box and clearing it
 * again never leaves a scenario looking edited. `false` and `0` are values.
 */
export function draftFingerprint(draft: StudioDraft): string {
  return fingerprintOf(draft, SKIP_NOTHING);
}

/** Would saving `a` write anything different from `b`? */
export function draftsDiffer(a: StudioDraft, b: StudioDraft): boolean {
  return draftFingerprint(a) !== draftFingerprint(b);
}

/**
 * Does a locally kept entry hold edits the server doesn't have? The same
 * question as `isUnsaved` in ./localDrafts, answered with the fingerprint
 * rules above (so `null` vs. a missing key is not "unsaved").
 */
export function localEntryHasChanges(entry: { draft: StudioDraft; baseline: string }): boolean {
  let base: StudioDraft;
  try {
    base = JSON.parse(entry.baseline) as StudioDraft;
  } catch {
    return true;
  }
  return draftsDiffer(entry.draft, base ?? {});
}

/** Columns a resumed local draft may never carry over: identity, publish
 * state, and what the server owns. */
const NOT_REBASED: ReadonlySet<string> = new Set([
  'scenario_id',
  'visible',
  'copied_from',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'deleted_at',
]);

function sameFieldValue(a: unknown, b: unknown): boolean {
  if (isBlankValue(a) && isBlankValue(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface RebasedDraft {
  /** The current server draft with ONLY the admin's local edits re-applied. */
  draft: StudioDraft;
  /** Keys the admin changed locally (relative to where they started). */
  edited: Array<keyof ScenarioOverrideRow>;
  /** The server version moved on after the local work began. */
  serverMoved: boolean;
}

/**
 * Resume unsaved browser work WITHOUT reverting anyone else's.
 *
 * A local entry remembers the server version the admin started from
 * (`baseline`). Resuming used to restore the whole old snapshot — so if
 * another admin had since edited or unpublished the scenario, one Save put
 * their changes back and re-published it. Now only the fields the admin
 * actually changed are laid over the CURRENT server draft, and `visible`
 * (publish state) always comes from the server.
 */
export function rebaseLocalDraft(
  entry: { draft: StudioDraft; baseline: string },
  server: StudioDraft,
): RebasedDraft {
  let base: StudioDraft = {};
  try {
    const parsed = JSON.parse(entry.baseline) as unknown;
    if (parsed && typeof parsed === 'object') base = parsed as StudioDraft;
  } catch {
    base = {};
  }
  const local = entry.draft as Record<string, unknown>;
  const from = base as Record<string, unknown>;
  const keys = new Set([...Object.keys(local), ...Object.keys(from)]);
  const edited: Array<keyof ScenarioOverrideRow> = [];
  const draft: Record<string, unknown> = { ...server };
  for (const key of keys) {
    if (NOT_REBASED.has(key)) continue;
    if (sameFieldValue(local[key], from[key])) continue;
    edited.push(key as keyof ScenarioOverrideRow);
    draft[key] = local[key] ?? null;
  }
  draft.visible = server.visible;
  draft.scenario_id = server.scenario_id;
  // A never-saved draft started from nothing — there is no server version to
  // have moved.
  const serverMoved = Object.keys(from).length > 0 && draftsDiffer(stripUnrebased(base), stripUnrebased(server));
  return { draft: draft as StudioDraft, edited, serverMoved };
}

function stripUnrebased(d: StudioDraft): StudioDraft {
  const out: Record<string, unknown> = { ...d };
  for (const k of NOT_REBASED) if (k !== 'visible') delete out[k];
  return out as StudioDraft;
}

/**
 * Fields that never reach the AI: how the card looks, whether it is live, and
 * the columns the server owns. Changing them after a Test drive doesn't make
 * the test stale.
 */
const NOT_AI_RELEVANT: ReadonlySet<string> = new Set<string>([
  ...STUDIO_STEPS.find((s) => s.key === 'publish')!.fields,
  ...SERVER_MANAGED_COLUMNS,
  'scenario_id',
  'copied_from',
]);

/**
 * Everything about a draft that changes how the AI customer behaves. A Test
 * drive counts as "this version" while `aiSignature` is unchanged — retitling
 * the card after testing doesn't ask for another test; changing the breed does.
 */
export function aiSignature(draft: StudioDraft): string {
  return fingerprintOf(draft, NOT_AI_RELEVANT);
}

/** The knowledge-library fields the Studio's health checks read. */
export type KnowledgeDocLite = Pick<KnowledgeDocument, 'slug' | 'title' | 'chunk_count' | 'metadata'>;

/**
 * Readiness context for a draft. `docs` is null while the library is loading,
 * failed, or can't be read by this role — the checks then report nothing
 * rather than calling every attachment "missing".
 */
export function buildStudioContext(args: {
  draft: StudioDraft;
  source: StudioSource;
  tested: boolean;
  docs: readonly KnowledgeDocLite[] | null;
  /** From `admin-scenario-overrides?op=capabilities`; undefined = unknown. */
  speciesSupported?: boolean;
  /**
   * The team's objections (active + retired), the deleted ones, and whether
   * the list loaded. Absent = unknown: a team objection is then neither
   * called deleted nor blocked.
   */
  objections?: {
    team: readonly TeamObjection[];
    deleted?: readonly ObjectionRef[];
    loaded: boolean;
  };
  /** Every category (built-ins included), so an inherited knowledge choice can be named. */
  categories?: readonly ObjectionCategory[];
}): StudioContext {
  const { draft, source, tested, docs } = args;
  const speciesUnsupported = args.speciesSupported === false;
  const team = args.objections?.team ?? [];
  const categories = args.categories ?? [];
  const categoryId = objectionCategoryId(draft.pushback_id, team);
  const category = categoryId ? categories.find((c) => c.id === categoryId) ?? null : null;
  const categoryKnowledge =
    category && categoryKnowledgeFor(draft.pushback_id, team, categories) ? { id: category.id, name: category.name } : null;
  const objection = checkObjection({
    pushbackId: draft.pushback_id,
    species: draft.species,
    team: args.objections?.team ?? [],
    deleted: args.objections?.deleted ?? [],
    loaded: args.objections?.loaded ?? false,
  });
  // Advisory checks (./readinessWarnings): present only when there is
  // something to say, so a context with nothing to warn about stays as it was.
  const objectionConcerns = objectionConcernsFor(draft.pushback_id, team);
  const categoryScoring = categoryScoringReach({ draft, team, categories, docs });
  const warnings = {
    ...(objectionConcerns ? { objectionConcerns } : {}),
    ...(categoryScoring ? { categoryScoring } : {}),
  };
  const selected = draft.knowledge_slugs ?? [];
  if (!docs || selected.length === 0) {
    return {
      source,
      tested,
      missingSlugs: [],
      unindexedTitles: [],
      notRoleplayTitles: [],
      wrongSpeciesTitles: [],
      speciesUnsupported,
      objection,
      ...(categoryKnowledge ? { categoryKnowledge } : {}),
      ...warnings,
    };
  }
  const scope = retrievalSpeciesFor(draft.species, draft.life_stage);
  const bySlug = new Map(docs.map((d) => [d.slug, d] as const));
  const attached = selected
    .map((slug) => bySlug.get(slug))
    .filter((d): d is KnowledgeDocLite => Boolean(d));
  return {
    source,
    tested,
    missingSlugs: missingKnowledgeSlugs(selected, docs.map((d) => d.slug)),
    unindexedTitles: attached.filter((d) => (d.chunk_count ?? 0) === 0).map((d) => d.title),
    notRoleplayTitles: attached
      .filter((d) => !readKnowledgeScope(d.metadata).tools.includes('roleplay'))
      .map((d) => d.title),
    wrongSpeciesTitles: scope
      ? attached
          .filter((d) => !readKnowledgeScope(d.metadata).species.includes(scope))
          .map((d) => d.title)
      : [],
    speciesUnsupported,
    objection,
    ...(categoryKnowledge ? { categoryKnowledge } : {}),
    ...warnings,
  };
}

/** Where a save-time problem is fixed, read off the sentence `draftProblems` wrote. */
function problemStep(message: string): StudioStepKey {
  if (/^(Breed|Weight)\b/.test(message)) return 'pet';
  if (/^Difficulty\b/.test(message)) return 'customer';
  if (/^(Opening notes|Final reminders)\b/.test(message)) return 'brief';
  if (/documents are attached/.test(message)) return 'knowledge';
  return 'publish';
}

export interface SaveBlocker {
  message: string;
  /** Where to fix it. */
  step: StudioStepKey;
}

/**
 * Everything that would stop a SAVE (not a publish) from reaching the server,
 * each with the step that fixes it. On top of `draftProblems`, a scenario
 * written in the Studio can't be stored until it has the four answers the AI
 * needs — the server refuses it — so that is said here, in words, first.
 */
export function saveBlockers(
  draft: StudioDraft,
  source: StudioSource,
  /** The draft's team-objection check (`StudioContext.objection`), if any. */
  objection?: ObjectionCheck | null,
): SaveBlocker[] {
  const out: SaveBlocker[] = [];
  // The server only stores a team objection that exists — say so before it
  // refuses, in words, with where to fix it.
  if (objectionMissing(objection)) {
    out.push({
      message:
        objection?.state === 'deleted'
          ? `This scenario’s objection, “${objection.title}”, was deleted. Pick another one (or restore it on the Categories tab) before saving.`
          : 'This scenario’s objection can’t be found any more. Pick another one before saving.',
      step: 'pushback',
    });
  }
  if (source === 'admin') {
    const missing = missingCoreFields(draft);
    if (missing.length > 0) {
      const list = missing.map((m) => (m === 'ECHO driver' ? m : m.toLowerCase()));
      const joined =
        list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
      out.push({
        message: `To be saved, this scenario still needs its ${joined}. Your work is kept in this browser meanwhile.`,
        step:
          missing.includes('Breed') || missing.includes('Life stage')
            ? 'pet'
            : missing.includes('Pushback')
              ? 'pushback'
              : 'customer',
      });
    }
  }
  for (const message of draftProblems(draft)) out.push({ message, step: problemStep(message) });
  return out;
}

/**
 * The scenario's name as a person reads it: the card title, else the name it
 * was given elsewhere (the built-in title, the trainee's own title), else the
 * pushback it is about.
 */
export function studioTitle(
  draft: StudioDraft,
  fallback?: string | null,
  team: readonly ObjectionRef[] = [],
): string {
  const card = draft.card_title_override?.trim();
  if (card) return card;
  const given = fallback?.trim();
  if (given) return given;
  return draft.pushback_id ? objectionLabel(draft.pushback_id, team) : 'Untitled scenario';
}

/** "Labrador Retriever · Adult (3-7) · Analyzer" — whatever is filled in. */
export function scenarioSummary(draft: StudioDraft): string {
  const parts = [
    draft.breed?.trim() || null,
    draft.life_stage ? lifeStageLabel(draft.life_stage, draft.species) : null,
    draft.suggested_driver ?? null,
  ].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(' · ') : 'Not filled in yet';
}

/** "Level 3 · Hostile", or null when unset. */
export function difficultyText(level: number | null | undefined): string | null {
  if (level == null || !DIFFICULTY_LABELS[level]) return null;
  return `Level ${level} · ${DIFFICULTY_LABELS[level]}`;
}

/** "just now", "5 minutes ago", "yesterday", "3 weeks ago" … */
export function relativeTime(then: number, now: number = Date.now()): string {
  const sec = Math.round((now - then) / 1000);
  if (!Number.isFinite(sec) || sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return min <= 1 ? 'a minute ago' : `${min} minutes ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return hr <= 1 ? 'an hour ago' : `${hr} hours ago`;
  const day = Math.round(hr / 24);
  if (day <= 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  if (day < 30) {
    const wk = Math.round(day / 7);
    return wk <= 1 ? 'last week' : `${wk} weeks ago`;
  }
  if (day < 365) {
    const mo = Math.round(day / 30);
    return mo <= 1 ? 'last month' : `${mo} months ago`;
  }
  const yr = Math.round(day / 365);
  return yr <= 1 ? 'a year ago' : `${yr} years ago`;
}

/** A fresh id for a scenario written in the Studio. */
export function newAdminScenarioId(): string {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return `admin:${c.randomUUID()}`;
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `admin:${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
}

/**
 * Pull a valid enum value out of a free-form suggestion (moved from the old
 * builder's AI wizard). Exact match first, then case-insensitive, then "the
 * one option this sentence names" as a whole word. Anything else — free text,
 * or a sentence naming two options — is refused rather than written.
 */
export function matchEnumSuggestion(text: string, options: readonly string[]): string | null {
  const raw = text.trim();
  if (!raw) return null;
  const exact = options.find((o) => o === raw);
  if (exact) return exact;
  const lower = raw.toLowerCase();
  const ci = options.find((o) => o.toLowerCase() === lower);
  if (ci) return ci;
  // Whole-word only: a substring test maps "the customer is anxious" onto the
  // `custom` pushback, which is exactly the silent mis-write this guards.
  const named = options.filter((o) => {
    const esc = o.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`).test(lower);
  });
  return named.length === 1 ? named[0] : null;
}

/** Where a scenario stands with trainees. */
export type EntryStatus = 'live' | 'draft' | 'hidden' | 'trainee';

/** One scenario in the Studio gallery — everything the home and editor need. */
export interface StudioEntry {
  id: string;
  source: StudioSource;
  title: string;
  /** The saved override row, if one exists. */
  override: ScenarioOverrideRow | null;
  /** The trainee's own row, for `user:` scenarios. */
  userScenario: UserScenario | null;
  /** The shipped scenario, for library ones. */
  manifest: SeedScenarioManifest | null;
  /** Current effective values: the base scenario overlaid by the override. */
  draft: StudioDraft;
  status: EntryStatus;
  /** Last edit (ms), or null for a built-in nobody has touched. */
  editedAt: number | null;
}

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Every scenario the Studio lists, built the way the old builder built its
 * list: the shipped library (overlaid by any override row), the scenarios
 * written here (`admin:` rows), and trainee-built ones (`user:`).
 */
export function buildStudioEntries(
  overrides: readonly ScenarioOverrideRow[],
  userScenarios: readonly UserScenario[],
  /** The team's objections, so an untitled scenario is named by its objection. */
  team: readonly ObjectionRef[] = [],
): StudioEntry[] {
  const out: StudioEntry[] = [];
  const byId = new Map(overrides.map((o) => [o.scenario_id, o] as const));

  for (const m of LIBRARY_MANIFEST) {
    const o = byId.get(m.id) ?? null;
    const draft = buildInitialDraft({ id: m.id, source: 'library', override: o }, m, null);
    out.push({
      id: m.id,
      source: 'library',
      title: studioTitle(draft, m.title, team),
      override: o,
      userScenario: null,
      manifest: m,
      draft,
      status: draft.visible === false ? 'hidden' : 'live',
      editedAt: timeOf(o?.updated_at),
    });
  }

  for (const o of overrides) {
    if (!o.scenario_id.startsWith('admin:')) continue;
    const draft = buildInitialDraft({ id: o.scenario_id, source: 'admin', override: o }, null, null);
    out.push({
      id: o.scenario_id,
      source: 'admin',
      title: studioTitle(draft, null, team),
      override: o,
      userScenario: null,
      manifest: null,
      draft,
      status: o.visible ? 'live' : 'draft',
      editedAt: timeOf(o.updated_at),
    });
  }

  for (const s of userScenarios) {
    const id = `user:${s.id}`;
    const o = byId.get(id) ?? null;
    const draft = buildInitialDraft({ id, source: 'user', override: o }, null, s);
    out.push({
      id,
      source: 'user',
      title: studioTitle(draft, s.title, team),
      override: o,
      userScenario: s,
      manifest: null,
      draft,
      status: 'trainee',
      editedAt: timeOf(o?.updated_at) ?? timeOf(s.updated_at) ?? timeOf(s.created_at),
    });
  }
  return out;
}

/** The base layer of an entry (what Revert restores) — library only. */
export function entryBase(entry: Pick<StudioEntry, 'id' | 'source' | 'manifest'>): StudioDraft | null {
  if (entry.source !== 'library' || !entry.manifest) return null;
  return buildBaseLayer({ id: entry.id, source: 'library', override: null }, entry.manifest, null);
}

export type GalleryFilter = 'all' | 'live' | 'drafts' | 'builtin' | 'trainee';

export const GALLERY_FILTERS: Array<{ key: GalleryFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'builtin', label: 'Built-in' },
  { key: 'trainee', label: 'From trainees' },
];

export function matchesGalleryFilter(entry: StudioEntry, filter: GalleryFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'live':
      return entry.status === 'live';
    case 'drafts':
      return entry.status === 'draft' || entry.status === 'hidden';
    case 'builtin':
      return entry.source === 'library';
    case 'trainee':
      return entry.source === 'user';
  }
}

// ── Animal + objection filters ───────────────────────────────

export type AnimalFilter = 'all' | ScenarioSpecies;

export const ANIMAL_FILTERS: Array<{ key: AnimalFilter; label: string }> = [
  { key: 'all', label: 'All animals' },
  { key: 'dog', label: 'Dogs' },
  { key: 'cat', label: 'Cats' },
];

/** The objection filter's "everything" value (never a pushback id). */
export const ALL_OBJECTIONS = '*';

/** The category filter's "everything" value (never a category id). */
export const ALL_CATEGORIES = '*';

/** The category filter's "Something else / not set yet" value (never a category id). */
export const NO_CATEGORY = '-';

/** What a gallery lookup needs from a team objection: its name and category. */
export type GalleryObjectionRef = ObjectionRef & { categoryId?: string };

/** The category a scenario sits in (NO_CATEGORY for "Something else" or none). */
export function entryCategoryId(entry: StudioEntry, team: readonly GalleryObjectionRef[] = []): string {
  return (
    objectionCategoryId(
      entry.draft.pushback_id,
      team.filter((o): o is ObjectionRef & { categoryId: string } => typeof o.categoryId === 'string'),
    ) ?? NO_CATEGORY
  );
}

export function matchesCategoryFilter(
  entry: StudioEntry,
  category: string,
  team: readonly GalleryObjectionRef[] = [],
): boolean {
  return category === ALL_CATEGORIES || entryCategoryId(entry, team) === category;
}

export function matchesAnimalFilter(entry: StudioEntry, animal: AnimalFilter): boolean {
  return animal === 'all' || speciesOf(entry.draft.species) === animal;
}

export function matchesObjectionFilter(entry: StudioEntry, objection: string): boolean {
  return objection === ALL_OBJECTIONS || entry.draft.pushback_id === objection;
}

export interface GallerySelection {
  status: GalleryFilter;
  animal: AnimalFilter;
  /** A category id, NO_CATEGORY, or ALL_CATEGORIES (the default). */
  category?: string;
  objection: string;
}

export interface GalleryFacets {
  /** Entries matching the search and all three filters, in gallery order. */
  shown: StudioEntry[];
  /** Per option: how many would show with that option and the other filters as they are. */
  status: Record<GalleryFilter, number>;
  animal: Record<AnimalFilter, number>;
  /**
   * Every category at least one listed scenario sits in (search, status and
   * animal applied), in category order, with "Something else / not set" last.
   * The selected one stays listed even when nothing matches it any more.
   */
  categories: Array<{ id: string; label: string; count: number }>;
  /** How many scenarios the category filter's "All" would show. */
  categoryTotal: number;
  /**
   * Every objection at least one listed scenario uses (search, status, animal
   * AND category applied — the options are scoped to the chosen category),
   * named the way a person reads it, A→Z. The selected one stays listed even
   * when nothing matches it any more.
   */
  objections: Array<{ id: string; label: string; count: number }>;
  /** How many scenarios the objection filter's "All" would show. */
  objectionTotal: number;
}

/**
 * The gallery's filters as one pure computation: the search box, the status
 * chips, the animal chips and the objection picker, each count computed with
 * the OTHER filters applied (so "Cats 2" means two cats in what you're
 * looking at, not two cats overall).
 */
export function galleryFacets(
  entries: readonly StudioEntry[],
  sel: GallerySelection,
  query: string,
  team: readonly GalleryObjectionRef[] = [],
  /** Every category (built-ins included), for names and order. */
  categoryList: readonly Pick<ObjectionCategory, 'id' | 'name'>[] = [],
): GalleryFacets {
  const selCategory = sel.category ?? ALL_CATEGORIES;
  const searched = sortForGallery(entries.filter((e) => matchesGalleryQuery(e, query, team, categoryList)));
  const byStatus = (e: StudioEntry) => matchesGalleryFilter(e, sel.status);
  const byAnimal = (e: StudioEntry) => matchesAnimalFilter(e, sel.animal);
  const byCategory = (e: StudioEntry) => matchesCategoryFilter(e, selCategory, team);
  const byObjection = (e: StudioEntry) => matchesObjectionFilter(e, sel.objection);

  const status = {} as Record<GalleryFilter, number>;
  for (const f of GALLERY_FILTERS) {
    status[f.key] = searched.filter(
      (e) => matchesGalleryFilter(e, f.key) && byAnimal(e) && byCategory(e) && byObjection(e),
    ).length;
  }
  const animal = {} as Record<AnimalFilter, number>;
  for (const f of ANIMAL_FILTERS) {
    animal[f.key] = searched.filter(
      (e) => matchesAnimalFilter(e, f.key) && byStatus(e) && byCategory(e) && byObjection(e),
    ).length;
  }
  const base = searched.filter((e) => byStatus(e) && byAnimal(e));

  const catCounts = new Map<string, number>();
  for (const e of base) {
    const id = entryCategoryId(e, team);
    catCounts.set(id, (catCounts.get(id) ?? 0) + 1);
  }
  if (selCategory !== ALL_CATEGORIES && !catCounts.has(selCategory)) catCounts.set(selCategory, 0);
  const order = new Map(categoryList.map((c, i) => [c.id, i] as const));
  const rank = (id: string) => (id === NO_CATEGORY ? Number.MAX_SAFE_INTEGER : (order.get(id) ?? categoryList.length));
  const categories = [...catCounts.entries()]
    .map(([id, count]) => ({
      id,
      label: id === NO_CATEGORY ? 'Something else / not set yet' : categoryName(id, categoryList),
      count,
    }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.label.localeCompare(b.label));

  const pool = base.filter(byCategory);
  const counts = new Map<string, number>();
  for (const e of pool) {
    const id = e.draft.pushback_id;
    if (typeof id === 'string' && id.trim()) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (sel.objection !== ALL_OBJECTIONS && !counts.has(sel.objection)) counts.set(sel.objection, 0);
  const objections = [...counts.entries()]
    .map(([id, count]) => ({ id, label: objectionFilterLabel(id, team), count }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    shown: pool.filter(byObjection),
    status,
    animal,
    categories,
    categoryTotal: base.length,
    objections,
    objectionTotal: pool.length,
  };
}

/** A category id as a person reads it — never a raw `category:` id. */
function categoryName(id: string, list: readonly Pick<ObjectionCategory, 'id' | 'name'>[]): string {
  const hit = list.find((c) => c.id === id);
  if (hit) return hit.name;
  const words = id.replace(/^category:/, '').replace(/-+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Category';
}

/** The name of the category a scenario sits in, or null ("Something else" / none). */
export function entryCategoryName(
  entry: StudioEntry,
  team: readonly GalleryObjectionRef[] = [],
  categoryList: readonly Pick<ObjectionCategory, 'id' | 'name'>[] = [],
): string | null {
  const id = entryCategoryId(entry, team);
  return id === NO_CATEGORY ? null : categoryName(id, categoryList);
}

/** "Something else" reads better than "Other pushback" in a filter. */
function objectionFilterLabel(id: string, team: readonly ObjectionRef[]): string {
  return id === 'custom' ? 'Something else (described in the scenario)' : objectionLabel(id, team);
}

/** What a gallery card says about a scenario's standing with trainees. */
export function entryStatusText(
  entry: Pick<StudioEntry, 'status'>,
  /** For a trainee's scenario: its saved library copies (see `libraryCopiesByTrainee`). */
  libraryCopies: readonly StudioEntry[] = [],
): { tone: 'success' | 'neutral' | 'warn' | 'info'; text: string } {
  switch (entry.status) {
    case 'live':
      return { tone: 'success', text: 'Live in the app' };
    case 'hidden':
      return { tone: 'warn', text: 'Hidden from trainees' };
    case 'draft':
      return { tone: 'neutral', text: 'Saved draft — hidden' };
    case 'trainee':
      if (libraryCopies.length === 0) return { tone: 'neutral', text: 'Trainee’s own — not in the library' };
      return libraryCopies.some((c) => c.status === 'live')
        ? { tone: 'success', text: 'In the library — live' }
        : { tone: 'info', text: 'In the library — hidden draft' };
  }
}

/** Free-text search over what the card shows (and the id, for support). */
export function matchesGalleryQuery(
  entry: StudioEntry,
  query: string,
  team: readonly GalleryObjectionRef[] = [],
  categoryList: readonly Pick<ObjectionCategory, 'id' | 'name'>[] = [],
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const d = entry.draft;
  const haystack = [
    entry.title,
    entry.id,
    scenarioSummary(d),
    d.pushback_id ? objectionLabel(d.pushback_id, team) : '',
    entryCategoryName(entry, team, categoryList) ?? '',
    speciesOf(d.species),
    SOURCE_LABELS[entry.source],
    entry.status,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * Gallery order: scenarios for everyone first (most recently edited first,
 * untouched built-ins in their shipped order after), trainee-built ones last —
 * there can be hundreds, and they belong to one person each.
 */
export function sortForGallery(entries: readonly StudioEntry[]): StudioEntry[] {
  const group = (e: StudioEntry) => (e.source === 'user' ? 1 : 0);
  return [...entries].sort(
    (a, b) => group(a) - group(b) || (b.editedAt ?? -1) - (a.editedAt ?? -1),
  );
}
