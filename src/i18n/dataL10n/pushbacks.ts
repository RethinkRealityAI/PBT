/**
 * Display localization for pushback categories, difficulty levels, and the
 * trainee-facing slice of the pushback taxonomy.
 *
 * Key indirection (see dataRegistry.ts): the canonical modules in
 * `src/data/` stay the English source of truth and are never mutated. A
 * locale overlay supplies replacement DISPLAY strings keyed by the stable
 * pushback id / difficulty level, and these helpers merge overlay over
 * canonical at render time.
 *
 * IMPORTANT — `pushbackTaxonomy.ts` also feeds the AI prompt builders. The
 * prompt path keeps reading the canonical English module; only the cue lists
 * that `ScenarioHints` actually renders (title + the three ACT groups) carry
 * an overlay. `examples` / `rootConcerns` / `watchOuts` are prompt-only and
 * deliberately have no translation.
 */
import {
  DIFFICULTY_DESCRIPTIONS,
  DIFFICULTY_LABELS,
  PUSHBACK_CATEGORIES,
  type Difficulty,
  type PushbackCategory,
} from '../../data/scenarios';
import {
  PUSHBACK_KNOWLEDGE,
  type PushbackKnowledge,
} from '../../data/knowledge/pushbackTaxonomy';
import { getDataOverlay } from '../dataRegistry';
import { DEFAULT_LOCALE, type Locale } from '../locales';

/**
 * Canonical pushback ids. These are DB values (`scenario_overrides.pushback_id`,
 * RAG metadata) — the list mirrors `PUSHBACK_CATEGORIES` / `PUSHBACK_KNOWLEDGE`
 * so an overlay typed on it fails `tsc` when a category is added, and
 * `__tests__/dataL10n.test.ts` asserts the mirror never drifts.
 */
export const PUSHBACK_IDS = [
  'cost',
  'breeder-advice',
  'raw-food',
  'rx-diet',
  'brand-switch',
  'weight-denial',
  'custom',
] as const;

export type PushbackId = (typeof PUSHBACK_IDS)[number];

export const DIFFICULTY_LEVELS: Difficulty[] = [1, 2, 3, 4];

/** Display fields of a `PushbackCategory` (the id stays canonical). */
export interface PushbackCategoryL10n {
  title: string;
  example: string;
}

/** Difficulty chip label + the longer description under the slider. */
export interface DifficultyL10n {
  label: string;
  description: string;
}

/** The taxonomy fields `ScenarioHints` renders — ACT cue groups. */
export interface PushbackHintsL10n {
  title: string;
  acknowledgePatterns: string[];
  clarifyQuestions: string[];
  takeActionPatterns: string[];
}

/** Shape a locale registers under the `pushbacks` domain. */
export interface PushbackDataOverlay {
  categories: Record<PushbackId, PushbackCategoryL10n>;
  difficulties: Record<Difficulty, DifficultyL10n>;
  hints: Record<PushbackId, PushbackHintsL10n>;
}

function overlayFor(locale: Locale): PushbackDataOverlay | undefined {
  if (locale === DEFAULT_LOCALE) return undefined;
  return getDataOverlay<PushbackDataOverlay>(locale, 'pushbacks');
}

function canonicalCategory(id: string): PushbackCategory | undefined {
  return PUSHBACK_CATEGORIES.find((c) => c.id === id);
}

/** The pushback's display title — canonical English unless the locale overlays it. */
export function localizedPushbackLabel(id: string, locale: Locale): string {
  const canonical = canonicalCategory(id);
  const l10n = overlayFor(locale)?.categories[id as PushbackId];
  return l10n?.title ?? canonical?.title ?? id;
}

/** The italic example quote shown under the pushback title. */
export function localizedPushbackExample(id: string, locale: Locale): string {
  const canonical = canonicalCategory(id);
  const l10n = overlayFor(locale)?.categories[id as PushbackId];
  return l10n?.example ?? canonical?.example ?? '';
}

/**
 * A display copy of a `PushbackCategory` with `id` preserved. Returns the
 * input object itself when there is nothing to swap, so callers can rely on
 * reference equality for "unchanged".
 */
export function localizedPushbackCategory(
  category: PushbackCategory,
  locale: Locale,
): PushbackCategory {
  const l10n = overlayFor(locale)?.categories[category.id as PushbackId];
  if (!l10n) return category;
  return { ...category, title: l10n.title, example: l10n.example };
}

/** Difficulty level name + description (`DIFFICULTY_LABELS` / `_DESCRIPTIONS`). */
export function localizedDifficulty(
  level: Difficulty,
  locale: Locale,
): DifficultyL10n {
  const l10n = overlayFor(locale)?.difficulties[level];
  return {
    label: l10n?.label ?? DIFFICULTY_LABELS[level],
    description: l10n?.description ?? DIFFICULTY_DESCRIPTIONS[level],
  };
}

export function localizedDifficultyLabel(
  level: Difficulty,
  locale: Locale,
): string {
  return localizedDifficulty(level, locale).label;
}

/**
 * The ACT cue groups behind `ScenarioHints`. Returns null for a pushback that
 * isn't in the taxonomy (custom-built scenarios), matching the canonical
 * `getPushbackKnowledge` contract. Prompt-only fields stay English — this
 * object is for rendering, never for prompt building.
 */
export function localizedPushbackHints(
  id: string,
  locale: Locale,
): PushbackKnowledge | null {
  const canonical = PUSHBACK_KNOWLEDGE[id];
  if (!canonical) return null;
  const l10n = overlayFor(locale)?.hints[id as PushbackId];
  if (!l10n) return canonical;
  return {
    ...canonical,
    title: l10n.title,
    acknowledgePatterns: l10n.acknowledgePatterns,
    clarifyQuestions: l10n.clarifyQuestions,
    takeActionPatterns: l10n.takeActionPatterns,
  };
}
