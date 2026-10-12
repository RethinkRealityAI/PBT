import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_CATEGORIES,
  BUILT_IN_OBJECTION_CATEGORY,
  CATEGORY_LIMITS,
  categoriesForSpecies,
  categoryIdFromName,
  categoryKnowledgeFor,
  categoryName,
  categoryToRow,
  effectiveKnowledge,
  isCategoryIdShape,
  isTeamCategoryId,
  mergeCategories,
  objectionCategoryId,
  rowToCategory,
  validateCategoryInput,
  type ObjectionCategory,
} from '../objectionCategories';
import { PUSHBACK_IDS } from '../enums';
import { builtInObjections, objectionCatalog, type TeamObjection } from '../objections';

const probioticsCat = (over: Partial<ObjectionCategory> = {}): ObjectionCategory => ({
  id: 'category:probiotics',
  name: 'Probiotics',
  nameFr: 'Probiotiques',
  description: 'Gut health supplements.',
  focusArea: 'gi',
  knowledgeSlugs: ['custom:probiotics-monograph'],
  sortOrder: null,
  builtIn: false,
  updatedAt: null,
  ...over,
});

const yogurt: TeamObjection = {
  id: 'team:yogurt-is-enough',
  title: 'Yogurt is enough',
  example: '"I give him yogurt."',
  titleFr: null,
  exampleFr: null,
  species: ['dog'],
  categoryId: 'category:probiotics',
  coaching: {},
  visible: true,
  sortOrder: null,
  updatedAt: null,
};

describe('ids', () => {
  it('team categories carry the prefix; built-ins are known ids', () => {
    expect(isTeamCategoryId('category:probiotics')).toBe(true);
    expect(isTeamCategoryId('probiotics')).toBe(false);
    expect(isCategoryIdShape('weight')).toBe(true);
    expect(isCategoryIdShape('category:gi')).toBe(true);
    expect(isCategoryIdShape('gi')).toBe(false);
    expect(categoryIdFromName('GI / Digestive')).toBe('category:gi-digestive');
    expect(categoryIdFromName('Probiotics', ['category:probiotics'])).toBe('category:probiotics-2');
  });

  it('every built-in objection except Other has a built-in category', () => {
    for (const id of PUSHBACK_IDS) {
      if (id === 'custom') expect(BUILT_IN_OBJECTION_CATEGORY[id]).toBeUndefined();
      else expect(BUILT_IN_CATEGORIES.map((c) => c.id)).toContain(BUILT_IN_OBJECTION_CATEGORY[id]);
    }
    expect(builtInObjections().find((o) => o.id === 'weight-denial')?.categoryId).toBe('weight');
    expect(builtInObjections().find((o) => o.id === 'custom')?.categoryId).toBeNull();
  });

  it('built-in categories carry no knowledge, so existing scenarios retrieve as before', () => {
    for (const c of BUILT_IN_CATEGORIES) {
      expect(c.knowledgeSlugs).toEqual([]);
      expect(c.focusArea).toBeNull();
    }
  });
});

describe('rowToCategory / validateCategoryInput', () => {
  it('reads a stored row and flags built-ins', () => {
    expect(
      rowToCategory({
        id: 'weight',
        name: ' Obesity & weight loss ',
        name_fr: '',
        description: null,
        focus_area: 'weight',
        knowledge_slugs: ['a', 'a', '', 5, 'b'],
        sort_order: 2.4,
      }),
    ).toEqual({
      id: 'weight',
      name: 'Obesity & weight loss',
      nameFr: null,
      description: '',
      focusArea: 'weight',
      knowledgeSlugs: ['a', 'b'],
      sortOrder: 2,
      builtIn: true,
      updatedAt: null,
    });
    expect(rowToCategory({ id: 'nope', name: 'x' })).toBeNull();
    expect(rowToCategory({ id: 'category:x1', name: ' ' })).toBeNull();
  });

  it('validates a write and explains problems', () => {
    const ok = validateCategoryInput({ id: 'category:probiotics', name: 'Probiotics', focusArea: 'gi', knowledgeSlugs: ['a'] });
    expect(ok.ok && categoryToRow(ok.value)).toMatchObject({ id: 'category:probiotics', focus_area: 'gi', knowledge_slugs: ['a'] });
    const err = (raw: Record<string, unknown>) => {
      const r = validateCategoryInput({ id: 'category:x1', name: 'X', ...raw });
      return r.ok ? null : r.error;
    };
    expect(err({ id: 'probiotics' })).toMatch(/category/);
    expect(err({ name: '' })).toMatch(/name/);
    expect(err({ name: 'x'.repeat(CATEGORY_LIMITS.nameMax + 1) })).toMatch(/too long/);
    expect(err({ focusArea: 'probiotics' })).toMatch(/topic/);
    expect(err({ knowledgeSlugs: 'a' })).toMatch(/list/);
    expect(err({ knowledgeSlugs: Array(CATEGORY_LIMITS.knowledgeSlugsMax + 1).fill('a') })).toMatch(/at most/);
  });
});

describe('mergeCategories', () => {
  it('built-ins first (overlaid by an admin edit), then team categories, in display order', () => {
    const merged = mergeCategories([
      probioticsCat({ sortOrder: 15 }),
      { ...BUILT_IN_CATEGORIES[1], name: 'Obesity & weight loss', knowledgeSlugs: ['study:x'], builtIn: false },
    ]);
    expect(merged.map((c) => c.id)).toEqual(['everyday-nutrition', 'category:probiotics', 'weight', 'prescription-diets']);
    const weight = merged.find((c) => c.id === 'weight')!;
    expect(weight).toMatchObject({ name: 'Obesity & weight loss', builtIn: true, knowledgeSlugs: ['study:x'] });
    expect(mergeCategories().map((c) => c.id)).toEqual(BUILT_IN_CATEGORIES.map((c) => c.id));
  });

  it('names fall back to English', () => {
    expect(categoryName(probioticsCat(), 'fr')).toBe('Probiotiques');
    expect(categoryName(probioticsCat({ nameFr: null }), 'fr')).toBe('Probiotics');
    expect(categoryName(probioticsCat(), 'en')).toBe('Probiotics');
  });
});

describe('knowledge', () => {
  const cats = mergeCategories([probioticsCat()]);

  it('finds an objection’s category, built-in or team', () => {
    expect(objectionCategoryId('cost')).toBe('everyday-nutrition');
    expect(objectionCategoryId(yogurt.id, [yogurt])).toBe('category:probiotics');
    expect(objectionCategoryId('custom')).toBeNull();
    expect(objectionCategoryId('team:gone', [yogurt])).toBeNull();
  });

  it('gives a category’s knowledge only when it has some', () => {
    expect(categoryKnowledgeFor(yogurt.id, [yogurt], cats)).toEqual({
      focusArea: 'gi',
      knowledgeSlugs: ['custom:probiotics-monograph'],
    });
    expect(categoryKnowledgeFor('cost', [yogurt], cats)).toBeNull();
  });

  it('a scenario’s own choice replaces the category’s; otherwise it inherits; otherwise the library', () => {
    const cat = { focusArea: 'gi', knowledgeSlugs: ['doc-a'] };
    expect(effectiveKnowledge({ knowledgeSlugs: ['mine'] }, cat)).toEqual({ focusArea: null, knowledgeSlugs: ['mine'], source: 'scenario' });
    expect(effectiveKnowledge({ focusArea: 'weight' }, cat)).toEqual({ focusArea: 'weight', knowledgeSlugs: [], source: 'scenario' });
    expect(effectiveKnowledge({ focusArea: '  ', knowledgeSlugs: [] }, cat)).toEqual({ ...cat, source: 'category' });
    expect(effectiveKnowledge({}, null)).toEqual({ focusArea: null, knowledgeSlugs: [], source: 'library' });
  });

  it('offers only categories with a visible objection for the animal', () => {
    const catalogue = objectionCatalog([yogurt, { ...yogurt, id: 'team:cat-only', species: ['cat'], categoryId: 'category:feline-gi' }]);
    const merged = mergeCategories([probioticsCat(), probioticsCat({ id: 'category:feline-gi', name: 'Feline GI' })]);
    const forCat = categoriesForSpecies(merged, catalogue, 'cat').map((c) => c.id);
    expect(forCat).toContain('category:feline-gi');
    expect(forCat).not.toContain('category:probiotics');
    expect(forCat).toContain('weight');
    expect(categoriesForSpecies(merged, catalogue, undefined).map((c) => c.id)).toContain('category:probiotics');
  });
});
