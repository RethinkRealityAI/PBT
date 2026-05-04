import { useMemo, useState } from 'react';
import { calorieFor, closestRow } from '../../data/calorieTable';
import type { McsLevel } from '../../data/mcsLevels';

export type Activity = 'active' | 'inactive';
export type McsKey = McsLevel['key'];

export interface PetState {
  name: string;
  breed: string;
  weightKg: number;
  bcs: number;
  mcs: McsKey;
  activity: Activity;
}

export type Verdict = 'good' | 'warn' | 'ok';

export interface VerdictResult {
  verdict: Verdict;
  message: string;
}

export function deriveVerdict(state: PetState): VerdictResult {
  const { bcs, mcs } = state;
  if (mcs !== 'normal') {
    return {
      verdict: 'warn',
      message:
        'Muscle condition is not normal — screen for chronic disease or geriatric loss before adjusting calories.',
    };
  }
  if (bcs >= 7) {
    return {
      verdict: 'warn',
      message: `BCS ${bcs}/9. Caloric deficit recommended; recheck weight in 4 weeks.`,
    };
  }
  if (bcs <= 3) {
    return {
      verdict: 'warn',
      message: `BCS ${bcs}/9. Rule out medical cause; increase nutrient density.`,
    };
  }
  if (bcs >= 4 && bcs <= 6) {
    return {
      verdict: 'good',
      message: `BCS ${bcs}/9 with normal muscle. Maintain current intake.`,
    };
  }
  return {
    verdict: 'ok',
    message: `BCS ${bcs}/9. Monitor monthly.`,
  };
}

export function usePetAnalyzer(initial?: Partial<PetState>) {
  const [state, setState] = useState<PetState>({
    name: '',
    breed: '',
    weightKg: 12,
    bcs: 5,
    mcs: 'normal',
    activity: 'active',
    ...initial,
  });

  const update = <K extends keyof PetState>(key: K, value: PetState[K]) =>
    setState((s) => ({ ...s, [key]: value }));

  const calorieTarget = useMemo(
    () => calorieFor(state.weightKg, state.activity),
    [state.weightKg, state.activity],
  );
  const reference = useMemo(
    () => closestRow(state.weightKg),
    [state.weightKg],
  );
  const verdictResult = useMemo(() => deriveVerdict(state), [state]);

  return {
    state,
    update,
    calorieTarget,
    reference,
    verdictResult,
  };
}
