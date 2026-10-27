import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerDataCatalog } from '../../../i18n/dataRegistry';
import { frData } from '../../../i18n/fr';
import { PUSHBACK_CATEGORIES } from '../../../data/scenarios';
import { localizedPushbackLabel } from '../../../i18n/dataL10n/pushbacks';
import type { TeamObjection } from '../../../shared/scenarios/objections';
import { mergeCategories, type ObjectionCategory } from '../../../shared/scenarios/objectionCategories';
import type { PushbackDataOverlay } from '../../../i18n/dataL10n/pushbacks';
import {
  buildTrainingCategories,
  buildTrainingObjections,
  objectionsForSpecies,
  objectionsInCategory,
  trainingCategoriesForSpecies,
} from '../useObjectionCatalog';
import { readTrainingSpecies, useTrainingSpecies } from '../useTrainingSpecies';

/** Admin → Flags for the species-hook tests (`scenario.cat.enabled` is OFF by default). */
let flagValues: Record<string, unknown> = {};
vi.mock('../../../app/providers/FlagProvider', async () => {
  const actual = await vi.importActual<typeof import('../../../app/providers/FlagProvider')>(
    '../../../app/providers/FlagProvider',
  );
  return {
    ...actual,
    useFlags: () => ({
      ...actual.useFlags(),
      getFlag: <T,>(key: string, fallback: T) => (key in flagValues ? (flagValues[key] as T) : fallback),
    }),
  };
});

registerDataCatalog('fr', frData);

const base: Omit<TeamObjection, 'id' | 'title'> = {
  example: '"Line."',
  titleFr: null,
  exampleFr: null,
  species: ['dog', 'cat'],
  categoryId: 'everyday-nutrition',
  coaching: {},
  coachingFr: {},
  visible: true,
  sortOrder: null,
  updatedAt: null,
};
const PROBIOTICS: TeamObjection = {
  ...base,
  id: 'team:probiotics',
  title: 'Probiotics',
  titleFr: 'Probiotiques',
  species: ['dog'],
  categoryId: 'category:gi',
  sortOrder: 2,
};
const WET_FOOD: TeamObjection = {
  ...base,
  id: 'team:wet-food',
  title: 'Wet food',
  species: ['cat'],
  categoryId: 'category:urinary',
  sortOrder: 1,
};
const RETIRED: TeamObjection = { ...base, id: 'team:retired', title: 'Retired', visible: false };

describe('buildTrainingObjections', () => {
  const list = buildTrainingObjections([PROBIOTICS, WET_FOOD, RETIRED], 'fr');

  it('lists the six built-ins (no "Other") then the team objections by sort order', () => {
    expect(list.map((o) => o.id)).toEqual([
      ...PUSHBACK_CATEGORIES.filter((c) => c.id !== 'custom').map((c) => c.id),
      'team:wet-food',
      'team:probiotics',
      'team:retired',
    ]);
  });

  it('localises built-ins through the overlay and team objections through their own French', () => {
    expect(list[0].title).toBe(localizedPushbackLabel(list[0].id, 'fr'));
    expect(list[0].pushback).toBe(PUSHBACK_CATEGORIES[0]);
    const probiotics = list.find((o) => o.id === 'team:probiotics')!;
    expect(probiotics.title).toBe('Probiotiques');
    // English fallback when the team wrote no French.
    expect(list.find((o) => o.id === 'team:wet-food')!.title).toBe('Wet food');
    // The carried pushback keeps canonical English + the team's French.
    expect(probiotics.pushback).toEqual({
      id: 'team:probiotics',
      title: 'Probiotics',
      example: '"Line."',
      titleFr: 'Probiotiques',
    });
    // Every objection names its category: built-ins by the code mapping,
    // team ones by their own categoryId. No knowledge keys ride along.
    expect(probiotics.categoryId).toBe('category:gi');
    expect(list.find((o) => o.id === 'cost')!.categoryId).toBe('everyday-nutrition');
    expect(list.find((o) => o.id === 'weight-denial')!.categoryId).toBe('weight');
    expect(list.find((o) => o.id === 'rx-diet')!.categoryId).toBe('prescription-diets');
    expect(probiotics).not.toHaveProperty('focusArea');
  });

  it('pickers only get VISIBLE objections that apply to the animal', () => {
    const dog = objectionsForSpecies(list, 'dog').map((o) => o.id);
    const cat = objectionsForSpecies(list, 'cat').map((o) => o.id);
    expect(dog).toContain('team:probiotics');
    expect(dog).not.toContain('team:wet-food');
    expect(cat).toContain('team:wet-food');
    expect(cat).not.toContain('team:probiotics');
    expect(dog).not.toContain('team:retired');
    expect(cat).not.toContain('team:retired');
    // Built-ins apply to both animals.
    expect(cat).toContain('cost');
  });
});

describe('categories', () => {
  const team = (id: string, name: string, extra: Partial<ObjectionCategory> = {}): ObjectionCategory => ({
    id,
    name,
    nameFr: null,
    description: '',
    focusArea: null,
    knowledgeSlugs: [],
    sortOrder: null,
    builtIn: false,
    updatedAt: null,
    ...extra,
  });
  const GI = team('category:gi', 'GI', { nameFr: 'Gastro-intestinal', sortOrder: 40 });
  const URINARY = team('category:urinary', 'Urinary', { sortOrder: 50 });
  const EMPTY = team('category:empty', 'Nothing in it', { sortOrder: 60 });
  const objections = buildTrainingObjections([PROBIOTICS, WET_FOOD, RETIRED], 'fr');
  const merged = mergeCategories([GI, URINARY, EMPTY]);
  const fr = buildTrainingCategories(merged, 'fr');
  const overlay = frData.pushbacks as PushbackDataOverlay;

  it('localises built-ins through the overlay and team categories through nameFr (English fallback)', () => {
    expect(fr.map((c) => c.id)).toEqual([
      'everyday-nutrition',
      'weight',
      'prescription-diets',
      'category:gi',
      'category:urinary',
      'category:empty',
    ]);
    expect(fr[0].label).toBe(overlay.objectionCategories['everyday-nutrition'].name);
    expect(fr[0].blurb).toBe(overlay.objectionCategories['everyday-nutrition'].description);
    expect(fr.find((c) => c.id === 'category:gi')!.label).toBe('Gastro-intestinal');
    expect(fr.find((c) => c.id === 'category:urinary')!.label).toBe('Urinary');
    const en = buildTrainingCategories(merged, 'en');
    expect(en[1].label).toBe('Weight management');
    expect(en.find((c) => c.id === 'category:gi')!.label).toBe('GI');
  });

  it('offers only categories with a visible objection for the animal', () => {
    const dog = trainingCategoriesForSpecies(fr, objections, 'dog').map((c) => c.id);
    const cat = trainingCategoriesForSpecies(fr, objections, 'cat').map((c) => c.id);
    expect(dog).toEqual(['everyday-nutrition', 'weight', 'prescription-diets', 'category:gi']);
    expect(cat).toEqual(['everyday-nutrition', 'weight', 'prescription-diets', 'category:urinary']);
    // The retired objection (everyday-nutrition) and the empty category add nothing.
    expect(dog).not.toContain('category:empty');
  });

  it('lists the visible objections of one category for the animal', () => {
    expect(objectionsInCategory(objections, 'category:gi', 'dog').map((o) => o.id)).toEqual([
      'team:probiotics',
    ]);
    expect(objectionsInCategory(objections, 'category:gi', 'cat')).toEqual([]);
    expect(objectionsInCategory(objections, 'everyday-nutrition', 'cat').map((o) => o.id)).toEqual([
      'cost',
      'breeder-advice',
      'raw-food',
      'brand-switch',
    ]);
    expect(objectionsInCategory(objections, 'weight', 'dog').map((o) => o.id)).toEqual(['weight-denial']);
  });
});

describe('useTrainingSpecies', () => {
  beforeEach(() => {
    localStorage.clear();
    flagValues = {};
  });

  it("defaults to 'dog', persists the choice and keeps every instance in sync (cats on)", () => {
    flagValues = { 'scenario.cat.enabled': true };
    expect(readTrainingSpecies()).toBe('dog');
    const a = renderHook(() => useTrainingSpecies());
    const b = renderHook(() => useTrainingSpecies());
    act(() => a.result.current[1]('cat'));
    expect(a.result.current[0]).toBe('cat');
    expect(b.result.current[0]).toBe('cat');
    expect(localStorage.getItem('pbt:train_species')).toBe('"cat"');
    expect(readTrainingSpecies()).toBe('cat');
  });

  it("reads 'dog' and refuses 'cat' while scenario.cat.enabled is off — without erasing the stored choice", () => {
    localStorage.setItem('pbt:train_species', '"cat"');
    expect(readTrainingSpecies()).toBe('cat');
    const hook = renderHook(() => useTrainingSpecies());
    expect(hook.result.current[0]).toBe('dog');
    act(() => hook.result.current[1]('cat'));
    expect(hook.result.current[0]).toBe('dog');
    // Kept for when the switch comes back on; a dog choice still saves.
    expect(localStorage.getItem('pbt:train_species')).toBe('"cat"');
    act(() => hook.result.current[1]('dog'));
    expect(localStorage.getItem('pbt:train_species')).toBe('"dog"');
  });

  it('resets a corrupt stored value to dog', () => {
    localStorage.setItem('pbt:train_species', '"hamster"');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readTrainingSpecies()).toBe('dog');
    expect(localStorage.getItem('pbt:train_species')).toBeNull();
    warn.mockRestore();
  });
});
