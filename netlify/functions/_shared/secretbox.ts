/**
 * Symmetric encryption for provider credentials at rest.
 *
 * The Resend API key and SMTP password are entered in the admin portal, so
 * they have to live in the database — but a database dump should not hand
 * anyone the ability to send mail as you. They are stored as AES-256-GCM
 * ciphertext keyed by `EMAIL_SECRET_KEY`, which only the function runtime
 * holds. Decryption happens at send time and the plaintext never leaves the
 * function: the settings endpoint returns a masked hint, never the value.
 *
 * Format: `v1.<iv-b64>.<tag-b64>.<ciphertext-b64>`
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'v1';

/**
 * 32-byte key derived from EMAIL_SECRET_KEY. Falls back to the service-role
 * key so a deploy that hasn't set EMAIL_SECRET_KEY still encrypts rather than
 * storing plaintext — rotating to a real key later just requires re-entering
 * the credentials.
 */
function key(): Buffer {
  const material = process.env.EMAIL_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!material) throw new Error('Missing EMAIL_SECRET_KEY');
  return createHash('sha256').update(`pbt:email:${material}`).digest();
}

/** True when the runtime has a dedicated key (not the service-role fallback). */
export function hasDedicatedSecretKey(): boolean {
  return Boolean(process.env.EMAIL_SECRET_KEY);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join('.');
}

export function decryptSecret(payload: string | null | undefined): string {
  if (!payload) return '';
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    // Not our format — treat as plaintext so a hand-seeded row still works.
    return payload;
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** `re_1234…cdef` — enough to recognise a key, not enough to use it. */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.length <= 8) return '••••';
  return `${plaintext.slice(0, 4)}…${plaintext.slice(-4)}`;
}

/** SHA-256 hex — used for invite tokens, which are never stored in the clear. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** URL-safe random token for invitation links. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
