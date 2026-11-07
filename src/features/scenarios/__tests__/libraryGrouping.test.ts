import { describe, expect, it } from 'vitest';
import { LIBRARY_SCENARIOS, PUSHBACK_CATEGORIES, type Scenario } from '../../../data/scenarios';
import type { ResolvedScenario } from '../../../data/useResolvedScenarios';
import { mergeCategories, type ObjectionCategory } from '../../../shared/scenarios/objectionCategories';
import type { TeamObjection } from '../../../shared/scenarios/objections';
import { buildTrainingCategories, buildTrainingObjections } from '../useObjectionCatalog';
import {
  OTHER_GROUP,
  libraryForAnimal,
  libraryGroupOf,
  libraryGroups,
  libraryHasBothAnimals,
  libraryObjectionFilters,
  scenariosInGroup,
} from '../libraryGrouping';

const pushback = (id: string) => PUSHBACK_CATEGORIES.find((p) => p.id === id)!;

const GI: ObjectionCategory = {
  id: 'category:gi',
  name: 'Digestive health',
  nameFr: null,
  description: '',
  focusArea: null,
  knowledgeSlugs: [],
  sortOrder: 40,
  builtIn: false,
  updatedAt: null,
};
/** A category with nothing in it — never shown. */
const EMPTY: ObjectionCategory = { ...GI, id: 'category:empty', name: 'Empty', sortOrder: 5 };
const PROBIOTICS: TeamObjection = {
  id: 'team:probiotics',
  title: 'Probiotics',
  example: '',
  titleFr: null,
  exampleFr: null,
  species: ['dog', 'cat'],
  categoryId: 'category:gi',
  coaching: {},
  coachingFr: {},
  visible: true,
  sortOrder: null,
  updatedAt: null,
};
/** Filed under a category this snapshot doesn't carry → "Other". */
const ORPHAN: TeamObjection = { ...PROBIOTICS, id: 'team:orphan', title: 'Orphan', categoryId: 'category:gone' };
const TEAM = [PROBIOTICS, ORPHAN];
const CATEGORIES = buildTrainingCategories(mergeCategories([GI, EMPTY]), 'en');
const CATALOGUE = buildTrainingObjections(TEAM, 'en');

let n = 0;
function item(pushbackId: string, species?: 'cat'): ResolvedScenario {
  const team = TEAM.find((o) => o.id === pushbackId);
  const scenario: Scenario = {
    ...LIBRARY_SCENARIOS[0],
    ...(species ? { species } : {}),
    pushback: team ? { id: team.id, title: team.title, example: '' } : pushback(pushbackId),
  };
  n += 1;
  return { scenario, scenarioId: `admin:${n}`, override: null };
}

describe('libraryGroups', () => {
  const items = [
    item('cost'),
    item('brand-switch'),
    item('weight-denial'),
    item('team:probiotics'),
    item('custom'),
    item('team:orphan'),
  ];

  it('lists only areas with scenarios, in category order, Other last, with icons and counts', () => {
    expect(libraryGroups(items, TEAM, CATEGORIES, 'Other pushback')).toEqual([
      { id: 'everyday-nutrition', label: 'Everyday nutrition', icon: 'bowl', count: 2 },
      { id: 'weight', label: 'Weight management', icon: 'scale', count: 1 },
      { id: 'category:gi', label: 'Digestive health', icon: 'sprout', count: 1 },
      { id: OTHER_GROUP, label: 'Other pushback', icon: 'message', count: 2 },
    ]);
  });

  it('files "Other pushback" and an objection in an unknown category together', () => {
    expect(libraryGroupOf(items[4], TEAM, CATEGORIES)).toBe(OTHER_GROUP);
    expect(libraryGroupOf(items[5], TEAM, CATEGORIES)).toBe(OTHER_GROUP);
    expect(scenariosInGroup(items, OTHER_GROUP, TEAM, CATEGORIES)).toHaveLength(2);
  });

  it('has no Other group when nothing falls outside the categories', () => {
    expect(libraryGroups(items.slice(0, 3), TEAM, CATEGORIES, 'Other').map((g) => g.id)).toEqual([
      'everyday-nutrition',
      'weight',
    ]);
  });
});

describe('libraryObjectionFilters', () => {
  it('names each objection once, ordered like the catalogue, "Other" and unknown last', () => {
    const list = [item('team:orphan'), item('custom'), item('brand-switch'), item('cost'), item('cost')];
    expect(libraryObjectionFilters(list, CATALOGUE, 'en').map((f) => f.id)).toEqual([
      'cost',
      'brand-switch',
      'team:orphan',
      'custom',
    ]);
  });
});

describe('the animal rule', () => {
  const dogs = [item('cost'), item('weight-denial')];
  const cat = item('team:probiotics', 'cat');

  it('offers a choice only when both animals have scenarios', () => {
    expect(libraryHasBothAnimals(dogs)).toBe(false);
    expect(libraryHasBothAnimals([cat])).toBe(false);
    expect(libraryHasBothAnimals([...dogs, cat])).toBe(true);
  });

  it('filters by the animal only when there is a choice — a stored cat never empties a dog library', () => {
    expect(libraryForAnimal([...dogs, cat], 'cat')).toEqual([cat]);
    expect(libraryForAnimal([...dogs, cat], 'dog')).toEqual(dogs);
    expect(libraryForAnimal(dogs, 'cat')).toEqual(dogs);
  });
});
