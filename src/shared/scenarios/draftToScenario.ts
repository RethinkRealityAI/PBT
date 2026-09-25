// Build a runtime `Scenario` (what the AI functions consume) from a
// Studio draft — a fully hydrated `scenario_overrides`-shaped row.
//
// This is the admin-side twin of the consumer's `adminOverrideToScenario`
// (src/data/scenarioOverrides.ts) — same required fields, same defaults,
// same coercions — but built on the dependency-free shared vocabularies so
// the admin bundle and the Netlify Functions never import consumer data
// modules. `src/shared/scenarios/__tests__/draftToScenario.test.ts` pins the
// two against each other so they cannot drift.
//
// Only TYPES are imported from src/data — they are erased at build time.
import type { Difficulty, LifeStage, OwnerPersona, Scenario } from '../../data/scenarios';
import type { DriverKey } from '../../design-system/tokens';
import {
  PUSHBACK_EXAMPLES,
  PUSHBACK_LABELS,
  isLifeStage,
  isPersona,
  isPushbackId,
} from './enums';
import { isScenarioSpecies, type ScenarioSpecies } from './species';

const DRIVERS: readonly string[] = ['Activator', 'Energizer', 'Analyzer', 'Harmonizer'];

/** The draft fields this reads. `Partial<ScenarioOverrideRow>` satisfies it. */
export interface ScenarioDraftLike {
  scenario_id?: string | null;
  species?: string | null;
  breed?: string | null;
  life_stage?: string | null;
  pushback_id?: string | null;
  pushback_notes?: string | null;
  suggested_driver?: string | null;
  persona_override?: string | null;
  difficulty_override?: number | null;
  context_override?: string | null;
  opening_line_override?: string | null;
  weight_kg?: number | null;
  focus_area?: string | null;
  knowledge_slugs?: unknown;
}

/** Human labels of the fields a draft still needs before it can run. */
export function missingScenarioFields(draft: ScenarioDraftLike): string[] {
  const out: string[] = [];
  if (!draft.breed?.trim()) out.push('Breed');
  if (!isLifeStage(draft.life_stage)) out.push('Life stage');
  if (!isPushbackId(draft.pushback_id)) out.push('Pushback');
  if (!draft.suggested_driver || !DRIVERS.includes(draft.suggested_driver)) {
    out.push('ECHO driver');
  }
  return out;
}

function asWeightKg(n: number | null | undefined): string | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return undefined;
  return String(n);
}

function asKnowledgeSlugs(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const slugs = v.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
  return slugs.length ? slugs : undefined;
}

/**
 * The Scenario a draft would run as, or null when a required field is
 * missing (see `missingScenarioFields`). Optional fields fall back exactly
 * like `adminOverrideToScenario`: persona → Skeptical, difficulty → 2.
 * `species` is set only when the draft declares a valid one — an absent
 * species keeps the legacy (dog) prompt byte-identical.
 */
export function draftToScenario(draft: ScenarioDraftLike): Scenario | null {
  if (missingScenarioFields(draft).length > 0) return null;
  const pushbackId = draft.pushback_id as string;
  const difficulty = draft.difficulty_override;
  const scenario: Scenario = {
    breed: (draft.breed as string).trim(),
    age: draft.life_stage as LifeStage,
    persona: (isPersona(draft.persona_override) ? draft.persona_override : 'Skeptical') as OwnerPersona,
    difficulty: (difficulty === 1 || difficulty === 2 || difficulty === 3 || difficulty === 4
      ? difficulty
      : 2) as Difficulty,
    context: draft.context_override?.trim() || undefined,
    pushback: {
      id: pushbackId,
      title: PUSHBACK_LABELS[pushbackId],
      example: PUSHBACK_EXAMPLES[pushbackId],
    },
    pushbackNotes: draft.pushback_notes?.trim() || undefined,
    suggestedDriver: draft.suggested_driver as DriverKey,
    openingLine: draft.opening_line_override?.trim() || undefined,
    weightKg: asWeightKg(draft.weight_kg),
    focusArea: draft.focus_area?.trim() || undefined,
    knowledgeSlugs: asKnowledgeSlugs(draft.knowledge_slugs),
    _overrideId: draft.scenario_id ?? undefined,
  };
  if (isScenarioSpecies(draft.species)) scenario.species = draft.species as ScenarioSpecies;
  return scenario;
}
