/**
 * Categories in the Studio — the pure model: reading the server's answer
 * (built-ins always present), what a category covers (animals, knowledge),
 * the upload defaults, labels, and the editor's form + validation.
 */
import { describe, expect, it } from 'vitest';
import {
  builtInObjectionsIn,
  canDeleteCategory,
  categoryAnimals,
  categoryFormErrors,
  categoryFormToWrite,
  categoryKnowledgeLine,
  categoryLabel,
  categoryOfObjection,
  categoryUploadSpecies,
  categoryUsageLabel,
  emptyCategoryForm,
  formFromCategory,
  hasCategoryKnowledge,
  knowledgeSummaryText,
  knowledgeOf,
  splitCategories,
  teamObjectionsIn,
  toAdminCategory,
} from '../categoriesModel';
import { BUILT_IN_CATEGORIES } from '../../../../../src/shared/scenarios/objectionCategories';
import type { TeamObjection } from '../../../../../src/shared/scenarios/objections';

const PROBIOTICS = {
  id: 'category:probiotics',
  name: 'Probiotics',
  nameFr: 'Probiotiques',
  description: 'Owners who doubt a daily probiotic.',
  focusArea: 'gi',
  knowledgeSlugs: ['study:a'],
  sortOrder: 40,
  updatedAt: '2026-10-10T00:00:00Z',
  createdAt: '2026-10-09T00:00:00Z',
  deletedAt: null,
  customised: false,
  usage: { objections: 2, scenarios: 3 },
};

function team(over: Partial<TeamObjection> & Pick<TeamObjection, 'id' | 'title'>): TeamObjection {
  return {
    example: '“A line.”',
    titleFr: null,
    exampleFr: null,
    species: ['dog', 'cat'],
    categoryId: 'category:probiotics',
    coaching: {},
    visible: true,
    sortOrder: null,
    updatedAt: null,
    ...over,
  };
}

describe('reading admin-objections categories', () => {
  it('keeps usage, dates and the built-in flag; drops what can’t be a category', () => {
    const c = toAdminCategory(PROBIOTICS)!;
    expect(c).toMatchObject({ id: PROBIOTICS.id, builtIn: false, usage: { objections: 2, scenarios: 3 }, focusArea: 'gi' });
    expect(toAdminCategory({ id: 'not-a-category', name: 'X' })).toBeNull();
    expect(toAdminCategory({ id: 'category:x-y', name: '' })).toBeNull();
    expect(toAdminCategory({ ...PROBIOTICS, usage: { objections: -1, scenarios: 'lots' } })!.usage).toEqual({
      objections: 0,
      scenarios: 0,
    });
    // A built-in is never "deleted", whatever a row says.
    expect(toAdminCategory({ id: 'weight', name: 'Obesity & weight loss', deletedAt: '2026-10-01T00:00:00Z' })).toMatchObject({
      builtIn: true,
      deletedAt: null,
    });
  });

  it('always includes the three built-ins, in display order, and splits off the deleted', () => {
    const { active, deleted } = splitCategories([
      PROBIOTICS,
      { id: 'weight', name: 'Obesity & weight loss', knowledgeSlugs: ['study:davies-2024'], sortOrder: 20, customised: true },
      { ...PROBIOTICS, id: 'category:dental', name: 'Dental', deletedAt: '2026-10-11T00:00:00Z' },
      { junk: true },
    ]);
    expect(active.map((c) => c.id)).toEqual(['everyday-nutrition', 'weight', 'prescription-diets', 'category:probiotics']);
    expect(active[1]).toMatchObject({ name: 'Obesity & weight loss', builtIn: true, customised: true });
    expect(deleted.map((c) => c.id)).toEqual(['category:dental']);
    // Nothing loaded (an older server, a failed read): the built-ins alone.
    expect(splitCategories(undefined).active.map((c) => c.id)).toEqual(BUILT_IN_CATEGORIES.map((c) => c.id));
  });
});

describe('what a category covers', () => {
  const list = [
    team({ id: 'team:a', title: 'A', species: ['cat'] }),
    team({ id: 'team:b', title: 'B', species: ['cat'], visible: false }),
    team({ id: 'team:c', title: 'C', species: ['dog'], categoryId: 'category:gi' }),
  ];

  it('animals come from its ACTIVE objections; built-in ones apply to both', () => {
    expect(categoryAnimals('category:probiotics', list)).toEqual(['cat']);
    expect(categoryAnimals('category:gi', list)).toEqual(['dog']);
    expect(categoryAnimals('category:empty', list)).toEqual([]);
    expect(categoryAnimals('weight', [])).toEqual(['dog', 'cat']);
    expect(builtInObjectionsIn('everyday-nutrition').map((o) => o.id)).toEqual([
      'cost',
      'breeder-advice',
      'raw-food',
      'brand-switch',
    ]);
    expect(builtInObjectionsIn('category:probiotics')).toEqual([]);
    expect(teamObjectionsIn('category:probiotics', list).map((o) => o.id)).toEqual(['team:a', 'team:b']);
  });

  it('says what it reads, plainly', () => {
    expect(knowledgeSummaryText({ focusArea: 'gi', knowledgeSlugs: ['a', 'b', 'c'] })).toBe('3 documents · Digestive health (GI)');
    expect(knowledgeSummaryText({ focusArea: null, knowledgeSlugs: ['a'] })).toBe('1 document');
    expect(knowledgeSummaryText({ focusArea: null, knowledgeSlugs: [] })).toBeNull();
    expect(categoryKnowledgeLine({ focusArea: null, knowledgeSlugs: [] })).toBe(
      'No knowledge attached — scenarios read the whole library',
    );
    expect(hasCategoryKnowledge({ focusArea: 'gi', knowledgeSlugs: [] })).toBe(true);
    expect(hasCategoryKnowledge(null)).toBe(false);
  });

  it('files an upload for the category’s one animal, or for every animal', () => {
    expect(categoryUploadSpecies(['cat'])).toEqual(['cat']);
    expect(categoryUploadSpecies(['dog'])).toEqual(['dog', 'puppy']);
    expect(categoryUploadSpecies(['dog', 'cat'])).toEqual(['dog', 'puppy', 'cat']);
    expect(categoryUploadSpecies([])).toEqual(['dog', 'puppy', 'cat']);
  });

  it('finds a draft’s category through its objection; "Something else" has none', () => {
    const cats = splitCategories([PROBIOTICS]).active;
    expect(categoryOfObjection('cost', [], cats)?.id).toBe('everyday-nutrition');
    expect(categoryOfObjection('team:a', list, cats)?.id).toBe('category:probiotics');
    expect(categoryOfObjection('custom', list, cats)).toBeNull();
    expect(categoryOfObjection(null, list, cats)).toBeNull();
  });

  it('only a team category can be deleted', () => {
    expect(canDeleteCategory({ id: 'weight', builtIn: true })).toBe(false);
    expect(canDeleteCategory({ id: 'category:gi', builtIn: false })).toBe(true);
  });
});

describe('labels', () => {
  it('names a category — never a raw id', () => {
    expect(categoryLabel('weight')).toBe('Weight management');
    expect(categoryLabel('weight', [{ id: 'weight', name: 'Obesity & weight loss' }])).toBe('Obesity & weight loss');
    expect(categoryLabel('category:dental-care')).toBe('Dental care');
    expect(categoryLabel(null)).toBe('No category');
    expect(categoryUsageLabel(2, 0)).toBe('2 objections · no scenarios yet');
    expect(categoryUsageLabel(1, 3)).toBe('1 objection · 3 scenarios');
    expect(knowledgeOf(' Obesity & weight loss ')).toBe('the Obesity & weight loss knowledge');
  });
});

describe('the category editor form', () => {
  it('round-trips a category; a new one has no id', () => {
    const form = formFromCategory({ ...PROBIOTICS, builtIn: false });
    expect(categoryFormToWrite(form)).toEqual({
      id: 'category:probiotics',
      name: 'Probiotics',
      nameFr: 'Probiotiques',
      description: 'Owners who doubt a daily probiotic.',
      focusArea: 'gi',
      knowledgeSlugs: ['study:a'],
      sortOrder: 40,
    });
    expect(categoryFormToWrite(emptyCategoryForm())).not.toHaveProperty('id');
    expect(categoryFormToWrite({ ...emptyCategoryForm(), name: '  GI  ', nameFr: '  ' })).toMatchObject({
      name: 'GI',
      nameFr: null,
    });
  });

  it('explains every problem in words, per field', () => {
    expect(categoryFormErrors(emptyCategoryForm()).name).toBe('Give the category a name, e.g. Probiotics.');
    const long = categoryFormErrors({
      ...emptyCategoryForm(),
      name: 'x'.repeat(61),
      nameFr: 'y'.repeat(61),
      description: 'z'.repeat(301),
    });
    expect(long.name).toMatch(/under 60 characters/);
    expect(long.nameFr).toMatch(/French name under 60/);
    expect(long.description).toMatch(/under 300 characters/);
    expect(
      categoryFormErrors({ ...emptyCategoryForm(), name: 'GI', knowledgeSlugs: Array.from({ length: 41 }, (_, i) => `d:${i}`) })
        .knowledge,
    ).toMatch(/at most 40 documents/);
    expect(categoryFormErrors({ ...emptyCategoryForm(), name: 'Probiotics' })).toEqual({});
  });

  it('refuses a second category with the same name (any case), but not the category itself', () => {
    const others = [{ id: 'category:probiotics', name: 'Probiotics' }];
    expect(categoryFormErrors({ ...emptyCategoryForm(), name: 'probiotics ' }, others).name).toBe(
      'There’s already a category called “probiotics”.',
    );
    expect(categoryFormErrors({ ...formFromCategory({ ...PROBIOTICS, builtIn: false }) }, others)).toEqual({});
  });

  it('a built-in can be edited like any other', () => {
    const form = formFromCategory(BUILT_IN_CATEGORIES[1]);
    expect(form).toMatchObject({ id: 'weight', builtIn: true });
    expect(categoryFormErrors({ ...form, name: 'Obesity & weight loss', focusArea: 'weight' })).toEqual({});
  });
});
