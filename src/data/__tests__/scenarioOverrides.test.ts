import { describe, it, expect } from 'vitest';
import {
  adminOverrideToScenario,
  applyScenarioOverride,
  isAdminScenarioId,
  seedScenarioId,
} from '../scenarioOverrides';
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
  card_title_override: null,
  card_subtitle_override: null,
  info_modal_title: null,
  info_modal_body: null,
  start_button_label: null,
  card_driver_override: null,
  breed: null,
  life_stage: null,
  pushback_id: null,
  pushback_notes: null,
  suggested_driver: null,
  weight_kg: null,
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

  it('isAdminScenarioId only matches admin: prefix', () => {
    expect(isAdminScenarioId('admin:abc')).toBe(true);
    expect(isAdminScenarioId('seed:0')).toBe(false);
    expect(isAdminScenarioId('user:xyz')).toBe(false);
  });

  it('adminOverrideToScenario returns null when required fields missing', () => {
    const incomplete: ScenarioOverride = {
      ...NULL_OVERRIDE,
      scenario_id: 'admin:abc',
      // missing breed
      life_stage: 'Adult (3-7)',
      pushback_id: 'cost',
      suggested_driver: 'Activator',
    };
    expect(adminOverrideToScenario(incomplete)).toBeNull();
  });

  it('adminOverrideToScenario builds a runtime Scenario from a complete row', () => {
    const complete: ScenarioOverride = {
      ...NULL_OVERRIDE,
      scenario_id: 'admin:abc',
      breed: 'Mixed',
      life_stage: 'Senior (7+)',
      pushback_id: 'cost',
      suggested_driver: 'Harmonizer',
      persona_override: 'Devoted',
      difficulty_override: 3,
      opening_line_override: 'I love her so much, but the price…',
      context_override: 'Fixed-income owner.',
      weight_kg: 12,
    };
    const scenario = adminOverrideToScenario(complete);
    expect(scenario).not.toBeNull();
    expect(scenario?.breed).toBe('Mixed');
    expect(scenario?.age).toBe('Senior (7+)');
    expect(scenario?.suggestedDriver).toBe('Harmonizer');
    expect(scenario?.persona).toBe('Devoted');
    expect(scenario?.difficulty).toBe(3);
    expect(scenario?.openingLine).toBe('I love her so much, but the price…');
    expect(scenario?.weightKg).toBe('12');
    expect(scenario?._overrideId).toBe('admin:abc');
    // Pushback resolved via PUSHBACK_CATEGORIES lookup
    expect(scenario?.pushback.id).toBe('cost');
  });

  it('adminOverrideToScenario rejects unknown driver', () => {
    const bad: ScenarioOverride = {
      ...NULL_OVERRIDE,
      scenario_id: 'admin:abc',
      breed: 'Mixed',
      life_stage: 'Adult (3-7)',
      pushback_id: 'cost',
      suggested_driver: 'NotADriver',
    };
    expect(adminOverrideToScenario(bad)).toBeNull();
  });
});
