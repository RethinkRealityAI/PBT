import { buildCustomerSystemPrompt } from '../knowledge/promptBuilders';
import type { Scenario } from '../scenarios';
import { LIBRARY_SCENARIOS } from '../scenarios';

const scenario: Scenario = LIBRARY_SCENARIOS[0];

describe('buildCustomerSystemPrompt with overrides', () => {
  it('produces a stable prompt without overrides', () => {
    const out = buildCustomerSystemPrompt(scenario);
    expect(out).toContain('You are roleplaying a Royal Canin customer');
    expect(out).not.toContain('# ADMIN NOTES');
    expect(out).not.toContain('# ADMIN ADDENDUM');
  });

  it('inserts the prefix at the very top under ADMIN NOTES', () => {
    const out = buildCustomerSystemPrompt(scenario, {
      promptPrefix: 'Be extra patient on the first turn.',
    });
    expect(out.indexOf('# ADMIN NOTES')).toBeLessThan(
      out.indexOf('You are roleplaying'),
    );
    expect(out).toContain('Be extra patient on the first turn.');
  });

  it('appends the suffix after the rules block', () => {
    const out = buildCustomerSystemPrompt(scenario, {
      promptSuffix: 'CLINIC-SPECIFIC: mention Brisbane prices.',
    });
    expect(out).toContain('# ADMIN ADDENDUM');
    expect(out).toContain('CLINIC-SPECIFIC: mention Brisbane prices.');
    // Suffix must come after the canonical rules (after RULES heading).
    expect(out.indexOf('# RULES')).toBeLessThan(out.indexOf('# ADMIN ADDENDUM'));
  });

  it('caps overrides at 1500 chars', () => {
    const long = 'x'.repeat(2000);
    const out = buildCustomerSystemPrompt(scenario, {
      promptPrefix: long,
    });
    expect(out).toContain('xxxxx');
    // The original 2000-char string must not appear unmodified.
    expect(out.includes(long)).toBe(false);
  });

  it('ignores empty / whitespace overrides', () => {
    const out = buildCustomerSystemPrompt(scenario, {
      promptPrefix: '   ',
      promptSuffix: '',
    });
    expect(out).not.toContain('# ADMIN NOTES');
    expect(out).not.toContain('# ADMIN ADDENDUM');
  });
});
