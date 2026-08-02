import { ECHO_DRIVERS, type DriverTrait, type EchoDriver } from '../../data/echoDrivers';
import type { DriverKey } from '../../design-system/tokens';
import { getDataOverlay } from '../dataRegistry';
import { DEFAULT_LOCALE, type Locale } from '../locales';

/**
 * Display-only localization for the four ECHO drivers.
 *
 * Driver `key`/`name` (Activator · Energizer · Analyzer · Harmonizer) are
 * product proper nouns AND persisted `profiles` values — they never localize.
 * Everything else on the card (tagline, blurb, traits, growth edge) comes from
 * the locale overlay when one is registered. The canonical `ECHO_DRIVERS`
 * objects are never mutated.
 */

/** Registry domain key for the driver overlay. */
export const DRIVERS_DOMAIN = 'drivers';

/** Exactly five traits per driver, matching the canonical cards — a missing
 *  trait is a compile error at the overlay's definition site. */
export type DriverTraitsL10n = readonly [
  DriverTrait,
  DriverTrait,
  DriverTrait,
  DriverTrait,
  DriverTrait,
];

export interface DriverL10n {
  tagline: string;
  blurb: string;
  growth: string;
  motto?: string;
  traits: DriverTraitsL10n;
}

/** Keyed by `DriverKey`, so a locale that forgets a driver fails `tsc`. */
export type DriverOverlay = Record<DriverKey, DriverL10n>;

function driverOverlay(locale: Locale): DriverOverlay | undefined {
  if (locale === DEFAULT_LOCALE) return undefined;
  return getDataOverlay<DriverOverlay>(locale, DRIVERS_DOMAIN);
}

/**
 * The canonical driver for English (or any locale whose overlay hasn't
 * loaded), else a copy with display fields localized. Accepts either a
 * `DriverKey` or an already-resolved `EchoDriver`.
 */
export function localizedDriver(
  driverOrKey: DriverKey | EchoDriver,
  locale: Locale,
): EchoDriver {
  const driver =
    typeof driverOrKey === 'string' ? ECHO_DRIVERS[driverOrKey] : driverOrKey;
  const l10n = driverOverlay(locale)?.[driver.key];
  if (!l10n) return driver;
  return {
    ...driver,
    tagline: l10n.tagline || driver.tagline,
    blurb: l10n.blurb || driver.blurb,
    growth: l10n.growth || driver.growth,
    motto: l10n.motto ?? driver.motto,
    traits: driver.traits.map((trait, i) => {
      const t = l10n.traits[i];
      return t ? { name: t.name || trait.name, description: t.description || trait.description } : { ...trait };
    }),
  };
}
