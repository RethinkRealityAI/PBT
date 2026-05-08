/**
 * Static manifest of LIBRARY_SCENARIOS the consumer ships with — used by the
 * Overrides screen to list selectable scenarios. Mirrors the curated set in
 * src/data/scenarios.ts (LIBRARY_SCENARIOS). When that list changes, update
 * here too.
 *
 * Stable id format matches seedScenarioId(i) in src/data/scenarioOverrides.ts.
 */

export interface SeedScenarioManifest {
  id: string;
  title: string;
  breed: string;
  pushback: string;
  driver: string;
  defaultDifficulty: number;
}

export const LIBRARY_MANIFEST: SeedScenarioManifest[] = [
  {
    id: 'seed:0',
    title: 'Weight / obesity denial',
    breed: 'Lab',
    pushback: 'weight-denial',
    driver: 'Activator',
    defaultDifficulty: 3,
  },
  {
    id: 'seed:1',
    title: 'Cost / price pushback',
    breed: 'Lab',
    pushback: 'cost',
    driver: 'Activator',
    defaultDifficulty: 2,
  },
  {
    id: 'seed:2',
    title: 'Switching brands hesitation',
    breed: 'Mini Schnauzer',
    pushback: 'brand-switch',
    driver: 'Activator',
    defaultDifficulty: 2,
  },
];
