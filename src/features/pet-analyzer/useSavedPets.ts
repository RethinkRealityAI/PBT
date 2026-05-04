import { useCallback, useState } from 'react';
import { readStorage, writeStorage } from '../../lib/storage';
import type { PetState } from './usePetAnalyzer';
import { uuid } from '../../lib/id';

export interface SavedPet extends PetState {
  id: string;
  savedAt: string;
}

const SAVED_PETS_KEY = {
  key: 'saved_pets',
  fallback: [] as SavedPet[],
  validate: (v: unknown): v is SavedPet[] => Array.isArray(v),
};

export function useSavedPets() {
  const [savedPets, setSavedPets] = useState<SavedPet[]>(() =>
    readStorage(SAVED_PETS_KEY),
  );

  const savePet = useCallback((state: PetState) => {
    const pet: SavedPet = { ...state, id: uuid(), savedAt: new Date().toISOString() };
    setSavedPets((prev) => {
      const next = [pet, ...prev.filter((p) => p.name !== state.name || p.breed !== state.breed)];
      writeStorage(SAVED_PETS_KEY, next);
      return next;
    });
    return pet;
  }, []);

  const deletePet = useCallback((id: string) => {
    setSavedPets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      writeStorage(SAVED_PETS_KEY, next);
      return next;
    });
  }, []);

  return { savedPets, savePet, deletePet };
}
