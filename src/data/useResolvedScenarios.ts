/**
 * Hook that returns the runtime view of LIBRARY_SCENARIOS after the admin's
 * scenario_overrides are applied:
 *   - hidden scenarios are filtered out
 *   - sort_order overrides their order
 *   - persona / difficulty / context / openingLine fields are swapped in
 *
 * Used by Home + Create's library tab so admins can curate the rotation
 * without a code change.
 */
import { useMemo } from 'react';
import type { Scenario } from './scenarios';
import { LIBRARY_SCENARIOS } from './scenarios';
import { applyScenarioOverride, seedScenarioId } from './scenarioOverrides';
import { useFlags } from '../app/providers/FlagProvider';

export interface ResolvedScenario {
  scenario: Scenario;
  scenarioId: string;
}

export function useResolvedLibraryScenarios(): ResolvedScenario[] {
  const { getOverride } = useFlags();
  return useMemo(() => {
    const items = LIBRARY_SCENARIOS.map((scenario, i) => {
      const scenarioId = seedScenarioId(i);
      const override = getOverride(scenarioId);
      return {
        scenario: applyScenarioOverride(scenario, override, scenarioId),
        scenarioId,
        override,
      };
    });
    const visible = items.filter(
      ({ override }) => override == null || override.visible !== false,
    );
    visible.sort((a, b) => {
      const ao = a.override?.sort_order;
      const bo = b.override?.sort_order;
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
      return 0;
    });
    return visible.map(({ scenario, scenarioId }) => ({ scenario, scenarioId }));
  }, [getOverride]);
}
