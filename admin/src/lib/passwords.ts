/**
 * Admin passwords — the pure rules behind "Change password", the
 * temporary-password prompt and "Set a temporary password" (People → user →
 * Manage).
 *
 * The server (`admin-user-actions` op `set_password`) enforces the same
 * 12–72 character range; 72 is bcrypt's limit, past which Supabase Auth
 * silently ignores the rest.
 */

export const MIN_ADMIN_PASSWORD = 12;
export const MAX_ADMIN_PASSWORD = 72;

/**
 * Letters and digits a person can read aloud or copy from a screen without
 * mixing them up: no 0/O/o, 1/l/I/i, 5/S/s, 2/Z/z, 8/B.
 */
export const UNAMBIGUOUS_ALPHABET = 'abcdefghjkmnpqrtuvwxyACDEFGHJKLMNPQRTUVWXY34679';

/** The user-metadata flag the server sets with a temporary password. */
export const MUST_CHANGE_PASSWORD_KEY = 'must_change_password';

/**
 * A strong random password from the unambiguous alphabet, in groups of four
 * for reading ("aK4m-Tq7x-…"). Rejection sampling keeps every character
 * equally likely (a plain `% length` would favour the first few).
 */
export function generateTemporaryPassword(
  length = 16,
  random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b),
): string {
  const n = Math.max(16, Math.floor(length));
  const alphabet = UNAMBIGUOUS_ALPHABET;
  const limit = 256 - (256 % alphabet.length);
  const out: string[] = [];
  while (out.length < n) {
    const bytes = random(new Uint8Array(n * 2));
    for (const b of bytes) {
      if (b >= limit) continue;
      out.push(alphabet[b % alphabet.length]);
      if (out.length === n) break;
    }
  }
  return out
    .join('')
    .match(/.{1,4}/g)!
    .join('-');
}

/** Why a new password can't be used yet, in words — or null when it can. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length === 0) return 'Type a new password.';
  if (password.length < MIN_ADMIN_PASSWORD) {
    return `Use at least ${MIN_ADMIN_PASSWORD} characters (now ${password.length}).`;
  }
  if (password.length > MAX_ADMIN_PASSWORD) {
    return `Keep it to ${MAX_ADMIN_PASSWORD} characters or fewer (now ${password.length}).`;
  }
  if (password.trim() !== password) return 'Remove the spaces at the start or end.';
  if (confirm !== undefined && confirm !== password) return 'The two passwords don’t match yet.';
  return null;
}

/** True when the signed-in user's metadata says they're on a temporary password. */
export function mustChangePassword(user: { user_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  return user?.user_metadata?.[MUST_CHANGE_PASSWORD_KEY] === true;
}

/** Sentences for a password-change failure from Supabase Auth. */
export function passwordChangeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (/same.*(old|previous|current)|different from the old/i.test(raw)) {
    return 'That’s the password you already have — choose a new one.';
  }
  if (/weak|pwned|leaked|compromised/i.test(raw)) {
    return 'That password is too easy to guess (it has appeared in known leaks). Choose a different one.';
  }
  if (/session|jwt|not authenticated|expired/i.test(raw)) {
    return 'Your sign-in has expired. Sign out, sign back in, and try again.';
  }
  return raw ? `The password wasn’t changed: ${raw}` : 'The password wasn’t changed. Try again.';
}
