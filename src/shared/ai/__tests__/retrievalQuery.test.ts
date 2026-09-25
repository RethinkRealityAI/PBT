/**
 * Scenario → retrieval targeting for dog / cat scenarios.
 *
 * The property that matters most: a scenario that never declared a species
 * (every legacy row) asks the knowledge base EXACTLY the question it always
 * asked — same query string, same filters, no species key. Only a scenario
 * that declares a species gets the HARD species scope.
 */
import { describe, expect, it } from 'vitest';
import { scenarioRetrievalFilters, scenarioRetrievalQuery } from '../retrievalQuery';
import { SEED_SCENARIOS, type Scenario } from '../../../data/scenarios';
import { buildScopeFilter, sanitizeFilters } from '../../../../netlify/functions/_shared/retrieval';
import { isKnowledgeSpeciesKey } from '../../knowledge/knowledgeScopes';

const dog: Scenario = SEED_SCENARIOS[0];

describe('scenarioRetrievalQuery', () => {
  it('keeps the historical string for a species-less scenario', () => {
    expect(scenarioRetrievalQuery(dog)).toBe(
      `${dog.pushback.title} ${dog.suggestedDriver} owner ${dog.breed} ${dog.age}`,
    );
  });

  it('an explicit dog is byte-identical to a species-less scenario', () => {
    expect(scenarioRetrievalQuery({ ...dog, species: 'dog' })).toBe(scenarioRetrievalQuery(dog));
  });

  it('names the animal for a cat scenario', () => {
    const cat: Scenario = { ...dog, species: 'cat', breed: 'Maine Coon', age: 'Adult (3-7)' };
    const q = scenarioRetrievalQuery(cat);
    expect(q).toBe(
      `${dog.pushback.title} ${dog.suggestedDriver} owner cat Maine Coon Adult (3-7)`,
    );
    expect(q).toMatch(/\bcat\b/);
    expect(q).not.toMatch(/\bdog\b/i);
  });

  it('ignores an unknown species value (treated as a dog)', () => {
    const odd = { ...dog, species: 'hamster' } as unknown as Scenario;
    expect(scenarioRetrievalQuery(odd)).toBe(scenarioRetrievalQuery(dog));
  });
});

describe('scenarioRetrievalFilters — species scope', () => {
  it('adds no species key for a legacy scenario (filters unchanged)', () => {
    expect(scenarioRetrievalFilters({ focusArea: 'gi', age: 'Adult (3-7)' })).toEqual({
      focus: 'gi',
    });
    expect(
      scenarioRetrievalFilters({ knowledgeSlugs: ['doc-1'], age: 'Puppy (<1)' }),
    ).toEqual({ docSlugs: ['doc-1'] });
    expect(scenarioRetrievalFilters({ age: 'Adult (3-7)' })).toBeUndefined();
    expect(scenarioRetrievalFilters(dog)?.species).toBeUndefined();
  });

  it('scopes a cat scenario to cat documents — kittens included', () => {
    expect(scenarioRetrievalFilters({ species: 'cat', age: 'Adult (3-7)' })).toEqual({
      species: 'cat',
    });
    expect(scenarioRetrievalFilters({ species: 'cat', age: 'Puppy (<1)' })).toEqual({
      species: 'cat',
    });
  });

  it('scopes an explicit dog by life stage (under one year → puppy)', () => {
    expect(scenarioRetrievalFilters({ species: 'dog', age: 'Senior (7+)' })).toEqual({
      species: 'dog',
    });
    expect(scenarioRetrievalFilters({ species: 'dog', age: 'Puppy (<1)' })).toEqual({
      species: 'puppy',
    });
  });

  it('keeps the targeting precedence and adds the scope alongside it', () => {
    expect(
      scenarioRetrievalFilters({
        species: 'cat',
        age: 'Senior (7+)',
        focusArea: 'weight',
        knowledgeSlugs: ['doc-1'],
      }),
    ).toEqual({ docSlugs: ['doc-1'], species: 'cat' });
    expect(
      scenarioRetrievalFilters({ species: 'cat', age: 'Senior (7+)', focusArea: 'urinary' }),
    ).toEqual({ focus: 'urinary', species: 'cat' });
  });

  it('never picks the tool — the caller owns it', () => {
    expect(scenarioRetrievalFilters({ species: 'cat', age: 'Adult (3-7)' })).not.toHaveProperty(
      'tool',
    );
  });

  it('every species it can emit survives the server sanitiser as a HARD scope', () => {
    for (const age of ['Puppy (<1)', 'Adult (3-7)'] as const) {
      for (const species of ['dog', 'cat'] as const) {
        const filters = { ...scenarioRetrievalFilters({ species, age }), tool: 'roleplay' };
        expect(isKnowledgeSpeciesKey(filters.species)).toBe(true);
        const clean = sanitizeFilters(filters);
        expect(clean.species).toBe(filters.species);
        expect(buildScopeFilter(clean)).toEqual({
          tools: ['roleplay'],
          species: [filters.species],
        });
      }
    }
  });
});
