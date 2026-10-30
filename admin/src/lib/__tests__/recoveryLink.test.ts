import { describe, expect, it } from 'vitest';
import { jwtSubject, readRecoveryLink } from '../recoveryLink';

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (sub: string) => `${b64url({ alg: 'HS256' })}.${b64url({ sub, role: 'authenticated' })}.sig`;
const BASE = 'https://rc-pbt.netlify.app/admin/reset';

describe('readRecoveryLink', () => {
  it('reads a recovery session from the hash, with its account', () => {
    const href = `${BASE}#access_token=${token('user-7')}&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery`;
    expect(readRecoveryLink(href)).toEqual({ kind: 'recovery', userId: 'user-7' });
  });

  it('reads Supabase errors from the hash or the query', () => {
    expect(
      readRecoveryLink(`${BASE}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`),
    ).toEqual({ kind: 'error', code: 'otp_expired' });
    expect(readRecoveryLink(`${BASE}?error_description=bad`)).toEqual({ kind: 'error', code: null });
  });

  it('ignores a session that is not a recovery, and a bare page', () => {
    expect(readRecoveryLink(`${BASE}#access_token=${token('u')}&type=magiclink`)).toEqual({ kind: 'none' });
    expect(readRecoveryLink(BASE)).toEqual({ kind: 'none' });
    expect(readRecoveryLink('not a url')).toEqual({ kind: 'none' });
  });
});

describe('jwtSubject', () => {
  it('decodes base64url payloads of any padding', () => {
    for (const sub of ['a', 'ab', 'abc', '5809664e-0bec-4a12-b6c3-342a949925c2']) expect(jwtSubject(token(sub))).toBe(sub);
  });
  it('returns null for anything else', () => {
    expect(jwtSubject('nope')).toBeNull();
    expect(jwtSubject('a.!!!.c')).toBeNull();
    expect(jwtSubject(`x.${b64url({ sub: 5 })}.y`)).toBeNull();
  });
});
