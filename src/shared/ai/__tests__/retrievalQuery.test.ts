/**
 * Scenario → retrieval targeting for dog / cat scenarios.
 *
 * The property that matters most: a scenario that never declared a species
 * (every legacy row) asks the knowledge base EXACTLY the question it always
 * asked — same query string, same filters, no species key. Only a scenario
 * that declares a species gets the HARD species scope.
 */
import { describe, expect, it } from 'vitest';
import {
  CUSTOM_NOTES_QUERY_CHARS,
  scenarioRetrievalFilters,
  scenarioRetrievalQuery,
} from '../retrievalQuery';
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

describe('scenarioRetrievalQuery — "Other pushback" asks about what the owner said', () => {
  const custom: Scenario = {
    ...dog,
    pushback: { id: 'custom', title: 'Other pushback', example: '' },
  };

  it('uses the notes, not the generic title, so a probiotics objection finds probiotics documents', () => {
    const q = scenarioRetrievalQuery({
      ...custom,
      pushbackNotes: '  Thinks   probiotics\nare a fad and his dog\'s gut is fine.  ',
    });
    expect(q).toBe(
      `Thinks probiotics are a fad and his dog's gut is fine. ${dog.suggestedDriver} owner ${dog.breed} ${dog.age}`,
    );
    expect(q).not.toContain('Other pushback');
  });

  it('caps the notes it uses', () => {
    const q = scenarioRetrievalQuery({ ...custom, pushbackNotes: 'word '.repeat(200) });
    const topic = q.slice(0, q.indexOf(` ${dog.suggestedDriver} owner`));
    expect(topic.length).toBeLessThanOrEqual(CUSTOM_NOTES_QUERY_CHARS);
    expect(CUSTOM_NOTES_QUERY_CHARS).toBe(160);
  });

  it('names the animal for a cat, as for any other pushback', () => {
    expect(
      scenarioRetrievalQuery({ ...custom, species: 'cat', breed: 'Persian', pushbackNotes: 'Raw food only' }),
    ).toBe(`Raw food only ${dog.suggestedDriver} owner cat Persian ${dog.age}`);
  });

  it('keeps the title without notes, and every other pushback keeps its title even with notes', () => {
    expect(scenarioRetrievalQuery({ ...custom, pushbackNotes: '   ' })).toBe(
      `Other pushback ${dog.suggestedDriver} owner ${dog.breed} ${dog.age}`,
    );
    expect(scenarioRetrievalQuery({ ...dog, pushbackNotes: 'Owner is on a fixed income.' })).toBe(
      scenarioRetrievalQuery(dog),
    );
  });
});

describe('scenarioRetrievalFilters — species scope', () => {
  it('scopes a legacy (species-less) scenario as the dog it is — puppy under one year', () => {
    expect(scenarioRetrievalFilters({ focusArea: 'gi', age: 'Adult (3-7)' })).toEqual({
      focus: 'gi',
      species: 'dog',
    });
    expect(
      scenarioRetrievalFilters({ knowledgeSlugs: ['doc-1'], age: 'Puppy (<1)' }),
    ).toEqual({ docSlugs: ['doc-1'], species: 'puppy' });
    // Absent = dog: a species-less scenario is scoped to dog knowledge, so a
    // cat-only document can never ground it (the scope is HARD both ways).
    expect(scenarioRetrievalFilters({ age: 'Adult (3-7)' })).toEqual({ species: 'dog' });
    expect(scenarioRetrievalFilters(dog).species).toBe('dog');
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

describe('scenarioRetrievalFilters — category knowledge', () => {
  const category = { focusArea: 'gi', knowledgeSlugs: ['custom:probiotics-monograph'] };

  it('a scenario with no knowledge of its own reads its category’s documents', () => {
    expect(scenarioRetrievalFilters({ age: 'Adult (3-7)' }, { categoryKnowledge: category })).toEqual({
      docSlugs: ['custom:probiotics-monograph'],
      inheritedDocs: true,
      species: 'dog',
    });
    expect(
      scenarioRetrievalFilters({ age: 'Adult (3-7)' }, { categoryKnowledge: { focusArea: 'gi', knowledgeSlugs: [] } }),
    ).toEqual({ focus: 'gi', species: 'dog' });
  });

  it('only INHERITED documents are soft — a scenario’s own documents never are', () => {
    expect(
      scenarioRetrievalFilters(
        { knowledgeSlugs: ['study:own'], age: 'Adult (3-7)' },
        { categoryKnowledge: category },
      ),
    ).toEqual({ docSlugs: ['study:own'], species: 'dog' });
  });

  it('the scenario’s own choice replaces the category’s', () => {
    expect(
      scenarioRetrievalFilters({ focusArea: 'weight', age: 'Adult (3-7)' }, { categoryKnowledge: category }),
    ).toEqual({ focus: 'weight', species: 'dog' });
  });

  it('without category knowledge nothing changes (every existing scenario)', () => {
    expect(scenarioRetrievalFilters({ age: 'Adult (3-7)' })).toEqual({ species: 'dog' });
    expect(scenarioRetrievalFilters({ age: 'Adult (3-7)' }, { categoryKnowledge: null })).toEqual({ species: 'dog' });
  });
});
