import { describe, expect, it } from 'vitest';
import {
  buildCustomerSystemPrompt,
  buildScoringSystemPrompt,
  buildVoiceSystemPrompt,
  formatPushbackPromptSection,
} from '../promptBuilders';
import { PUSHBACK_CATEGORIES, SEED_SCENARIOS, type Scenario } from '../../scenarios';

const scenario = SEED_SCENARIOS[0];

const customScenario: Scenario = {
  breed: 'Beagle',
  age: 'Adult (3-7)',
  pushback: PUSHBACK_CATEGORIES.find((p) => p.id === 'custom')!,
  pushbackNotes: 'Owner says prescription diets are a scam.',
  persona: 'Skeptical',
  difficulty: 2,
  suggestedDriver: 'Activator',
};

describe('promptBuilders', () => {
  it('customer prompt includes driver, pushback, dog details', () => {
    const p = buildCustomerSystemPrompt(scenario);
    expect(p).toContain(scenario.breed);
    expect(p).toContain(scenario.suggestedDriver);
    expect(p).toContain(scenario.pushback.title);
    expect(p).toContain(scenario.pushback.example);
  });

  it('customer prompt enforces no-AI-mention rule', () => {
    const p = buildCustomerSystemPrompt(scenario);
    expect(p.toLowerCase()).toContain('never mention that you are an ai');
  });

  it('scoring prompt lists all 5 ACT-first dimensions and the ACT method', () => {
    const p = buildScoringSystemPrompt(scenario);
    ['acknowledge', 'clarify', 'transform', 'empathy', 'rapport'].forEach((k) =>
      expect(p).toContain(k),
    );
    expect(p).toContain('Acknowledge');
    expect(p).toContain('Clarify');
    expect(p).toContain('Transform');
    // The overhaul is explicitly empathy-first, not sales-first.
    expect(p).not.toContain('sales coach');
  });

  it('voice prompt extends customer prompt with tool-call guidance', () => {
    const p = buildVoiceSystemPrompt(scenario);
    expect(p).toContain('updateEmotion');
    expect(p).toContain('endSimulation');
    expect(p).toContain('Do not invent numeric scores');
  });

  it('custom pushback pulls trainee wording into the prompt', () => {
    const block = formatPushbackPromptSection(customScenario);
    expect(block).toContain('CUSTOM OBJECTION');
    expect(block).toContain('prescription diets');
    const p = buildCustomerSystemPrompt(customScenario);
    expect(p).toContain('prescription diets');
  });

  it('different scenarios produce different prompts', () => {
    const p1 = buildCustomerSystemPrompt(SEED_SCENARIOS[0]);
    const p2 = buildCustomerSystemPrompt(SEED_SCENARIOS[1]);
    expect(p1).not.toEqual(p2);
  });

  describe('simulation config', () => {
    it('customer prompt reflects an admin driver-persona override', () => {
      const config = { drivers: { Activator: { motivation: 'ZZ_CUSTOM_MOTIVE' } } };
      const activatorScenario = SEED_SCENARIOS.find((s) => s.suggestedDriver === 'Activator')!;
      const p = buildCustomerSystemPrompt(activatorScenario, {}, config);
      expect(p).toContain('ZZ_CUSTOM_MOTIVE');
    });

    it('customer prompt reflects a global config prompt prefix', () => {
      const p = buildCustomerSystemPrompt(scenario, {}, {
        customerPromptPrefix: 'GLOBAL_ADMIN_NOTE_XYZ',
      });
      expect(p).toContain('GLOBAL_ADMIN_NOTE_XYZ');
    });

    it('scoring prompt reflects an admin dimension label + weight + scoring prefix', () => {
      const p = buildScoringSystemPrompt(scenario, {
        scoring: {
          dimensions: [{ key: 'acknowledge', label: 'ZZ_VALIDATE', weight: 0.4 }],
          promptPrefix: 'SCORING_PREAMBLE_ABC',
        },
      });
      expect(p).toContain('ZZ_VALIDATE');
      expect(p).toContain('weight 0.4');
      expect(p).toContain('SCORING_PREAMBLE_ABC');
    });

    it('falls back to code defaults when config is empty', () => {
      const withEmpty = buildScoringSystemPrompt(scenario, {});
      const withNone = buildScoringSystemPrompt(scenario);
      expect(withEmpty).toEqual(withNone);
    });
  });
});
