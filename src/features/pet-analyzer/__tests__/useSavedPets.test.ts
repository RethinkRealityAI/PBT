import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  petStateEquals,
  savedPetToPetState,
  useSavedPets,
  type SavedPet,
} from '../useSavedPets';
import type { PetState } from '../usePetAnalyzer';

// No Supabase env in tests — keep the telemetry write a no-op.
vi.mock('../../auth/supabaseClient', () => ({ getSupabase: () => null }));

function makePet(over: Partial<SavedPet> = {}): SavedPet {
  return {
    id: 'p1',
    savedAt: '2026-01-01T00:00:00.000Z',
    name: 'Bailey',
    breed: 'Golden',
    weightKg: 30,
    bcs: 6,
    mcs: 'normal',
    activity: 'active',
    ...over,
  };
}

function makeState(over: Partial<PetState> = {}): PetState {
  return {
    name: 'Bailey',
    breed: 'Golden',
    weightKg: 30,
    bcs: 6,
    mcs: 'normal',
    activity: 'active',
    ...over,
  };
}

/** Build an intentionally corrupt record — the storage validator only checks
 *  that the saved value is an array, so this really can reach the mapper. */
function corruptPet(over: Record<string, unknown>): SavedPet {
  return { ...makePet(), ...over } as unknown as SavedPet;
}

describe('savedPetToPetState', () => {
  it('drops the record-only fields and keeps the analyzer fields', () => {
    const mapped = savedPetToPetState(
      makePet({ source: 'vision', vision: { ageEstimate: '3 years' } }),
    );
    expect(mapped).toEqual(makeState());
    expect(mapped).not.toHaveProperty('id');
    expect(mapped).not.toHaveProperty('savedAt');
    expect(mapped).not.toHaveProperty('source');
    expect(mapped).not.toHaveProperty('vision');
  });

  it('rounds and clamps weight into the analyzer slider range', () => {
    expect(savedPetToPetState(makePet({ weightKg: 41.6 })).weightKg).toBe(42);
    expect(savedPetToPetState(makePet({ weightKg: 250 })).weightKg).toBe(90);
    expect(savedPetToPetState(makePet({ weightKg: 0 })).weightKg).toBe(2);
  });

  it('rounds and clamps BCS onto the 1-9 scale', () => {
    expect(savedPetToPetState(makePet({ bcs: 6.4 })).bcs).toBe(6);
    expect(savedPetToPetState(makePet({ bcs: 42 })).bcs).toBe(9);
    expect(savedPetToPetState(makePet({ bcs: -3 })).bcs).toBe(1);
  });

  it('falls back to the analyzer defaults for non-numeric weight / BCS', () => {
    const mapped = savedPetToPetState(
      corruptPet({ weightKg: 'heavy', bcs: null }),
    );
    expect(mapped.weightKg).toBe(12);
    expect(mapped.bcs).toBe(5);
  });

  it('rejects an unknown MCS key', () => {
    expect(savedPetToPetState(corruptPet({ mcs: 'wasted' })).mcs).toBe('normal');
    expect(savedPetToPetState(makePet({ mcs: 'severe' })).mcs).toBe('severe');
  });

  it('normalises activity to a known value', () => {
    expect(savedPetToPetState(corruptPet({ activity: 'sprinting' })).activity).toBe(
      'active',
    );
    expect(savedPetToPetState(makePet({ activity: 'inactive' })).activity).toBe(
      'inactive',
    );
  });

  it('coerces missing name / breed to empty strings', () => {
    const mapped = savedPetToPetState(
      corruptPet({ name: undefined, breed: 42 }),
    );
    expect(mapped.name).toBe('');
    expect(mapped.breed).toBe('');
  });
});

describe('petStateEquals', () => {
  it('is true for a pet mapped straight back off its own record', () => {
    const pet = makePet();
    expect(petStateEquals(savedPetToPetState(pet), makeState())).toBe(true);
  });

  it('is false when any single field diverges', () => {
    const base = makeState();
    const divergent: Partial<PetState>[] = [
      { name: 'Max' },
      { breed: 'Poodle' },
      { weightKg: 31 },
      { bcs: 7 },
      { mcs: 'mild' },
      { activity: 'inactive' },
    ];
    for (const patch of divergent) {
      expect(petStateEquals(base, makeState(patch))).toBe(false);
    }
  });

  it('stops matching once the sanitised record differs from the edited state', () => {
    // The user loaded this pet, then nudged the weight slider.
    const mapped = savedPetToPetState(makePet());
    expect(petStateEquals(mapped, { ...mapped, weightKg: 31 })).toBe(false);
  });
});

describe('useSavedPets', () => {
  it('adds a saved pet to the front of the list', () => {
    const { result } = renderHook(() => useSavedPets());
    act(() => {
      result.current.savePet(makeState({ name: 'Bailey' }));
    });
    act(() => {
      result.current.savePet(makeState({ name: 'Max', breed: 'Poodle' }));
    });
    expect(result.current.savedPets.map((p) => p.name)).toEqual([
      'Max',
      'Bailey',
    ]);
  });

  it('deletes only the targeted pet and persists the remainder', () => {
    const { result } = renderHook(() => useSavedPets());
    act(() => {
      result.current.savePet(makeState({ name: 'Bailey' }));
    });
    act(() => {
      result.current.savePet(makeState({ name: 'Max', breed: 'Poodle' }));
    });

    const doomed = result.current.savedPets.find((p) => p.name === 'Max')!;
    act(() => result.current.deletePet(doomed.id));

    expect(result.current.savedPets.map((p) => p.name)).toEqual(['Bailey']);
    expect(JSON.parse(localStorage.getItem('pbt:saved_pets') ?? '[]')).toHaveLength(
      1,
    );
  });

  it('is a no-op when deleting an id that is not in the list', () => {
    const { result } = renderHook(() => useSavedPets());
    act(() => {
      result.current.savePet(makeState());
    });
    act(() => result.current.deletePet('not-a-real-id'));
    expect(result.current.savedPets).toHaveLength(1);
  });
});
