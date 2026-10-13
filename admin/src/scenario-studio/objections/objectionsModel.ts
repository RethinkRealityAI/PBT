/**
 * Objections in the Scenario Studio — the pure model.
 *
 * Objections are the pushbacks scenarios are built on: the seven built into
 * the app (`src/shared/scenarios/enums.ts`) and the ones the team adds in the
 * Studio (`team:<slug>`, stored in `scenario_objections`). The shared module
 * `src/shared/scenarios/objections.ts` owns the vocabulary, validation and
 * resolution; this file is what the admin screens need on top of it — reading
 * the `admin-objections` answer, the options a picker offers for an animal,
 * where a draft's objection stands, and the editor's form.
 *
 * No React, no fetches. Unit-tested in ./__tests__/objectionsModel.test.ts.
 */
import {
  COACHING_KEYS,
  HINT_COACHING_KEYS,
  OBJECTION_LIMITS,
  builtInObjections,
  isBuiltInObjectionId,
  isTeamObjectionId,
  objectionAppliesTo,
  rowToTeamObjection,
  sortTeamObjections,
  topicLabel,
  validateObjectionInput,
  type AdminObjection,
  type CoachingKey,
  type HintCoachingKey,
  type ObjectionCoaching,
  type ObjectionCoachingFr,
  type TeamObjection,
} from '../../../../src/shared/scenarios/objections';
import { PUSHBACK_LABELS } from '../../../../src/shared/scenarios/enums';
import {
  categoriesForSpecies,
  type ObjectionCategory,
} from '../../../../src/shared/scenarios/objectionCategories';
import {
  SCENARIO_SPECIES,
  speciesOf,
  type ScenarioSpecies,
} from '../../../../src/shared/scenarios/species';
import { missingScenarioFields, type ScenarioDraftLike } from '../../../../src/shared/scenarios/draftToScenario';

/** What a label lookup needs from a team objection. */
export type ObjectionRef = Pick<TeamObjection, 'id' | 'title'>;

// ─────────────────────────────────────────────────────────────
// Reading the server's answer
// ─────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function isoOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * One `admin-objections` entry, read tolerantly: anything that can't be a
 * usable objection is dropped (null) rather than rendered half-valid — the
 * same rule `rowToTeamObjection` applies everywhere else.
 */
export function toAdminObjection(raw: unknown): AdminObjection | null {
  const base = rowToTeamObjection(raw);
  if (!base || !isRecord(raw)) return null;
  const usage = isRecord(raw.usage) ? raw.usage : {};
  return {
    ...base,
    createdAt: isoOrNull(raw.createdAt ?? raw.created_at),
    deletedAt: isoOrNull(raw.deletedAt ?? raw.deleted_at),
    usage: {
      scenarios: count(usage.scenarios),
      live: Math.min(count(usage.live), count(usage.scenarios)),
      trainee: count(usage.trainee),
    },
  };
}

/** The live list (active + retired, display order) and the recently deleted. */
export function splitObjections(raw: unknown): { active: AdminObjection[]; deleted: AdminObjection[] } {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const active: AdminObjection[] = [];
  const deleted: AdminObjection[] = [];
  for (const item of list) {
    const o = toAdminObjection(item);
    if (!o || seen.has(o.id)) continue;
    seen.add(o.id);
    (o.deletedAt ? deleted : active).push(o);
  }
  deleted.sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  return { active: sortTeamObjections(active), deleted };
}

// ─────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────

/** The `team:` slug read as words — for an id whose objection isn't loaded. */
export function teamSlugWords(id: string): string {
  const words = id.replace(/^team:/, '').replace(/-+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Team objection';
}

/**
 * A pushback id as a person reads it: the built-in name, the team
 * objection's own title, or — while the list is unknown — its slug in words.
 * Never the raw `team:` id.
 */
export function objectionLabel(id: string | null | undefined, team: readonly ObjectionRef[] = []): string {
  if (!id) return 'No objection yet';
  if (isBuiltInObjectionId(id)) return PUSHBACK_LABELS[id] ?? id;
  const hit = team.find((t) => t.id === id);
  if (hit) return hit.title;
  return isTeamObjectionId(id) ? teamSlugWords(id) : id;
}

/** "Dogs & cats" / "Dogs only" / "Cats only". */
export function animalsLabel(species: readonly string[]): string {
  const dog = species.includes('dog');
  const cat = species.includes('cat');
  if (dog && cat) return 'Dogs & cats';
  if (cat) return 'Cats only';
  if (dog) return 'Dogs only';
  return 'No animals';
}

/** "Used by 3 scenarios (1 live) · 2 trainees' own" / "Not used yet". */
export function usageLabel(usage: { scenarios: number; live: number; trainee?: number }): string {
  const trainee = usage.trainee ?? 0;
  const traineePart = trainee > 0 ? `${trainee} ${trainee === 1 ? 'trainee’s' : 'trainees’'} own` : '';
  if (usage.scenarios <= 0) {
    return traineePart ? `Not in any library scenario · ${traineePart}` : 'Not used by any scenario yet';
  }
  const noun = usage.scenarios === 1 ? 'scenario' : 'scenarios';
  const base = `Used by ${usage.scenarios} ${noun} (${usage.live} live)`;
  return traineePart ? `${base} · ${traineePart}` : base;
}

// ─────────────────────────────────────────────────────────────
// Pickers
// ─────────────────────────────────────────────────────────────

export interface PushbackOption {
  id: string;
  title: string;
  /** The owner's typical line. */
  example: string;
  builtIn: boolean;
  species: ScenarioSpecies[];
  /** The category it lives in (null only for "Something else"). */
  categoryId: string | null;
}

/**
 * What the Pushback step offers for an animal: the built-ins (minus
 * "Something else", which every picker shows on its own) and the team's
 * ACTIVE objections that apply to it. `hiddenForSpecies` counts the active
 * team objections left out because they are for the other animal, so the
 * step can say why they aren't there.
 */
export function pushbackOptionsFor(
  species: unknown,
  team: readonly TeamObjection[],
): { builtIn: PushbackOption[]; team: PushbackOption[]; hiddenForSpecies: number } {
  const animal = speciesOf(species);
  const builtIn = builtInObjections()
    .filter((o) => o.id !== 'custom')
    .map((o) => ({
      id: o.id,
      title: o.title,
      example: o.example,
      builtIn: true,
      species: [...o.species],
      categoryId: o.categoryId,
    }));
  const visible = sortTeamObjections(team).filter((o) => o.visible);
  const fits = visible.filter((o) => objectionAppliesTo(o, animal));
  return {
    builtIn,
    team: fits.map((o) => ({
      id: o.id,
      title: o.title,
      example: o.example,
      builtIn: false,
      species: [...o.species],
      categoryId: o.categoryId,
    })),
    hiddenForSpecies: visible.length - fits.length,
  };
}

/** One category on the Pushback step, with the objections it offers for the animal. */
export interface CategoryChoice<C extends Pick<ObjectionCategory, 'id' | 'name'> = ObjectionCategory> {
  category: C;
  builtIn: PushbackOption[];
  team: PushbackOption[];
  /** Active team objections in it left out because they're for the other animal. */
  hiddenForSpecies: number;
}

/**
 * The Pushback step's categories for an animal: every category holding at
 * least one objection on offer for it (`categoriesForSpecies`), plus any id in
 * `keep` (the draft's own category, one just created) even while it has none —
 * in category display order, each with its built-in and team options.
 */
export function pushbackChoicesFor<C extends ObjectionCategory>(
  species: unknown,
  team: readonly TeamObjection[],
  categories: readonly C[],
  keep: ReadonlyArray<string | null | undefined> = [],
): CategoryChoice<C>[] {
  const animal = speciesOf(species);
  const options = pushbackOptionsFor(animal, team);
  const offered = new Set(
    categoriesForSpecies(
      categories,
      [...options.builtIn, ...options.team].map((o) => ({ categoryId: o.categoryId, species: o.species, visible: true })),
      animal,
    ).map((c) => c.id),
  );
  for (const id of keep) if (id) offered.add(id);
  const visibleTeam = team.filter((o) => o.visible);
  return categories
    .filter((c) => offered.has(c.id))
    .map((category) => ({
      category,
      builtIn: options.builtIn.filter((o) => o.categoryId === category.id),
      team: options.team.filter((o) => o.categoryId === category.id),
      hiddenForSpecies: visibleTeam.filter(
        (o) => o.categoryId === category.id && !objectionAppliesTo(o, animal),
      ).length,
    }));
}

// ─────────────────────────────────────────────────────────────
// Where a draft's objection stands
// ─────────────────────────────────────────────────────────────

export type ObjectionCheck =
  | { state: 'ok'; id: string; title: string; species: ScenarioSpecies[] }
  /** Still plays, but hidden from every picker. */
  | { state: 'retired'; id: string; title: string; species: ScenarioSpecies[]; fits: boolean }
  /** Set up for the other animal only. */
  | { state: 'wrong-species'; id: string; title: string; species: ScenarioSpecies[] }
  /** Soft-deleted — restorable from the Categories tab. */
  | { state: 'deleted'; id: string; title: string }
  /** Nothing by that id (or the table doesn't exist). */
  | { state: 'unknown'; id: string; title: string }
  /** The list didn't load, so nothing can be said either way. */
  | { state: 'unchecked'; id: string; title: string };

/**
 * The check for a draft whose pushback is a TEAM objection (null for a
 * built-in, "Something else", or none). Retired objections resolve — a
 * scenario built on one keeps playing — so only a deleted / unknown one
 * can't run.
 */
export function checkObjection(args: {
  pushbackId: string | null | undefined;
  species: unknown;
  team: readonly TeamObjection[];
  deleted?: readonly ObjectionRef[];
  /** The team list was fetched (successfully) — absent = can't tell yet. */
  loaded: boolean;
}): ObjectionCheck | null {
  const { pushbackId: id, team, deleted = [], loaded } = args;
  if (!id || !isTeamObjectionId(id)) return null;
  const animal = speciesOf(args.species);
  const hit = team.find((t) => t.id === id);
  if (hit) {
    const fits = objectionAppliesTo(hit, animal);
    if (!hit.visible) return { state: 'retired', id, title: hit.title, species: [...hit.species], fits };
    if (!fits) return { state: 'wrong-species', id, title: hit.title, species: [...hit.species] };
    return { state: 'ok', id, title: hit.title, species: [...hit.species] };
  }
  if (!loaded) return { state: 'unchecked', id, title: teamSlugWords(id) };
  const gone = deleted.find((d) => d.id === id);
  if (gone) return { state: 'deleted', id, title: gone.title };
  return { state: 'unknown', id, title: teamSlugWords(id) };
}

/** A check that means "this scenario can't run with that objection". */
export function objectionMissing(check: ObjectionCheck | null | undefined): boolean {
  return check?.state === 'deleted' || check?.state === 'unknown';
}

/** A check that means "it runs, but the objection is for the other animal". */
export function objectionMisfits(check: ObjectionCheck | null | undefined): boolean {
  return check?.state === 'wrong-species' || (check?.state === 'retired' && !check.fits);
}

/** "dogs" / "cats" / "dogs and cats" — inside a sentence. */
export function animalsInSentence(species: readonly string[]): string {
  const dog = species.includes('dog');
  const cat = species.includes('cat');
  if (dog && cat) return 'dogs and cats';
  return cat ? 'cats' : 'dogs';
}

/**
 * `missingScenarioFields` with team objections counted as answers. Whether
 * the objection still EXISTS is `checkObjection`'s question, so a deleted
 * one is reported once, in words — not also as a blank "Pushback".
 */
export function missingCoreFields(draft: ScenarioDraftLike): string[] {
  const missing = missingScenarioFields(draft);
  return isTeamObjectionId(draft.pushback_id) ? missing.filter((m) => m !== 'Pushback') : missing;
}


// ─────────────────────────────────────────────────────────────
// The editor's form
// ─────────────────────────────────────────────────────────────

export interface ObjectionForm {
  /** Null for a new objection — the server allocates `team:<slug>`. */
  id: string | null;
  title: string;
  example: string;
  titleFr: string;
  exampleFr: string;
  species: ScenarioSpecies[];
  /** The category it belongs to — required (the category owns the knowledge). */
  categoryId: string | null;
  /** One coaching line per text line, per list (the editor's textareas). */
  coaching: Record<CoachingKey, string>;
  /** The French versions of the three trainee-hint lists, same one-per-line shape. */
  coachingFr: Record<HintCoachingKey, string>;
  visible: boolean;
  sortOrder: number | null;
}

function emptyCoachingText(): Record<CoachingKey, string> {
  return Object.fromEntries(COACHING_KEYS.map((k) => [k, ''])) as Record<CoachingKey, string>;
}

function emptyCoachingFrText(): Record<HintCoachingKey, string> {
  return Object.fromEntries(HINT_COACHING_KEYS.map((k) => [k, ''])) as Record<HintCoachingKey, string>;
}

/** The form field of a French hint box (`acknowledgePatternsFr`, …). */
export type HintCoachingFrField = `${HintCoachingKey}Fr`;

export function frenchHintField(key: HintCoachingKey): HintCoachingFrField {
  return `${key}Fr`;
}

/**
 * The hint groups that have English lines but no French ones — what a French
 * trainee would see in English. Drives the editor's "French trainees will
 * see these hints in English" note.
 */
export function untranslatedHintKeys(form: Pick<ObjectionForm, 'coaching' | 'coachingFr'>): HintCoachingKey[] {
  return HINT_COACHING_KEYS.filter(
    (k) => coachingLines(form.coaching[k]).length > 0 && coachingLines(form.coachingFr[k]).length === 0,
  );
}

export function emptyObjectionForm(
  species?: readonly ScenarioSpecies[] | null,
  categoryId: string | null = null,
): ObjectionForm {
  const animals = species && species.length ? SCENARIO_SPECIES.filter((s) => species.includes(s)) : [...SCENARIO_SPECIES];
  return {
    id: null,
    title: '',
    example: '',
    titleFr: '',
    exampleFr: '',
    species: animals,
    categoryId,
    coaching: emptyCoachingText(),
    coachingFr: emptyCoachingFrText(),
    visible: true,
    sortOrder: null,
  };
}

export function formFromObjection(o: TeamObjection): ObjectionForm {
  const coaching = emptyCoachingText();
  for (const key of COACHING_KEYS) coaching[key] = (o.coaching[key] ?? []).join('\n');
  const coachingFr = emptyCoachingFrText();
  for (const key of HINT_COACHING_KEYS) coachingFr[key] = (o.coachingFr?.[key] ?? []).join('\n');
  return {
    id: o.id,
    title: o.title,
    example: o.example,
    titleFr: o.titleFr ?? '',
    exampleFr: o.exampleFr ?? '',
    species: [...o.species],
    categoryId: o.categoryId,
    coaching,
    coachingFr,
    visible: o.visible,
    sortOrder: o.sortOrder,
  };
}

/** The non-blank lines of one coaching box, in order. */
export function coachingLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l !== '');
}

/** The `objection` body of an `upsert` (no `id` for a new one). */
export function formToWrite(form: ObjectionForm): Record<string, unknown> {
  const coaching: ObjectionCoaching = {};
  for (const key of COACHING_KEYS) {
    const lines = coachingLines(form.coaching[key]);
    if (lines.length) coaching[key] = lines.slice(0, OBJECTION_LIMITS.coachingItems);
  }
  // Always sent (even empty): the server keeps the stored French lists only
  // for a body that doesn't mention them, so clearing them must be explicit.
  const coachingFr: ObjectionCoachingFr = {};
  for (const key of HINT_COACHING_KEYS) {
    const lines = coachingLines(form.coachingFr?.[key] ?? '');
    if (lines.length) coachingFr[key] = lines.slice(0, OBJECTION_LIMITS.coachingItems);
  }
  return {
    ...(form.id ? { id: form.id } : {}),
    title: form.title.trim(),
    example: form.example.trim(),
    titleFr: form.titleFr.trim() || null,
    exampleFr: form.exampleFr.trim() || null,
    species: SCENARIO_SPECIES.filter((s) => form.species.includes(s)),
    categoryId: form.categoryId,
    coaching,
    coachingFr,
    visible: form.visible,
    sortOrder: form.sortOrder,
  };
}

export type ObjectionFormField =
  | 'title'
  | 'example'
  | 'species'
  | 'categoryId'
  | 'titleFr'
  | 'exampleFr'
  | CoachingKey
  | HintCoachingFrField;

/**
 * Everything wrong with the form, per field, in words — checked before the
 * request goes out (the server re-validates). `general` holds whatever the
 * shared validator still refuses that no field explains.
 */
export function objectionFormErrors(
  form: ObjectionForm,
): Partial<Record<ObjectionFormField | 'general', string>> {
  const L = OBJECTION_LIMITS;
  const out: Partial<Record<ObjectionFormField | 'general', string>> = {};
  const title = form.title.trim();
  const example = form.example.trim();
  if (!title) out.title = 'Give the objection a short name.';
  else if (title.length > L.titleMax) out.title = `Keep the name under ${L.titleMax} characters (now ${title.length}).`;
  if (!example) out.example = 'Add the line an owner would typically say.';
  else if (example.length > L.exampleMax) {
    out.example = `Keep the owner’s line under ${L.exampleMax} characters (now ${example.length}).`;
  }
  if (form.species.length === 0) out.species = 'Choose at least one animal.';
  if (!form.categoryId) out.categoryId = 'Choose the category this objection belongs to, e.g. Probiotics.';
  if (form.titleFr.trim().length > L.titleMax) out.titleFr = `Keep the French name under ${L.titleMax} characters.`;
  if (form.exampleFr.trim().length > L.exampleMax) {
    out.exampleFr = `Keep the French line under ${L.exampleMax} characters.`;
  }
  const listError = (text: string): string | undefined => {
    const lines = coachingLines(text);
    if (lines.length > L.coachingItems) return `Up to ${L.coachingItems} lines here (now ${lines.length}).`;
    if (lines.some((l) => l.length > L.coachingItemMax)) return `Keep each line under ${L.coachingItemMax} characters.`;
    return undefined;
  };
  for (const key of COACHING_KEYS) {
    const err = listError(form.coaching[key]);
    if (err) out[key] = err;
  }
  for (const key of HINT_COACHING_KEYS) {
    const err = listError(form.coachingFr?.[key] ?? '');
    if (err) out[frenchHintField(key)] = err;
  }
  if (Object.keys(out).length === 0) {
    // The same validator the server runs. A new objection has no id yet, so
    // a placeholder stands in for the one the server will allocate.
    const verdict = validateObjectionInput({ ...formToWrite(form), id: form.id ?? 'team:new-objection' });
    if (!verdict.ok) out.general = verdict.error;
  }
  return out;
}

/** Topic name for display, "No specific topic" when unset. */
export function topicText(key: string | null | undefined): string {
  return topicLabel(key) ?? 'No specific topic';
}
