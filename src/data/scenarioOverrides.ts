/**
 * Scenario override application — merges a `scenario_overrides` row from the
 * admin dashboard onto a base Scenario before it's used for rendering or
 * AI prompt building. The base Scenario is always present; the override is
 * optional. Stable scenario_id strings:
 *   - Seed scenarios: `seed:<index>` (matches LIBRARY_SCENARIOS[i] order).
 *   - User-built scenarios: `user:<uuid>`.
 */
import type {
  LifeStage,
  OwnerPersona,
  Difficulty,
  PushbackCategory,
  Scenario,
} from './scenarios';
import {
  LIFE_STAGES,
  OWNER_PERSONAS,
  PUSHBACK_CATEGORIES,
} from './scenarios';
import type { ScenarioOverride } from '../services/flagsClient';
import type { DriverKey } from '../design-system/tokens';
import { DRIVER_KEYS } from '../design-system/tokens';
import { isScenarioSpecies, type ScenarioSpecies } from '../shared/scenarios/species';
import {
  resolveObjection,
  rowToTeamObjection,
  type TeamObjection,
} from '../shared/scenarios/objections';
import { rowToCategory, type ObjectionCategory } from '../shared/scenarios/objectionCategories';

export function seedScenarioId(index: number): string {
  return `seed:${index}`;
}

export function userScenarioId(uuid: string): string {
  return `user:${uuid}`;
}

export function isAdminScenarioId(id: string): boolean {
  return id.startsWith('admin:');
}

/**
 * Tolerant read of `snapshot.objections` (team-authored objections): anything
 * that isn't a usable team objection is dropped (never rendered half-valid),
 * and an absent list (an older server, or the migration not applied) is
 * simply none.
 */
export function teamObjectionsFromSnapshot(raw: unknown): TeamObjection[] {
  if (!Array.isArray(raw)) return [];
  const out: TeamObjection[] = [];
  for (const entry of raw) {
    const objection = rowToTeamObjection(entry);
    if (objection) out.push(objection);
  }
  return out;
}

/**
 * Tolerant read of `snapshot.objectionCategories` — the STORED categories
 * (team categories + admin edits of the built-ins). Unusable entries are
 * dropped; an absent list is none. Always merge the result with the code's
 * built-ins (`mergeCategories`) before use.
 */
export function objectionCategoriesFromSnapshot(raw: unknown): ObjectionCategory[] {
  if (!Array.isArray(raw)) return [];
  const out: ObjectionCategory[] = [];
  for (const entry of raw) {
    const category = rowToCategory(entry);
    if (category) out.push(category);
  }
  return out;
}

function asLifeStage(v: string | null | undefined): LifeStage | null {
  if (!v) return null;
  return (LIFE_STAGES as readonly string[]).includes(v) ? (v as LifeStage) : null;
}

function asDriver(v: string | null | undefined): DriverKey | null {
  if (!v) return null;
  return (DRIVER_KEYS as readonly string[]).includes(v) ? (v as DriverKey) : null;
}

function asPersona(v: string | null | undefined): OwnerPersona | null {
  if (!v) return null;
  return (OWNER_PERSONAS as readonly string[]).includes(v)
    ? (v as OwnerPersona)
    : null;
}

function asDifficulty(n: number | null | undefined): Difficulty | null {
  if (n == null) return null;
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

/**
 * Resolve a `pushback_id` column to the real category. Unknown id → null.
 *
 * Goes through the shared `resolveObjection` — the ONE resolver the Studio's
 * `draftToScenario` uses too — so a built-in id and a team objection
 * (`team:<slug>`, retired ones included) resolve identically on both sides.
 * A built-in hands back its canonical `PUSHBACK_CATEGORIES` entry (same text
 * as the shared labels; the object identity is kept for callers that compare
 * against the base scenario's category).
 */
function asPushback(
  v: string | null | undefined,
  teamObjections: readonly TeamObjection[],
): PushbackCategory | null {
  const resolved = resolveObjection(v, teamObjections);
  if (!resolved) return null;
  return PUSHBACK_CATEGORIES.find((p) => p.id === resolved.id) ?? resolved;
}

/**
 * True when an override names a pushback this client cannot resolve (a team
 * objection that was deleted, or one a stale snapshot doesn't carry yet).
 * `applyScenarioOverride` would otherwise fall back to the BASE scenario's
 * pushback while keeping the override's backstory, notes and opening line —
 * written for the other objection — so a trainee would play "Cost" with a
 * probiotics story. Callers hide such a scenario instead (the admin side,
 * `draftToScenario`, refuses the same draft, so both sides agree).
 */
export function overridePushbackUnresolvable(
  override: ScenarioOverride | null,
  teamObjections: readonly TeamObjection[] = [],
): boolean {
  const id = override?.pushback_id;
  if (!id) return false;
  return resolveObjection(id, teamObjections) === null;
}

/**
 * `weight_kg` is stored numeric but `Scenario.weightKg` is the string the
 * builder's text input produces. Non-finite / non-positive values are junk,
 * not "0 kg" — fall back to the base rather than showing nonsense.
 */
function asWeightKg(n: number | null | undefined): string | null {
  if (n == null) return null;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return String(n);
}

/**
 * `species` arrives only once migration 20260925000000_scenario_species.sql
 * is applied, and is plain text — anything but 'dog' | 'cat' is ignored.
 */
function asSpecies(v: string | null | undefined): ScenarioSpecies | null {
  return isScenarioSpecies(v) ? v : null;
}

/**
 * `knowledge_slugs` is jsonb — trust nothing about its shape. Returns
 * undefined (not []) when there is nothing usable, so callers can treat
 * "no explicit attachment" as a single falsy check.
 */
function asKnowledgeSlugs(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const slugs = v.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
  return slugs.length ? slugs : undefined;
}

/**
 * Merge an override row onto a base Scenario.
 *
 * EVERY editable column is honoured, not just the prose ones: the admin
 * Scenario Builder lets you retype a seed scenario's breed, life stage,
 * pushback category, driver and weight, and those edits used to be accepted,
 * saved, and then silently dropped here — the consumer kept playing the
 * hardcoded seed. Each field independently falls back to the base when the
 * column is null or holds a value we can't resolve (unknown pushback id,
 * retired driver key, …), so a bad row degrades one field instead of
 * removing the scenario.
 */
export function applyScenarioOverride(
  base: Scenario,
  override: ScenarioOverride | null,
  scenarioId?: string,
  teamObjections: readonly TeamObjection[] = [],
): Scenario {
  if (!override) return scenarioId ? { ...base, _overrideId: scenarioId } : base;
  // Only a scenario that HAS a species gets the key: a legacy row merged onto
  // a legacy base stays key-for-key the object it always was.
  const species = asSpecies(override.species) ?? base.species;
  return {
    ...base,
    ...(species ? { species } : {}),
    breed: override.breed?.trim() || base.breed,
    age: asLifeStage(override.life_stage) ?? base.age,
    pushback: asPushback(override.pushback_id, teamObjections) ?? base.pushback,
    suggestedDriver: asDriver(override.suggested_driver) ?? base.suggestedDriver,
    weightKg: asWeightKg(override.weight_kg) ?? base.weightKg,
    persona: asPersona(override.persona_override) ?? base.persona,
    difficulty: asDifficulty(override.difficulty_override) ?? base.difficulty,
    context: override.context_override?.trim() || base.context,
    openingLine: override.opening_line_override?.trim() || base.openingLine,
    pushbackNotes: override.pushback_notes?.trim() || base.pushbackNotes,
    focusArea: override.focus_area?.trim() || base.focusArea,
    knowledgeSlugs: asKnowledgeSlugs(override.knowledge_slugs) ?? base.knowledgeSlugs,
    _overrideId: scenarioId ?? base._overrideId,
  };
}

/**
 * Build a runtime Scenario from an `admin:<uuid>` override row. The row
 * itself must contain every required scenario field — validation in the
 * Netlify function enforces this so a malformed admin scenario can't reach
 * the consumer.
 *
 * Returns null if the row is missing required fields (graceful skip rather
 * than crash). The caller then drops it from the resolved library.
 *
 * `teamObjections` = the team-authored objections from the flags snapshot
 * (`snapshot.objections`, retired ones included). A row built on a team
 * objection the snapshot doesn't carry (deleted, or an older server) is
 * dropped like any unknown pushback.
 */
export function adminOverrideToScenario(
  override: ScenarioOverride,
  teamObjections: readonly TeamObjection[] = [],
): Scenario | null {
  const lifeStage = asLifeStage(override.life_stage);
  const driver = asDriver(override.suggested_driver);
  const pushback = asPushback(override.pushback_id, teamObjections);
  if (!override.breed || !lifeStage || !driver || !pushback) return null;
  const species = asSpecies(override.species);
  return {
    ...(species ? { species } : {}),
    breed: override.breed,
    age: lifeStage,
    persona: asPersona(override.persona_override) ?? 'Skeptical',
    difficulty: asDifficulty(override.difficulty_override) ?? 2,
    context: override.context_override?.trim() || undefined,
    pushback,
    pushbackNotes: override.pushback_notes?.trim() || undefined,
    suggestedDriver: driver,
    openingLine: override.opening_line_override?.trim() || undefined,
    weightKg: asWeightKg(override.weight_kg) ?? undefined,
    focusArea: override.focus_area?.trim() || undefined,
    knowledgeSlugs: asKnowledgeSlugs(override.knowledge_slugs),
    _overrideId: override.scenario_id,
  };
}
