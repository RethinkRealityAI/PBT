import { describe, expect, it } from 'vitest';
import { checkPassword } from '../passwordStrength';

describe('checkPassword', () => {
  it('rejects short passwords regardless of strength', async () => {
    expect((await checkPassword('Tr0ub4d')).ok).toBe(false);
  });

  it('approves long passphrases', async () => {
    const r = await checkPassword('correct horse battery staple');
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(3);
  });

  it('rejects empty input', async () => {
    expect((await checkPassword('')).feedback).toContain('Enter');
  });
});
