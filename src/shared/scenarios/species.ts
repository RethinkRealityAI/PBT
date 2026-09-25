// Scenario species — which animal a training scenario is about.
//
// Imported by BOTH admin/src (pickers, labels) and netlify/functions
// (validation, prompt building, retrieval scope) — keep this file
// dependency-free, like ./enums.ts.
//
// A scenario with NO species is a dog scenario: every row written before the
// Scenario Studio existed is about a dog, and the customer prompt said "dog"
// unconditionally. Code must treat `null` / `undefined` exactly like 'dog'
// (see `speciesOf`) so legacy scenarios keep their byte-identical prompts.

export type ScenarioSpecies = 'dog' | 'cat';

export const SCENARIO_SPECIES: readonly ScenarioSpecies[] = ['dog', 'cat'] as const;

export const SPECIES_LABELS: Record<ScenarioSpecies, string> = {
  dog: 'Dog',
  cat: 'Cat',
};

export function isScenarioSpecies(value: unknown): value is ScenarioSpecies {
  return value === 'dog' || value === 'cat';
}

/** Effective species: anything that isn't explicitly 'cat' is a dog. */
export function speciesOf(value: unknown): ScenarioSpecies {
  return value === 'cat' ? 'cat' : 'dog';
}

/**
 * Display label for a stored life stage. The stored vocabulary is shared by
 * both species (it is interpolated into prompts and validated server-side),
 * so a kitten is stored as `Puppy (<1)` and only *shown* as "Kitten (<1)".
 */
export function lifeStageLabel(stage: string | null | undefined, species: unknown): string {
  if (!stage) return '';
  if (speciesOf(species) === 'cat' && stage === 'Puppy (<1)') return 'Kitten (<1)';
  return stage;
}

/**
 * Knowledge-scope species key (`tags.species[]` in knowledge_chunks) for a
 * scenario. `undefined` when the scenario never declared a species — legacy
 * scenarios keep their un-scoped retrieval. A dog under one year maps to the
 * `puppy` scope (the knowledge vocabulary splits them); a kitten stays `cat`.
 */
export function retrievalSpeciesFor(
  species: unknown,
  lifeStage: string | null | undefined,
): 'dog' | 'puppy' | 'cat' | undefined {
  if (!isScenarioSpecies(species)) return undefined;
  if (species === 'cat') return 'cat';
  return lifeStage === 'Puppy (<1)' ? 'puppy' : 'dog';
}

/**
 * Quick-pick breed suggestions shown in the Studio. The breed field stays
 * free text (any breed is valid); these are only shortcuts.
 */
export const POPULAR_BREEDS: Record<ScenarioSpecies, readonly string[]> = {
  dog: [
    'Labrador Retriever',
    'Golden Retriever',
    'French Bulldog',
    'German Shepherd',
    'Miniature Schnauzer',
    'Poodle',
    'Dachshund',
    'Beagle',
    'Cavalier King Charles Spaniel',
    'Mixed breed',
  ],
  cat: [
    'Domestic Shorthair',
    'Domestic Longhair',
    'Maine Coon',
    'Persian',
    'Siamese',
    'Ragdoll',
    'British Shorthair',
    'Bengal',
    'Sphynx',
    'Mixed breed',
  ],
};

/** Plain-language weight hint for the optional weight field. */
export const TYPICAL_WEIGHT_HINT: Record<ScenarioSpecies, string> = {
  dog: 'Anything from ~2 kg (toy breeds) to 70+ kg (giant breeds).',
  cat: 'Most adult cats weigh 3.5–5.5 kg; large breeds like Maine Coons can reach 8–10 kg.',
};
