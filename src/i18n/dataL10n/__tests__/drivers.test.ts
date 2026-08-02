import { describe, it, expect } from 'vitest';
import { ECHO_DRIVER_LIST, ECHO_DRIVERS } from '../../../data/echoDrivers';
import { DRIVER_KEYS } from '../../../design-system/tokens';
import { registerDataCatalog } from '../../dataRegistry';
import { drivers as frDrivers } from '../../fr/data/drivers';
import { localizedDriver } from '../drivers';

/**
 * Guard rails for the ECHO driver overlay. Driver keys/names are persisted
 * `profiles` values and product proper nouns — the merge must never touch
 * them, in any locale.
 */
registerDataCatalog('fr', { drivers: frDrivers });

describe('driver data overlay — coverage', () => {
  it('translates every driver, every trait, with nothing empty', () => {
    for (const driver of ECHO_DRIVER_LIST) {
      const l10n = frDrivers[driver.key];
      expect(l10n, `missing fr overlay for ${driver.key}`).toBeTruthy();
      expect(l10n.tagline.trim()).not.toBe('');
      expect(l10n.blurb.trim()).not.toBe('');
      expect(l10n.growth.trim()).not.toBe('');
      expect(l10n.traits).toHaveLength(driver.traits.length);
      for (const trait of l10n.traits) {
        expect(trait.name.trim()).not.toBe('');
        expect(trait.description.trim()).not.toBe('');
      }
    }
  });

  it('covers exactly the canonical driver keys', () => {
    expect(Object.keys(frDrivers).sort()).toEqual([...DRIVER_KEYS].sort());
  });

  it('leaves no English display text behind', () => {
    for (const driver of ECHO_DRIVER_LIST) {
      const l10n = frDrivers[driver.key];
      expect(l10n.tagline).not.toBe(driver.tagline);
      expect(l10n.blurb).not.toBe(driver.blurb);
      expect(l10n.growth).not.toBe(driver.growth);
      l10n.traits.forEach((trait, i) => {
        expect(trait.description).not.toBe(driver.traits[i].description);
      });
    }
  });
});

describe('localizedDriver', () => {
  it('returns the canonical object untouched for English', () => {
    for (const key of DRIVER_KEYS) {
      expect(localizedDriver(key, 'en')).toBe(ECHO_DRIVERS[key]);
      expect(localizedDriver(ECHO_DRIVERS[key], 'en')).toBe(ECHO_DRIVERS[key]);
    }
  });

  it('replaces display fields for French and keeps key/name/colors', () => {
    for (const driver of ECHO_DRIVER_LIST) {
      const fr = localizedDriver(driver.key, 'fr');
      const l10n = frDrivers[driver.key];
      expect(fr.key).toBe(driver.key);
      expect(fr.name).toBe(driver.name);
      expect(fr.color).toBe(driver.color);
      expect(fr.accent).toBe(driver.accent);
      expect(fr.soft).toBe(driver.soft);
      expect(fr.tagline).toBe(l10n.tagline);
      expect(fr.blurb).toBe(l10n.blurb);
      expect(fr.growth).toBe(l10n.growth);
      expect(fr.traits.map((t) => t.name)).toEqual(l10n.traits.map((t) => t.name));
      expect(fr.traits.map((t) => t.description)).toEqual(
        l10n.traits.map((t) => t.description),
      );
    }
  });

  it('accepts an already-resolved driver object', () => {
    const fr = localizedDriver(ECHO_DRIVERS.Analyzer, 'fr');
    expect(fr.tagline).toBe(frDrivers.Analyzer.tagline);
    expect(fr.name).toBe('Analyzer');
  });

  it('never mutates the canonical drivers', () => {
    const before = JSON.stringify(ECHO_DRIVERS);
    DRIVER_KEYS.forEach((key) => localizedDriver(key, 'fr'));
    expect(JSON.stringify(ECHO_DRIVERS)).toBe(before);
    const fr = localizedDriver('Activator', 'fr');
    expect(fr.traits[0]).not.toBe(ECHO_DRIVERS.Activator.traits[0]);
  });
});
