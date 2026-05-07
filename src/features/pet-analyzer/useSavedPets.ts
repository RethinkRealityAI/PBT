import { useCallback, useState } from 'react';
import { readStorage, writeStorage } from '../../lib/storage';
import { deriveVerdict, type PetState } from './usePetAnalyzer';
import { uuid } from '../../lib/id';
import { calorieFor } from '../../data/calorieTable';
import { getSupabase } from '../auth/supabaseClient';
import { logEvent } from '../../lib/analytics';

export interface SavedPet extends PetState {
  id: string;
  savedAt: string;
}

const SAVED_PETS_KEY = {
  key: 'saved_pets',
  fallback: [] as SavedPet[],
  validate: (v: unknown): v is SavedPet[] => Array.isArray(v),
};

/** UI verdict bands → admin-dashboard verdict buckets. */
function adminVerdict(state: PetState): 'on_track' | 'watch' | 'adjust' | 'concern' {
  const { verdict } = deriveVerdict(state);
  if (verdict === 'good') return 'on_track';
  if (verdict === 'ok') return 'watch';
  if (state.bcs <= 2 || state.bcs >= 8) return 'concern';
  return 'adjust';
}

async function persistAnalyzerEvent(state: PetState, petId: string | null): Promise<void> {
  const verdict = adminVerdict(state);
  logEvent({
    type: 'custom',
    screen: 'analyzer',
    target: 'analyzer_save',
    meta: { breed: state.breed, bcs: state.bcs, mcs: state.mcs, verdict },
  });

  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    const mcsMap: Record<string, number> = { normal: 1, mild: 2, moderate: 3, severe: 4 };
    await sb.from('analyzer_events').insert({
      user_id: user?.id ?? null,
      pet_id: petId,
      breed: state.breed,
      weight_kg: state.weightKg,
      bcs: state.bcs,
      mcs: mcsMap[state.mcs] ?? null,
      activity: state.activity,
      kcal_target: calorieFor(state.weightKg, state.activity),
      verdict,
    });
  } catch (err) {
    console.warn('[saved-pets] persistAnalyzerEvent failed', err);
  }
}

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
    void persistAnalyzerEvent(state, pet.id);
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
