/**
 * Scenario override application — merges a `scenario_overrides` row from the
 * admin dashboard onto a base Scenario before it's used for rendering or
 * AI prompt building. The base Scenario is always present; the override is
 * optional. Stable scenario_id strings:
 *   - Seed scenarios: `seed:<index>` (matches LIBRARY_SCENARIOS[i] order).
 *   - User-built scenarios: `user:<uuid>`.
 */
import type { Scenario, OwnerPersona, Difficulty } from './scenarios';
import type { ScenarioOverride } from '../services/flagsClient';

export function seedScenarioId(index: number): string {
  return `seed:${index}`;
}

export function userScenarioId(uuid: string): string {
  return `user:${uuid}`;
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
    _overrideId: scenarioId ?? base._overrideId,
  };
}
