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
    const p = buildCustomerSystemPrompt({ scenario });
    expect(p).toContain(scenario.breed);
    expect(p).toContain(scenario.suggestedDriver);
    expect(p).toContain(scenario.pushback.title);
    expect(p).toContain(scenario.pushback.example);
  });

  it('customer prompt enforces no-AI-mention rule', () => {
    const p = buildCustomerSystemPrompt({ scenario });
    expect(p.toLowerCase()).toContain('never mention that you are an ai');
  });

  it('scoring prompt lists all 5 ACT-first dimensions and the ACT method', () => {
    const p = buildScoringSystemPrompt({ scenario });
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
    const p = buildVoiceSystemPrompt({ scenario });
    expect(p).toContain('updateEmotion');
    expect(p).toContain('endSimulation');
    expect(p).toContain('Do not invent numeric scores');
  });

  it('custom pushback pulls trainee wording into the prompt', () => {
    const block = formatPushbackPromptSection(customScenario);
    expect(block).toContain('CUSTOM OBJECTION');
    expect(block).toContain('prescription diets');
    const p = buildCustomerSystemPrompt({ scenario: customScenario });
    expect(p).toContain('prescription diets');
  });

  it('different scenarios produce different prompts', () => {
    const p1 = buildCustomerSystemPrompt({ scenario: SEED_SCENARIOS[0] });
    const p2 = buildCustomerSystemPrompt({ scenario: SEED_SCENARIOS[1] });
    expect(p1).not.toEqual(p2);
  });

  describe('simulation config', () => {
    it('customer prompt reflects an admin driver-persona override', () => {
      const config = { drivers: { Activator: { motivation: 'ZZ_CUSTOM_MOTIVE' } } };
      const activatorScenario = SEED_SCENARIOS.find((s) => s.suggestedDriver === 'Activator')!;
      const p = buildCustomerSystemPrompt({ scenario: activatorScenario, config });
      expect(p).toContain('ZZ_CUSTOM_MOTIVE');
    });

    it('customer prompt reflects a global config prompt prefix', () => {
      const p = buildCustomerSystemPrompt({
        scenario,
        config: { customerPromptPrefix: 'GLOBAL_ADMIN_NOTE_XYZ' },
      });
      expect(p).toContain('GLOBAL_ADMIN_NOTE_XYZ');
    });

    it('scoring prompt reflects an admin dimension label + weight + scoring prefix', () => {
      const p = buildScoringSystemPrompt({
        scenario,
        config: {
          scoring: {
            dimensions: [{ key: 'acknowledge', label: 'ZZ_VALIDATE', weight: 0.4 }],
            promptPrefix: 'SCORING_PREAMBLE_ABC',
          },
        },
      });
      expect(p).toContain('ZZ_VALIDATE');
      expect(p).toContain('weight 34% of the overall score');
      expect(p).toContain('SCORING_PREAMBLE_ABC');
    });

    it('injects retrieved reference/evidence blocks only when provided', () => {
      const retrieved = [
        { content: 'Owners often resist weight advice.', citation: 'Davies et al., 2024', tags: null, similarity: 0.9 },
      ];
      const customer = buildCustomerSystemPrompt({ scenario, retrieved });
      expect(customer).toContain('WHAT RESEARCH SAYS ABOUT OWNERS LIKE YOU');
      expect(customer).toContain('[Davies et al., 2024]');
      expect(customer).toContain('never cite authors or years in dialogue');

      const scoring = buildScoringSystemPrompt({ scenario, retrieved });
      expect(scoring).toContain('# EVIDENCE BASE');
      expect(scoring).toContain('[Davies et al., 2024]');

      // Absent retrieval → prompts identical to today (no empty block).
      expect(buildCustomerSystemPrompt({ scenario })).not.toContain('WHAT RESEARCH SAYS');
      expect(buildScoringSystemPrompt({ scenario })).not.toContain('EVIDENCE BASE');
    });

    it('falls back to code defaults when config is empty', () => {
      const withEmpty = buildScoringSystemPrompt({ scenario, config: {} });
      const withNone = buildScoringSystemPrompt({ scenario });
      expect(withEmpty).toEqual(withNone);
    });
  });
});

describe('scorer + coach answer key, and per-scenario success criteria', () => {
  const teamScenario: Scenario = {
    ...scenario,
    pushback: { id: 'team:probiotics', title: 'Probiotics: "he doesn\'t need them"', example: 'He eats well already.' } as Scenario['pushback'],
  };
  const config = {
    pushbacks: {
      'team:probiotics': {
        title: 'Probiotics',
        rootConcerns: ['Thinks supplements are a money grab'],
        clarifyQuestions: ['What have you heard about probiotics?'],
        takeActionPatterns: ['A two-week trial with a follow-up call'],
        watchOuts: ['Leading with the price'],
      },
    },
  };

  it("gives the scorer the objection's concerns, questions, next steps and mistakes", () => {
    const p = buildScoringSystemPrompt({ scenario: teamScenario, config });
    expect(p).toContain('# WHAT GOOD LOOKS LIKE FOR THIS OBJECTION');
    expect(p).toContain('- Thinks supplements are a money grab');
    expect(p).toContain('- What have you heard about probiotics?');
    expect(p).toContain('- A two-week trial with a follow-up call');
    expect(p).toContain('(mark them down):\n- Leading with the price');
  });

  it('gives the coach the same key, worded as background rather than grading', async () => {
    const { buildCoachHintSystemPrompt } = await import('../promptBuilders');
    const p = buildCoachHintSystemPrompt({ scenario: teamScenario, config });
    expect(p).toContain('A two-week trial with a follow-up call');
    expect(p).toContain('steer the trainee away from them');
    expect(p).not.toContain('mark them down');
  });

  it('skips the key entirely for an objection without coaching', () => {
    // A team objection whose coaching the server could not load / never had.
    const p = buildScoringSystemPrompt({ scenario: teamScenario });
    expect(p).not.toContain('WHAT GOOD LOOKS LIKE');
  });

  it('puts success criteria in the scorer only — never in the customer prompt', () => {
    const overrides = { successCriteria: 'Offers a two-week trial and books a follow-up call.' };
    const scoring = buildScoringSystemPrompt({ scenario: teamScenario, config, overrides });
    expect(scoring).toContain("# THIS SCENARIO'S SUCCESS CRITERIA");
    expect(scoring).toContain('Offers a two-week trial and books a follow-up call.');
    const customer = buildCustomerSystemPrompt({ scenario: teamScenario, config, overrides });
    expect(customer).not.toContain('books a follow-up call');
    expect(customer).not.toContain('SUCCESS CRITERIA');
  });

  it('prints no "UNDER THE SURFACE" heading for coaching without root concerns', () => {
    const hintsOnly = { pushbacks: { 'team:probiotics': { title: 'P', watchOuts: ['Pitching first'] } } };
    const customer = buildCustomerSystemPrompt({ scenario: teamScenario, config: hintsOnly });
    expect(customer).not.toContain('UNDER THE SURFACE');
    expect(buildScoringSystemPrompt({ scenario: teamScenario, config: hintsOnly })).toContain('- Pitching first');
  });
});
