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
import {
  isBuiltInObjectionId,
  isTeamObjectionId,
  objectionText,
  type TeamObjection,
} from '../../shared/scenarios/objections';
import {
  BUILT_IN_CATEGORIES,
  categoryName,
  type ObjectionCategory,
} from '../../shared/scenarios/objectionCategories';

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

/**
 * The BUILT-IN objection categories (the subject areas — "Everyday
 * nutrition", "Weight management", "Prescription diets") — mirrors
 * `BUILT_IN_CATEGORIES` in src/shared/scenarios/objectionCategories.ts, which
 * is their canonical English. Typed so a new built-in category fails `tsc`
 * until every overlay names it; `__tests__/pushbacks.test.ts` asserts the
 * mirror never drifts. Team categories (`category:<slug>`) carry their own
 * French (`nameFr`) instead.
 */
export const OBJECTION_CATEGORY_IDS = ['everyday-nutrition', 'weight', 'prescription-diets'] as const;

export type BuiltInCategoryId = (typeof OBJECTION_CATEGORY_IDS)[number];

/** Display fields of an objection category. */
export interface ObjectionCategoryL10n {
  name: string;
  /** One plain sentence; '' when the category has none. */
  description: string;
}

/** Shape a locale registers under the `pushbacks` domain. */
export interface PushbackDataOverlay {
  categories: Record<PushbackId, PushbackCategoryL10n>;
  difficulties: Record<Difficulty, DifficultyL10n>;
  hints: Record<PushbackId, PushbackHintsL10n>;
  /** Built-in objection categories (subject areas), keyed by category id. */
  objectionCategories: Record<BuiltInCategoryId, ObjectionCategoryL10n>;
}

function overlayFor(locale: Locale): PushbackDataOverlay | undefined {
  if (locale === DEFAULT_LOCALE) return undefined;
  return getDataOverlay<PushbackDataOverlay>(locale, 'pushbacks');
}

function canonicalCategory(id: string): PushbackCategory | undefined {
  return PUSHBACK_CATEGORIES.find((c) => c.id === id);
}

/**
 * The pushback's display title — canonical English unless the locale overlays
 * it. A TEAM objection (`team:<slug>`, authored in the Scenario Studio) has no
 * overlay: pass the snapshot's `team` list and its own French title is used
 * (English when the team wrote none). An id nobody knows reads as itself.
 */
export function localizedPushbackLabel(
  id: string,
  locale: Locale,
  team: readonly TeamObjection[] = [],
): string {
  if (isTeamObjectionId(id)) {
    const objection = team.find((o) => o.id === id);
    return objection ? objectionText(objection, locale).title : id;
  }
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
  if (!isBuiltInObjectionId(category.id)) {
    // A team objection carries its own French (`titleFr` / `exampleFr`,
    // stamped by `resolveObjection`); English stands in when there is none.
    if (locale === DEFAULT_LOCALE) return category;
    const text = objectionText(
      {
        title: category.title,
        example: category.example,
        titleFr: category.titleFr ?? null,
        exampleFr: category.exampleFr ?? null,
      },
      locale,
    );
    if (text.title === category.title && text.example === category.example) return category;
    return { ...category, title: text.title, example: text.example };
  }
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

/**
 * A session's stored `scenarioSummary` is canonical English on purpose — it
 * doubles as the RAG cache key — so localize it for DISPLAY only: swap the
 * leading pushback title for the locale's label and leave the breed and the
 * trainee's own notes verbatim. Works for built-ins (overlay) and team
 * objections (their own French, from `team`); anything else — an objection
 * renamed since, or one the snapshot no longer carries — stays as stored.
 */
export function localizedSessionSummary(
  summary: string,
  pushbackId: string,
  locale: Locale,
  team: readonly TeamObjection[] = [],
): string {
  let englishTitle: string | undefined;
  if (isTeamObjectionId(pushbackId)) {
    englishTitle = team.find((o) => o.id === pushbackId)?.title;
  } else {
    englishTitle = canonicalCategory(pushbackId)?.title;
  }
  if (!englishTitle || !summary.startsWith(englishTitle)) return summary;
  return localizedPushbackLabel(pushbackId, locale, team) + summary.slice(englishTitle.length);
}

/**
 * Display name + description of an objection CATEGORY (a merged entry from
 * `mergeCategories`), in the locale.
 *
 *  • Team category (`category:<slug>`): its own French name when the team
 *    wrote one, English otherwise (`categoryName`). The description has no
 *    French field, so it reads as written.
 *  • Built-in category: the locale overlay — UNLESS an admin edited it in the
 *    Studio (stored as a row with the same id). An admin's French name always
 *    wins; a renamed / re-described built-in shows the admin's text (English
 *    when no French was given), never the stale translation of the old name.
 */
export function localizedObjectionCategory(
  category: Pick<ObjectionCategory, 'id' | 'name' | 'nameFr' | 'description'>,
  locale: Locale,
): ObjectionCategoryL10n {
  const canonical = BUILT_IN_CATEGORIES.find((c) => c.id === category.id);
  if (!canonical) {
    return { name: categoryName(category, locale), description: category.description };
  }
  const l10n = overlayFor(locale)?.objectionCategories[category.id as BuiltInCategoryId];
  const renamed = category.name !== canonical.name;
  const redescribed = category.description !== canonical.description;
  const name =
    locale !== DEFAULT_LOCALE && category.nameFr
      ? categoryName(category, locale)
      : renamed
        ? category.name
        : (l10n?.name ?? canonical.name);
  const description = redescribed ? category.description : (l10n?.description ?? canonical.description);
  return { name, description };
}
