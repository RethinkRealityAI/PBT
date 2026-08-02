import { describe, expect, it } from 'vitest';
import { registerDataCatalog } from '../../dataRegistry';
import { frData } from '../../fr';
import {
  LIBRARY_SCENARIOS,
  SEED_SCENARIOS,
  LIFE_STAGES,
  OWNER_PERSONAS,
  PUSHBACK_CATEGORIES,
  type Scenario,
} from '../../../data/scenarios';
import { seedScenarioId } from '../../../data/scenarioOverrides';
import {
  SCENARIO_L10N_IDS,
  getLocalizedOpeningLine,
  localizedLifeStage,
  localizedPersona,
  localizedScenario,
  scenarioL10nId,
  type ScenarioDataOverlay,
} from '../scenarios';

/**
 * The lazy `import('../fr')` in translate.ts never runs under Vitest, so the
 * suite registers the overlay itself — same call loadCatalog makes.
 */
registerDataCatalog('fr', frData);

const overlay = frData.scenarios as ScenarioDataOverlay;

/** Life stages whose French label is legitimately the English string. */
const IDENTICAL_ALLOWED = new Set<string>(['Junior (1-3)']);

describe('scenario overlay coverage', () => {
  it('has one overlay id per seed scenario, in order', () => {
    expect(SCENARIO_L10N_IDS.length).toBe(SEED_SCENARIOS.length);
    expect(new Set(SCENARIO_L10N_IDS).size).toBe(SCENARIO_L10N_IDS.length);
  });

  it('resolves an id for every seed and library scenario', () => {
    for (const scenario of SEED_SCENARIOS) {
      expect(scenarioL10nId(scenario)).not.toBeNull();
    }
    for (const scenario of LIBRARY_SCENARIOS) {
      expect(scenarioL10nId(scenario)).not.toBeNull();
    }
  });

  it('resolves an id from the seed:<i> handle after an override copy', () => {
    LIBRARY_SCENARIOS.forEach((base, i) => {
      const copy: Scenario = { ...base, _overrideId: seedScenarioId(i) };
      expect(scenarioL10nId(copy)).toBe(scenarioL10nId(base));
    });
  });

  it('overlay ids match the seed scenarios they name (pushback + breed)', () => {
    SEED_SCENARIOS.forEach((scenario, i) => {
      const id = SCENARIO_L10N_IDS[i];
      expect(id.startsWith(scenario.pushback.id), `${id} vs ${scenario.pushback.id}`).toBe(true);
    });
  });

  it('French covers every seed scenario with non-empty, non-English text', () => {
    for (const id of SCENARIO_L10N_IDS) {
      const fields = overlay.scenarios[id];
      expect(fields, `missing fr overlay for ${id}`).toBeDefined();
      expect(fields.context.trim().length).toBeGreaterThan(0);
      expect(fields.openingLine.trim().length).toBeGreaterThan(0);
    }
    SEED_SCENARIOS.forEach((scenario, i) => {
      const fields = overlay.scenarios[SCENARIO_L10N_IDS[i]];
      expect(fields.context).not.toBe(scenario.context);
      expect(fields.openingLine).not.toBe(scenario.openingLine);
    });
  });

  it('French covers every life stage and owner persona', () => {
    for (const stage of LIFE_STAGES) {
      const label = overlay.lifeStages[stage];
      expect(label?.trim().length, stage).toBeGreaterThan(0);
      if (!IDENTICAL_ALLOWED.has(stage)) expect(label).not.toBe(stage);
    }
    for (const persona of OWNER_PERSONAS) {
      const label = overlay.personas[persona];
      expect(label?.trim().length, persona).toBeGreaterThan(0);
      expect(label).not.toBe(persona);
    }
  });
});

describe('localizedScenario', () => {
  it('returns the very same object for English', () => {
    for (const scenario of SEED_SCENARIOS) {
      expect(localizedScenario(scenario, 'en')).toBe(scenario);
    }
  });

  it('replaces display fields only, and never mutates the canonical object', () => {
    const canonical = SEED_SCENARIOS[0];
    const before = JSON.stringify(canonical);
    const fr = localizedScenario(canonical, 'fr');

    expect(fr).not.toBe(canonical);
    expect(fr.context).toBe(overlay.scenarios['weight-denial-lab'].context);
    expect(fr.openingLine).toBe(overlay.scenarios['weight-denial-lab'].openingLine);
    // Non-display / enum-key fields are untouched.
    expect(fr.breed).toBe(canonical.breed);
    expect(fr.age).toBe(canonical.age);
    expect(fr.persona).toBe(canonical.persona);
    expect(fr.difficulty).toBe(canonical.difficulty);
    expect(fr.suggestedDriver).toBe(canonical.suggestedDriver);
    expect(fr.pushback.id).toBe(canonical.pushback.id);
    // …and the pushback label follows the locale.
    expect(fr.pushback.title).not.toBe(canonical.pushback.title);
    expect(JSON.stringify(canonical)).toBe(before);
  });

  it('localizes every seed scenario under fr', () => {
    SEED_SCENARIOS.forEach((scenario, i) => {
      const fr = localizedScenario(scenario, 'fr');
      expect(fr.context, SCENARIO_L10N_IDS[i]).toBe(
        overlay.scenarios[SCENARIO_L10N_IDS[i]].context,
      );
      expect(fr.openingLine, SCENARIO_L10N_IDS[i]).toBe(
        overlay.scenarios[SCENARIO_L10N_IDS[i]].openingLine,
      );
    });
  });

  it('passes a user-built scenario through untouched', () => {
    const custom: Scenario = {
      breed: 'Mixed',
      age: 'Adult (3-7)',
      pushback: PUSHBACK_CATEGORIES[6], // custom
      persona: 'Busy',
      difficulty: 2,
      context: 'Owner mentioned her neighbour feeds something cheaper.',
      pushbackNotes: 'Neighbour said the store brand is identical.',
      suggestedDriver: 'Energizer',
      openingLine: 'My neighbour says the store brand is exactly the same.',
      _overrideId: 'user:abc-123',
    };
    const fr = localizedScenario(custom, 'fr');
    expect(fr.context).toBe(custom.context);
    expect(fr.openingLine).toBe(custom.openingLine);
    expect(fr.pushbackNotes).toBe(custom.pushbackNotes);
    expect(scenarioL10nId(custom)).toBeNull();
  });

  it('leaves an admin-overridden seed scenario alone (no stale translation)', () => {
    const overridden: Scenario = {
      ...LIBRARY_SCENARIOS[0],
      context: 'Admin-authored replacement context.',
      openingLine: 'Admin-authored replacement opening line.',
      _overrideId: seedScenarioId(0),
    };
    const fr = localizedScenario(overridden, 'fr');
    expect(fr.context).toBe(overridden.context);
    expect(fr.openingLine).toBe(overridden.openingLine);
  });
});

describe('getLocalizedOpeningLine', () => {
  it('returns the canonical line for English', () => {
    for (const scenario of SEED_SCENARIOS) {
      expect(getLocalizedOpeningLine(scenario, 'en')).toBe(scenario.openingLine);
    }
  });

  it('returns the French line for every seed scenario', () => {
    SEED_SCENARIOS.forEach((scenario, i) => {
      expect(getLocalizedOpeningLine(scenario, 'fr')).toBe(
        overlay.scenarios[SCENARIO_L10N_IDS[i]].openingLine,
      );
    });
  });

  it('falls back to an empty string when the scenario has no opening line', () => {
    const noLine: Scenario = { ...SEED_SCENARIOS[0], openingLine: undefined };
    expect(getLocalizedOpeningLine(noLine, 'fr')).toBe('');
    expect(getLocalizedOpeningLine(noLine, 'en')).toBe('');
  });
});

describe('life stage / persona labels', () => {
  it('return the canonical value for English', () => {
    for (const stage of LIFE_STAGES) {
      expect(localizedLifeStage(stage, 'en')).toBe(stage);
    }
    for (const persona of OWNER_PERSONAS) {
      expect(localizedPersona(persona, 'en')).toBe(persona);
    }
  });

  it('return the French label for fr', () => {
    expect(localizedLifeStage('Puppy (<1)', 'fr')).toBe('Chiot (<1)');
    expect(localizedPersona('Devoted', 'fr')).toBe('Dévoué');
  });
});
