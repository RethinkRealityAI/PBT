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
  Scenario,
} from './scenarios';
import { PUSHBACK_CATEGORIES } from './scenarios';
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

const LIFE_STAGES: LifeStage[] = [
  'Puppy (<1)',
  'Junior (1-3)',
  'Adult (3-7)',
  'Senior (7+)',
];

function asLifeStage(v: string | null | undefined): LifeStage | null {
  if (!v) return null;
  return (LIFE_STAGES as readonly string[]).includes(v) ? (v as LifeStage) : null;
}

function asDriver(v: string | null | undefined): DriverKey | null {
  if (!v) return null;
  return (DRIVER_KEYS as readonly string[]).includes(v) ? (v as DriverKey) : null;
}

const PERSONAS: OwnerPersona[] = [
  'Skeptical',
  'Anxious',
  'Busy',
  'Bargain-hunter',
  'Devoted',
];

function asPersona(v: string | null | undefined): OwnerPersona | null {
  if (!v) return null;
  return (PERSONAS as readonly string[]).includes(v) ? (v as OwnerPersona) : null;
}

function asDifficulty(n: number | null | undefined): Difficulty | null {
  if (n == null) return null;
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  return null;
}

export function applyScenarioOverride(
  base: Scenario,
  override: ScenarioOverride | null,
  scenarioId?: string,
): Scenario {
  if (!override) return scenarioId ? { ...base, _overrideId: scenarioId } : base;
  return {
    ...base,
    persona: asPersona(override.persona_override) ?? base.persona,
    difficulty: asDifficulty(override.difficulty_override) ?? base.difficulty,
    context: override.context_override?.trim() || base.context,
    openingLine: override.opening_line_override?.trim() || base.openingLine,
    pushbackNotes: override.pushback_notes?.trim() || base.pushbackNotes,
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
  const pushback = PUSHBACK_CATEGORIES.find((p) => p.id === override.pushback_id);
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
    weightKg:
      override.weight_kg != null ? String(override.weight_kg) : undefined,
    _overrideId: override.scenario_id,
  };
}
