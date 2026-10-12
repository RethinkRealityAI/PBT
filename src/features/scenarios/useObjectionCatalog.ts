import { useCallback, useMemo } from 'react';
import { useFlags } from '../../app/providers/FlagProvider';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { PUSHBACK_CATEGORIES, type PushbackCategory } from '../../data/scenarios';
import { teamObjectionsFromSnapshot } from '../../data/scenarioOverrides';
import { localizedPushbackCategory } from '../../i18n/dataL10n/pushbacks';
import type { Locale } from '../../i18n/locales';
import {
  objectionAppliesTo,
  objectionText,
  resolveObjection,
  sortTeamObjections,
  type TeamObjection,
} from '../../shared/scenarios/objections';
import { SCENARIO_SPECIES, type ScenarioSpecies } from '../../shared/scenarios/species';

/**
 * The trainee's objection catalogue: the six built-in objections (localised
 * through the existing French overlay) followed by the objections the team
 * authored in the Scenario Studio (`snapshot.objections`, localised through
 * their own `titleFr` / `exampleFr`, English when absent).
 *
 * `custom` ("Other pushback") is NOT in the list — every picker shows it as a
 * separate card. Retired team objections ARE in the list (`visible: false`)
 * so a saved scenario built on one still resolves; pickers must go through
 * `objectionsForSpecies`, which offers only visible ones.
 */
export interface TrainingObjection {
  id: string;
  /**
   * What a scenario built on this objection carries: canonical English text,
   * plus the team's French (`titleFr` / `exampleFr`) for a team objection.
   */
  category: PushbackCategory;
  /** Display text in the current locale. */
  title: string;
  example: string;
  species: ScenarioSpecies[];
  /** Knowledge topic a team objection belongs to (built-ins: null). */
  focusArea: string | null;
  builtIn: boolean;
  visible: boolean;
}

export function buildTrainingObjections(
  team: readonly TeamObjection[],
  locale: Locale,
): TrainingObjection[] {
  const builtIns: TrainingObjection[] = PUSHBACK_CATEGORIES.filter((c) => c.id !== 'custom').map(
    (category) => {
      const view = localizedPushbackCategory(category, locale);
      return {
        id: category.id,
        category,
        title: view.title,
        example: view.example,
        species: [...SCENARIO_SPECIES],
        focusArea: null,
        builtIn: true,
        visible: true,
      };
    },
  );
  const teamEntries: TrainingObjection[] = [];
  for (const objection of sortTeamObjections(team)) {
    const category = resolveObjection(objection.id, team);
    if (!category) continue;
    const text = objectionText(objection, locale);
    teamEntries.push({
      id: objection.id,
      category,
      title: text.title,
      example: text.example,
      species: [...objection.species],
      focusArea: objection.focusArea,
      builtIn: false,
      visible: objection.visible,
    });
  }
  return [...builtIns, ...teamEntries];
}

/** The objections a trainee may PICK for an animal: visible, and applying to it. */
export function objectionsForSpecies(
  list: readonly TrainingObjection[],
  species: ScenarioSpecies,
): TrainingObjection[] {
  return list.filter((o) => o.visible && objectionAppliesTo(o, species));
}

/** Team objections from the flags snapshot, normalised (memoised per snapshot). */
export function useTeamObjections(): TeamObjection[] {
  const { snapshot } = useFlags();
  const raw = snapshot?.objections;
  return useMemo(() => teamObjectionsFromSnapshot(raw), [raw]);
}

export function useObjectionCatalog(): {
  /** Every objection (built-ins + team, retired team ones included). */
  objections: TrainingObjection[];
  /** The normalised team objections (for `adminOverrideToScenario` & co.). */
  teamObjections: TeamObjection[];
  /** Pickable objections for an animal (visible + applies). */
  forSpecies: (species: ScenarioSpecies) => TrainingObjection[];
  byId: (id: string) => TrainingObjection | undefined;
} {
  const { locale } = useLanguage();
  const teamObjections = useTeamObjections();
  const objections = useMemo(
    () => buildTrainingObjections(teamObjections, locale),
    [teamObjections, locale],
  );
  const forSpecies = useCallback(
    (species: ScenarioSpecies) => objectionsForSpecies(objections, species),
    [objections],
  );
  const byId = useCallback((id: string) => objections.find((o) => o.id === id), [objections]);
  return { objections, teamObjections, forSpecies, byId };
}
