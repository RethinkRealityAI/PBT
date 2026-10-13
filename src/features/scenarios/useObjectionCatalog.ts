import { useCallback, useMemo } from 'react';
import { useFlags } from '../../app/providers/FlagProvider';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { PUSHBACK_CATEGORIES, type PushbackCategory } from '../../data/scenarios';
import {
  objectionCategoriesFromSnapshot,
  teamObjectionsFromSnapshot,
} from '../../data/scenarioOverrides';
import {
  localizedObjectionCategory,
  localizedPushbackCategory,
} from '../../i18n/dataL10n/pushbacks';
import type { Locale } from '../../i18n/locales';
import {
  objectionAppliesTo,
  objectionText,
  resolveObjection,
  sortTeamObjections,
  type TeamObjection,
} from '../../shared/scenarios/objections';
import {
  BUILT_IN_OBJECTION_CATEGORY,
  categoriesForSpecies,
  mergeCategories,
  type ObjectionCategory,
} from '../../shared/scenarios/objectionCategories';
import { SCENARIO_SPECIES, type ScenarioSpecies } from '../../shared/scenarios/species';

/**
 * The trainee's objection catalogue, organised the way training is:
 *
 *   animal → CATEGORY (the subject area: "Everyday nutrition", "Weight
 *            management", team ones like "Probiotics") → OBJECTION (what the
 *            owner says) → a library scenario, or the trainee's own build.
 *
 * Objections: the six built-ins (localised through the existing French
 * overlay) followed by the objections the team authored in the Scenario
 * Studio (`snapshot.objections`, localised through their own `titleFr` /
 * `exampleFr`, English when absent). Each carries its `categoryId`.
 *
 * Categories: the code's built-ins merged with the stored rows
 * (`snapshot.objectionCategories` — team categories + admin edits of the
 * built-ins) via `mergeCategories`, localised by `localizedObjectionCategory`.
 * A category is also the knowledge container — but that is applied
 * SERVER-side for AI calls; a trainee build never copies it onto the
 * scenario.
 *
 * `custom` ("Other pushback") is NOT in the list — every picker shows it as a
 * separate card. Retired team objections ARE in the list (`visible: false`)
 * so a saved scenario built on one still resolves; pickers must go through
 * `objectionsForSpecies` / `objectionsInCategory`, which offer only visible
 * ones.
 */
export interface TrainingObjection {
  id: string;
  /**
   * What a scenario built on this objection carries: canonical English text,
   * plus the team's French (`titleFr` / `exampleFr`) for a team objection.
   */
  pushback: PushbackCategory;
  /** Display text in the current locale. */
  title: string;
  example: string;
  species: ScenarioSpecies[];
  /** The category (subject area) it belongs to. */
  categoryId: string | null;
  builtIn: boolean;
  visible: boolean;
}

/** A merged objection category with its display text in the current locale. */
export interface TrainingCategory extends ObjectionCategory {
  /** Display name in the current locale. */
  label: string;
  /** One-line display description in the current locale ('' when none). */
  blurb: string;
}

export function buildTrainingObjections(
  team: readonly TeamObjection[],
  locale: Locale,
): TrainingObjection[] {
  const builtIns: TrainingObjection[] = PUSHBACK_CATEGORIES.filter((c) => c.id !== 'custom').map(
    (pushback) => {
      const view = localizedPushbackCategory(pushback, locale);
      return {
        id: pushback.id,
        pushback,
        title: view.title,
        example: view.example,
        species: [...SCENARIO_SPECIES],
        categoryId: BUILT_IN_OBJECTION_CATEGORY[pushback.id] ?? null,
        builtIn: true,
        visible: true,
      };
    },
  );
  const teamEntries: TrainingObjection[] = [];
  for (const objection of sortTeamObjections(team)) {
    const pushback = resolveObjection(objection.id, team);
    if (!pushback) continue;
    const text = objectionText(objection, locale);
    teamEntries.push({
      id: objection.id,
      pushback,
      title: text.title,
      example: text.example,
      species: [...objection.species],
      categoryId: objection.categoryId,
      builtIn: false,
      visible: objection.visible,
    });
  }
  return [...builtIns, ...teamEntries];
}

/** Merged (built-ins + stored) categories, localised, in display order. */
export function buildTrainingCategories(
  merged: readonly ObjectionCategory[],
  locale: Locale,
): TrainingCategory[] {
  return merged.map((c) => {
    const view = localizedObjectionCategory(c, locale);
    return { ...c, label: view.name, blurb: view.description };
  });
}

/** The objections a trainee may PICK for an animal: visible, and applying to it. */
export function objectionsForSpecies(
  list: readonly TrainingObjection[],
  species: ScenarioSpecies,
): TrainingObjection[] {
  return list.filter((o) => o.visible && objectionAppliesTo(o, species));
}

/** The pickable objections (visible, applying to the animal) in one category. */
export function objectionsInCategory(
  list: readonly TrainingObjection[],
  categoryId: string,
  species: ScenarioSpecies,
): TrainingObjection[] {
  return objectionsForSpecies(list, species).filter((o) => o.categoryId === categoryId);
}

/**
 * The categories worth offering for an animal: those holding at least one
 * visible objection that applies to it (the shared `categoriesForSpecies` is
 * the one rule; this keeps the localised entries).
 */
export function trainingCategoriesForSpecies(
  categories: readonly TrainingCategory[],
  objections: readonly TrainingObjection[],
  species: ScenarioSpecies,
): TrainingCategory[] {
  const offered = new Set(categoriesForSpecies(categories, objections, species).map((c) => c.id));
  return categories.filter((c) => offered.has(c.id));
}

/** Team objections from the flags snapshot, normalised (memoised per snapshot). */
export function useTeamObjections(): TeamObjection[] {
  const { snapshot } = useFlags();
  const raw = snapshot?.objections;
  return useMemo(() => teamObjectionsFromSnapshot(raw), [raw]);
}

/**
 * Every category the app knows — built-ins (with any admin edit) plus the
 * team's — merged from the flags snapshot, NOT localised (knowledge lookups:
 * `categoryKnowledgeFor`). Memoised per snapshot.
 */
export function useMergedCategories(): ObjectionCategory[] {
  const { snapshot } = useFlags();
  const raw = snapshot?.objectionCategories;
  // An absent list (an older server, or the migration not applied) is none —
  // the built-ins still exist.
  return useMemo(() => mergeCategories(objectionCategoriesFromSnapshot(raw)), [raw]);
}

export function useObjectionCatalog(): {
  /** Every objection (built-ins + team, retired team ones included). */
  objections: TrainingObjection[];
  /** The normalised team objections (for `adminOverrideToScenario` & co.). */
  teamObjections: TeamObjection[];
  /** Every category (built-ins + team), localised, in display order. */
  categories: TrainingCategory[];
  /** Pickable objections for an animal (visible + applies). */
  forSpecies: (species: ScenarioSpecies) => TrainingObjection[];
  /** Categories holding at least one pickable objection for the animal. */
  categoriesFor: (species: ScenarioSpecies) => TrainingCategory[];
  /** Pickable objections in one category for the animal. */
  objectionsIn: (categoryId: string, species: ScenarioSpecies) => TrainingObjection[];
  byId: (id: string) => TrainingObjection | undefined;
  categoryById: (id: string | null | undefined) => TrainingCategory | undefined;
} {
  const { locale } = useLanguage();
  const teamObjections = useTeamObjections();
  const merged = useMergedCategories();
  const objections = useMemo(
    () => buildTrainingObjections(teamObjections, locale),
    [teamObjections, locale],
  );
  const categories = useMemo(() => buildTrainingCategories(merged, locale), [merged, locale]);
  const forSpecies = useCallback(
    (species: ScenarioSpecies) => objectionsForSpecies(objections, species),
    [objections],
  );
  const categoriesFor = useCallback(
    (species: ScenarioSpecies) => trainingCategoriesForSpecies(categories, objections, species),
    [categories, objections],
  );
  const objectionsIn = useCallback(
    (categoryId: string, species: ScenarioSpecies) =>
      objectionsInCategory(objections, categoryId, species),
    [objections],
  );
  const byId = useCallback((id: string) => objections.find((o) => o.id === id), [objections]);
  const categoryById = useCallback(
    (id: string | null | undefined) => (id ? categories.find((c) => c.id === id) : undefined),
    [categories],
  );
  return {
    objections,
    teamObjections,
    categories,
    forSpecies,
    categoriesFor,
    objectionsIn,
    byId,
    categoryById,
  };
}
