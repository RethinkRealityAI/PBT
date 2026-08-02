import { PUSHBACK_CATEGORIES, SEED_SCENARIOS, type Scenario } from '../../scenarios';
import type { SimulationConfig } from '../simulationConfig';
import type { PromptOverrides } from '../promptBuilders';
import type { RetrievedChunk } from '../../../services/ragShared';

/**
 * Frozen inputs for the English prompt-regression fixtures.
 *
 * These describe the *inputs only* — never how a builder is called — so the
 * same cases can be replayed through any future builder signature. The
 * captured English output lives in `__fixtures__/en/*.txt` and was generated
 * from the pre-refactor builders; `enPromptParity.test.ts` replays these
 * cases through the current builders and asserts byte-identical output.
 *
 * If a case's output legitimately changes for English, that is a product
 * decision — regenerate the fixture deliberately, never to make a red test
 * green.
 */

export const FIXTURE_SCENARIO: Scenario = SEED_SCENARIOS[0];

export const FIXTURE_CUSTOM_SCENARIO: Scenario = {
  breed: 'Beagle',
  age: 'Adult (3-7)',
  pushback: PUSHBACK_CATEGORIES.find((p) => p.id === 'custom')!,
  pushbackNotes: 'Owner says prescription diets are a scam.',
  persona: 'Skeptical',
  difficulty: 2,
  suggestedDriver: 'Activator',
  context: 'Third visit this year; already switched foods twice.',
  weightKg: '14.5',
};

export const FIXTURE_OVERRIDES: PromptOverrides = {
  promptPrefix: 'Be extra patient on the first turn.',
  promptSuffix: 'CLINIC-SPECIFIC: mention the loyalty programme.',
};

export const FIXTURE_CONFIG: SimulationConfig = {
  customerPromptPrefix: 'GLOBAL_ADMIN_NOTE_XYZ',
  customerPromptSuffix: 'GLOBAL_ADMIN_TAIL_XYZ',
  drivers: { Activator: { motivation: 'ZZ_CUSTOM_MOTIVE' } },
  scoring: {
    dimensions: [{ key: 'acknowledge', label: 'ZZ_VALIDATE', weight: 0.4 }],
    promptPrefix: 'SCORING_PREAMBLE_ABC',
    promptSuffix: 'SCORING_TAIL_ABC',
  },
};

export const FIXTURE_RETRIEVED: RetrievedChunk[] = [
  {
    content: 'Owners often resist  weight advice\nwhen cost is raised first.',
    citation: 'Davies et al., 2024',
    tags: null,
    similarity: 0.91,
  },
  {
    content: 'Bond-centred framing outperforms clinical framing.',
    citation: null,
    tags: null,
    similarity: 0.77,
  },
];

/** One fixture file per entry; `name` is the `.txt` basename. */
export interface PromptFixtureCase {
  name: string;
  builder: 'customer' | 'voice' | 'scoring' | 'coach';
  scenario: Scenario;
  overrides?: PromptOverrides;
  config?: SimulationConfig;
  retrieved?: RetrievedChunk[];
}

export const PROMPT_FIXTURE_CASES: PromptFixtureCase[] = [
  { name: 'customer-default', builder: 'customer', scenario: FIXTURE_SCENARIO },
  {
    name: 'customer-custom-pushback',
    builder: 'customer',
    scenario: FIXTURE_CUSTOM_SCENARIO,
  },
  {
    name: 'customer-full',
    builder: 'customer',
    scenario: FIXTURE_SCENARIO,
    overrides: FIXTURE_OVERRIDES,
    config: FIXTURE_CONFIG,
    retrieved: FIXTURE_RETRIEVED,
  },
  { name: 'voice-default', builder: 'voice', scenario: FIXTURE_SCENARIO },
  {
    name: 'voice-full',
    builder: 'voice',
    scenario: FIXTURE_SCENARIO,
    overrides: FIXTURE_OVERRIDES,
    config: FIXTURE_CONFIG,
    retrieved: FIXTURE_RETRIEVED,
  },
  { name: 'scoring-default', builder: 'scoring', scenario: FIXTURE_SCENARIO },
  {
    name: 'scoring-full',
    builder: 'scoring',
    scenario: FIXTURE_SCENARIO,
    config: FIXTURE_CONFIG,
    retrieved: FIXTURE_RETRIEVED,
  },
  { name: 'coach-default', builder: 'coach', scenario: FIXTURE_SCENARIO },
  {
    name: 'coach-config',
    builder: 'coach',
    scenario: FIXTURE_CUSTOM_SCENARIO,
    config: FIXTURE_CONFIG,
  },
];
