// Objections — the catalogue of client pushbacks a scenario can be built on.
//
// Two kinds share one id space:
//   • BUILT-IN objections: the seven code-defined categories in ./enums.ts
//     (`cost`, `weight-denial`, …, `custom`). They ship with the app, have a
//     hand-written French overlay and a hand-written coaching taxonomy, and
//     apply to dogs and cats alike.
//   • TEAM objections: authored by admins in the Scenario Studio and stored in
//     `scenario_objections` (migration 20261012000000_scenario_objections.sql).
//     Their ids are `team:<slug>` so they can never collide with a built-in.
//     Each one says which animals it applies to, which knowledge topic it
//     belongs to, and (optionally) the coaching the AI customer and the trainee
//     hints draw on. A new subject area such as probiotics is added this way,
//     with no deploy.
//
// Imported by the consumer app, the admin app AND netlify/functions — keep it
// dependency-free (shared → shared imports only).
//
// Trust: every field here reaches the AI customer's prompt as DATA and is shown
// to trainees, so writes go through `validateObjectionInput` (server) and reads
// through `rowToTeamObjection` (tolerant: a malformed row is dropped, never
// rendered half-valid).

import { FOCUS_AREAS, isFocusAreaKey } from '../knowledge/focusAreas';
import { PUSHBACK_EXAMPLES, PUSHBACK_IDS, PUSHBACK_LABELS } from './enums';
import { SCENARIO_SPECIES, speciesOf, type ScenarioSpecies } from './species';

export const TEAM_OBJECTION_PREFIX = 'team:';

/** `team:` + a lowercase slug of 2–60 characters (letters, digits, hyphens). */
const TEAM_OBJECTION_ID_RE = /^team:[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/;

export const OBJECTION_LIMITS = {
  titleMax: 80,
  exampleMax: 300,
  /** Items per coaching list. */
  coachingItems: 6,
  coachingItemMax: 300,
  /** Hard ceiling on live (non-deleted) team objections. */
  maxTeamObjections: 100,
  sortOrderMax: 1_000_000,
} as const;

/**
 * The coaching lists, in the order the admin editor shows them. They mirror
 * `PushbackKnowledge` (src/data/knowledge/pushbackTaxonomy.ts) so a team
 * objection plugs into the same prompt slots as a built-in one.
 */
export const COACHING_KEYS = [
  'rootConcerns',
  'acknowledgePatterns',
  'clarifyQuestions',
  'takeActionPatterns',
  'watchOuts',
] as const;
export type CoachingKey = (typeof COACHING_KEYS)[number];
export type ObjectionCoaching = Partial<Record<CoachingKey, string[]>>;

export const COACHING_LABELS: Record<CoachingKey, { label: string; help: string }> = {
  rootConcerns: {
    label: 'What the owner is really worried about',
    help: 'The fear underneath the objection. The AI owner reveals these when the trainee asks good questions.',
  },
  acknowledgePatterns: {
    label: 'Good ways to acknowledge it',
    help: 'Shown to trainees as hints.',
  },
  clarifyQuestions: {
    label: 'Good questions to ask',
    help: 'Open questions that surface the real concern.',
  },
  takeActionPatterns: {
    label: 'Good next steps to offer',
    help: 'A specific, bounded recommendation and a follow-up.',
  },
  watchOuts: {
    label: 'Common mistakes',
    help: 'What staff tend to get wrong with this objection.',
  },
};

/** A team-authored objection, as the app and the server use it. */
export interface TeamObjection {
  id: string;
  /** Short name, e.g. "Probiotics: 'my dog doesn't need them'". */
  title: string;
  /** The owner's typical line, shown in pickers and used as the objection's example. */
  example: string;
  /** Optional Canadian-French versions; English is shown when absent. */
  titleFr: string | null;
  exampleFr: string | null;
  /** Animals this objection applies to. Never empty. */
  species: ScenarioSpecies[];
  /** Knowledge topic key (src/shared/knowledge/focusAreas.ts), or null. */
  focusArea: string | null;
  coaching: ObjectionCoaching;
  /** False = retired: kept so existing scenarios still play, hidden from pickers. */
  visible: boolean;
  sortOrder: number | null;
  updatedAt: string | null;
}

/** `scenario_objections` row (snake_case, as stored). */
export interface ScenarioObjectionRow {
  id: string;
  title: string;
  example: string;
  title_fr: string | null;
  example_fr: string | null;
  species: string[] | null;
  focus_area: string | null;
  coaching: unknown;
  visible: boolean;
  sort_order: number | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}

/** One entry of the merged catalogue (built-ins + team), English text. */
export interface CatalogObjection {
  id: string;
  title: string;
  example: string;
  titleFr: string | null;
  exampleFr: string | null;
  species: ScenarioSpecies[];
  focusArea: string | null;
  builtIn: boolean;
  visible: boolean;
}

/** What `admin-objections` GET returns per team objection. */
export interface AdminObjection extends TeamObjection {
  createdAt: string | null;
  deletedAt: string | null;
  /**
   * Non-deleted library scenarios using it, how many of those are live, and
   * how many trainees' own saved scenarios (`user_scenarios`) are built on it
   * — those don't block a delete (each trainee keeps a full local copy), but
   * the admin should know before deleting.
   */
  usage: { scenarios: number; live: number; trainee: number };
}

/** `admin-objections` POST bodies. */
export type ObjectionWriteRequest =
  | { op: 'upsert'; objection: unknown; baseUpdatedAt?: string | null }
  | { op: 'delete'; id: string }
  | { op: 'restore'; id: string };

// ─────────────────────────────────────────────────────────────────────────
// Ids
// ─────────────────────────────────────────────────────────────────────────

export function isTeamObjectionId(value: unknown): value is string {
  return typeof value === 'string' && TEAM_OBJECTION_ID_RE.test(value);
}

export function isBuiltInObjectionId(value: unknown): value is string {
  return typeof value === 'string' && PUSHBACK_IDS.includes(value);
}

/**
 * A fresh `team:` id from a title: lowercase ASCII slug (accents folded),
 * de-duplicated against `taken` with a numeric suffix. Never returns an id in
 * `taken`, and never a built-in id (those don't carry the prefix).
 */
export function objectionIdFromTitle(title: string, taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const slug =
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48)
      .replace(/-+$/g, '') || 'objection';
  const base = slug.length >= 2 ? slug : `${slug}-objection`;
  let id = `${TEAM_OBJECTION_PREFIX}${base}`;
  for (let n = 2; used.has(id); n += 1) id = `${TEAM_OBJECTION_PREFIX}${base}-${n}`;
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

function cleanSpecies(v: unknown): ScenarioSpecies[] {
  if (!Array.isArray(v)) return [];
  return SCENARIO_SPECIES.filter((s) => v.includes(s));
}

/** Trim, drop blanks and duplicates, cap the item count and length. */
export function cleanCoaching(v: unknown): ObjectionCoaching {
  const out: ObjectionCoaching = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  const src = v as Record<string, unknown>;
  for (const key of COACHING_KEYS) {
    const list = src[key];
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    const items: string[] = [];
    for (const item of list) {
      const s = cleanText(item, OBJECTION_LIMITS.coachingItemMax);
      if (!s || seen.has(s)) continue;
      seen.add(s);
      items.push(s);
      if (items.length >= OBJECTION_LIMITS.coachingItems) break;
    }
    if (items.length > 0) out[key] = items;
  }
  return out;
}

function cleanSortOrder(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return Math.max(-OBJECTION_LIMITS.sortOrderMax, Math.min(OBJECTION_LIMITS.sortOrderMax, n));
}

/**
 * Tolerant read of a stored row (or a snapshot entry, which is already
 * camelCase). Returns null for anything that can't be a usable objection —
 * the caller drops it rather than rendering half a card.
 */
export function rowToTeamObjection(raw: unknown): TeamObjection | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isTeamObjectionId(r.id)) return null;
  const title = cleanText(r.title, OBJECTION_LIMITS.titleMax);
  if (!title) return null;
  const species = cleanSpecies(r.species);
  if (species.length === 0) return null;
  const focus = r.focus_area ?? r.focusArea;
  return {
    id: r.id,
    title,
    example: cleanText(r.example, OBJECTION_LIMITS.exampleMax),
    titleFr: cleanOptional(r.title_fr ?? r.titleFr, OBJECTION_LIMITS.titleMax),
    exampleFr: cleanOptional(r.example_fr ?? r.exampleFr, OBJECTION_LIMITS.exampleMax),
    species,
    focusArea: isFocusAreaKey(focus) ? focus : null,
    coaching: cleanCoaching(r.coaching),
    visible: r.visible !== false,
    sortOrder: cleanSortOrder(r.sort_order ?? r.sortOrder),
    updatedAt: typeof (r.updated_at ?? r.updatedAt) === 'string' ? String(r.updated_at ?? r.updatedAt) : null,
  };
}

// The optional `never`-ish members let callers read `.error` / `.value` after
// an `ok` check: the repo compiles without `strictNullChecks`, where a
// boolean-literal discriminant does not narrow the union.
export type ObjectionValidation =
  | { ok: true; value: Omit<TeamObjection, 'updatedAt'>; error?: undefined }
  | { ok: false; error: string; value?: undefined };

/**
 * Strict validation for a WRITE. Unlike `rowToTeamObjection` it explains what
 * is wrong instead of silently dropping, because an admin is waiting on it.
 * `id` must already be a `team:` id (the server allocates one for a new
 * objection before calling this).
 */
export function validateObjectionInput(raw: unknown): ObjectionValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'objection must be an object' };
  }
  const r = raw as Record<string, unknown>;
  if (!isTeamObjectionId(r.id)) {
    return { ok: false, error: 'id must look like team:<lowercase-words>' };
  }
  if (typeof r.title !== 'string' || !r.title.trim()) {
    return { ok: false, error: 'Give the objection a short name.' };
  }
  if (r.title.trim().length > OBJECTION_LIMITS.titleMax) {
    return { ok: false, error: `The name is too long (max ${OBJECTION_LIMITS.titleMax} characters).` };
  }
  if (typeof r.example !== 'string' || !r.example.trim()) {
    return { ok: false, error: 'Add the line an owner would typically say.' };
  }
  if (r.example.trim().length > OBJECTION_LIMITS.exampleMax) {
    return { ok: false, error: `The owner's line is too long (max ${OBJECTION_LIMITS.exampleMax} characters).` };
  }
  for (const [key, max] of [
    ['titleFr', OBJECTION_LIMITS.titleMax],
    ['exampleFr', OBJECTION_LIMITS.exampleMax],
  ] as const) {
    const v = r[key];
    if (v != null && typeof v !== 'string') return { ok: false, error: `${key} must be text` };
    if (typeof v === 'string' && v.trim().length > max) {
      return { ok: false, error: `The French ${key === 'titleFr' ? 'name' : 'line'} is too long (max ${max} characters).` };
    }
  }
  const species = cleanSpecies(r.species);
  if (!Array.isArray(r.species) || species.length === 0 || species.length !== r.species.length) {
    return { ok: false, error: 'Choose which animals this objection applies to (dog, cat or both).' };
  }
  const focus = r.focusArea ?? null;
  if (focus !== null && !isFocusAreaKey(focus)) {
    return { ok: false, error: `Unknown knowledge topic "${String(focus)}".` };
  }
  if (r.coaching != null && (typeof r.coaching !== 'object' || Array.isArray(r.coaching))) {
    return { ok: false, error: 'coaching must be an object of lists' };
  }
  if (r.visible != null && typeof r.visible !== 'boolean') {
    return { ok: false, error: 'visible must be true or false' };
  }
  if (r.sortOrder != null && (typeof r.sortOrder !== 'number' || !Number.isFinite(r.sortOrder))) {
    return { ok: false, error: 'sortOrder must be a number' };
  }
  return {
    ok: true,
    value: {
      id: r.id,
      title: cleanText(r.title, OBJECTION_LIMITS.titleMax),
      example: cleanText(r.example, OBJECTION_LIMITS.exampleMax),
      titleFr: cleanOptional(r.titleFr, OBJECTION_LIMITS.titleMax),
      exampleFr: cleanOptional(r.exampleFr, OBJECTION_LIMITS.exampleMax),
      species,
      // Checked above: null or a known focus key.
      focusArea: focus as string | null,
      coaching: cleanCoaching(r.coaching),
      visible: r.visible !== false,
      sortOrder: cleanSortOrder(r.sortOrder),
    },
  };
}

/** The columns a write sets (server-managed columns excluded). */
export function teamObjectionToRow(
  o: Omit<TeamObjection, 'updatedAt'>,
): Pick<
  ScenarioObjectionRow,
  'id' | 'title' | 'example' | 'title_fr' | 'example_fr' | 'species' | 'focus_area' | 'coaching' | 'visible' | 'sort_order'
> {
  return {
    id: o.id,
    title: o.title,
    example: o.example,
    title_fr: o.titleFr,
    example_fr: o.exampleFr,
    species: [...o.species],
    focus_area: o.focusArea,
    coaching: o.coaching,
    visible: o.visible,
    sort_order: o.sortOrder,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────

/** Built-ins as catalogue entries (English; the consumer localises them). */
export function builtInObjections(): CatalogObjection[] {
  return PUSHBACK_IDS.map((id) => ({
    id,
    title: PUSHBACK_LABELS[id] ?? id,
    example: PUSHBACK_EXAMPLES[id] ?? '',
    titleFr: null,
    exampleFr: null,
    species: [...SCENARIO_SPECIES],
    focusArea: null,
    builtIn: true,
    visible: true,
  }));
}

export function teamToCatalog(o: TeamObjection): CatalogObjection {
  return {
    id: o.id,
    title: o.title,
    example: o.example,
    titleFr: o.titleFr,
    exampleFr: o.exampleFr,
    species: [...o.species],
    focusArea: o.focusArea,
    builtIn: false,
    visible: o.visible,
  };
}

/** Team objections ordered for display: sort_order first, then by name. */
export function sortTeamObjections<T extends Pick<TeamObjection, 'sortOrder' | 'title'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.sortOrder != null && b.sortOrder != null && a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.sortOrder != null && b.sortOrder == null) return -1;
    if (a.sortOrder == null && b.sortOrder != null) return 1;
    return a.title.localeCompare(b.title);
  });
}

/**
 * Built-ins (minus `custom`, which every picker shows separately as "Other")
 * followed by the team's objections. `includeHidden` keeps retired team
 * objections — needed to RESOLVE a saved scenario, never to offer a choice.
 */
export function objectionCatalog(
  team: readonly TeamObjection[],
  opts: { includeHidden?: boolean; includeCustom?: boolean } = {},
): CatalogObjection[] {
  const builtIns = builtInObjections().filter((o) => opts.includeCustom || o.id !== 'custom');
  const teamEntries = sortTeamObjections(team)
    .filter((o) => opts.includeHidden || o.visible)
    .map(teamToCatalog);
  return [...builtIns, ...teamEntries];
}

export function objectionAppliesTo(o: { species: readonly string[] }, species: unknown): boolean {
  return o.species.includes(speciesOf(species));
}

/** A built-in id, or a team id present in `teamIds`. */
export function isKnownObjectionId(value: unknown, teamIds: Iterable<string> = []): value is string {
  if (isBuiltInObjectionId(value)) return true;
  if (!isTeamObjectionId(value)) return false;
  for (const id of teamIds) if (id === value) return true;
  return false;
}

/** French text when present, English otherwise. */
export function objectionText(
  o: Pick<CatalogObjection, 'title' | 'example' | 'titleFr' | 'exampleFr'>,
  locale: string,
): { title: string; example: string } {
  if (locale === 'fr') {
    return { title: o.titleFr || o.title, example: o.exampleFr || o.example };
  }
  return { title: o.title, example: o.example };
}

/**
 * The coaching of a team objection shaped like a `PushbackKnowledge` partial,
 * so the server can merge it into `SimulationConfig.pushbacks` and the
 * existing prompt builders resolve it like any built-in. The owner's line
 * doubles as the first example phrasing.
 */
export function teamObjectionKnowledge(o: TeamObjection): {
  id: string;
  title: string;
  examples: string[];
  rootConcerns: string[];
  acknowledgePatterns: string[];
  clarifyQuestions: string[];
  takeActionPatterns: string[];
  watchOuts: string[];
} {
  return {
    id: o.id,
    title: o.title,
    examples: o.example ? [o.example] : [],
    rootConcerns: o.coaching.rootConcerns ?? [],
    acknowledgePatterns: o.coaching.acknowledgePatterns ?? [],
    clarifyQuestions: o.coaching.clarifyQuestions ?? [],
    takeActionPatterns: o.coaching.takeActionPatterns ?? [],
    watchOuts: o.coaching.watchOuts ?? [],
  };
}

/** Human label for a focus key (display only). */
export function topicLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return FOCUS_AREAS.find((f) => f.key === key)?.label ?? null;
}

/** The pushback a scenario carries: English text, plus French when the team wrote it. */
export interface ResolvedObjection {
  id: string;
  title: string;
  example: string;
  titleFr?: string;
  exampleFr?: string;
}

/**
 * Resolve a stored pushback id to the pushback a scenario carries. Built-ins
 * resolve from the code; team ids resolve from `team` — retired (hidden) ones
 * included, because a scenario built on a retired objection must still play.
 * Null for an unknown id: the caller drops the scenario rather than playing it
 * with a made-up objection. ONE implementation for the consumer
 * (`adminOverrideToScenario`) and the server/admin (`draftToScenario`) so the
 * two stay in parity.
 */
export function resolveObjection(
  id: string | null | undefined,
  team: readonly TeamObjection[] = [],
): ResolvedObjection | null {
  if (!id) return null;
  if (isBuiltInObjectionId(id)) {
    return { id, title: PUSHBACK_LABELS[id] ?? id, example: PUSHBACK_EXAMPLES[id] ?? '' };
  }
  if (!isTeamObjectionId(id)) return null;
  const o = team.find((t) => t.id === id);
  if (!o) return null;
  return {
    id: o.id,
    title: o.title,
    example: o.example,
    ...(o.titleFr ? { titleFr: o.titleFr } : {}),
    ...(o.exampleFr ? { exampleFr: o.exampleFr } : {}),
  };
}
