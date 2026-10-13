import { useCallback, useEffect, useState } from 'react';
import { readStorage, writeStorage, STORAGE_KEYS } from '../../lib/storage';
import { isScenarioSpecies, type ScenarioSpecies } from '../../shared/scenarios/species';

/**
 * The trainee's "Which animal?" choice — dog or cat — shared by the scenario
 * builder (both tabs) and Home's Today's-pick switch, and remembered on this
 * device (`pbt:train_species`, default 'dog').
 *
 * Every mounted instance stays in sync: a change made through one hook is
 * broadcast to the others in the same tab, so two surfaces can never show
 * different animals at once.
 */
type Listener = (species: ScenarioSpecies) => void;
const listeners = new Set<Listener>();

export function readTrainingSpecies(): ScenarioSpecies {
  const stored = readStorage(STORAGE_KEYS.trainSpecies);
  return isScenarioSpecies(stored) ? stored : 'dog';
}

export function useTrainingSpecies(): [ScenarioSpecies, (next: ScenarioSpecies) => void] {
  const [species, setSpeciesState] = useState<ScenarioSpecies>(readTrainingSpecies);

  useEffect(() => {
    const listener: Listener = (next) => setSpeciesState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setSpecies = useCallback((next: ScenarioSpecies) => {
    if (!isScenarioSpecies(next)) return;
    writeStorage(STORAGE_KEYS.trainSpecies, next);
    setSpeciesState(next);
    listeners.forEach((l) => l(next));
  }, []);

  return [species, setSpecies];
}
