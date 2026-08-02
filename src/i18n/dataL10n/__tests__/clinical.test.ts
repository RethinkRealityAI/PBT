import { describe, it, expect } from 'vitest';
import { BCS_LEVELS } from '../../../data/bcsLevels';
import { MCS_LEVELS } from '../../../data/mcsLevels';
import { registerDataCatalog } from '../../dataRegistry';
import { clinical as frClinical } from '../../fr/data/clinical';
import { localizedBcsLevel, localizedMcsLevel } from '../clinical';

/**
 * The overlay normally arrives via the lazy `import('./fr')` in
 * translate.ts#loadCatalog; tests register it directly so they don't depend on
 * catalog-loading order.
 */
registerDataCatalog('fr', { clinical: frClinical });

describe('localizedBcsLevel', () => {
  it('covers every BCS level in French', () => {
    expect(BCS_LEVELS).toHaveLength(9);
    for (const level of BCS_LEVELS) {
      const fr = localizedBcsLevel(level, 'fr');
      expect(fr.label, `BCS ${level.score} label`).not.toBe(level.label);
      expect(
        fr.description,
        `BCS ${level.score} description`,
      ).not.toBe(level.description);
      expect(fr.label.trim().length, `BCS ${level.score} label empty`).toBeGreaterThan(0);
      expect(
        fr.description.trim().length,
        `BCS ${level.score} description empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('passes English through by identity (no overlay registered)', () => {
    for (const level of BCS_LEVELS) {
      expect(localizedBcsLevel(level, 'en')).toBe(level);
    }
  });

  it('localizes display fields only — score and color are untouched', () => {
    for (const level of BCS_LEVELS) {
      const fr = localizedBcsLevel(level, 'fr');
      expect(fr.score, `BCS ${level.score} score`).toBe(level.score);
      expect(fr.color, `BCS ${level.score} color`).toBe(level.color);
      expect(Object.keys(fr).sort()).toEqual(Object.keys(level).sort());
    }
  });

  it('never mutates the canonical level', () => {
    const snapshot = BCS_LEVELS.map((l) => ({ ...l }));
    BCS_LEVELS.forEach((l) => localizedBcsLevel(l, 'fr'));
    expect(BCS_LEVELS).toEqual(snapshot);
  });
});

describe('localizedMcsLevel', () => {
  it('covers every MCS level in French', () => {
    expect(MCS_LEVELS).toHaveLength(4);
    for (const level of MCS_LEVELS) {
      const fr = localizedMcsLevel(level, 'fr');
      expect(fr.label, `MCS ${level.key} label`).not.toBe(level.label);
      expect(fr.description, `MCS ${level.key} description`).not.toBe(level.description);
      expect(fr.label.trim().length, `MCS ${level.key} label empty`).toBeGreaterThan(0);
      expect(
        fr.description.trim().length,
        `MCS ${level.key} description empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('passes English through by identity (no overlay registered)', () => {
    for (const level of MCS_LEVELS) {
      expect(localizedMcsLevel(level, 'en')).toBe(level);
    }
  });

  it('localizes display fields only — key and color are untouched', () => {
    for (const level of MCS_LEVELS) {
      const fr = localizedMcsLevel(level, 'fr');
      expect(fr.key, `MCS ${level.key} key`).toBe(level.key);
      expect(fr.color, `MCS ${level.key} color`).toBe(level.color);
      expect(Object.keys(fr).sort()).toEqual(Object.keys(level).sort());
    }
  });

  it('never mutates the canonical level', () => {
    const snapshot = MCS_LEVELS.map((l) => ({ ...l }));
    MCS_LEVELS.forEach((l) => localizedMcsLevel(l, 'fr'));
    expect(MCS_LEVELS).toEqual(snapshot);
  });
});

describe('fr clinical overlay', () => {
  it('keeps the BCS/MCS initialisms out of the prose (glossary terms only)', () => {
    // Nothing in the French copy should have leaked an English scale word.
    // NB: "palpable" is a French word too — only unambiguously English terms here.
    const english = /\b(ribs|waist|fat|muscle mass|wasting|underweight|obese)\b/i;
    const prose = [
      ...Object.values(frClinical.bcs),
      ...Object.values(frClinical.mcs),
    ].flatMap((d) => [d.label, d.description]);
    for (const text of prose) {
      expect(english.test(text), `English leaked: ${text}`).toBe(false);
    }
  });
});
