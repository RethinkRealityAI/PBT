import {
  DIMENSIONS,
  type DimensionDef,
  type DimensionKey,
} from '../../data/knowledge/scoringRubric';
import type { ResolvedDimension } from '../../data/knowledge/simulationConfig';
import { getDataOverlay } from '../dataRegistry';
import { DEFAULT_LOCALE, type Locale } from '../locales';

/**
 * Display localization for the ACT-first scoring rubric.
 *
 * Key indirection, per src/i18n/dataRegistry.ts: `scoringRubric.ts` stays the
 * canonical English source (it feeds the scorer prompt and must not move), and
 * a locale overlay supplies replacement DISPLAY strings keyed by the stable
 * `DimensionKey`. Only the three fields the trainee actually reads on the
 * scorecard are overlaid:
 *
 *   - `label`                 breakdown bars + the "focus next" headline
 *   - `description`           the focus-next explainer + the Home scoring modal
 *   - `bands.excellent.example`  "what excellent sounds like"
 *
 * The remaining band prose is prompt-only and deliberately untranslated — the
 * scorer reads the canonical English rubric regardless of app locale, which is
 * exactly what `promptBuilders.ts` wants (English scaffolding, localized
 * OUTPUT).
 *
 * ADMIN OVERRIDES WIN. `localizedResolvedDimension` only swaps in the
 * translation when the resolved value is still the canonical English default;
 * a label an admin typed in the Simulation screen is shown verbatim, because
 * we cannot know what language they authored it in.
 */

/** The trainee-facing fields of a scoring dimension. */
export interface DimensionL10n {
  label: string;
  description: string;
  /** "What excellent sounds like" — the ≥85 band example. */
  excellentExample: string;
}

/** Shape a locale registers under the `rubric` domain. */
export type RubricOverlay = Record<DimensionKey, DimensionL10n>;

function overlayFor(locale: Locale): RubricOverlay | undefined {
  if (locale === DEFAULT_LOCALE) return undefined;
  return getDataOverlay<RubricOverlay>(locale, 'rubric');
}

/** The overlay entry for one dimension, or undefined (English / not loaded). */
export function dimensionL10n(
  key: DimensionKey,
  locale: Locale,
): DimensionL10n | undefined {
  return overlayFor(locale)?.[key];
}

/**
 * A canonical `DimensionDef` as the given locale should display it. Returns
 * the input object itself when there is nothing to swap, so callers can rely
 * on reference equality for "unchanged".
 */
export function localizedDimension(
  dim: DimensionDef,
  locale: Locale,
): DimensionDef {
  const l10n = dimensionL10n(dim.key, locale);
  if (!l10n) return dim;
  return {
    ...dim,
    label: l10n.label,
    description: l10n.description,
    bands: {
      ...dim.bands,
      excellent: { ...dim.bands.excellent, example: l10n.excellentExample },
    },
  };
}

/** Every canonical dimension, localized. Order matches `DIMENSIONS`. */
export function localizedDimensions(locale: Locale): DimensionDef[] {
  return DIMENSIONS.map((d) => localizedDimension(d, locale));
}

/**
 * A `resolveDimensions()` row as the given locale should display it.
 *
 * Admin-authored overrides are left alone: a field is translated only when it
 * still equals the code default for that dimension.
 */
export function localizedResolvedDimension(
  dim: ResolvedDimension,
  locale: Locale,
): ResolvedDimension {
  const l10n = dimensionL10n(dim.key, locale);
  if (!l10n) return dim;
  const canonical = DIMENSIONS.find((d) => d.key === dim.key);
  if (!canonical) return dim;
  return {
    ...dim,
    label: dim.label === canonical.label ? l10n.label : dim.label,
    description:
      dim.description === canonical.description ? l10n.description : dim.description,
    excellentExample:
      dim.excellentExample === canonical.bands.excellent.example
        ? l10n.excellentExample
        : dim.excellentExample,
  };
}
