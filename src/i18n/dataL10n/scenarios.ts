/**
 * Display localization for authored scenarios.
 *
 * `Scenario` carries no id column of its own — the stable handle a scenario
 * gets at runtime is `_overrideId` (`seed:<i>` into LIBRARY_SCENARIOS,
 * `user:<uuid>`, `admin:<uuid>`), and those are DB values we must not
 * repurpose. So the overlay is keyed by a separate, code-local id per authored
 * seed scenario (`SCENARIO_L10N_IDS`, positionally aligned with
 * `SEED_SCENARIOS`), resolved from a scenario object by reference identity and
 * then by its `seed:<i>` handle.
 *
 * Consequences that matter:
 *   - User-built and admin-authored scenarios resolve to no id and pass
 *     through untouched (their text is user-authored, not translatable).
 *   - A seed scenario whose text an admin has overridden also passes through:
 *     each field is only swapped when it still equals the canonical English,
 *     so an admin edit is never clobbered by a stale translation.
 *
 * Display only. The canonical `SEED_SCENARIOS` objects are never mutated, and
 * the prompt/persistence paths keep using the canonical scenario.
 */
import {
  LIBRARY_SCENARIOS,
  SEED_SCENARIOS,
  type LifeStage,
  type OwnerPersona,
  type Scenario,
} from '../../data/scenarios';
import { getDataOverlay } from '../dataRegistry';
import { DEFAULT_LOCALE, type Locale } from '../locales';
import { localizedPushbackCategory } from './pushbacks';

/**
 * Overlay keys for the authored seed scenarios, aligned index-for-index with
 * `SEED_SCENARIOS`. Names describe the scenario (pushback + breed) so a
 * reordering of the seed array shows up as a test failure rather than as
 * silently mismatched French.
 */
export const SCENARIO_L10N_IDS = [
  'weight-denial-lab',
  'cost-lab',
  'breeder-advice-gsd',
  'rx-diet-french-bulldog',
  'raw-food-golden',
  'brand-switch-mini-schnauzer',
  'cost-poodle',
] as const;

export type ScenarioL10nId = (typeof SCENARIO_L10N_IDS)[number];

/** Free-text display fields of an authored scenario. */
export interface ScenarioDisplayL10n {
  /** Clinical/background note shown on the scenario card and chat header. */
  context: string;
  /** Customer's first line — spoken verbatim by the voice kickoff. */
  openingLine: string;
}

/** Shape a locale registers under the `scenarios` domain. */
export interface ScenarioDataOverlay {
  scenarios: Record<ScenarioL10nId, ScenarioDisplayL10n>;
  /** `LifeStage` union values are DB/enum keys; only their labels translate. */
  lifeStages: Record<LifeStage, string>;
  /** Same for `OwnerPersona`. */
  personas: Record<OwnerPersona, string>;
}

const ID_BY_SCENARIO = new WeakMap<Scenario, ScenarioL10nId>();
const CANONICAL_BY_ID = new Map<ScenarioL10nId, Scenario>();

SEED_SCENARIOS.forEach((scenario, i) => {
  const id = SCENARIO_L10N_IDS[i];
  if (!id) return;
  ID_BY_SCENARIO.set(scenario, id);
  CANONICAL_BY_ID.set(id, scenario);
});

function overlayFor(locale: Locale): ScenarioDataOverlay | undefined {
  if (locale === DEFAULT_LOCALE) return undefined;
  return getDataOverlay<ScenarioDataOverlay>(locale, 'scenarios');
}

/**
 * The overlay key for a scenario, or null when it has none (user-built,
 * admin-authored, or a hand-rolled object).
 */
export function scenarioL10nId(scenario: Scenario): ScenarioL10nId | null {
  const direct = ID_BY_SCENARIO.get(scenario);
  if (direct) return direct;
  // `applyScenarioOverride` hands back a copy, so identity is gone by the time
  // a scenario reaches chat — fall back to its stable seed handle.
  const handle = scenario._overrideId;
  if (handle && handle.startsWith('seed:')) {
    const index = Number(handle.slice('seed:'.length));
    const base = Number.isInteger(index) ? LIBRARY_SCENARIOS[index] : undefined;
    if (base) return ID_BY_SCENARIO.get(base) ?? null;
  }
  return null;
}

/**
 * A display copy of the scenario with its free text and pushback labels in
 * `locale`. Never mutates the input; returns the input object itself when
 * nothing changes (English, no overlay loaded, or an unknown scenario), so
 * callers can rely on reference equality.
 */
export function localizedScenario(scenario: Scenario, locale: Locale): Scenario {
  if (locale === DEFAULT_LOCALE) return scenario;
  const pushback = localizedPushbackCategory(scenario.pushback, locale);

  const id = scenarioL10nId(scenario);
  const l10n = id ? overlayFor(locale)?.scenarios[id] : undefined;
  const canonical = id ? CANONICAL_BY_ID.get(id) : undefined;

  const context =
    l10n && canonical && scenario.context === canonical.context
      ? l10n.context
      : scenario.context;
  const openingLine =
    l10n && canonical && scenario.openingLine === canonical.openingLine
      ? l10n.openingLine
      : scenario.openingLine;

  if (
    pushback === scenario.pushback &&
    context === scenario.context &&
    openingLine === scenario.openingLine
  ) {
    return scenario;
  }
  return { ...scenario, pushback, context, openingLine };
}

/**
 * The line the AI customer opens with, in `locale` — used by the voice
 * kickoff so the simulation starts in the user's language. Falls back to the
 * canonical line, then to an empty string when the scenario has none.
 */
export function getLocalizedOpeningLine(
  scenario: Scenario,
  locale: Locale,
): string {
  return localizedScenario(scenario, locale).openingLine ?? '';
}

/** Display label for a life-stage chip (`Adult (3-7)` → `Adulte (3-7)`). */
export function localizedLifeStage(stage: LifeStage, locale: Locale): string {
  return overlayFor(locale)?.lifeStages[stage] ?? stage;
}

/** Display label for an owner-persona chip (`Devoted` → `Dévoué`). */
export function localizedPersona(
  persona: OwnerPersona,
  locale: Locale,
): string {
  return overlayFor(locale)?.personas[persona] ?? persona;
}
