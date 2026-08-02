import { useCallback, useState } from 'react';
import { readStorage, writeStorage } from '../../lib/storage';
import { deriveVerdict, type PetState } from './usePetAnalyzer';
import { uuid } from '../../lib/id';
import { calorieFor } from '../../data/calorieTable';
import { MCS_LEVELS } from '../../data/mcsLevels';
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

/**
 * Analyzer input bounds. The weight range mirrors the slider in
 * `PetAnalyzerScreen`; BCS mirrors the 9-point WSAVA scale.
 */
const WEIGHT_MIN_KG = 2;
const WEIGHT_MAX_KG = 90;
const BCS_MIN = 1;
const BCS_MAX = 9;

/** Analyzer defaults, mirrored from `usePetAnalyzer`'s initial state. */
const DEFAULT_WEIGHT_KG = 12;
const DEFAULT_BCS = 5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Usable number, or `null` when the field is missing / not a number.
 *
 * Deliberately stricter than `Number(value)`: that coerces `null`, `''` and
 * `[]` to 0, which would silently clamp a missing BCS to 1 ("emaciated")
 * instead of falling through to the analyzer's default.
 */
function finiteOrNull(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Map a stored pet back onto analyzer state (drops `id` / `savedAt` /
 * provenance).
 *
 * Deliberately defensive: `SAVED_PETS_KEY`'s validator only asserts that the
 * stored value is an array, so an individual record — written by an older
 * build, or hand-edited in devtools — can carry missing, non-numeric, or
 * out-of-range fields. Anything unusable falls back to the analyzer's own
 * defaults rather than pushing a NaN into the calorie maths or parking the
 * weight slider off its track.
 */
export function savedPetToPetState(pet: SavedPet): PetState {
  const weightKg = finiteOrNull(pet?.weightKg);
  const bcs = finiteOrNull(pet?.bcs);
  return {
    name: typeof pet?.name === 'string' ? pet.name : '',
    breed: typeof pet?.breed === 'string' ? pet.breed : '',
    weightKg:
      weightKg == null
        ? DEFAULT_WEIGHT_KG
        : clamp(Math.round(weightKg), WEIGHT_MIN_KG, WEIGHT_MAX_KG),
    bcs: bcs == null ? DEFAULT_BCS : clamp(Math.round(bcs), BCS_MIN, BCS_MAX),
    mcs: MCS_LEVELS.some((level) => level.key === pet?.mcs)
      ? pet.mcs
      : 'normal',
    activity: pet?.activity === 'inactive' ? 'inactive' : 'active',
  };
}

/**
 * Field-by-field equality on analyzer state.
 *
 * Lets the screen *derive* which saved row is currently on display instead of
 * tracking a "loaded id" in state. That matters twice: editing any field
 * silently drops the marker (the values no longer mirror the row), and
 * deleting the displayed row simply removes it from the list — the analyzer
 * keeps the user's on-screen work with nothing to clean up.
 */
export function petStateEquals(a: PetState, b: PetState): boolean {
  return (
    a.name === b.name &&
    a.breed === b.breed &&
    a.weightKg === b.weightKg &&
    a.bcs === b.bcs &&
    a.mcs === b.mcs &&
    a.activity === b.activity
  );
}

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
