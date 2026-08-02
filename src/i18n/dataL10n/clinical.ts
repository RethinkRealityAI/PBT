import type { BcsLevel } from '../../data/bcsLevels';
import type { McsLevel } from '../../data/mcsLevels';
import { getDataOverlay } from '../dataRegistry';
import type { Locale } from '../locales';

/**
 * Display-only localization for the clinical condition scales (BCS 1–9 and the
 * 4-point MCS).
 *
 * Key indirection, per src/i18n/dataRegistry.ts: `src/data/bcsLevels.ts` and
 * `src/data/mcsLevels.ts` stay the canonical English source and are never
 * mutated. Only the two prose fields a user reads (`label`, `description`) are
 * overlaid; `score`, `key` and `color` are data/identity, not copy, so they
 * pass straight through. English registers no overlay and therefore returns
 * the canonical object by identity.
 */

/** The user-facing fields of a BCS level — everything else is data. */
export type BcsLevelDisplay = Pick<BcsLevel, 'label' | 'description'>;

/** The user-facing fields of an MCS level. */
export type McsLevelDisplay = Pick<McsLevel, 'label' | 'description'>;

/**
 * Shape a locale must supply to localize the clinical scales. `Record` over
 * the canonical unions means a locale that forgets BCS 7 (or the `moderate`
 * MCS band) fails `tsc` at the overlay's definition site.
 */
export interface ClinicalOverlay {
  bcs: Record<BcsLevel['score'], BcsLevelDisplay>;
  mcs: Record<McsLevel['key'], McsLevelDisplay>;
}

function clinicalOverlay(locale: Locale): ClinicalOverlay | undefined {
  return getDataOverlay<ClinicalOverlay>(locale, 'clinical');
}

/**
 * The BCS level as the given locale should display it. Returns `level`
 * unchanged (same reference) when the locale has no overlay — English, or a
 * catalog that hasn't finished loading.
 */
export function localizedBcsLevel(level: BcsLevel, locale: Locale): BcsLevel {
  const text = clinicalOverlay(locale)?.bcs[level.score];
  return text ? { ...level, ...text } : level;
}

/** The MCS level as the given locale should display it. See above. */
export function localizedMcsLevel(level: McsLevel, locale: Locale): McsLevel {
  const text = clinicalOverlay(locale)?.mcs[level.key];
  return text ? { ...level, ...text } : level;
}
