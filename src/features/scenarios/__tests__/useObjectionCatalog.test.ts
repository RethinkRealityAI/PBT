import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { registerDataCatalog } from '../../../i18n/dataRegistry';
import { frData } from '../../../i18n/fr';
import { PUSHBACK_CATEGORIES } from '../../../data/scenarios';
import { localizedPushbackLabel } from '../../../i18n/dataL10n/pushbacks';
import type { TeamObjection } from '../../../shared/scenarios/objections';
import { buildTrainingObjections, objectionsForSpecies } from '../useObjectionCatalog';
import { readTrainingSpecies, useTrainingSpecies } from '../useTrainingSpecies';

registerDataCatalog('fr', frData);

const base: Omit<TeamObjection, 'id' | 'title'> = {
  example: '"Line."',
  titleFr: null,
  exampleFr: null,
  species: ['dog', 'cat'],
  focusArea: null,
  coaching: {},
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
  focusArea: 'gi',
  sortOrder: 2,
};
const WET_FOOD: TeamObjection = { ...base, id: 'team:wet-food', title: 'Wet food', species: ['cat'], sortOrder: 1 };
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
    expect(list[0].category).toBe(PUSHBACK_CATEGORIES[0]);
    const probiotics = list.find((o) => o.id === 'team:probiotics')!;
    expect(probiotics.title).toBe('Probiotiques');
    // English fallback when the team wrote no French.
    expect(list.find((o) => o.id === 'team:wet-food')!.title).toBe('Wet food');
    // The carried category keeps canonical English + the team's French.
    expect(probiotics.category).toEqual({
      id: 'team:probiotics',
      title: 'Probiotics',
      example: '"Line."',
      titleFr: 'Probiotiques',
    });
    expect(probiotics.focusArea).toBe('gi');
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

describe('useTrainingSpecies', () => {
  it("defaults to 'dog', persists the choice and keeps every instance in sync", () => {
    expect(readTrainingSpecies()).toBe('dog');
    const a = renderHook(() => useTrainingSpecies());
    const b = renderHook(() => useTrainingSpecies());
    act(() => a.result.current[1]('cat'));
    expect(a.result.current[0]).toBe('cat');
    expect(b.result.current[0]).toBe('cat');
    expect(localStorage.getItem('pbt:train_species')).toBe('"cat"');
    expect(readTrainingSpecies()).toBe('cat');
  });

  it('resets a corrupt stored value to dog', () => {
    localStorage.setItem('pbt:train_species', '"hamster"');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readTrainingSpecies()).toBe('dog');
    expect(localStorage.getItem('pbt:train_species')).toBeNull();
    warn.mockRestore();
  });
});
