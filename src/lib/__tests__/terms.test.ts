import { describe, expect, it } from 'vitest';
import { readStorage, writeStorage, STORAGE_KEYS } from '../storage';
import {
  CURRENT_TERMS_VERSION,
  acceptTerms,
  hasAcceptedCurrentTerms,
  needsTermsReview,
} from '../terms';

describe('terms', () => {
  it('a fresh device has accepted nothing and needs onboarding, not a review', () => {
    expect(hasAcceptedCurrentTerms()).toBe(false);
    expect(needsTermsReview()).toBe(false);
  });

  it('acceptTerms stores the acceptance time AND the current version', () => {
    acceptTerms();
    expect(typeof readStorage(STORAGE_KEYS.termsAcceptedAt)).toBe('string');
    expect(readStorage(STORAGE_KEYS.termsVersion)).toBe(CURRENT_TERMS_VERSION);
    expect(localStorage.getItem('pbt:terms_version')).toBe(String(CURRENT_TERMS_VERSION));
    expect(hasAcceptedCurrentTerms()).toBe(true);
    expect(needsTermsReview()).toBe(false);
  });

  it('a device that accepted version 1 (raw "1", as the old screen wrote it) needs a review', () => {
    writeStorage(STORAGE_KEYS.termsAcceptedAt, '2026-08-01T00:00:00.000Z');
    localStorage.setItem('pbt:terms_version', '1');
    expect(readStorage(STORAGE_KEYS.termsVersion)).toBe(1);
    expect(hasAcceptedCurrentTerms()).toBe(false);
    expect(needsTermsReview()).toBe(true);
  });

  it('an acceptance with no version stored needs a review', () => {
    writeStorage(STORAGE_KEYS.termsAcceptedAt, '2026-08-01T00:00:00.000Z');
    expect(hasAcceptedCurrentTerms()).toBe(false);
    expect(needsTermsReview()).toBe(true);
  });

  it('a corrupt version reads as missing', () => {
    writeStorage(STORAGE_KEYS.termsAcceptedAt, '2026-08-01T00:00:00.000Z');
    localStorage.setItem('pbt:terms_version', '"two"');
    expect(readStorage(STORAGE_KEYS.termsVersion)).toBeNull();
    expect(needsTermsReview()).toBe(true);
  });

  it('a version without an acceptance time is not an acceptance', () => {
    writeStorage(STORAGE_KEYS.termsVersion, CURRENT_TERMS_VERSION);
    expect(hasAcceptedCurrentTerms()).toBe(false);
    expect(needsTermsReview()).toBe(false);
  });

  it('a later version still counts as accepted', () => {
    writeStorage(STORAGE_KEYS.termsAcceptedAt, '2026-10-15T00:00:00.000Z');
    writeStorage(STORAGE_KEYS.termsVersion, CURRENT_TERMS_VERSION + 1);
    expect(hasAcceptedCurrentTerms()).toBe(true);
  });

  it('accepting again after a review clears it', () => {
    writeStorage(STORAGE_KEYS.termsAcceptedAt, '2026-08-01T00:00:00.000Z');
    localStorage.setItem('pbt:terms_version', '1');
    acceptTerms();
    expect(needsTermsReview()).toBe(false);
    expect(hasAcceptedCurrentTerms()).toBe(true);
  });
});
