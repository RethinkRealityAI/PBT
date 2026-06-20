import { useCallback, useState } from 'react';
import { readStorage, writeStorage } from '../../lib/storage';
import { deriveVerdict, type PetState } from './usePetAnalyzer';
import { uuid } from '../../lib/id';
import { calorieFor } from '../../data/calorieTable';
import { getSupabase } from '../auth/supabaseClient';
import { logEvent } from '../../lib/analytics';
import type {
  PetVisionDermatitis,
  VisionLifeStage,
} from '../../services/petVisionService';

/**
 * Optional Pet Vision provenance attached at save time. Present only when the
 * pet's fields were seeded from a photo analysis (and possibly hand-corrected).
 * The raw image is never stored — only these structured fields.
 */
export interface VisionSaveMeta {
  ageEstimate?: string;
  breedConfidence?: number;
  lifeStage?: VisionLifeStage;
  dermatitis?: PetVisionDermatitis;
}

export interface SavedPet extends PetState {
  id: string;
  savedAt: string;
  source?: 'manual' | 'vision';
  vision?: VisionSaveMeta;
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

async function persistAnalyzerEvent(
  state: PetState,
  vision?: VisionSaveMeta,
): Promise<void> {
  const verdict = adminVerdict(state);
  const source = vision ? 'vision' : 'manual';
  logEvent({
    type: 'custom',
    screen: 'analyzer',
    target: 'analyzer_save',
    meta: { breed: state.breed, bcs: state.bcs, mcs: state.mcs, verdict, source },
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
      // pet_records is only populated by the sign-up backfill, never on a live
      // save — so we cannot reference a pet_records(id) here without violating
      // the FK (which would silently reject the whole event). The local
      // SavedPet id lives in localStorage only; admin telemetry reads
      // analyzer_events directly and doesn't need the linkage.
      pet_id: null,
      breed: state.breed,
      weight_kg: state.weightKg,
      bcs: state.bcs,
      mcs: mcsMap[state.mcs] ?? null,
      activity: state.activity,
      kcal_target: calorieFor(state.weightKg, state.activity),
      verdict,
      source,
      age_estimate: vision?.ageEstimate ?? null,
      breed_confidence: vision?.breedConfidence ?? null,
      dermatitis: vision?.dermatitis ?? null,
    });
  } catch (err) {
    console.warn('[saved-pets] persistAnalyzerEvent failed', err);
  }
}

export function useSavedPets() {
  const [savedPets, setSavedPets] = useState<SavedPet[]>(() =>
    readStorage(SAVED_PETS_KEY),
  );

  const savePet = useCallback((state: PetState, vision?: VisionSaveMeta) => {
    const pet: SavedPet = {
      ...state,
      id: uuid(),
      savedAt: new Date().toISOString(),
      source: vision ? 'vision' : 'manual',
      vision,
    };
    setSavedPets((prev) => {
      const next = [pet, ...prev.filter((p) => p.name !== state.name || p.breed !== state.breed)];
      writeStorage(SAVED_PETS_KEY, next);
      return next;
    });
    void persistAnalyzerEvent(state, vision);
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
