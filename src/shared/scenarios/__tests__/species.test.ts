/**
 * Scenario species helpers — the one place "absent means dog" is decided.
 */
import { describe, expect, it } from 'vitest';
import {
  POPULAR_BREEDS,
  SCENARIO_SPECIES,
  SPECIES_LABELS,
  TYPICAL_WEIGHT_HINT,
  isScenarioSpecies,
  lifeStageLabel,
  retrievalSpeciesFor,
  speciesOf,
} from '../species';
import { LIFE_STAGES } from '../enums';
import { isKnowledgeSpeciesKey } from '../../knowledge/knowledgeScopes';

const JUNK: unknown[] = [undefined, null, '', 'Cat', 'DOG', 'hamster', 0, 1, true, {}, ['cat']];

describe('isScenarioSpecies', () => {
  it('accepts exactly dog and cat', () => {
    for (const s of SCENARIO_SPECIES) expect(isScenarioSpecies(s)).toBe(true);
    for (const v of JUNK) expect(isScenarioSpecies(v), String(v)).toBe(false);
  });
});

describe('speciesOf', () => {
  it('is cat only for an explicit cat — everything else is a dog', () => {
    expect(speciesOf('cat')).toBe('cat');
    expect(speciesOf('dog')).toBe('dog');
    for (const v of JUNK) expect(speciesOf(v), String(v)).toBe('dog');
  });
});

describe('lifeStageLabel', () => {
  it('is the identity for dogs and for an absent species', () => {
    for (const stage of LIFE_STAGES) {
      expect(lifeStageLabel(stage, 'dog')).toBe(stage);
      expect(lifeStageLabel(stage, undefined)).toBe(stage);
      expect(lifeStageLabel(stage, null)).toBe(stage);
    }
  });

  it('shows a cat under one year as a kitten, and nothing else changes', () => {
    expect(lifeStageLabel('Puppy (<1)', 'cat')).toBe('Kitten (<1)');
    for (const stage of LIFE_STAGES.filter((s) => s !== 'Puppy (<1)')) {
      expect(lifeStageLabel(stage, 'cat')).toBe(stage);
    }
  });

  it('returns an empty string for a missing stage', () => {
    expect(lifeStageLabel(null, 'cat')).toBe('');
    expect(lifeStageLabel(undefined, 'dog')).toBe('');
    expect(lifeStageLabel('', 'cat')).toBe('');
  });
});

describe('retrievalSpeciesFor', () => {
  it('is undefined when the scenario never declared a species (legacy retrieval)', () => {
    for (const v of JUNK) {
      expect(retrievalSpeciesFor(v, 'Adult (3-7)'), String(v)).toBeUndefined();
      expect(retrievalSpeciesFor(v, 'Puppy (<1)'), String(v)).toBeUndefined();
    }
  });

  it('maps a young dog to the puppy scope and a cat of any age to cat', () => {
    expect(retrievalSpeciesFor('dog', 'Puppy (<1)')).toBe('puppy');
    expect(retrievalSpeciesFor('dog', 'Adult (3-7)')).toBe('dog');
    expect(retrievalSpeciesFor('dog', null)).toBe('dog');
    expect(retrievalSpeciesFor('cat', 'Puppy (<1)')).toBe('cat');
    expect(retrievalSpeciesFor('cat', 'Senior (7+)')).toBe('cat');
  });

  it('only ever emits keys of the knowledge-scope vocabulary', () => {
    for (const species of SCENARIO_SPECIES) {
      for (const stage of LIFE_STAGES) {
        expect(isKnowledgeSpeciesKey(retrievalSpeciesFor(species, stage))).toBe(true);
      }
    }
  });
});

describe('studio vocabularies', () => {
  it('cover every species', () => {
    for (const species of SCENARIO_SPECIES) {
      expect(SPECIES_LABELS[species].trim()).not.toBe('');
      expect(TYPICAL_WEIGHT_HINT[species].trim()).not.toBe('');
      expect(POPULAR_BREEDS[species].length).toBeGreaterThan(0);
      expect(new Set(POPULAR_BREEDS[species]).size).toBe(POPULAR_BREEDS[species].length);
    }
  });
});
