/**
 * Terms acceptance — the ONE place that knows which Terms version this device
 * agreed to (`pbt:terms_accepted_at` + `pbt:terms_version`).
 *
 * Bump `CURRENT_TERMS_VERSION` when the Terms text changes in a way people
 * must see before the new behaviour applies to them: a device that accepted
 * an older version boots into the Terms screen once more (`App.tsx`), and
 * anonymous sessions are not sent to the server until it accepts again
 * (`useTextChat` / `geminiService`).
 *
 * History:
 *   1 — original Terms.
 *   2 — 2026-10-15: "Anonymous by default" says anonymous practice sessions
 *       are recorded on the server under a random per-device id.
 */
import { readStorage, writeStorage, STORAGE_KEYS } from './storage';

export const CURRENT_TERMS_VERSION = 2;

/** Record that this device accepted the current Terms, now. */
export function acceptTerms(): void {
  writeStorage(STORAGE_KEYS.termsAcceptedAt, new Date().toISOString());
  writeStorage(STORAGE_KEYS.termsVersion, CURRENT_TERMS_VERSION);
}

/** True when this device accepted the current (or a later) Terms version. */
export function hasAcceptedCurrentTerms(): boolean {
  if (!readStorage(STORAGE_KEYS.termsAcceptedAt)) return false;
  const version = readStorage(STORAGE_KEYS.termsVersion);
  return version != null && version >= CURRENT_TERMS_VERSION;
}

/**
 * True when this device accepted Terms before but not the current version
 * (no version stored, or an older one) — show the Terms again, once.
 * False for a device that never accepted (that is onboarding, not a review).
 */
export function needsTermsReview(): boolean {
  if (!readStorage(STORAGE_KEYS.termsAcceptedAt)) return false;
  return !hasAcceptedCurrentTerms();
}
