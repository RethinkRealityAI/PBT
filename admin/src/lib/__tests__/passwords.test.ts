import { describe, expect, it } from 'vitest';
import {
  MIN_ADMIN_PASSWORD,
  UNAMBIGUOUS_ALPHABET,
  generateTemporaryPassword,
  mustChangePassword,
  passwordChangeError,
  passwordProblem,
} from '../passwords';
import { canSetTemporaryPassword } from '../../screens/TemporaryPassword';

describe('generateTemporaryPassword', () => {
  it('makes 16+ characters from the unambiguous alphabet, in readable groups of four', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateTemporaryPassword(16);
      expect(pw).toMatch(/^[^-]{4}(-[^-]{4}){3}$/);
      const chars = pw.replace(/-/g, '');
      expect(chars).toHaveLength(16);
      for (const c of chars) expect(UNAMBIGUOUS_ALPHABET).toContain(c);
      expect(passwordProblem(pw)).toBeNull();
    }
    expect(generateTemporaryPassword(4).replace(/-/g, '')).toHaveLength(16);
  });

  it('never uses look-alike characters', () => {
    for (const c of '0O1lIiS5sZz2B8o') expect(UNAMBIGUOUS_ALPHABET).not.toContain(c);
  });

  it('skips bytes that would bias the choice (rejection sampling)', () => {
    let call = 0;
    // First draw: every byte is above the unbiased limit, so all are skipped.
    const random = (b: Uint8Array) => {
      b.fill(call++ === 0 ? 255 : 0);
      return b;
    };
    expect(generateTemporaryPassword(16, random).replace(/-/g, '')).toBe(UNAMBIGUOUS_ALPHABET[0].repeat(16));
    expect(call).toBe(2);
  });

  it('is different every time', () => {
    const seen = new Set(Array.from({ length: 20 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(20);
  });
});

describe('passwordProblem', () => {
  it('explains each problem in words', () => {
    expect(passwordProblem('')).toBe('Type a new password.');
    expect(passwordProblem('short')).toBe(`Use at least ${MIN_ADMIN_PASSWORD} characters (now 5).`);
    expect(passwordProblem('x'.repeat(73))).toBe('Keep it to 72 characters or fewer (now 73).');
    expect(passwordProblem(' padded-password ')).toBe('Remove the spaces at the start or end.');
    expect(passwordProblem('a long enough one', 'a long enough onE')).toBe('The two passwords don’t match yet.');
    expect(passwordProblem('a long enough one', 'a long enough one')).toBeNull();
    expect(passwordProblem('a long enough one')).toBeNull();
  });
});

describe('the temporary-password flag and errors', () => {
  it('reads must_change_password from user metadata (true only)', () => {
    expect(mustChangePassword({ user_metadata: { must_change_password: true } })).toBe(true);
    expect(mustChangePassword({ user_metadata: { must_change_password: 'true' } })).toBe(false);
    expect(mustChangePassword({ user_metadata: {} })).toBe(false);
    expect(mustChangePassword(null)).toBe(false);
  });

  it('turns Supabase’s errors into plain sentences', () => {
    expect(passwordChangeError(new Error('New password should be different from the old password.'))).toMatch(
      /already have/,
    );
    expect(passwordChangeError(new Error('Password is known to be weak and easy to guess'))).toMatch(/too easy to guess/);
    expect(passwordChangeError(new Error('Auth session missing!'))).toMatch(/Sign out, sign back in/);
    expect(passwordChangeError(null)).toBe('The password wasn’t changed. Try again.');
  });
});

describe('canSetTemporaryPassword', () => {
  const base = { canTeamManage: true, isSelf: false, targetIsOwner: false, actorIsOwner: false };
  it('needs team.manage, is never for yourself, and an owner’s only by an owner', () => {
    expect(canSetTemporaryPassword(base)).toBe(true);
    expect(canSetTemporaryPassword({ ...base, canTeamManage: false })).toBe(false);
    expect(canSetTemporaryPassword({ ...base, isSelf: true, actorIsOwner: true })).toBe(false);
    expect(canSetTemporaryPassword({ ...base, targetIsOwner: true })).toBe(false);
    expect(canSetTemporaryPassword({ ...base, targetIsOwner: true, actorIsOwner: true })).toBe(true);
  });
});
