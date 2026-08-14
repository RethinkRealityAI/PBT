/**
 * Stepped Scenario Builder — the pure step model.
 *
 * These guard the two things a layout refactor can silently break: a field
 * quietly dropping out of every step (so its override state stops showing on
 * the stepper) and the "has overrides" dot lying about what a save would write.
 */
import { describe, expect, it } from 'vitest';
import {
  BUILDER_STEPS,
  REQUIRED_ADMIN_FIELDS,
  computeStepStates,
  hasOverrideValue,
} from '../ScenarioBuilderScreen';
import type { ScenarioOverrideRow } from '../../data/types';

/** Every editable column of the draft model — `scenario_id` is not editable. */
const EDITABLE_COLUMNS: Array<keyof ScenarioOverrideRow> = [
  'visible',
  'sort_order',
  'title_override',
  'context_override',
  'opening_line_override',
  'difficulty_override',
  'persona_override',
  'prompt_prefix',
  'prompt_suffix',
  'card_title_override',
  'card_subtitle_override',
  'info_modal_title',
  'info_modal_body',
  'start_button_label',
  'card_driver_override',
  'breed',
  'life_stage',
  'pushback_id',
  'pushback_notes',
  'suggested_driver',
  'weight_kg',
  'focus_area',
  'knowledge_slugs',
];

describe('BUILDER_STEPS', () => {
  it('covers every editable column exactly once', () => {
    const all = BUILDER_STEPS.flatMap((s) => s.fields);
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...EDITABLE_COLUMNS].sort());
  });

  it('has four uniquely-keyed steps in editing order', () => {
    expect(BUILDER_STEPS.map((s) => s.key)).toEqual([
      'scenario',
      'knowledge',
      'ai',
      'card',
    ]);
  });

  it('keeps the required admin fields on the scenario step', () => {
    const scenario = BUILDER_STEPS.find((s) => s.key === 'scenario')!;
    for (const req of REQUIRED_ADMIN_FIELDS) {
      expect(scenario.fields).toContain(req.key);
    }
  });
});

describe('hasOverrideValue', () => {
  it('treats empty-ish values as "no override"', () => {
    expect(hasOverrideValue(null)).toBe(false);
    expect(hasOverrideValue(undefined)).toBe(false);
    expect(hasOverrideValue('')).toBe(false);
    expect(hasOverrideValue('   ')).toBe(false);
    expect(hasOverrideValue([])).toBe(false);
    expect(hasOverrideValue(false)).toBe(false);
    expect(hasOverrideValue(Number.NaN)).toBe(false);
  });

  it('counts real values, including 0 (a legitimate sort order)', () => {
    expect(hasOverrideValue(0)).toBe(true);
    expect(hasOverrideValue('Lab')).toBe(true);
    expect(hasOverrideValue(['bcs-chart'])).toBe(true);
    expect(hasOverrideValue(true)).toBe(true);
  });
});

describe('computeStepStates', () => {
  const empty = { sparse: {}, draft: {}, baseVisible: true, requireCoreFields: false };

  it('reports no overrides for an untouched library scenario', () => {
    const states = computeStepStates(empty);
    for (const step of BUILDER_STEPS) {
      expect(states[step.key].overrides).toBe(0);
      expect(states[step.key].missing).toEqual([]);
    }
  });

  it('attributes each overridden field to its own step', () => {
    const states = computeStepStates({
      ...empty,
      sparse: {
        breed: 'Mini Schnauzer',
        context_override: 'Owner is in a hurry.',
        prompt_suffix: 'Never agree before asking about price.',
        knowledge_slugs: ['bcs-chart'],
        card_title_override: null,
      },
    });
    expect(states.scenario.overrides).toBe(2);
    expect(states.knowledge.overrides).toBe(1);
    expect(states.ai.overrides).toBe(1);
    expect(states.card.overrides).toBe(0);
  });

  it('ignores blank strings the save path would null out', () => {
    const states = computeStepStates({
      ...empty,
      sparse: { breed: '   ', prompt_prefix: '' },
    });
    expect(states.scenario.overrides).toBe(0);
    expect(states.ai.overrides).toBe(0);
  });

  it('flags `visible` only when it differs from how the scenario ships', () => {
    // Library scenario, still visible → not an override.
    expect(
      computeStepStates({ ...empty, draft: { visible: true }, baseVisible: true }).card
        .overrides,
    ).toBe(0);
    // Library scenario pulled from the app → an override worth a dot.
    expect(
      computeStepStates({ ...empty, draft: { visible: false }, baseVisible: true }).card
        .overrides,
    ).toBe(1);
    // Admin-authored scenarios start hidden, so publishing one is the change.
    expect(
      computeStepStates({ ...empty, draft: { visible: true }, baseVisible: false }).card
        .overrides,
    ).toBe(1);
  });

  it('lists missing required fields for admin-authored scenarios only', () => {
    const draft: Partial<ScenarioOverrideRow> = {
      breed: 'Lab',
      life_stage: null,
      pushback_id: '',
      suggested_driver: 'Analyzer',
    };
    const admin = computeStepStates({
      sparse: draft,
      draft,
      baseVisible: false,
      requireCoreFields: true,
    });
    expect(admin.scenario.missing).toEqual(['Life stage', 'Pushback']);
    // Other steps never carry the required-field warning.
    expect(admin.knowledge.missing).toEqual([]);
    expect(admin.card.missing).toEqual([]);

    const library = computeStepStates({
      sparse: draft,
      draft,
      baseVisible: true,
      requireCoreFields: false,
    });
    expect(library.scenario.missing).toEqual([]);
  });
});
