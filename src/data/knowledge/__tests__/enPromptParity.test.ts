import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildCoachHintSystemPrompt,
  buildCustomerSystemPrompt,
  buildScoringSystemPrompt,
  buildVoiceSystemPrompt,
} from '../promptBuilders';
import { PROMPT_FIXTURE_CASES, type PromptFixtureCase } from './promptFixtureCases';

/**
 * ENGLISH REGRESSION GUARD — the primary safety property of the i18n work.
 *
 * The `__fixtures__/en/*.txt` files were captured from the builders as they
 * existed BEFORE the options-object refactor and before any locale
 * conditionals were introduced. Every English prompt this app sends must
 * still be byte-for-byte those files.
 *
 * That is a stronger claim than "contains the right phrases": prompt output
 * is the actual product surface, and a stray space, a reordered bullet or a
 * dropped rule silently changes model behaviour in ways no functional test
 * would catch. If one of these fails, the English prompt changed — either
 * revert the change or regenerate the fixture as a deliberate, reviewed act.
 */

const FIXTURE_DIR = join(__dirname, '__fixtures__', 'en');

function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.txt`), 'utf8');
}

function build(c: PromptFixtureCase, locale: 'en' | 'fr'): string {
  const base = {
    scenario: c.scenario,
    overrides: c.overrides,
    config: c.config,
    retrieved: c.retrieved,
    locale,
  };
  switch (c.builder) {
    case 'customer':
      return buildCustomerSystemPrompt(base);
    case 'voice':
      return buildVoiceSystemPrompt(base);
    case 'scoring':
      return buildScoringSystemPrompt(base);
    case 'coach':
      return buildCoachHintSystemPrompt(base);
  }
}

describe('English prompt parity (byte-identical to pre-i18n output)', () => {
  it.each(PROMPT_FIXTURE_CASES.map((c) => [c.name, c] as const))(
    '%s is unchanged',
    (name, c) => {
      expect(build(c, 'en')).toBe(readFixture(name));
    },
  );

  it('omitting `locale` entirely behaves exactly like locale: "en"', () => {
    for (const c of PROMPT_FIXTURE_CASES) {
      const implicit = (() => {
        const base = {
          scenario: c.scenario,
          overrides: c.overrides,
          config: c.config,
          retrieved: c.retrieved,
        };
        switch (c.builder) {
          case 'customer':
            return buildCustomerSystemPrompt(base);
          case 'voice':
            return buildVoiceSystemPrompt(base);
          case 'scoring':
            return buildScoringSystemPrompt(base);
          case 'coach':
            return buildCoachHintSystemPrompt(base);
        }
      })();
      expect(implicit, `${c.name} (implicit locale)`).toBe(readFixture(c.name));
    }
  });

  it('mode: "text" is the default for the customer builder', () => {
    const explicit = buildCustomerSystemPrompt({
      scenario: PROMPT_FIXTURE_CASES[0].scenario,
      mode: 'text',
    });
    expect(explicit).toBe(readFixture('customer-default'));
  });

  it('mode: "voice" swaps the opening rule in place — no string surgery left', () => {
    const scenario = PROMPT_FIXTURE_CASES[0].scenario;
    const text = buildCustomerSystemPrompt({ scenario, mode: 'text' });
    const voice = buildCustomerSystemPrompt({ scenario, mode: 'voice' });

    expect(text).toContain(
      '- Open the conversation with your pushback — do not wait for staff to greet you.',
    );
    expect(voice).not.toContain('- Open the conversation with your pushback');
    expect(voice).toContain('- Wait for the text cue to begin.');
    // The voice system prompt is that same body plus the voice-mode block.
    expect(buildVoiceSystemPrompt({ scenario }).startsWith(voice)).toBe(true);
  });

  it('French output actually differs from English for every builder', () => {
    for (const c of PROMPT_FIXTURE_CASES) {
      expect(build(c, 'fr'), c.name).not.toBe(build(c, 'en'));
    }
  });
});
