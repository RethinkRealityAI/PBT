import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage, STORAGE_KEYS } from '../../lib/storage';
import { useFlags } from '../../app/providers/FlagProvider';
import { isScenarioSpecies, type ScenarioSpecies } from '../../shared/scenarios/species';

/**
 * The trainee's "Which animal?" choice — dog or cat — shared by the scenario
 * builder and Home's Today's-pick switch, and remembered on this device
 * (`pbt:train_species`, default 'dog').
 *
 * Cats are behind the `scenario.cat.enabled` switch (Admin → Flags, default
 * OFF until the feline content ships). While it is off the trainee app is
 * dogs only: this hook reads 'dog' whatever the device stored, refuses to
 * store 'cat', and `useResolvedLibraryScenarios` lists no cat scenario — so
 * nothing cat-shaped reaches a trainee. A stored cat preference is kept, not
 * erased: switching the flag on brings it back.
 *
 * Every mounted instance stays in sync: a change made through one hook is
 * broadcast to the others in the same tab, so two surfaces can never show
 * different animals at once.
 */
type Listener = (species: ScenarioSpecies) => void;
const listeners = new Set<Listener>();

/** Are cat scenarios switched on for this trainee? (`scenario.cat.enabled`) */
export function useCatScenariosEnabled(): boolean {
  const { getFlag } = useFlags();
  return getFlag<boolean>('scenario.cat.enabled', false) === true;
}

/** The raw stored choice — ungated. Prefer `useTrainingSpecies()`. */
export function readTrainingSpecies(): ScenarioSpecies {
  const stored = readStorage(STORAGE_KEYS.trainSpecies);
  return isScenarioSpecies(stored) ? stored : 'dog';
}

export function useTrainingSpecies(): [ScenarioSpecies, (next: ScenarioSpecies) => void] {
  const catEnabled = useCatScenariosEnabled();
  const [stored, setSpeciesState] = useState<ScenarioSpecies>(readTrainingSpecies);

  useEffect(() => {
    const listener: Listener = (next) => setSpeciesState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setSpecies = useCallback(
    (next: ScenarioSpecies) => {
      if (!isScenarioSpecies(next)) return;
      if (next === 'cat' && !catEnabled) return;
      writeStorage(STORAGE_KEYS.trainSpecies, next);
      setSpeciesState(next);
      listeners.forEach((l) => l(next));
    },
    [catEnabled],
  );

  return [catEnabled ? stored : 'dog', setSpecies];
}
