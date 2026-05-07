/**
 * Hook that returns the runtime view of LIBRARY_SCENARIOS plus admin-authored
 * scenarios after the admin's scenario_overrides are applied:
 *   - hidden scenarios are filtered out
 *   - sort_order overrides their order
 *   - persona / difficulty / context / openingLine fields are swapped in
 *   - admin-authored scenarios (id `admin:<uuid>`) are appended
 *
 * Each returned item carries the `override` row so callers can read the
 * card-level fields (card_title_override, info_modal_body, etc.) without
 * a second lookup.
 */
import { useMemo } from 'react';
import type { Scenario } from './scenarios';
import { LIBRARY_SCENARIOS } from './scenarios';
import {
  adminOverrideToScenario,
  applyScenarioOverride,
  isAdminScenarioId,
  seedScenarioId,
} from './scenarioOverrides';
import type { ScenarioOverride } from '../services/flagsClient';
import { useFlags } from '../app/providers/FlagProvider';

export interface ResolvedScenario {
  scenario: Scenario;
  scenarioId: string;
  override: ScenarioOverride | null;
}

export function useResolvedLibraryScenarios(): ResolvedScenario[] {
  const { snapshot, getOverride } = useFlags();
  return useMemo(() => {
    const items: Array<ResolvedScenario & { sort: number | null }> = [];

    LIBRARY_SCENARIOS.forEach((scenario, i) => {
      const scenarioId = seedScenarioId(i);
      const override = getOverride(scenarioId);
      items.push({
        scenario: applyScenarioOverride(scenario, override, scenarioId),
        scenarioId,
        override,
        sort: override?.sort_order ?? null,
      });
    });

    if (snapshot) {
      for (const o of snapshot.scenarioOverrides) {
        if (!isAdminScenarioId(o.scenario_id)) continue;
        const synthesized = adminOverrideToScenario(o);
        if (!synthesized) continue;
        items.push({
          scenario: synthesized,
          scenarioId: o.scenario_id,
          override: o,
          sort: o.sort_order ?? null,
        });
      }
    }

    const visible = items.filter(
      (it) => it.override == null || it.override.visible !== false,
    );
    visible.sort((a, b) => {
      if (a.sort != null && b.sort != null) return a.sort - b.sort;
      if (a.sort != null) return -1;
      if (b.sort != null) return 1;
      return 0;
    });
    return visible.map(({ scenario, scenarioId, override }) => ({
      scenario,
      scenarioId,
      override,
    }));
  }, [snapshot, getOverride]);
}
