/**
 * Parity: the Studio's `draftToScenario` (shared, dependency-free — what the
 * admin inspect endpoint and the AI functions build from a draft) and the
 * consumer's `adminOverrideToScenario` (what a trainee actually plays) must
 * turn the same `scenario_overrides` row into the same runtime Scenario.
 * If these drift, the admin previews a prompt the trainee never receives.
 *
 * Known, deliberate difference NOT exercised here: the shared builder trims
 * `breed` while the consumer passes it through verbatim, so every row below
 * uses already-trimmed breed values.
 */
import { describe, expect, it } from 'vitest';
import { draftToScenario, missingScenarioFields } from '../draftToScenario';
import { adminOverrideToScenario } from '../../../data/scenarioOverrides';
import type { ScenarioOverride } from '../../../services/flagsClient';

const EMPTY: ScenarioOverride = {
  scenario_id: 'admin:00000000-0000-4000-8000-000000000000',
  visible: false,
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

/** The four fields a runnable scenario cannot do without. */
const MINIMAL: ScenarioOverride = {
  ...EMPTY,
  breed: 'Labrador Retriever',
  life_stage: 'Adult (3-7)',
  pushback_id: 'cost',
  suggested_driver: 'Analyzer',
};

const COMPLETE: ScenarioOverride = {
  ...MINIMAL,
  scenario_id: 'admin:11111111-1111-4111-8111-111111111111',
  persona_override: 'Anxious',
  difficulty_override: 3,
  context_override: '  Third visit this year.  ',
  opening_line_override: '  Why does this cost so much?  ',
  pushback_notes: '  Owner is on a fixed income.  ',
  weight_kg: 31.5,
  focus_area: '  weight  ',
  knowledge_slugs: ['royal-canin-satiety', 'bcs-primer'],
};

function expectParity(row: ScenarioOverride, label: string): void {
  const shared = draftToScenario(row);
  const consumer = adminOverrideToScenario(row);
  expect(shared, label).toEqual(consumer);
}

describe('draftToScenario ↔ adminOverrideToScenario parity', () => {
  const rows: Array<[string, ScenarioOverride]> = [
    ['minimal row', MINIMAL],
    ['complete row', COMPLETE],
    ['cat', { ...COMPLETE, species: 'cat', breed: 'Maine Coon', life_stage: 'Puppy (<1)' }],
    ['explicit dog', { ...COMPLETE, species: 'dog' }],
    ['species null', { ...COMPLETE, species: null }],
    ['species unknown', { ...COMPLETE, species: 'hamster' }],
    ['species wrong case', { ...COMPLETE, species: 'Cat' }],
    ['custom pushback', { ...MINIMAL, pushback_id: 'custom', pushback_notes: 'Diets are a scam.' }],
    ['persona unknown → Skeptical', { ...MINIMAL, persona_override: 'Grumpy' }],
    ['difficulty 0 → 2', { ...MINIMAL, difficulty_override: 0 }],
    ['difficulty 5 → 2', { ...MINIMAL, difficulty_override: 5 }],
    ['difficulty 2.5 → 2', { ...MINIMAL, difficulty_override: 2.5 }],
    ['difficulty 1 kept', { ...MINIMAL, difficulty_override: 1 }],
    ['difficulty 4 kept', { ...MINIMAL, difficulty_override: 4 }],
    ['weight 0 dropped', { ...MINIMAL, weight_kg: 0 }],
    ['weight negative dropped', { ...MINIMAL, weight_kg: -3 }],
    ['weight NaN dropped', { ...MINIMAL, weight_kg: Number.NaN }],
    ['weight Infinity dropped', { ...MINIMAL, weight_kg: Number.POSITIVE_INFINITY }],
    ['weight integer', { ...MINIMAL, weight_kg: 4 }],
    ['blank prose → undefined', {
      ...MINIMAL,
      context_override: '   ',
      opening_line_override: '',
      pushback_notes: '  ',
      focus_area: ' ',
    }],
    ['slugs empty array', { ...MINIMAL, knowledge_slugs: [] }],
    ['slugs mixed junk', {
      ...MINIMAL,
      knowledge_slugs: ['ok', '', '  ', 42, null, 'also-ok'] as unknown as string[],
    }],
    ['slugs not an array', { ...MINIMAL, knowledge_slugs: 'doc-1' as unknown as string[] }],
    ['slugs null', { ...MINIMAL, knowledge_slugs: null }],
  ];

  it.each(rows)('%s', (label, row) => {
    expect(draftToScenario(row), label).not.toBeNull();
    expectParity(row, label);
  });

  it('both return null for every missing or unknown required field', () => {
    const broken: Array<[string, ScenarioOverride]> = [
      ['no breed', { ...COMPLETE, breed: null }],
      ['empty breed', { ...COMPLETE, breed: '' }],
      ['no life stage', { ...COMPLETE, life_stage: null }],
      ['unknown life stage', { ...COMPLETE, life_stage: 'Geriatric (99+)' }],
      ['no pushback', { ...COMPLETE, pushback_id: null }],
      ['unknown pushback', { ...COMPLETE, pushback_id: 'made-up' }],
      ['no driver', { ...COMPLETE, suggested_driver: null }],
      ['retired driver', { ...COMPLETE, suggested_driver: 'Rebel' }],
      ['empty row', EMPTY],
    ];
    for (const [label, row] of broken) {
      expect(draftToScenario(row), label).toBeNull();
      expect(adminOverrideToScenario(row), label).toBeNull();
      expect(missingScenarioFields(row).length, label).toBeGreaterThan(0);
    }
  });

  it('the complete row maps every field the way the consumer does', () => {
    const scenario = draftToScenario(COMPLETE);
    expect(scenario).toMatchObject({
      breed: 'Labrador Retriever',
      age: 'Adult (3-7)',
      persona: 'Anxious',
      difficulty: 3,
      context: 'Third visit this year.',
      openingLine: 'Why does this cost so much?',
      pushbackNotes: 'Owner is on a fixed income.',
      suggestedDriver: 'Analyzer',
      weightKg: '31.5',
      focusArea: 'weight',
      knowledgeSlugs: ['royal-canin-satiety', 'bcs-primer'],
      _overrideId: COMPLETE.scenario_id,
    });
    expect(scenario?.pushback.id).toBe('cost');
    expect(scenario).not.toHaveProperty('species');
  });

  it('only a valid species produces the key — on both sides', () => {
    const cat = { ...COMPLETE, species: 'cat' };
    expect(draftToScenario(cat)?.species).toBe('cat');
    expect(adminOverrideToScenario(cat)?.species).toBe('cat');
    const junk = { ...COMPLETE, species: 'hamster' };
    expect(draftToScenario(junk)).not.toHaveProperty('species');
    expect(adminOverrideToScenario(junk)).not.toHaveProperty('species');
  });
});
