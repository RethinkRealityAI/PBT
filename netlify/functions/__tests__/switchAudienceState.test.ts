import { describe, expect, it } from 'vitest';
import { switchAudienceState, type FlagRow, type RuleRow } from '../_shared/flagRules';

const KEY = 'scenario.cat.enabled';
const flag = (v: boolean): FlagRow => ({ key: KEY, default_value: v, value_type: 'boolean' });
const rule = (audience: Record<string, unknown>, value: boolean, priority = 1): RuleRow => ({
  id: `r${priority}`,
  flag_key: KEY,
  priority,
  audience,
  value,
  enabled: true,
});

describe('switchAudienceState', () => {
  it('follows the default when there are no rules, and the code default without a row', () => {
    expect(switchAudienceState(KEY, flag(false), [], true)).toBe('off');
    expect(switchAudienceState(KEY, flag(true), [], false)).toBe('on');
    expect(switchAudienceState(KEY, null, [], false)).toBe('off');
  });

  it('an everyone rule decides for everyone', () => {
    expect(switchAudienceState(KEY, flag(false), [rule({}, true)], false)).toBe('on');
  });

  it('a targeted rule that differs makes it "some"; one that agrees changes nothing', () => {
    expect(switchAudienceState(KEY, flag(false), [rule({ user_ids: ['u1'] }, true)], false)).toBe('some');
    expect(switchAudienceState(KEY, flag(false), [rule({ percentage: 50 }, true)], false)).toBe('some');
    expect(switchAudienceState(KEY, flag(true), [rule({ drivers: ['Analyzer'] }, true)], false)).toBe('on');
  });

  it('ignores disabled rules and other keys', () => {
    expect(
      switchAudienceState(KEY, flag(false), [{ ...rule({}, true), enabled: false }, { ...rule({}, true), flag_key: 'x' }], false),
    ).toBe('off');
  });
});
