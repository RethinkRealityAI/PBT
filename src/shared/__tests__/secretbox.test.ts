/**
 * Credential-at-rest helpers used by the email settings endpoint. The module
 * lives with the Netlify Functions (it needs `node:crypto`), but its behaviour
 * is worth pinning here — a silent regression means provider credentials
 * stored in the clear.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  generateToken,
  hasDedicatedSecretKey,
  hashToken,
  maskSecret,
} from '../../../netlify/functions/_shared/secretbox';

const OLD_ENV = { ...process.env };

beforeEach(() => {
  process.env.EMAIL_SECRET_KEY = 'test-key-material';
});

afterEach(() => {
  process.env = { ...OLD_ENV };
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a value', () => {
    const secret = 're_live_abcdef1234567890';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces different ciphertext each time (fresh IV)', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('does not leak the plaintext into the stored payload', () => {
    const payload = encryptSecret('super-secret-value');
    expect(payload).not.toContain('super-secret-value');
    expect(payload.startsWith('v1.')).toBe(true);
  });

  it('refuses to decrypt under a different key', () => {
    const payload = encryptSecret('secret');
    process.env.EMAIL_SECRET_KEY = 'a-different-key';
    expect(() => decryptSecret(payload)).toThrow();
  });

  it('rejects a tampered payload rather than returning garbage', () => {
    const [v, iv, tag, data] = encryptSecret('secret').split('.');
    const flipped = data.startsWith('A') ? `B${data.slice(1)}` : `A${data.slice(1)}`;
    expect(() => decryptSecret([v, iv, tag, flipped].join('.'))).toThrow();
  });

  it('passes through empty and hand-seeded plaintext values', () => {
    expect(decryptSecret(null)).toBe('');
    expect(decryptSecret('')).toBe('');
    // A row seeded by hand (not in our format) still works.
    expect(decryptSecret('re_plain_value')).toBe('re_plain_value');
  });

  it('falls back to the service-role key when no dedicated key is set', () => {
    delete process.env.EMAIL_SECRET_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    expect(hasDedicatedSecretKey()).toBe(false);
    expect(decryptSecret(encryptSecret('x'))).toBe('x');
  });

  it('throws rather than storing plaintext when no key material exists at all', () => {
    delete process.env.EMAIL_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => encryptSecret('x')).toThrow(/EMAIL_SECRET_KEY/);
  });
});

describe('maskSecret', () => {
  it('shows enough to recognise a key and not enough to use it', () => {
    expect(maskSecret('re_live_abcdef1234')).toBe('re_l…1234');
    expect(maskSecret('short')).toBe('••••');
    expect(maskSecret('')).toBe('');
  });
});

describe('invite tokens', () => {
  it('hashes deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
    expect(hashToken('abc')).toHaveLength(64);
  });

  it('generates URL-safe, non-repeating tokens', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateToken()));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
