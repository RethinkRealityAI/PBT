import { applyScenarioOverride, seedScenarioId } from '../scenarioOverrides';
import type { Scenario } from '../scenarios';
import { LIBRARY_SCENARIOS } from '../scenarios';
import type { ScenarioOverride } from '../../services/flagsClient';

const base: Scenario = LIBRARY_SCENARIOS[0];

const NULL_OVERRIDE: ScenarioOverride = {
  scenario_id: 'seed:0',
  visible: true,
  sort_order: null,
  title_override: null,
  context_override: null,
  opening_line_override: null,
  difficulty_override: null,
  persona_override: null,
  prompt_prefix: null,
  prompt_suffix: null,
};

describe('scenarioOverrides', () => {
  it('seedScenarioId formats indices', () => {
    expect(seedScenarioId(0)).toBe('seed:0');
    expect(seedScenarioId(7)).toBe('seed:7');
  });

  it('returns base unchanged when override is null', () => {
    expect(applyScenarioOverride(base, null)).toBe(base);
  });

  it('stamps _overrideId when supplied without an override', () => {
    const result = applyScenarioOverride(base, null, 'seed:0');
    expect(result._overrideId).toBe('seed:0');
    expect(result.persona).toBe(base.persona);
  });

  it('merges field-level overrides', () => {
    const merged = applyScenarioOverride(
      base,
      {
        ...NULL_OVERRIDE,
        difficulty_override: 4,
        persona_override: 'Anxious',
        opening_line_override: 'Replacement opener.',
      },
      'seed:0',
    );
    expect(merged.difficulty).toBe(4);
    expect(merged.persona).toBe('Anxious');
    expect(merged.openingLine).toBe('Replacement opener.');
    expect(merged._overrideId).toBe('seed:0');
  });

  it('rejects invalid persona / difficulty values and keeps base', () => {
    const merged = applyScenarioOverride(
      base,
      {
        ...NULL_OVERRIDE,
        difficulty_override: 99,
        persona_override: 'Nonsense',
      },
      'seed:0',
    );
    expect(merged.difficulty).toBe(base.difficulty);
    expect(merged.persona).toBe(base.persona);
  });
});
