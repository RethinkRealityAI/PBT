/**
 * Categories in the Scenario Studio — the pure model.
 *
 * A category is a subject area ("Obesity & weight loss", "Probiotics") and
 * the KNOWLEDGE CONTAINER for everything inside it: the documents attached
 * to it and/or a knowledge topic. Objections live in a category; scenarios
 * on an objection read their category's knowledge unless they pick their own.
 * The shared module `src/shared/scenarios/objectionCategories.ts` owns the
 * vocabulary, validation and the knowledge rules; this file is what the admin
 * screens need on top of it — reading the `admin-objections` answer, what a
 * category covers (animals, knowledge, objections), and the editor's form.
 *
 * No React, no fetches. Unit-tested in ./__tests__/categoriesModel.test.ts.
 */
import {
  BUILT_IN_CATEGORIES,
  CATEGORY_LIMITS,
  isTeamCategoryId,
  objectionCategoryId,
  rowToCategory,
  sortCategories,
  validateCategoryInput,
  type AdminObjectionCategory,
  type KnowledgeSelection,
  type ObjectionCategory,
} from '../../../../src/shared/scenarios/objectionCategories';
import {
  builtInObjections,
  type CatalogObjection,
  type TeamObjection,
} from '../../../../src/shared/scenarios/objections';
import { focusAreaLabel } from '../../../../src/shared/knowledge/focusAreas';
import { ALL_KNOWLEDGE_SPECIES } from '../../../../src/shared/knowledge/knowledgeScopes';
import { SCENARIO_SPECIES, type ScenarioSpecies } from '../../../../src/shared/scenarios/species';
import { resolveDocScope } from '../../data/knowledgeActions';

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
 * One `admin-objections` category, read tolerantly: anything that can't be a
 * usable category is dropped (null), the same rule `rowToCategory` applies.
 */
export function toAdminCategory(raw: unknown): AdminObjectionCategory | null {
  const base = rowToCategory(raw);
  if (!base || !isRecord(raw)) return null;
  const usage = isRecord(raw.usage) ? raw.usage : {};
  return {
    ...base,
    createdAt: isoOrNull(raw.createdAt ?? raw.created_at),
    deletedAt: isoOrNull(raw.deletedAt ?? raw.deleted_at),
    // A built-in can never be deleted, whatever a row says.
    ...(base.builtIn ? { deletedAt: null } : {}),
    customised: raw.customised === true,
    usage: { objections: count(usage.objections), scenarios: count(usage.scenarios) },
  };
}

/** A built-in as the admin sees it when no stored edit exists (or nothing loaded). */
export function builtInAdminCategory(c: ObjectionCategory): AdminObjectionCategory {
  return {
    ...c,
    knowledgeSlugs: [...c.knowledgeSlugs],
    builtIn: true,
    createdAt: null,
    deletedAt: null,
    customised: false,
    usage: { objections: 0, scenarios: 0 },
  };
}

/** The three built-ins, untouched — what a picker shows before (or without) the server. */
export function builtInAdminCategories(): AdminObjectionCategory[] {
  return BUILT_IN_CATEGORIES.map(builtInAdminCategory);
}

/**
 * The live list (built-ins always included, display order) and the recently
 * deleted team categories (most recent first). The server already merges the
 * built-ins in; a built-in it left out (an older server, a failed read) is
 * added back untouched, so every built-in objection always has a home.
 */
export function splitCategories(raw: unknown): {
  active: AdminObjectionCategory[];
  deleted: AdminObjectionCategory[];
} {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const active: AdminObjectionCategory[] = [];
  const deleted: AdminObjectionCategory[] = [];
  for (const item of list) {
    const c = toAdminCategory(item);
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    (c.deletedAt ? deleted : active).push(c);
  }
  for (const b of BUILT_IN_CATEGORIES) {
    if (!seen.has(b.id)) active.push(builtInAdminCategory(b));
  }
  deleted.sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''));
  return { active: sortCategories(active), deleted };
}

// ─────────────────────────────────────────────────────────────
// What a category covers
// ─────────────────────────────────────────────────────────────

/** Built-in and team objections as one list of catalogue entries (no "Other pushback"). */
export function catalogFor(team: readonly TeamObjection[]): CatalogObjection[] {
  return [
    ...builtInObjections().filter((o) => o.id !== 'custom'),
    ...team.map((o) => ({
      id: o.id,
      title: o.title,
      example: o.example,
      titleFr: o.titleFr,
      exampleFr: o.exampleFr,
      species: [...o.species],
      categoryId: o.categoryId,
      builtIn: false,
      visible: o.visible,
    })),
  ];
}

/** The built-in objections that live in a category (none for a team category). */
export function builtInObjectionsIn(categoryId: string): CatalogObjection[] {
  return builtInObjections().filter((o) => o.id !== 'custom' && o.categoryId === categoryId);
}

/** The team's objections in a category (active and retired). */
export function teamObjectionsIn<T extends Pick<TeamObjection, 'categoryId'>>(
  categoryId: string,
  team: readonly T[],
): T[] {
  return team.filter((o) => o.categoryId === categoryId);
}

/**
 * Which animals a category covers — read off its ACTIVE objections (built-in
 * ones apply to both). Empty when it has none yet.
 */
export function categoryAnimals(
  categoryId: string,
  team: readonly Pick<TeamObjection, 'categoryId' | 'species' | 'visible'>[],
): ScenarioSpecies[] {
  const species = new Set<ScenarioSpecies>();
  for (const o of builtInObjectionsIn(categoryId)) for (const s of o.species) species.add(s);
  for (const o of team) {
    if (o.categoryId !== categoryId || !o.visible) continue;
    for (const s of o.species) species.add(s);
  }
  return SCENARIO_SPECIES.filter((s) => species.has(s));
}

/** "3 documents · Digestive health (GI)" — or null when nothing is attached. */
export function knowledgeSummaryText(sel: Pick<KnowledgeSelection, 'focusArea' | 'knowledgeSlugs'> | null): string | null {
  if (!sel) return null;
  const n = sel.knowledgeSlugs.length;
  const parts = [
    n > 0 ? `${n} document${n === 1 ? '' : 's'}` : null,
    sel.focusArea ? focusAreaLabel(sel.focusArea) ?? sel.focusArea : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : null;
}

/** The sentence a category card shows about its knowledge. */
export function categoryKnowledgeLine(c: Pick<ObjectionCategory, 'focusArea' | 'knowledgeSlugs'>): string {
  return knowledgeSummaryText(c) ?? 'No knowledge attached — scenarios read the whole library';
}

/** True when a category gives its scenarios anything to read. */
export function hasCategoryKnowledge(c: Pick<ObjectionCategory, 'focusArea' | 'knowledgeSlugs'> | null | undefined): boolean {
  return Boolean(c && (c.knowledgeSlugs.length > 0 || c.focusArea));
}

/** The category a draft's objection belongs to (null for "Something else" / none). */
export function categoryOfObjection<C extends Pick<ObjectionCategory, 'id'>>(
  pushbackId: string | null | undefined,
  team: ReadonlyArray<{ id: string; categoryId: string }>,
  categories: readonly C[],
): C | null {
  const id = objectionCategoryId(pushbackId, team);
  if (!id) return null;
  return categories.find((c) => c.id === id) ?? null;
}

/**
 * The animals a document uploaded "for this category" is filed for: every
 * species, unless the category's active objections are all for ONE animal
 * (a cat-only category files for cats; a dog-only one for dogs and puppies).
 */
export function categoryUploadSpecies(animals: readonly ScenarioSpecies[]): string[] {
  if (animals.length === 1 && animals[0] === 'cat') return ['cat'];
  if (animals.length === 1 && animals[0] === 'dog') return ['dog', 'puppy'];
  return [...ALL_KNOWLEDGE_SPECIES];
}

/** "Delete" is only ever offered on a TEAM category. */
export function canDeleteCategory(c: Pick<ObjectionCategory, 'id' | 'builtIn'>): boolean {
  return !c.builtIn && isTeamCategoryId(c.id);
}

// ─────────────────────────────────────────────────────────────
// The editor's form
// ─────────────────────────────────────────────────────────────

export interface CategoryForm {
  /** Null for a new category — the server allocates `category:<slug>`. */
  id: string | null;
  builtIn: boolean;
  name: string;
  nameFr: string;
  description: string;
  focusArea: string | null;
  knowledgeSlugs: string[];
  sortOrder: number | null;
}

export function emptyCategoryForm(): CategoryForm {
  return {
    id: null,
    builtIn: false,
    name: '',
    nameFr: '',
    description: '',
    focusArea: null,
    knowledgeSlugs: [],
    sortOrder: null,
  };
}

export function formFromCategory(c: ObjectionCategory): CategoryForm {
  return {
    id: c.id,
    builtIn: c.builtIn,
    name: c.name,
    nameFr: c.nameFr ?? '',
    description: c.description,
    focusArea: c.focusArea,
    knowledgeSlugs: [...c.knowledgeSlugs],
    sortOrder: c.sortOrder,
  };
}

/** The `category` body of an `upsert-category` (no `id` for a new one). */
export function categoryFormToWrite(form: CategoryForm): Record<string, unknown> {
  return {
    ...(form.id ? { id: form.id } : {}),
    name: form.name.trim(),
    nameFr: form.nameFr.trim() || null,
    description: form.description.trim(),
    focusArea: form.focusArea,
    knowledgeSlugs: [...form.knowledgeSlugs],
    sortOrder: form.sortOrder,
  };
}

export type CategoryFormField = 'name' | 'nameFr' | 'description' | 'knowledge';

/**
 * Everything wrong with the form, per field, in words — checked before the
 * request goes out (the server re-validates). `others` are the categories
 * already there: two with the same name would be impossible to tell apart in
 * a picker. `general` holds whatever the shared validator still refuses.
 */
export function categoryFormErrors(
  form: CategoryForm,
  others: readonly Pick<ObjectionCategory, 'id' | 'name'>[] = [],
): Partial<Record<CategoryFormField | 'general', string>> {
  const L = CATEGORY_LIMITS;
  const out: Partial<Record<CategoryFormField | 'general', string>> = {};
  const name = form.name.trim();
  if (!name) out.name = 'Give the category a name, e.g. Probiotics.';
  else if (name.length > L.nameMax) out.name = `Keep the name under ${L.nameMax} characters (now ${name.length}).`;
  else if (others.some((c) => c.id !== form.id && c.name.trim().toLowerCase() === name.toLowerCase())) {
    out.name = `There’s already a category called “${name}”.`;
  }
  if (form.nameFr.trim().length > L.nameMax) out.nameFr = `Keep the French name under ${L.nameMax} characters.`;
  const description = form.description.trim();
  if (description.length > L.descriptionMax) {
    out.description = `Keep the description under ${L.descriptionMax} characters (now ${description.length}).`;
  }
  if (form.knowledgeSlugs.length > L.knowledgeSlugsMax) {
    out.knowledge = `Attach at most ${L.knowledgeSlugsMax} documents (now ${form.knowledgeSlugs.length}).`;
  }
  if (Object.keys(out).length === 0) {
    // The same validator the server runs. A new category has no id yet, so
    // a placeholder stands in for the one the server will allocate.
    const verdict = validateCategoryInput({ ...categoryFormToWrite(form), id: form.id ?? 'category:new-category' });
    if (!verdict.ok) out.general = verdict.error;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────

/** A category id as a person reads it — never a raw `category:` id. */
export function categoryLabel(
  id: string | null | undefined,
  categories: readonly Pick<ObjectionCategory, 'id' | 'name'>[] = [],
): string {
  if (!id) return 'No category';
  const hit = categories.find((c) => c.id === id);
  if (hit) return hit.name;
  const builtIn = BUILT_IN_CATEGORIES.find((c) => c.id === id);
  if (builtIn) return builtIn.name;
  const words = id.replace(/^category:/, '').replace(/-+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Category';
}

/** "2 objections · 3 scenarios" for a category card. */
export function categoryUsageLabel(objections: number, scenarios: number): string {
  const o = `${objections} objection${objections === 1 ? '' : 's'}`;
  if (scenarios <= 0) return `${o} · no scenarios yet`;
  return `${o} · ${scenarios} scenario${scenarios === 1 ? '' : 's'}`;
}

/**
 * "the Probiotics knowledge" — a category's knowledge named in a sentence.
 * (A possessive can't be built from a name: "Probiotics’" is right,
 * "Obesity & weight loss’" isn't.)
 */
export function knowledgeOf(name: string): string {
  return `the ${name.trim()} knowledge`;
}

const REACH_SPECIES: Record<ScenarioSpecies, readonly ('dog' | 'puppy' | 'cat')[]> = {
  dog: ['dog', 'puppy'],
  cat: ['cat'],
};
const REACH_SPECIES_LABEL: Record<'dog' | 'puppy' | 'cat', string> = {
  dog: 'adult dogs',
  puppy: 'puppies',
  cat: 'cats',
};

/**
 * Why an attached document won't reach every scenario in a category — one
 * plain sentence per gap, empty when it reaches them all. A category's
 * documents are read by the roleplay AND the scoring, inside each
 * scenario's species scope; one filed for another animal or tool gives
 * those scenarios nothing from it (retrieval then widens to the whole
 * library for them, so they are never left ungrounded — but the category's
 * choice doesn't apply). `animals` = the animals the category's objections
 * cover; a category with none yet is checked against both.
 */
export function categoryDocReach(
  doc: { metadata: Record<string, unknown> | null | undefined },
  animals: readonly ScenarioSpecies[],
): string[] {
  const scope = resolveDocScope(doc.metadata);
  const wanted = (animals.length ? animals : SCENARIO_SPECIES).flatMap((a) => REACH_SPECIES[a]);
  const missing = wanted.filter((s) => !scope.species.includes(s));
  const out: string[] = [];
  if (missing.length) {
    out.push(
      `Not filed for ${missing.map((s) => REACH_SPECIES_LABEL[s]).join(' or ')}, so those scenarios skip it (with nothing else here for them, they read the whole library).`,
    );
  }
  if (!scope.tools.includes('roleplay')) out.push('The AI customer doesn’t read it.');
  if (!scope.tools.includes('scoring')) out.push('The scoring doesn’t read it, so scorecards won’t draw on it.');
  return out;
}
