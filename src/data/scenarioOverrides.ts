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

export function seedScenarioId(index: number): string {
  return `seed:${index}`;
}

export function userScenarioId(uuid: string): string {
  return `user:${uuid}`;
}

export function isAdminScenarioId(id: string): boolean {
  return id.startsWith('admin:');
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

/** Resolve a `pushback_id` column to the real category. Unknown id → null. */
function asPushback(v: string | null | undefined): PushbackCategory | null {
  if (!v) return null;
  return PUSHBACK_CATEGORIES.find((p) => p.id === v) ?? null;
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
): Scenario {
  if (!override) return scenarioId ? { ...base, _overrideId: scenarioId } : base;
  return {
    ...base,
    breed: override.breed?.trim() || base.breed,
    age: asLifeStage(override.life_stage) ?? base.age,
    pushback: asPushback(override.pushback_id) ?? base.pushback,
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
 */
export function adminOverrideToScenario(
  override: ScenarioOverride,
): Scenario | null {
  const lifeStage = asLifeStage(override.life_stage);
  const driver = asDriver(override.suggested_driver);
  const pushback = asPushback(override.pushback_id);
  if (!override.breed || !lifeStage || !driver || !pushback) return null;
  return {
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
