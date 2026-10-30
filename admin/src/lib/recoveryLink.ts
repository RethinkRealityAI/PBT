/**
 * What a password-reset link carried when `/admin/reset` opened.
 *
 * The recovery email's link goes through Supabase's verify endpoint, which
 * redirects here with either the new session in the hash
 * (`#access_token=…&type=recovery`) or an error (`#error_code=otp_expired…`,
 * sometimes in the query instead). Read it BEFORE supabase-js consumes and
 * clears the hash — the page decides from what the link said, never from
 * whatever session happens to be stored in the browser: on a failed link
 * supabase-js deliberately keeps an existing session, which would put the
 * signed-in admin's password behind someone else's expired link.
 */

export type RecoveryLink =
  | { kind: 'recovery'; userId: string | null }
  | { kind: 'error'; code: string | null }
  | { kind: 'none' };

export function readRecoveryLink(href: string): RecoveryLink {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: 'none' };
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const query = url.searchParams;
  const get = (k: string) => hash.get(k) ?? query.get(k);

  if (get('error') || get('error_code') || get('error_description')) {
    return { kind: 'error', code: get('error_code') };
  }
  const token = hash.get('access_token');
  if (token && hash.get('type') === 'recovery') {
    return { kind: 'recovery', userId: jwtSubject(token) };
  }
  return { kind: 'none' };
}

/**
 * The `sub` claim of a JWT, unverified — used only to check that the session
 * supabase-js ends up with belongs to the link's account (supabase-js itself
 * verifies the token with the server).
 */
export function jwtSubject(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))) as { sub?: unknown };
    return typeof json.sub === 'string' ? json.sub : null;
  } catch {
    return null;
  }
}

/**
 * The account whose reset link this TAB already confirmed — so reloading the
 * page mid-form (the hash is gone by then) still shows the form, for that
 * account only. sessionStorage: this tab only, gone when it closes.
 */
const CONFIRMED_KEY = 'pbt:admin_recovery_user';

export function rememberConfirmedRecovery(userId: string): void {
  try {
    sessionStorage.setItem(CONFIRMED_KEY, userId);
  } catch {
    /* storage blocked — a reload just asks for a new link */
  }
}

export function confirmedRecoveryUser(): string | null {
  try {
    return sessionStorage.getItem(CONFIRMED_KEY);
  } catch {
    return null;
  }
}

export function forgetConfirmedRecovery(): void {
  try {
    sessionStorage.removeItem(CONFIRMED_KEY);
  } catch {
    /* nothing to clear */
  }
}
