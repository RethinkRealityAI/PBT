import type { ActStep } from '../../data/knowledge/actGuide';
import { getDataOverlay } from '../dataRegistry';
import type { Locale } from '../locales';

/**
 * Display-only localization for the ACT method steps.
 *
 * `src/data/knowledge/actGuide.ts` is dual-purpose: it renders the ACT Guide
 * screen AND feeds the scoring prompt builder. The canonical module therefore
 * stays English and untouched — prompts keep reading it directly, while the
 * screen routes each step through `localizedActStep`. The `key` never moves
 * (it lines up with the `acknowledge`/`clarify`/`transform` scoring dimension
 * keys); only the prose is overlaid.
 */

/** The user-facing fields of an ACT step — key excluded, it is an identifier. */
export type ActStepDisplay = Pick<
  ActStep,
  'label' | 'goal' | 'techniques' | 'doExamples' | 'dontExamples'
>;

/**
 * Shape a locale must supply to localize the ACT guide. `Record` over the
 * canonical key union makes a forgotten step a compile error.
 */
export type ActGuideOverlay = Record<ActStep['key'], ActStepDisplay>;

/**
 * The ACT step as the given locale should display it. Returns `step` unchanged
 * (same reference) when the locale has no overlay — English, or a catalog that
 * hasn't finished loading.
 */
export function localizedActStep(step: ActStep, locale: Locale): ActStep {
  const text = getDataOverlay<ActGuideOverlay>(locale, 'actGuide')?.[step.key];
  return text ? { ...step, ...text } : step;
}
