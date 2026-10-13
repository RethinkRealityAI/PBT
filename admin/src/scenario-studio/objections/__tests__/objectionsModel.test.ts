/**
 * Objections in the Studio — the pure model: reading the server's answer,
 * names (never a raw `team:` id), what a picker offers per animal, where a
 * draft's objection stands, and the editor's form.
 */
import { describe, expect, it } from 'vitest';
import {
  animalsLabel,
  checkObjection,
  emptyObjectionForm,
  formFromObjection,
  formToWrite,
  missingCoreFields,
  objectionFormErrors,
  objectionLabel,
  pushbackChoicesFor,
  pushbackOptionsFor,
  splitObjections,
  toAdminObjection,
  untranslatedHintKeys,
  usageLabel,
} from '../objectionsModel';
import { pushbackLabel } from '../../../lib/labels';
import type { TeamObjection } from '../../../../../src/shared/scenarios/objections';
import { BUILT_IN_CATEGORIES, type ObjectionCategory } from '../../../../../src/shared/scenarios/objectionCategories';

function team(over: Partial<TeamObjection> & Pick<TeamObjection, 'id' | 'title'>): TeamObjection {
  return {
    example: '“A line.”',
    titleFr: null,
    exampleFr: null,
    species: ['dog', 'cat'],
    categoryId: 'everyday-nutrition',
    coaching: {},
    coachingFr: {},
    visible: true,
    sortOrder: null,
    updatedAt: '2026-10-10T10:00:00Z',
    ...over,
  };
}

const PROBIOTICS = 'category:probiotics';
const PRO = team({ id: 'team:probiotics-not-needed', title: 'Probiotics: not needed', categoryId: PROBIOTICS });
const YOGURT = team({ id: 'team:yogurt-is-enough', title: 'Yogurt is enough', categoryId: PROBIOTICS });
const BORED = team({ id: 'team:cat-bored', title: 'Cat gets bored', species: ['cat'] });
const RETIRED = team({ id: 'team:old-one', title: 'Old one', visible: false });

describe('reading admin-objections', () => {
  it('keeps usage and dates, drops what can’t be an objection', () => {
    const o = toAdminObjection({
      ...PRO,
      usage: { scenarios: 3, live: 1 },
      createdAt: '2026-10-01T00:00:00Z',
      deletedAt: null,
    });
    expect(o).toMatchObject({ id: PRO.id, usage: { scenarios: 3, live: 1 }, createdAt: '2026-10-01T00:00:00Z' });
    expect(toAdminObjection({ id: 'cost', title: 'Built-in id' })).toBeNull();
    expect(toAdminObjection({ id: 'team:x-y', title: '', species: ['dog'] })).toBeNull();
    expect(toAdminObjection({ id: 'team:x-y', title: 'No animals', species: [] })).toBeNull();
    // Nonsense usage is read as zero, live never above total.
    expect(toAdminObjection({ ...PRO, usage: { scenarios: -2, live: 'many' } })!.usage).toEqual({ scenarios: 0, live: 0, trainee: 0 });
    expect(toAdminObjection({ ...PRO, usage: { scenarios: 1, live: 4 } })!.usage).toEqual({ scenarios: 1, live: 1, trainee: 0 });
  });

  it('splits live from deleted, each in display order', () => {
    const { active, deleted } = splitObjections([
      { ...YOGURT },
      { ...PRO, sortOrder: 1 },
      { ...BORED, deletedAt: '2026-10-09T00:00:00Z' },
      { ...RETIRED, deletedAt: '2026-10-11T00:00:00Z' },
      { junk: true },
      { ...PRO }, // duplicate id: first one wins
    ]);
    expect(active.map((o) => o.id)).toEqual([PRO.id, YOGURT.id]);
    expect(deleted.map((o) => o.id)).toEqual([RETIRED.id, BORED.id]);
    expect(splitObjections(undefined)).toEqual({ active: [], deleted: [] });
  });
});

describe('names', () => {
  it('a pushback id reads as words — never a raw team: id', () => {
    expect(objectionLabel('cost')).toBe('Cost / price pushback');
    expect(objectionLabel(PRO.id, [PRO])).toBe('Probiotics: not needed');
    // Not loaded (or deleted): the slug in words.
    expect(objectionLabel('team:probiotics-not-needed')).toBe('Probiotics not needed');
    expect(objectionLabel(null)).toBe('No objection yet');
  });

  it('the portal-wide label helper agrees', () => {
    expect(pushbackLabel('weight-denial')).toBe('Weight / obesity denial');
    expect(pushbackLabel(PRO.id, [PRO])).toBe('Probiotics: not needed');
    expect(pushbackLabel('team:cat-bored')).toBe('Cat bored');
    expect(pushbackLabel(null, [], 'Pushback not recorded')).toBe('Pushback not recorded');
  });

  it('animals and usage read plainly', () => {
    expect(animalsLabel(['dog', 'cat'])).toBe('Dogs & cats');
    expect(animalsLabel(['cat'])).toBe('Cats only');
    expect(animalsLabel(['dog'])).toBe('Dogs only');
    expect(usageLabel({ scenarios: 0, live: 0 })).toBe('Not used by any scenario yet');
    expect(usageLabel({ scenarios: 1, live: 0 })).toBe('Used by 1 scenario (0 live)');
    expect(usageLabel({ scenarios: 0, live: 0, trainee: 1 })).toBe('Not in any library scenario · 1 trainee’s own');
    expect(usageLabel({ scenarios: 2, live: 1, trainee: 3 })).toBe('Used by 2 scenarios (1 live) · 3 trainees’ own');
    expect(usageLabel({ scenarios: 3, live: 2 })).toBe('Used by 3 scenarios (2 live)');
  });
});

describe('pushbackOptionsFor', () => {
  const list = [PRO, BORED, RETIRED, YOGURT];

  it('offers the built-ins (not "Something else") and the team’s active ones for the animal', () => {
    const cat = pushbackOptionsFor('cat', list);
    expect(cat.builtIn.map((o) => o.id)).toEqual([
      'cost',
      'breeder-advice',
      'raw-food',
      'rx-diet',
      'brand-switch',
      'weight-denial',
    ]);
    expect(cat.team.map((o) => o.id)).toEqual([BORED.id, PRO.id, YOGURT.id]);
    expect(cat.hiddenForSpecies).toBe(0);
  });

  it('leaves a cat-only objection out of a dog scenario (absent species = dog), and counts it', () => {
    for (const species of ['dog', null, undefined]) {
      const dog = pushbackOptionsFor(species, list);
      expect(dog.team.map((o) => o.id)).toEqual([PRO.id, YOGURT.id]);
      expect(dog.hiddenForSpecies).toBe(1);
    }
  });

  it('never offers a retired objection', () => {
    expect(pushbackOptionsFor('dog', [RETIRED]).team).toEqual([]);
    expect(pushbackOptionsFor('dog', [RETIRED]).hiddenForSpecies).toBe(0);
  });
});

describe('pushbackChoicesFor (the Pushback step: category first)', () => {
  const CATEGORIES: ObjectionCategory[] = [
    ...BUILT_IN_CATEGORIES,
    {
      id: PROBIOTICS,
      name: 'Probiotics',
      nameFr: null,
      description: '',
      focusArea: 'gi',
      knowledgeSlugs: [],
      sortOrder: 40,
      builtIn: false,
      updatedAt: null,
    },
    {
      id: 'category:empty',
      name: 'Empty',
      nameFr: null,
      description: '',
      focusArea: null,
      knowledgeSlugs: [],
      sortOrder: 50,
      builtIn: false,
      updatedAt: null,
    },
  ];
  const CAT_ONLY = team({ id: 'team:hairballs', title: 'Hairballs are normal', species: ['cat'], categoryId: PROBIOTICS });
  const list = [PRO, YOGURT, BORED, RETIRED, CAT_ONLY];

  it('offers the categories holding an objection for the animal, in display order, with their objections', () => {
    const dog = pushbackChoicesFor('dog', list, CATEGORIES);
    expect(dog.map((c) => c.category.id)).toEqual(['everyday-nutrition', 'weight', 'prescription-diets', PROBIOTICS]);
    const everyday = dog[0];
    expect(everyday.builtIn.map((o) => o.id)).toEqual(['cost', 'breeder-advice', 'raw-food', 'brand-switch']);
    // BORED is cat-only; RETIRED is never offered.
    expect(everyday.team).toEqual([]);
    expect(everyday.hiddenForSpecies).toBe(1);
    const probiotics = dog[3];
    expect(probiotics.builtIn).toEqual([]);
    expect(probiotics.team.map((o) => o.id)).toEqual([PRO.id, YOGURT.id]);
    expect(probiotics.team[0].categoryId).toBe(PROBIOTICS);
    expect(probiotics.hiddenForSpecies).toBe(1);
  });

  it('a cat sees the cat-only objections and no "hidden" count for them', () => {
    const cat = pushbackChoicesFor('cat', list, CATEGORIES);
    const probiotics = cat.find((c) => c.category.id === PROBIOTICS)!;
    expect(probiotics.team.map((o) => o.id)).toEqual([CAT_ONLY.id, PRO.id, YOGURT.id]);
    expect(probiotics.hiddenForSpecies).toBe(0);
    expect(cat[0].team.map((o) => o.id)).toEqual([BORED.id]);
  });

  it('leaves out a category with nothing for the animal — unless asked to keep it (the draft’s own, one just created)', () => {
    expect(pushbackChoicesFor('dog', list, CATEGORIES).some((c) => c.category.id === 'category:empty')).toBe(false);
    const kept = pushbackChoicesFor('dog', list, CATEGORIES, ['category:empty', null]);
    const empty = kept.find((c) => c.category.id === 'category:empty')!;
    expect(empty).toMatchObject({ builtIn: [], team: [], hiddenForSpecies: 0 });
    // Still in category order.
    expect(kept.map((c) => c.category.id).slice(-1)).toEqual(['category:empty']);
  });
});

describe('checkObjection', () => {
  const args = { team: [PRO, BORED, RETIRED], deleted: [{ id: 'team:gone', title: 'Gone' }], loaded: true };

  it('says nothing about built-ins, "Something else" or no objection', () => {
    for (const id of ['cost', 'custom', null, '']) {
      expect(checkObjection({ ...args, pushbackId: id, species: 'dog' })).toBeNull();
    }
  });

  it('reads a healthy, retired, other-animal, deleted and unknown objection', () => {
    expect(checkObjection({ ...args, pushbackId: PRO.id, species: 'cat' })).toMatchObject({ state: 'ok' });
    expect(checkObjection({ ...args, pushbackId: BORED.id, species: 'dog' })).toMatchObject({
      state: 'wrong-species',
      species: ['cat'],
    });
    expect(checkObjection({ ...args, pushbackId: RETIRED.id, species: 'dog' })).toMatchObject({
      state: 'retired',
      fits: true,
    });
    expect(checkObjection({ ...args, pushbackId: 'team:gone', species: 'dog' })).toMatchObject({
      state: 'deleted',
      title: 'Gone',
    });
    expect(checkObjection({ ...args, pushbackId: 'team:never-heard', species: 'dog' })).toMatchObject({
      state: 'unknown',
      title: 'Never heard',
    });
  });

  it('won’t call anything deleted before the list has loaded', () => {
    expect(checkObjection({ team: [], loaded: false, pushbackId: 'team:gone', species: 'dog' })).toMatchObject({
      state: 'unchecked',
    });
  });
});

describe('missingCoreFields', () => {
  const base = { breed: 'Lab', life_stage: 'Adult (3-7)', suggested_driver: 'Analyzer' };
  it('counts a team objection as an answer (its existence is checked separately)', () => {
    expect(missingCoreFields({ ...base, pushback_id: 'team:anything' })).toEqual([]);
    expect(missingCoreFields({ ...base, pushback_id: null })).toEqual(['Pushback']);
    expect(missingCoreFields({ ...base, pushback_id: 'made-up' })).toEqual(['Pushback']);
  });
});

describe('the editor form', () => {
  it('starts a new objection for the scenario’s animal, or both — in the category it was opened from', () => {
    expect(emptyObjectionForm(['cat']).species).toEqual(['cat']);
    expect(emptyObjectionForm().species).toEqual(['dog', 'cat']);
    expect(emptyObjectionForm().categoryId).toBeNull();
    expect(emptyObjectionForm(null, PROBIOTICS).categoryId).toBe(PROBIOTICS);
    expect(emptyObjectionForm().visible).toBe(true);
    expect(formToWrite(emptyObjectionForm())).not.toHaveProperty('id');
  });

  it('round-trips an objection, coaching one line per item', () => {
    const o = team({
      ...PRO,
      titleFr: 'Probiotiques',
      coaching: { rootConcerns: ['Upsell', 'Daily for life'], watchOuts: ['Product first'] },
    });
    const form = formFromObjection(o);
    expect(form.coaching.rootConcerns).toBe('Upsell\nDaily for life');
    expect(formToWrite(form)).toEqual({
      id: PRO.id,
      title: PRO.title,
      example: PRO.example,
      titleFr: 'Probiotiques',
      exampleFr: null,
      species: ['dog', 'cat'],
      categoryId: PROBIOTICS,
      coaching: { rootConcerns: ['Upsell', 'Daily for life'], watchOuts: ['Product first'] },
      coachingFr: {},
      visible: true,
      sortOrder: null,
    });
  });

  it('round-trips the French hint lists, and always sends them (empty = clear)', () => {
    const o = team({
      ...PRO,
      coaching: { acknowledgePatterns: ['Fair question.'] },
      coachingFr: { acknowledgePatterns: ['Bonne question.', 'C’est logique.'] },
    });
    const form = formFromObjection(o);
    expect(form.coachingFr.acknowledgePatterns).toBe('Bonne question.\nC’est logique.');
    expect(form.coachingFr.clarifyQuestions).toBe('');
    expect(formToWrite(form).coachingFr).toEqual({ acknowledgePatterns: ['Bonne question.', 'C’est logique.'] });
    // Cleared in the editor: sent as an explicit empty object, never left out.
    const cleared = { ...form, coachingFr: { ...form.coachingFr, acknowledgePatterns: '  \n' } };
    expect(formToWrite(cleared)).toHaveProperty('coachingFr', {});
    expect(formToWrite(emptyObjectionForm())).toHaveProperty('coachingFr', {});
  });

  it('lists the hint groups a French trainee would read in English', () => {
    const form = formFromObjection(
      team({
        ...PRO,
        coaching: { acknowledgePatterns: ['A'], clarifyQuestions: ['Q?'], rootConcerns: ['AI only'] },
        coachingFr: { acknowledgePatterns: ['A fr'], takeActionPatterns: ['Only in French'] },
      }),
    );
    // rootConcerns is AI-only (no French version) and never counts.
    expect(untranslatedHintKeys(form)).toEqual(['clarifyQuestions']);
    expect(untranslatedHintKeys(emptyObjectionForm())).toEqual([]);
  });

  it('checks the French boxes with the English limits', () => {
    const errors = objectionFormErrors({
      ...emptyObjectionForm(null, PROBIOTICS),
      title: 'T',
      example: 'E',
      coachingFr: {
        acknowledgePatterns: 'a\nb\nc\nd\ne\nf\ng',
        clarifyQuestions: 'x'.repeat(301),
        takeActionPatterns: 'ok',
      },
    });
    expect(errors.acknowledgePatternsFr).toBe('Up to 6 lines here (now 7).');
    expect(errors.clarifyQuestionsFr).toBe('Keep each line under 300 characters.');
    expect(errors.takeActionPatternsFr).toBeUndefined();
    expect(errors.acknowledgePatterns).toBeUndefined();
  });

  it('drops blank coaching lines and empty lists', () => {
    const form = { ...emptyObjectionForm(), title: 'T', example: 'E' };
    form.coaching = { ...form.coaching, clarifyQuestions: '\n  What does a normal day look like?  \n\n' };
    expect(formToWrite(form).coaching).toEqual({ clarifyQuestions: ['What does a normal day look like?'] });
  });

  it('explains every problem in words, per field', () => {
    const errors = objectionFormErrors({ ...emptyObjectionForm(), species: [] });
    expect(errors.title).toBe('Give the objection a short name.');
    expect(errors.example).toBe('Add the line an owner would typically say.');
    expect(errors.species).toBe('Choose at least one animal.');
    // The category is required: it owns the knowledge the objection's scenarios read.
    expect(errors.categoryId).toBe('Choose the category this objection belongs to, e.g. Probiotics.');

    const long = objectionFormErrors({
      ...emptyObjectionForm(),
      title: 'x'.repeat(81),
      example: 'ok',
      coaching: { ...emptyObjectionForm().coaching, watchOuts: 'a\nb\nc\nd\ne\nf\ng' },
    });
    expect(long.title).toMatch(/under 80 characters/);
    expect(long.watchOuts).toBe('Up to 6 lines here (now 7).');

    expect(
      objectionFormErrors({ ...emptyObjectionForm(null, PROBIOTICS), title: 'Probiotics', example: '“Not needed.”' }),
    ).toEqual({});
    expect(formToWrite({ ...emptyObjectionForm(null, PROBIOTICS), title: 'T', example: 'E' })).toMatchObject({
      categoryId: PROBIOTICS,
    });
    expect(formToWrite(emptyObjectionForm())).not.toHaveProperty('focusArea');
  });
});
