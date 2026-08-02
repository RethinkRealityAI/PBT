import { describe, expect, it } from 'vitest';
import { registerDataCatalog } from '../../dataRegistry';
import { frData } from '../../fr';
import {
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  PUSHBACK_CATEGORIES,
} from '../../../data/scenarios';
import { PUSHBACK_KNOWLEDGE } from '../../../data/knowledge/pushbackTaxonomy';
import {
  DIFFICULTY_LEVELS,
  PUSHBACK_IDS,
  localizedDifficulty,
  localizedDifficultyLabel,
  localizedPushbackCategory,
  localizedPushbackExample,
  localizedPushbackHints,
  localizedPushbackLabel,
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
