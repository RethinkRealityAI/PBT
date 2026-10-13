import { describe, expect, it } from 'vitest';
import { registerDataCatalog } from '../../dataRegistry';
import { frData } from '../../fr';
import {
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  PUSHBACK_CATEGORIES,
  SEED_SCENARIOS,
  type Scenario,
} from '../../../data/scenarios';
import type { TeamObjection } from '../../../shared/scenarios/objections';
import { localizedScenario } from '../scenarios';
import { PUSHBACK_KNOWLEDGE } from '../../../data/knowledge/pushbackTaxonomy';
import {
  BUILT_IN_CATEGORIES,
  BUILT_IN_CATEGORY_IDS,
  mergeCategories,
  type ObjectionCategory,
} from '../../../shared/scenarios/objectionCategories';
import {
  DIFFICULTY_LEVELS,
  OBJECTION_CATEGORY_IDS,
  PUSHBACK_IDS,
  localizedObjectionCategory,
  localizedDifficulty,
  localizedDifficultyLabel,
  localizedPushbackCategory,
  localizedPushbackExample,
  localizedPushbackHints,
  localizedPushbackLabel,
  localizedSessionSummary,
  type PushbackDataOverlay,
} from '../pushbacks';

registerDataCatalog('fr', frData);

const overlay = frData.pushbacks as PushbackDataOverlay;

/** Labels that legitimately read the same in French (« Hostile » is French). */
const IDENTICAL_ALLOWED = new Set<string>(['Hostile']);

describe('pushback overlay coverage', () => {
  it('PUSHBACK_IDS mirrors the canonical category and taxonomy ids', () => {
    expect([...PUSHBACK_IDS]).toEqual(PUSHBACK_CATEGORIES.map((c) => c.id));
    expect([...PUSHBACK_IDS].sort()).toEqual(Object.keys(PUSHBACK_KNOWLEDGE).sort());
  });

  it('French covers every category with non-empty, non-English text', () => {
    for (const category of PUSHBACK_CATEGORIES) {
      const l10n = overlay.categories[category.id as (typeof PUSHBACK_IDS)[number]];
      expect(l10n, `missing fr overlay for ${category.id}`).toBeDefined();
      expect(l10n.title.trim().length).toBeGreaterThan(0);
      expect(l10n.example.trim().length).toBeGreaterThan(0);
      expect(l10n.title).not.toBe(category.title);
      expect(l10n.example).not.toBe(category.example);
    }
  });

  it('French covers all four difficulty levels', () => {
    for (const level of DIFFICULTY_LEVELS) {
      const l10n = overlay.difficulties[level];
      expect(l10n, `missing fr difficulty ${level}`).toBeDefined();
      expect(l10n.label.trim().length).toBeGreaterThan(0);
      expect(l10n.description.trim().length).toBeGreaterThan(0);
      if (!IDENTICAL_ALLOWED.has(DIFFICULTY_LABELS[level])) {
        expect(l10n.label).not.toBe(DIFFICULTY_LABELS[level]);
      }
      expect(l10n.description).not.toBe(DIFFICULTY_DESCRIPTIONS[level]);
    }
  });

  it('French covers the displayed ACT cue groups for every taxonomy entry', () => {
    for (const id of PUSHBACK_IDS) {
      const canonical = PUSHBACK_KNOWLEDGE[id];
      const l10n = overlay.hints[id];
      expect(l10n, `missing fr hints for ${id}`).toBeDefined();
      expect(l10n.title).not.toBe(canonical.title);
      // Same cue counts, so the ScenarioHints slice(0, 2) shows the same cues.
      expect(l10n.acknowledgePatterns.length).toBe(canonical.acknowledgePatterns.length);
      expect(l10n.clarifyQuestions.length).toBe(canonical.clarifyQuestions.length);
      expect(l10n.takeActionPatterns.length).toBe(canonical.takeActionPatterns.length);
      for (const cue of [
        ...l10n.acknowledgePatterns,
        ...l10n.clarifyQuestions,
        ...l10n.takeActionPatterns,
      ]) {
        expect(cue.trim().length, `empty fr cue in ${id}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('localizedPushbackLabel / Example', () => {
  it('returns canonical English for en', () => {
    for (const category of PUSHBACK_CATEGORIES) {
      expect(localizedPushbackLabel(category.id, 'en')).toBe(category.title);
      expect(localizedPushbackExample(category.id, 'en')).toBe(category.example);
    }
  });

  it('returns the French label for every canonical id', () => {
    for (const id of PUSHBACK_IDS) {
      expect(localizedPushbackLabel(id, 'fr')).toBe(overlay.categories[id].title);
      expect(localizedPushbackExample(id, 'fr')).toBe(overlay.categories[id].example);
    }
  });

  it('falls back to the id for an unknown pushback', () => {
    expect(localizedPushbackLabel('not-a-pushback', 'fr')).toBe('not-a-pushback');
    expect(localizedPushbackExample('not-a-pushback', 'fr')).toBe('');
  });
});

describe('localizedPushbackCategory', () => {
  it('returns the same object for en and for an unknown id', () => {
    const category = PUSHBACK_CATEGORIES[0];
    expect(localizedPushbackCategory(category, 'en')).toBe(category);
    const unknown = { id: 'not-a-pushback', title: 'Whatever', example: 'x' };
    expect(localizedPushbackCategory(unknown, 'fr')).toBe(unknown);
  });

  it('swaps display fields only and leaves the input untouched', () => {
    const category = PUSHBACK_CATEGORIES[0];
    const snapshot = { ...category };
    const fr = localizedPushbackCategory(category, 'fr');
    expect(fr.id).toBe(category.id);
    expect(fr.title).toBe(overlay.categories.cost.title);
    expect(fr.example).toBe(overlay.categories.cost.example);
    expect(category).toEqual(snapshot);
  });
});

describe('localizedDifficulty', () => {
  it('returns canonical English for en', () => {
    for (const level of DIFFICULTY_LEVELS) {
      expect(localizedDifficulty(level, 'en')).toEqual({
        label: DIFFICULTY_LABELS[level],
        description: DIFFICULTY_DESCRIPTIONS[level],
      });
      expect(localizedDifficultyLabel(level, 'en')).toBe(DIFFICULTY_LABELS[level]);
    }
  });

  it('returns the French label + description for every level', () => {
    for (const level of DIFFICULTY_LEVELS) {
      expect(localizedDifficulty(level, 'fr')).toEqual(overlay.difficulties[level]);
      expect(localizedDifficultyLabel(level, 'fr')).toBe(overlay.difficulties[level].label);
    }
  });
});

describe('localizedPushbackHints', () => {
  it('returns null for a pushback outside the taxonomy', () => {
    expect(localizedPushbackHints('not-a-pushback', 'fr')).toBeNull();
    expect(localizedPushbackHints('not-a-pushback', 'en')).toBeNull();
  });

  it('returns the canonical entry for en', () => {
    for (const id of PUSHBACK_IDS) {
      expect(localizedPushbackHints(id, 'en')).toBe(PUSHBACK_KNOWLEDGE[id]);
    }
  });

  it('swaps the displayed cue groups but keeps prompt-only fields canonical', () => {
    const canonical = PUSHBACK_KNOWLEDGE['weight-denial'];
    const fr = localizedPushbackHints('weight-denial', 'fr');
    expect(fr).not.toBeNull();
    expect(fr!.id).toBe('weight-denial');
    expect(fr!.acknowledgePatterns).toEqual(overlay.hints['weight-denial'].acknowledgePatterns);
    expect(fr!.clarifyQuestions).toEqual(overlay.hints['weight-denial'].clarifyQuestions);
    expect(fr!.takeActionPatterns).toEqual(overlay.hints['weight-denial'].takeActionPatterns);
    // Prompt-only fields are deliberately not translated.
    expect(fr!.examples).toBe(canonical.examples);
    expect(fr!.rootConcerns).toBe(canonical.rootConcerns);
    expect(fr!.watchOuts).toBe(canonical.watchOuts);
  });

  it('does not mutate the canonical taxonomy', () => {
    const before = JSON.stringify(PUSHBACK_KNOWLEDGE);
    for (const id of PUSHBACK_IDS) localizedPushbackHints(id, 'fr');
    expect(JSON.stringify(PUSHBACK_KNOWLEDGE)).toBe(before);
  });
});

describe('team objections (Scenario Studio) — display localisation', () => {
  const PROBIOTICS: TeamObjection = {
    id: 'team:probiotics',
    title: "Probiotics: 'my dog doesn't need them'",
    example: '"He eats fine."',
    titleFr: 'Probiotiques : « mon chien n’en a pas besoin »',
    exampleFr: '« Il mange bien. »',
    species: ['dog'],
    categoryId: 'category:gi',
    coaching: {},
    visible: true,
    sortOrder: null,
    updatedAt: null,
  };
  const NO_FRENCH: TeamObjection = {
    ...PROBIOTICS,
    id: 'team:english-only',
    title: 'English only',
    example: '"Only English."',
    titleFr: null,
    exampleFr: null,
  };
  // What a scenario carries for it (resolveObjection's shape).
  const carried = {
    id: PROBIOTICS.id,
    title: PROBIOTICS.title,
    example: PROBIOTICS.example,
    titleFr: PROBIOTICS.titleFr!,
    exampleFr: PROBIOTICS.exampleFr!,
  };

  it("localizedPushbackCategory uses the team's French in fr and is untouched in en", () => {
    expect(localizedPushbackCategory(carried, 'en')).toBe(carried);
    const fr = localizedPushbackCategory(carried, 'fr');
    expect(fr.id).toBe('team:probiotics');
    expect(fr.title).toBe(PROBIOTICS.titleFr);
    expect(fr.example).toBe(PROBIOTICS.exampleFr);
  });

  it('falls back to English (same object) when the team wrote no French', () => {
    const englishOnly = { id: NO_FRENCH.id, title: NO_FRENCH.title, example: NO_FRENCH.example };
    expect(localizedPushbackCategory(englishOnly, 'fr')).toBe(englishOnly);
    const titleOnly = { ...carried, exampleFr: undefined };
    const fr = localizedPushbackCategory(titleOnly, 'fr');
    expect(fr.title).toBe(PROBIOTICS.titleFr);
    expect(fr.example).toBe(PROBIOTICS.example);
  });

  it('localizedScenario carries the French title to Chat / Home / the Library card', () => {
    const scenario: Scenario = { ...SEED_SCENARIOS[0], pushback: carried, _overrideId: 'admin:p' };
    expect(localizedScenario(scenario, 'fr').pushback.title).toBe(PROBIOTICS.titleFr);
    expect(localizedScenario(scenario, 'en')).toBe(scenario);
  });

  it('localizedPushbackLabel resolves team ids through the snapshot list', () => {
    expect(localizedPushbackLabel('team:probiotics', 'fr', [PROBIOTICS])).toBe(PROBIOTICS.titleFr);
    expect(localizedPushbackLabel('team:probiotics', 'en', [PROBIOTICS])).toBe(PROBIOTICS.title);
    expect(localizedPushbackLabel('team:english-only', 'fr', [NO_FRENCH])).toBe('English only');
    expect(localizedPushbackLabel('team:gone', 'fr', [PROBIOTICS])).toBe('team:gone');
    // Built-ins are unchanged by the extra argument.
    expect(localizedPushbackLabel('cost', 'fr', [PROBIOTICS])).toBe(overlay.categories.cost.title);
  });

  it('localizedSessionSummary swaps the leading title only', () => {
    const summary = `${PROBIOTICS.title} · Beagle`;
    expect(localizedSessionSummary(summary, 'team:probiotics', 'fr', [PROBIOTICS])).toBe(
      `${PROBIOTICS.titleFr} · Beagle`,
    );
    expect(localizedSessionSummary(summary, 'team:probiotics', 'en', [PROBIOTICS])).toBe(summary);
    // Objection no longer in the snapshot, or renamed since → stored text.
    expect(localizedSessionSummary(summary, 'team:probiotics', 'fr', [])).toBe(summary);
    expect(
      localizedSessionSummary('Old name · Beagle', 'team:probiotics', 'fr', [PROBIOTICS]),
    ).toBe('Old name · Beagle');
    // Built-ins keep their overlay behaviour.
    const cost = PUSHBACK_CATEGORIES[0];
    expect(localizedSessionSummary(`${cost.title} · Lab`, 'cost', 'fr')).toBe(
      `${overlay.categories.cost.title} · Lab`,
    );
  });
});

describe('objection categories — display localisation', () => {
  const builtIn = (id: string) => mergeCategories().find((c) => c.id === id)!;

  it('OBJECTION_CATEGORY_IDS mirrors the built-in categories', () => {
    expect([...OBJECTION_CATEGORY_IDS]).toEqual([...BUILT_IN_CATEGORY_IDS]);
  });

  it('French covers every built-in category with non-empty, non-English text', () => {
    for (const category of BUILT_IN_CATEGORIES) {
      const l10n = overlay.objectionCategories[category.id as (typeof OBJECTION_CATEGORY_IDS)[number]];
      expect(l10n, `missing fr overlay for ${category.id}`).toBeDefined();
      expect(l10n.name.trim().length).toBeGreaterThan(0);
      expect(l10n.description.trim().length).toBeGreaterThan(0);
      expect(l10n.name).not.toBe(category.name);
      expect(l10n.description).not.toBe(category.description);
    }
  });

  it('a built-in reads canonical English in en and the overlay in fr', () => {
    const weight = builtIn('weight');
    expect(localizedObjectionCategory(weight, 'en')).toEqual({
      name: 'Weight management',
      description: weight.description,
    });
    expect(localizedObjectionCategory(weight, 'fr')).toEqual(overlay.objectionCategories.weight);
  });

  it("an admin's edit of a built-in wins over the shipped translation", () => {
    const base = builtIn('everyday-nutrition');
    // French name given: shown in fr; English untouched.
    const withFr = mergeCategories([{ ...base, nameFr: 'Alimentation de tous les jours' }])[0];
    expect(localizedObjectionCategory(withFr, 'fr').name).toBe('Alimentation de tous les jours');
    expect(localizedObjectionCategory(withFr, 'en').name).toBe('Everyday nutrition');
    // Renamed without French: the admin's name in both locales (never the
    // translation of the OLD name); an unchanged description keeps its overlay.
    const renamed = mergeCategories([{ ...base, name: 'Daily feeding' }])[0];
    expect(localizedObjectionCategory(renamed, 'en').name).toBe('Daily feeding');
    expect(localizedObjectionCategory(renamed, 'fr')).toEqual({
      name: 'Daily feeding',
      description: overlay.objectionCategories['everyday-nutrition'].description,
    });
    const redescribed = mergeCategories([{ ...base, description: 'Food questions.' }])[0];
    expect(localizedObjectionCategory(redescribed, 'fr').description).toBe('Food questions.');
  });

  it('a team category uses its own French name, English when none', () => {
    const team: ObjectionCategory = {
      id: 'category:probiotics',
      name: 'Probiotics',
      nameFr: 'Probiotiques',
      description: 'Gut health supplements.',
      focusArea: null,
      knowledgeSlugs: [],
      sortOrder: null,
      builtIn: false,
      updatedAt: null,
    };
    expect(localizedObjectionCategory(team, 'fr')).toEqual({
      name: 'Probiotiques',
      description: 'Gut health supplements.',
    });
    expect(localizedObjectionCategory(team, 'en').name).toBe('Probiotics');
    expect(localizedObjectionCategory({ ...team, nameFr: null }, 'fr').name).toBe('Probiotics');
  });
});
