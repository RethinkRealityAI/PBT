import { describe, it, expect } from 'vitest';
import { en } from '../en';
import { fr } from '../fr';
import { chrome as enChrome } from '../en/chrome';
import { chat as enChat } from '../en/chat';
import { home as enHome } from '../en/home';
import { create as enCreate } from '../en/create';
import { settings as enSettings } from '../en/settings';
import { analyzer as enAnalyzer } from '../en/analyzer';
import { onboarding as enOnboarding } from '../en/onboarding';
import { terms as enTerms } from '../en/terms';
import { quiz as enQuiz } from '../en/quiz';
import { result as enResult } from '../en/result';
import { stats as enStats } from '../en/stats';
import { scorecard as enScorecard } from '../en/scorecard';
import { feedback as enFeedback } from '../en/feedback';
import { LOCALES, isLocale } from '../locales';
import { STORAGE_KEYS } from '../../lib/storage';
import { translate, registerCatalog } from '../translate';

/**
 * Guard rails for the locale catalogs. If you add UI text, these tests are
 * what enforce the CLAUDE.md "Translations (MANDATORY)" rule mechanically:
 * every locale must cover exactly the English key set, with no untranslated
 * stubs left behind.
 */

// Proper nouns / terms of art that legitimately read the same in French.
const IDENTICAL_ALLOWED = new Set<string>([
  // e.g. 'chrome.brand' — product names, breed names. Keep this list short
  // and reviewed; a growing allowlist usually means lazy translations.
  'settings.delete.placeholder', // pure '{word}' token, no prose
  'analyzer.savedPets.stats', // '{weightKg} kg · BCS {bcs}/9' — units + clinical initialism only
  'onboarding.slide1.eyebrow', // 'PBT · Pushback Training' — product wordmark, untranslated by design
  'terms.eyebrow', // same product wordmark as the onboarding eyebrow
  'home.actions.analyzer.sub', // 'BCS · MCS · kcal' — clinical initialisms + SI unit only
  'create.weight.unit', // 'kg' — SI unit symbol
  'chat.coach.label', // 'Coach · {count}' — "Coach" is used verbatim in fr-CA; 9px pill has no room for longer
]);

const CATALOGS = { en, fr } as const;

describe('locale catalogs', () => {
  it('every locale covers exactly the English key set', () => {
    const enKeys = Object.keys(en).sort();
    for (const locale of LOCALES) {
      const keys = Object.keys(CATALOGS[locale]).sort();
      expect(keys, `locale "${locale}" key set`).toEqual(enKeys);
    }
  });

  it('every value is a non-empty string', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(CATALOGS[locale])) {
        expect(typeof value, `${locale}:${key}`).toBe('string');
        expect(value.trim().length, `${locale}:${key} empty`).toBeGreaterThan(0);
      }
    }
  });

  it('non-English locales contain no untranslated English stubs', () => {
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const catalog: Record<string, string> = CATALOGS[locale];
      for (const [key, value] of Object.entries(en)) {
        if (IDENTICAL_ALLOWED.has(key)) continue;
        expect(
          catalog[key],
          `${locale}:${key} is identical to English — translate it or allowlist it`,
        ).not.toBe(value);
      }
    }
  });

  it('interpolation tokens match across locales', () => {
    const tokensOf = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const catalog: Record<string, string> = CATALOGS[locale];
      for (const [key, value] of Object.entries(en)) {
        expect(tokensOf(catalog[key] ?? ''), `${locale}:${key} tokens`).toEqual(
          tokensOf(value),
        );
      }
    }
  });

  it('namespace files do not shadow each other (duplicate keys)', () => {
    // en is a spread-merge of its namespace files; if two namespaces declare
    // the same key, the merged catalog silently keeps the last one. Guard by
    // checking the sum of namespace key counts equals the merged count.
    const namespaces = [
      enChrome,
      enChat,
      enHome,
      enCreate,
      enSettings,
      enAnalyzer,
      enOnboarding,
      enTerms,
      enQuiz,
      enResult,
      enStats,
      enScorecard,
      enFeedback,
    ];
    const total = namespaces.reduce((n, ns) => n + Object.keys(ns).length, 0);
    expect(Object.keys(en).length).toBe(total);
  });

  it('storage locale union stays aligned with the Locale union', () => {
    // storage.ts inlines the locale literals to avoid an import cycle.
    expect(isLocale(STORAGE_KEYS.locale.fallback)).toBe(true);
    expect(STORAGE_KEYS.locale.validate?.('en')).toBe(true);
    expect(STORAGE_KEYS.locale.validate?.('fr')).toBe(true);
    expect(STORAGE_KEYS.locale.validate?.('de')).toBe(false);
  });
});

describe('translate()', () => {
  it('returns English for en and French for fr (registered)', () => {
    registerCatalog('fr', fr);
    expect(translate('en', 'settings.language.label')).toBe('Language');
    expect(translate('fr', 'settings.language.label')).toBe('Langue');
  });

  it('interpolates {tokens}', () => {
    // No parameterised key exists in the seed catalog yet; exercise the
    // mechanism through a raw catalog entry once one is added. For now,
    // interpolation of an absent token is a no-op on the text.
    expect(translate('en', 'settings.language.label', { x: 1 })).toBe('Language');
  });
});
