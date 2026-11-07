/**
 * The Training library's grouping — pure, so the screen and its tests share
 * ONE definition of "which focus areas, which animals, how many scenarios".
 *
 *   animal (only when the library holds both) → FOCUS AREA (an objection
 *   category, or "Other pushback") → the scenarios in it, optionally
 *   narrowed by objection.
 *
 * Input is the RESOLVED library (`useResolvedLibraryScenarios`: admin-hidden
 * seeds removed, published Studio scenarios appended, cats already dropped
 * while `scenario.cat.enabled` is off) and the trainee's objection catalogue
 * (`useObjectionCatalog`). No fetches, no React.
 */
import type { ResolvedScenario } from '../../data/useResolvedScenarios';
import { localizedPushbackCategory } from '../../i18n/dataL10n/pushbacks';
import type { Locale } from '../../i18n/locales';
import {
  OTHER_CATEGORY_ICON,
  categoryIconFor,
  type CategoryIconKey,
} from '../../shared/scenarios/categoryIcons';
import { objectionCategoryId } from '../../shared/scenarios/objectionCategories';
import type { TeamObjection } from '../../shared/scenarios/objections';
import { speciesOf, type ScenarioSpecies } from '../../shared/scenarios/species';
import type { TrainingCategory, TrainingObjection } from './useObjectionCatalog';

/**
 * The group for scenarios outside every known category: "Other pushback"
 * (`custom`), or a team objection whose category this snapshot doesn't
 * carry. Never a real category id (those are built-in words or
 * `category:<slug>`).
 */
export const OTHER_GROUP = '__other';

/** One focus-area card on the library's first step. */
export interface LibraryGroup {
  /** A category id, or OTHER_GROUP. */
  id: string;
  /** Display name in the current locale. */
  label: string;
  icon: CategoryIconKey;
  /** Scenarios in it (for the animal shown). */
  count: number;
}

/** A "narrow by objection" chip on the second step. */
export interface ObjectionFilterOption {
  id: string;
  label: string;
}

/** The focus area a library scenario files under (see OTHER_GROUP). */
export function libraryGroupOf(
  item: ResolvedScenario,
  team: readonly TeamObjection[],
  categories: readonly Pick<TrainingCategory, 'id'>[],
): string {
  const id = objectionCategoryId(item.scenario.pushback.id, team);
  return id && categories.some((c) => c.id === id) ? id : OTHER_GROUP;
}

/**
 * The focus areas present in a list of library scenarios — only those with
 * at least one scenario — in category display order, "Other pushback"
 * (labelled `otherLabel`) last, each with its icon and count.
 */
export function libraryGroups(
  items: readonly ResolvedScenario[],
  team: readonly TeamObjection[],
  categories: readonly TrainingCategory[],
  otherLabel: string,
): LibraryGroup[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const g = libraryGroupOf(item, team, categories);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  const out: LibraryGroup[] = categories
    .filter((c) => counts.has(c.id))
    .map((c) => ({ id: c.id, label: c.label, icon: categoryIconFor(c), count: counts.get(c.id) ?? 0 }));
  const other = counts.get(OTHER_GROUP);
  if (other) out.push({ id: OTHER_GROUP, label: otherLabel, icon: OTHER_CATEGORY_ICON, count: other });
  return out;
}

/** The scenarios of one focus area. */
export function scenariosInGroup(
  items: readonly ResolvedScenario[],
  groupId: string,
  team: readonly TeamObjection[],
  categories: readonly Pick<TrainingCategory, 'id'>[],
): ResolvedScenario[] {
  return items.filter((item) => libraryGroupOf(item, team, categories) === groupId);
}

/**
 * The objections present in a list of library scenarios, labelled in the
 * locale, ordered like the catalogue (built-ins, then the team's), with
 * "Other pushback" and anything the catalogue doesn't know last.
 */
export function libraryObjectionFilters(
  items: readonly ResolvedScenario[],
  catalogue: readonly Pick<TrainingObjection, 'id'>[],
  locale: Locale,
): ObjectionFilterOption[] {
  const seen = new Map<string, ObjectionFilterOption>();
  for (const { scenario } of items) {
    const id = scenario.pushback.id;
    if (seen.has(id)) continue;
    seen.set(id, { id, label: localizedPushbackCategory(scenario.pushback, locale).title });
  }
  const rank = (id: string) => {
    const i = catalogue.findIndex((o) => o.id === id);
    return i >= 0 ? i : catalogue.length + (id === 'custom' ? 0 : 1);
  };
  return [...seen.values()].sort((a, b) => rank(a.id) - rank(b.id));
}

/**
 * Does the library offer a Dog | Cat choice? Only when it holds scenarios
 * for BOTH animals — with one animal there is nothing to choose, and a stored
 * preference can never empty the list. (The resolved library already holds
 * no cat while `scenario.cat.enabled` is off, so the switch is in here too.)
 */
export function libraryHasBothAnimals(items: readonly ResolvedScenario[]): boolean {
  return (
    items.some((r) => speciesOf(r.scenario.species) === 'dog') &&
    items.some((r) => speciesOf(r.scenario.species) === 'cat')
  );
}

/**
 * The scenarios shown for the trainee's animal: the chosen animal's when the
 * library holds both, otherwise everything (one animal — no filter).
 */
export function libraryForAnimal(
  items: readonly ResolvedScenario[],
  species: ScenarioSpecies,
): ResolvedScenario[] {
  return libraryHasBothAnimals(items)
    ? items.filter((r) => speciesOf(r.scenario.species) === species)
    : [...items];
}
