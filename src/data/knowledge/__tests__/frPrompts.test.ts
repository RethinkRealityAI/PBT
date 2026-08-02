import { describe, expect, it } from 'vitest';
import {
  buildCoachHintSystemPrompt,
  buildCustomerSystemPrompt,
  buildScoringSystemPrompt,
  buildVoiceSystemPrompt,
  END_SIMULATION_TOKEN,
} from '../promptBuilders';
import { SEED_SCENARIOS } from '../../scenarios';

/**
 * French prompt assertions.
 *
 * These deliberately check STRUCTURE, not exact wording — the copy will be
 * tuned by the translator agent, and pinning full French paragraphs here
 * would make every reword a test failure. What must not drift: the dialect
 * block exists, the French filler list is the one the STT clipping guard
 * needs, the coaching output is directed to French, and the end token stays
 * an untranslated ASCII literal.
 */

const scenario = SEED_SCENARIOS[0];
const fr = { scenario, locale: 'fr' as const };
const en = { scenario, locale: 'en' as const };

describe('French customer prompt', () => {
  const prompt = buildCustomerSystemPrompt(fr);

  it('replaces the American-English rule with a Québec dialect block', () => {
    expect(prompt).toContain('FRANÇAIS QUÉBÉCOIS');
    expect(prompt).not.toContain('Speak conversational AMERICAN ENGLISH');
    // The English prompt still has it — this is a swap, not a deletion.
    expect(buildCustomerSystemPrompt(en)).toContain('Speak conversational AMERICAN ENGLISH');
  });

  it('declares French as the output language while keeping English scaffolding', () => {
    expect(prompt).toContain('# OUTPUT LANGUAGE — CANADIAN FRENCH');
    // Scaffolding (the instructions ABOUT the roleplay) stays English.
    expect(prompt).toContain('You are roleplaying a Royal Canin customer');
    expect(prompt).toContain('# DIFFICULTY');
    expect(prompt).toContain('# RULES');
  });

  it('permits tutoiement where a real client would use it', () => {
    expect(prompt.toLowerCase()).toContain('tutoie');
  });

  it('uses French closing examples for the natural end', () => {
    expect(prompt).toContain("on va l'essayer");
    expect(prompt).not.toContain("Okay, that makes sense — let's give it a try.");
  });
});

describe('[END_SIMULATION] stays locale-independent', () => {
  it('is the same ASCII literal in both locales', () => {
    expect(END_SIMULATION_TOKEN).toBe('[END_SIMULATION]');
  });

  it.each(['en', 'fr'] as const)(
    'appears exactly once as the emit instruction in the %s customer prompt',
    (locale) => {
      const p = buildCustomerSystemPrompt({ scenario, locale });
      const occurrences = p.split(END_SIMULATION_TOKEN).length - 1;
      // Once in the "append the literal token" instruction, once in the
      // correct-example final message. The French prompt adds one more in the
      // never-translate note.
      expect(occurrences).toBeGreaterThanOrEqual(2);
      expect(p).toContain(`append the literal token ${END_SIMULATION_TOKEN}`);
    },
  );

  it('is never translated into a French token', () => {
    const p = buildCustomerSystemPrompt(fr);
    expect(p).not.toContain('[FIN_SIMULATION]');
    expect(p).not.toContain('[FIN_DE_SIMULATION]');
    // The counter-examples intentionally SHOW a translated token as a
    // mistake to avoid — lower-cased, inside the "Incorrect" block.
    expect(p).toContain('[fin de simulation]');
  });

  it('tells the French customer never to translate it', () => {
    expect(buildCustomerSystemPrompt(fr)).toContain('NEVER translate, accent, or re-spell the token');
    // …and adds nothing of the sort to English (byte-parity is pinned
    // separately, this just documents the intent).
    expect(buildCustomerSystemPrompt(en)).not.toContain('NEVER translate, accent, or re-spell');
  });
});

describe('French voice prompt', () => {
  const prompt = buildVoiceSystemPrompt(fr);

  it('lists the French lead-in fillers', () => {
    for (const filler of ['"Ben,"', '"Écoute,"', '"Bon,"', '"OK,"', '"Hum,"', '"Fait que,"']) {
      expect(prompt).toContain(filler);
    }
    expect(prompt).not.toContain('"Hmm,", "So,", "I mean,"');
  });

  it('keeps the STT-clipping rationale that justifies the filler rule', () => {
    expect(prompt).toContain('drops the first ~200ms of audio every turn');
    expect(prompt).toContain('ABSOLUTE LEAD-IN REQUIREMENT (CRITICAL)');
  });

  it('carries a Québec dialect instruction and French closing lines', () => {
    expect(prompt).toContain('FRANÇAIS QUÉBÉCOIS parlé');
    expect(prompt).toContain('accent québécois neutre');
    expect(prompt).toContain("on va l'essayer");
  });

  it('still carries the voice tool-call contract unchanged', () => {
    expect(prompt).toContain('updateEmotion');
    expect(prompt).toContain('endSimulation');
    expect(prompt).toContain('red (start here)');
    expect(prompt).toContain('Do not invent numeric scores');
  });

  it('uses the voice opening rule, never the text one', () => {
    expect(prompt).toContain('- Wait for the text cue to begin.');
    expect(prompt).not.toContain('- Open the conversation with your pushback');
  });
});

describe('French scorer + coach prompts', () => {
  it('direct the scorer to write coaching prose in Canadian French', () => {
    const p = buildScoringSystemPrompt(fr);
    expect(p).toContain('# OUTPUT LANGUAGE — CANADIAN FRENCH');
    expect(p).toContain('Quote transcript excerpts VERBATIM');
    // Rubric + dimension keys stay English/machine-stable.
    expect(p).toContain('# 5-DIMENSION ACT-FIRST RUBRIC');
    ['acknowledge', 'clarify', 'transform', 'empathy', 'rapport'].forEach((k) =>
      expect(p).toContain(k),
    );
  });

  it('spell the ACT steps the French way while keeping the initialism', () => {
    const p = buildScoringSystemPrompt(fr);
    expect(p).toContain('Reconnaître / Clarifier / Transformer');
    expect(p).toContain('initialism "ACT"');
  });

  it('protect the do-not-translate glossary', () => {
    const p = buildScoringSystemPrompt(fr);
    expect(p).toContain('Never translate ECHO driver names, dog breeds, Royal Canin');
  });

  it('apply the same directive to the coach nudge', () => {
    const p = buildCoachHintSystemPrompt(fr);
    expect(p).toContain('# OUTPUT LANGUAGE — CANADIAN FRENCH');
    expect(p).toContain('# THE ACT METHOD (the skill being trained)');
  });

  it('leave the English scorer and coach prompts free of the block', () => {
    expect(buildScoringSystemPrompt(en)).not.toContain('CANADIAN FRENCH');
    expect(buildCoachHintSystemPrompt(en)).not.toContain('CANADIAN FRENCH');
  });
});
