// Objection categories — the broad subject areas training is organised by
// ("Weight management", "Probiotics", "GI", …) and the KNOWLEDGE CONTAINER for
// everything inside them.
//
// The structure, top to bottom:
//   Category  — the subject area. Owns the knowledge (documents attached from
//               the RAG library and/or a knowledge topic). Not tied to one
//               animal: which animals it covers follows from its objections.
//   Objection — a specific thing owners say within the category
//               (./objections.ts). Says which animals it applies to.
//   Scenario  — one conversation on one objection (pet, owner, difficulty).
//               Uses its CATEGORY's knowledge unless it picks its own
//               (`effectiveKnowledge`).
//
// Two kinds of category, one id space:
//   • BUILT-IN categories hold the seven code-defined objections. They exist
//     even with no database row; an admin can rename them, add a French name
//     and attach knowledge (stored as a row with the same id), but never
//     delete them.
//   • TEAM categories (`category:<slug>`) are created in the Studio.
// Stored in `scenario_objection_categories` (migration
// 20261012000000_scenario_objections.sql).
//
// Imported by the consumer app, the admin app AND netlify/functions — keep it
// dependency-free (shared → shared imports only).

import { isFocusAreaKey } from '../knowledge/focusAreas';
import { SCENARIO_LIMITS } from './limits';
import { speciesOf, type ScenarioSpecies } from './species';

export const TEAM_CATEGORY_PREFIX = 'category:';

/** `category:` + a lowercase slug of 2–60 characters. */
const TEAM_CATEGORY_ID_RE = /^category:[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;

export const CATEGORY_LIMITS = {
  nameMax: 60,
  descriptionMax: 300,
  /** Documents attached to one category (same cap as one scenario). */
  knowledgeSlugsMax: SCENARIO_LIMITS.knowledgeSlugsMax,
  knowledgeSlugLenMax: SCENARIO_LIMITS.knowledgeSlugLenMax,
  /** Hard ceiling on live (non-deleted) team categories. */
  maxTeamCategories: 50,
  sortOrderMax: 1_000_000,
} as const;

export interface ObjectionCategory {
  id: string;
  name: string;
  /** Optional Canadian-French name; English is shown when absent. */
  nameFr: string | null;
  /** One plain sentence: what this subject area covers. */
  description: string;
  /** Knowledge topic (src/shared/knowledge/focusAreas.ts) — a soft filter. */
  focusArea: string | null;
  /** Documents (knowledge_documents.slug) this category's scenarios read. */
  knowledgeSlugs: string[];
  sortOrder: number | null;
  builtIn: boolean;
  updatedAt: string | null;
}

/** `scenario_objection_categories` row (snake_case, as stored). */
export interface ObjectionCategoryRow {
  id: string;
  name: string;
  name_fr: string | null;
  description: string;
  focus_area: string | null;
  knowledge_slugs: string[] | null;
  sort_order: number | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}

/** What `admin-objections` GET returns per category (built-ins included). */
export interface AdminObjectionCategory extends ObjectionCategory {
  createdAt: string | null;
  deletedAt: string | null;
  /** True for a built-in whose name/knowledge an admin has edited (a stored row exists). */
  customised: boolean;
  /** Live team objections in it (built-in objections not counted), and scenarios built on its objections. */
  usage: { objections: number; scenarios: number };
}

// ─────────────────────────────────────────────────────────────────────────
// Built-ins
// ─────────────────────────────────────────────────────────────────────────

/**
 * The categories the seven built-in objections live in. No knowledge attached
 * by default, so every existing scenario retrieves exactly as before until an
 * admin attaches some.
 */
export const BUILT_IN_CATEGORIES: readonly ObjectionCategory[] = [
  {
    id: 'everyday-nutrition',
    name: 'Everyday nutrition',
    nameFr: null,
    description: 'Cost, switching food, breeder advice and diet trends — the pushback behind most food recommendations.',
    focusArea: null,
    knowledgeSlugs: [],
    sortOrder: 10,
    builtIn: true,
    updatedAt: null,
  },
  {
    id: 'weight',
    name: 'Weight management',
    nameFr: null,
    description: 'Overweight and obese pets, and owners who don’t see it or don’t want to change.',
    focusArea: null,
    knowledgeSlugs: [],
    sortOrder: 20,
    builtIn: true,
    updatedAt: null,
  },
  {
    id: 'prescription-diets',
    name: 'Prescription diets',
    nameFr: null,
    description: 'Therapeutic (Rx) diets the vet has recommended for a medical condition.',
    focusArea: null,
    knowledgeSlugs: [],
    sortOrder: 30,
    builtIn: true,
    updatedAt: null,
  },
];

export const BUILT_IN_CATEGORY_IDS: readonly string[] = BUILT_IN_CATEGORIES.map((c) => c.id);

/**
 * Which built-in category each built-in objection belongs to. `custom`
 * ("Other pushback") belongs to none — every picker shows it separately.
 */
export const BUILT_IN_OBJECTION_CATEGORY: Readonly<Record<string, string>> = {
  cost: 'everyday-nutrition',
  'breeder-advice': 'everyday-nutrition',
  'raw-food': 'everyday-nutrition',
  'brand-switch': 'everyday-nutrition',
  'weight-denial': 'weight',
  'rx-diet': 'prescription-diets',
};

// ─────────────────────────────────────────────────────────────────────────
// Ids
// ─────────────────────────────────────────────────────────────────────────

export function isTeamCategoryId(value: unknown): value is string {
  return typeof value === 'string' && TEAM_CATEGORY_ID_RE.test(value);
}

export function isBuiltInCategoryId(value: unknown): value is string {
  return typeof value === 'string' && BUILT_IN_CATEGORY_IDS.includes(value);
}

/** Built-in id or team-id SHAPE (existence is the server's job). */
export function isCategoryIdShape(value: unknown): value is string {
  return isBuiltInCategoryId(value) || isTeamCategoryId(value);
}

/** A fresh `category:` id from a name, de-duplicated against `taken`. */
export function categoryIdFromName(name: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const slug =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '') || 'category';
  const base = slug.length >= 2 ? slug : `${slug}-category`;
  let id = `${TEAM_CATEGORY_PREFIX}${base}`;
  for (let n = 2; used.has(id); n += 1) id = `${TEAM_CATEGORY_PREFIX}${base}-${n}`;
  return id;
}

// ─────────────────────────────────────────────────────────────────────────
// Normalisation
// ─────────────────────────────────────────────────────────────────────────

function cleanText(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanOptional(v: unknown, max: number): string | null {
  const s = cleanText(v, max);
  return s ? s : null;
}

function cleanSortOrder(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return Math.max(-CATEGORY_LIMITS.sortOrderMax, Math.min(CATEGORY_LIMITS.sortOrderMax, n));
}

/** Strings only, trimmed, de-duplicated, length- and count-capped. */
export function cleanKnowledgeSlugs(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s || s.length > CATEGORY_LIMITS.knowledgeSlugLenMax || out.includes(s)) continue;
    out.push(s);
    if (out.length >= CATEGORY_LIMITS.knowledgeSlugsMax) break;
  }
  return out;
}

/**
 * Tolerant read of a stored row (or a camelCase snapshot entry). A malformed
 * one is dropped. A built-in id's row is the admin's EDIT of that built-in.
 */
export function rowToCategory(raw: unknown): ObjectionCategory | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isCategoryIdShape(r.id)) return null;
  const name = cleanText(r.name, CATEGORY_LIMITS.nameMax);
  if (!name) return null;
  const focus = r.focus_area ?? r.focusArea;
  const updated = r.updated_at ?? r.updatedAt;
  return {
    id: r.id,
    name,
    nameFr: cleanOptional(r.name_fr ?? r.nameFr, CATEGORY_LIMITS.nameMax),
    description: cleanText(r.description, CATEGORY_LIMITS.descriptionMax),
    focusArea: isFocusAreaKey(focus) ? focus : null,
    knowledgeSlugs: cleanKnowledgeSlugs(r.knowledge_slugs ?? r.knowledgeSlugs),
    sortOrder: cleanSortOrder(r.sort_order ?? r.sortOrder),
    builtIn: isBuiltInCategoryId(r.id),
    updatedAt: typeof updated === 'string' ? updated : null,
  };
}

// Optional members let callers read `.error` / `.value` after an `ok` check
// (the repo compiles without strictNullChecks; see ObjectionValidation).
export type CategoryValidation =
  | { ok: true; value: Omit<ObjectionCategory, 'updatedAt' | 'builtIn'>; error?: undefined }
  | { ok: false; error: string; value?: undefined };

/** Strict validation for a WRITE (the server allocates a new id first). */
export function validateCategoryInput(raw: unknown): CategoryValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'category must be an object' };
  }
  const r = raw as Record<string, unknown>;
  if (!isCategoryIdShape(r.id)) {
    return { ok: false, error: 'id must be a built-in category or look like category:<lowercase-words>' };
  }
  if (typeof r.name !== 'string' || !r.name.trim()) {
    return { ok: false, error: 'Give the category a name, e.g. Probiotics.' };
  }
  if (r.name.trim().length > CATEGORY_LIMITS.nameMax) {
    return { ok: false, error: `The name is too long (max ${CATEGORY_LIMITS.nameMax} characters).` };
  }
  if (r.nameFr != null && typeof r.nameFr !== 'string') return { ok: false, error: 'nameFr must be text' };
  if (typeof r.nameFr === 'string' && r.nameFr.trim().length > CATEGORY_LIMITS.nameMax) {
    return { ok: false, error: `The French name is too long (max ${CATEGORY_LIMITS.nameMax} characters).` };
  }
  if (r.description != null && typeof r.description !== 'string') {
    return { ok: false, error: 'description must be text' };
  }
  if (typeof r.description === 'string' && r.description.trim().length > CATEGORY_LIMITS.descriptionMax) {
    return { ok: false, error: `The description is too long (max ${CATEGORY_LIMITS.descriptionMax} characters).` };
  }
  const focus = r.focusArea ?? null;
  if (focus !== null && !isFocusAreaKey(focus)) {
    return { ok: false, error: `Unknown knowledge topic "${String(focus)}".` };
  }
  if (r.knowledgeSlugs != null) {
    if (!Array.isArray(r.knowledgeSlugs)) return { ok: false, error: 'knowledgeSlugs must be a list' };
    if (r.knowledgeSlugs.length > CATEGORY_LIMITS.knowledgeSlugsMax) {
      return { ok: false, error: `Attach at most ${CATEGORY_LIMITS.knowledgeSlugsMax} documents to one category.` };
    }
    for (const s of r.knowledgeSlugs) {
      if (typeof s !== 'string' || !s.trim() || s.length > CATEGORY_LIMITS.knowledgeSlugLenMax) {
        return { ok: false, error: 'knowledgeSlugs must be document ids' };
      }
    }
  }
  if (r.sortOrder != null && (typeof r.sortOrder !== 'number' || !Number.isFinite(r.sortOrder))) {
    return { ok: false, error: 'sortOrder must be a number' };
  }
  return {
    ok: true,
    value: {
      id: r.id,
      name: cleanText(r.name, CATEGORY_LIMITS.nameMax),
      nameFr: cleanOptional(r.nameFr, CATEGORY_LIMITS.nameMax),
      description: cleanText(r.description, CATEGORY_LIMITS.descriptionMax),
      focusArea: focus as string | null,
      knowledgeSlugs: cleanKnowledgeSlugs(r.knowledgeSlugs),
      sortOrder: cleanSortOrder(r.sortOrder),
    },
  };
}

/** The columns a write sets (server-managed columns excluded). */
export function categoryToRow(
  c: Omit<ObjectionCategory, 'updatedAt' | 'builtIn'>,
): Pick<
  ObjectionCategoryRow,
  'id' | 'name' | 'name_fr' | 'description' | 'focus_area' | 'knowledge_slugs' | 'sort_order'
> {
  return {
    id: c.id,
    name: c.name,
    name_fr: c.nameFr,
    description: c.description,
    focus_area: c.focusArea,
    knowledge_slugs: [...c.knowledgeSlugs],
    sort_order: c.sortOrder,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// The merged list
// ─────────────────────────────────────────────────────────────────────────

/** Display order: sort_order first, then by name. */
export function sortCategories<T extends Pick<ObjectionCategory, 'sortOrder' | 'name'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.sortOrder != null && b.sortOrder != null && a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.sortOrder != null && b.sortOrder == null) return -1;
    if (a.sortOrder == null && b.sortOrder != null) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Every category the app knows: the built-ins (overlaid by an admin's stored
 * edit of them, if any) plus the team's own, in display order. `stored` =
 * non-deleted rows (`rowToCategory`'d) from the database or the snapshot.
 */
export function mergeCategories(stored: readonly ObjectionCategory[] = []): ObjectionCategory[] {
  const byId = new Map(stored.map((c) => [c.id, c]));
  const builtIns = BUILT_IN_CATEGORIES.map((b) => {
    const edit = byId.get(b.id);
    return edit ? { ...edit, builtIn: true } : { ...b, knowledgeSlugs: [...b.knowledgeSlugs] };
  });
  const team = stored.filter((c) => isTeamCategoryId(c.id)).map((c) => ({ ...c, builtIn: false }));
  return sortCategories([...builtIns, ...team]);
}

/** French name when present, English otherwise (built-ins are localised by the consumer's catalogs). */
export function categoryName(c: Pick<ObjectionCategory, 'name' | 'nameFr'>, locale: string): string {
  return locale === 'fr' && c.nameFr ? c.nameFr : c.name;
}

// ─────────────────────────────────────────────────────────────────────────
// Category of an objection, and the knowledge a scenario uses
// ─────────────────────────────────────────────────────────────────────────

/**
 * The category id of an objection: the built-in mapping for a built-in id,
 * the stored `categoryId` for a team id (retired ones included). Null for
 * `custom` and for an id nothing knows.
 */
export function objectionCategoryId(
  objectionId: string | null | undefined,
  team: ReadonlyArray<{ id: string; categoryId: string }> = [],
): string | null {
  if (!objectionId) return null;
  if (objectionId in BUILT_IN_OBJECTION_CATEGORY) return BUILT_IN_OBJECTION_CATEGORY[objectionId];
  return team.find((o) => o.id === objectionId)?.categoryId ?? null;
}

export interface KnowledgeSelection {
  focusArea: string | null;
  knowledgeSlugs: string[];
}

/**
 * The knowledge a category gives its scenarios, or null when it has none
 * attached (then a scenario without its own choice reads the whole library,
 * exactly as before categories existed).
 */
export function categoryKnowledgeFor(
  objectionId: string | null | undefined,
  team: ReadonlyArray<{ id: string; categoryId: string }>,
  categories: readonly ObjectionCategory[],
): KnowledgeSelection | null {
  const id = objectionCategoryId(objectionId, team);
  if (!id) return null;
  const c = categories.find((x) => x.id === id);
  if (!c) return null;
  if (c.knowledgeSlugs.length === 0 && !c.focusArea) return null;
  return { focusArea: c.focusArea, knowledgeSlugs: [...c.knowledgeSlugs] };
}

/**
 * What a scenario actually reads: its OWN choice when it made one (specific
 * documents, else one topic), otherwise its category's knowledge, otherwise
 * nothing (= the whole library). The scenario's choice REPLACES the
 * category's — it never adds to it — so what an admin sees on the Knowledge
 * step is exactly what is retrieved.
 */
export function effectiveKnowledge(
  scenario: { focusArea?: string | null; knowledgeSlugs?: readonly string[] | null },
  category: KnowledgeSelection | null,
): KnowledgeSelection & { source: 'scenario' | 'category' | 'library' } {
  const ownSlugs = (scenario.knowledgeSlugs ?? []).filter((s) => typeof s === 'string' && s.trim());
  const ownFocus = scenario.focusArea?.trim() || null;
  if (ownSlugs.length > 0 || ownFocus) {
    return { focusArea: ownFocus, knowledgeSlugs: [...ownSlugs], source: 'scenario' };
  }
  if (category && (category.knowledgeSlugs.length > 0 || category.focusArea)) {
    return { focusArea: category.focusArea, knowledgeSlugs: [...category.knowledgeSlugs], source: 'category' };
  }
  return { focusArea: null, knowledgeSlugs: [], source: 'library' };
}

/**
 * Categories worth offering for an animal: those holding at least one VISIBLE
 * objection that applies to it. `objections` = the merged catalogue entries
 * (built-ins + team) with their `categoryId` and `species`.
 */
export function categoriesForSpecies(
  categories: readonly ObjectionCategory[],
  objections: ReadonlyArray<{ categoryId: string | null; species: readonly ScenarioSpecies[]; visible: boolean }>,
  species: unknown,
): ObjectionCategory[] {
  const s = speciesOf(species);
  const used = new Set(
    objections
      .filter((o) => o.visible && o.categoryId && o.species.includes(s))
      .map((o) => o.categoryId as string),
  );
  return categories.filter((c) => used.has(c.id));
}
