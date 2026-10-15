import { describe, expect, it } from 'vitest';
import {
  LANGUAGE_NONE,
  anonymousDevices,
  anonymousName,
  deviceLabel,
  deviceTag,
  isAnonymous,
  languageKey,
  languageLabel,
  languageOrder,
  matchesWho,
  peopleWords,
  sessionLanguage,
  signedInTrainees,
  speciesOf,
} from '../who';
import { anonSession, rebuiltSession, session } from './fixtures';

describe('who practised', () => {
  it('a session without an account is anonymous', () => {
    expect(isAnonymous(session())).toBe(false);
    expect(isAnonymous(anonSession('dev-1'))).toBe(true);
    expect(isAnonymous({ user_id: '' })).toBe(true);
  });

  it('device tags are short, stable, upper-case and never repeat the id', () => {
    const id = '4f2a9c1e-0000-4000-8000-000000000001';
    const tag = deviceTag(id);
    expect(tag).toMatch(/^[0-9A-F]{4}$/);
    expect(deviceTag(id)).toBe(tag);
    expect(id.toUpperCase().startsWith(tag as string)).toBe(false);
    expect(deviceTag('another-device')).not.toBe(tag);
    expect(deviceTag(null)).toBeNull();
    expect(deviceTag('   ')).toBeNull();
    expect(deviceLabel(id)).toBe(`Device ${tag}`);
    expect(deviceLabel(null)).toBe('Unknown device');
    expect(anonymousName(id)).toBe(`Anonymous · Device ${tag}`);
  });

  it('counts people as signed-in trainees and anonymous devices — never a phantom null trainee', () => {
    const rows = [
      session({ user_id: 'a' }),
      session({ user_id: 'a' }),
      session({ user_id: 'b' }),
      anonSession('d1'),
      anonSession('d1'),
      anonSession('d2'),
      rebuiltSession('d3', 'unknown'),
    ];
    expect(signedInTrainees(rows)).toBe(2);
    expect(anonymousDevices(rows)).toBe(3);
    // A signed-in row's stale device id is not a device.
    expect(anonymousDevices([session({ user_id: 'a', anon_session_id: 'd9' })])).toBe(0);
  });

  it('filters by who', () => {
    expect(matchesWho(session(), 'signed_in')).toBe(true);
    expect(matchesWho(session(), 'anonymous')).toBe(false);
    expect(matchesWho(anonSession('d'), 'anonymous')).toBe(true);
    expect(matchesWho(anonSession('d'), 'all')).toBe(true);
  });

  it('says people in words', () => {
    expect(peopleWords(12, 30)).toBe('12 trainees · 30 anonymous devices');
    expect(peopleWords(1, 0)).toBe('1 trainee');
    expect(peopleWords(0, 1)).toBe('1 anonymous device');
    expect(peopleWords(0, 0)).toBe('0 trainees');
  });
});

describe('language', () => {
  it('reads the base language and names it', () => {
    expect(languageKey('fr')).toBe('fr');
    expect(languageKey('fr-CA')).toBe('fr');
    expect(languageKey('EN')).toBe('en');
    expect(languageKey(null)).toBe(LANGUAGE_NONE);
    expect(languageKey('')).toBe(LANGUAGE_NONE);
    expect(languageKey('nonsense!')).toBe(LANGUAGE_NONE);
    expect(languageLabel('en')).toBe('English');
    expect(languageLabel('fr')).toBe('Français');
    expect(languageLabel(LANGUAGE_NONE)).toBe('Not recorded');
    expect(languageLabel('es')).toBe('ES');
    expect(sessionLanguage(session({ locale: 'fr' }))).toBe('Français');
    expect(sessionLanguage(session({ locale: null }))).toBe('Not recorded');
  });

  it('orders the shipped languages first, any other next, "Not recorded" last', () => {
    expect(languageOrder([session({ locale: 'es' }), session({ locale: 'fr' })])).toEqual(['en', 'fr', 'es', LANGUAGE_NONE]);
    expect(languageOrder([])).toEqual(['en', 'fr', LANGUAGE_NONE]);
  });
});

describe('rebuilt sessions', () => {
  it('never claim an animal', () => {
    expect(speciesOf(rebuiltSession('d', 'finished'))).toBeNull();
    expect(speciesOf(session({ species: 'cat' }))).toBe('cat');
    expect(speciesOf(anonSession('d', { species: 'dog' }))).toBe('dog');
  });
});
