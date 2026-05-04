import { describe, expect, it } from 'vitest';
import {
  buildCustomerSystemPrompt,
  buildScoringSystemPrompt,
  buildVoiceSystemPrompt,
} from '../promptBuilders';
import { SEED_SCENARIOS } from '../../scenarios';

const scenario = SEED_SCENARIOS[0];

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

  it('scoring prompt lists all 7 dimensions and the ACT method', () => {
    const p = buildScoringSystemPrompt(scenario);
    [
      'empathyTone',
      'activeListening',
      'productKnowledge',
      'objectionHandling',
      'confidence',
      'closingEffectiveness',
      'pacing',
    ].forEach((k) => expect(p).toContain(k));
    expect(p).toContain('Acknowledge');
    expect(p).toContain('Clarify');
    expect(p).toContain('Take Action');
  });

  it('voice prompt extends customer prompt with tool-call guidance', () => {
    const p = buildVoiceSystemPrompt(scenario);
    expect(p).toContain('updateEmotion');
    expect(p).toContain('endSimulation');
  });

  it('different scenarios produce different prompts', () => {
    const p1 = buildCustomerSystemPrompt(SEED_SCENARIOS[0]);
    const p2 = buildCustomerSystemPrompt(SEED_SCENARIOS[1]);
    expect(p1).not.toEqual(p2);
  });
});
