import { describe, expect, it } from 'vitest';
import { checkPassword } from '../passwordStrength';

describe('checkPassword', () => {
  it('rejects short passwords regardless of strength', () => {
    expect(checkPassword('Tr0ub4d').ok).toBe(false);
  });

  it('approves long passphrases', () => {
    const r = checkPassword('correct horse battery staple');
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(3);
  });

  it('rejects empty input', () => {
    expect(checkPassword('').feedback).toContain('Enter');
  });
});
