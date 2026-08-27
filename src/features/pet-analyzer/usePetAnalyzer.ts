import { useMemo, useState } from 'react';
import { calorieFor, closestRow } from '../../data/calorieTable';
import type { McsLevel } from '../../data/mcsLevels';
import { useLanguage } from '../../app/providers/LanguageProvider';
import type { CatalogKey } from '../../i18n/catalog';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locales';
import { translate } from '../../i18n/translate';

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

/** Stable code for the clinical sentence, so the prose can live in a catalog. */
export type VerdictCode =
  | 'mcsAbnormal'
  | 'bcsHigh'
  | 'bcsLow'
  | 'bcsIdeal'
  | 'bcsMonitor';

const VERDICT_MESSAGE_KEY: Record<VerdictCode, CatalogKey> = {
  mcsAbnormal: 'analyzer.verdict.message.mcsAbnormal',
  bcsHigh: 'analyzer.verdict.message.bcsHigh',
  bcsLow: 'analyzer.verdict.message.bcsLow',
  bcsIdeal: 'analyzer.verdict.message.bcsIdeal',
  bcsMonitor: 'analyzer.verdict.message.bcsMonitor',
};

export interface VerdictResult {
  verdict: Verdict;
  code: VerdictCode;
  /** Already rendered in `locale` — consumers display it as-is. */
  message: string;
}

/**
 * Pure clinical triage. `locale` is a parameter rather than a hook read so the
 * saved-pets list and the tests can derive a verdict outside React; callers
 * that only need the traffic-light `verdict` can ignore it.
 */
export function deriveVerdict(
  state: PetState,
  locale: Locale = DEFAULT_LOCALE,
): VerdictResult {
  const { bcs, mcs } = state;
  const result = (verdict: Verdict, code: VerdictCode): VerdictResult => ({
    verdict,
    code,
    message: translate(locale, VERDICT_MESSAGE_KEY[code], { bcs }),
  });
  if (mcs !== 'normal') return result('warn', 'mcsAbnormal');
  if (bcs >= 7) return result('warn', 'bcsHigh');
  if (bcs <= 3) return result('warn', 'bcsLow');
  if (bcs >= 4 && bcs <= 6) return result('good', 'bcsIdeal');
  return result('ok', 'bcsMonitor');
}

export function usePetAnalyzer(initial?: Partial<PetState>) {
  const { locale } = useLanguage();
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

  /**
   * Replace every field at once — used when a saved pet is loaded back in.
   * Six sequential `update` calls would also work, but this keeps the swap
   * atomic (one render, no intermediate half-loaded state feeding the calorie
   * / verdict memos).
   */
  const load = (next: PetState) => setState(next);

  const calorieTarget = useMemo(
    () => calorieFor(state.weightKg, state.activity),
    [state.weightKg, state.activity],
  );
  const reference = useMemo(
    () => closestRow(state.weightKg),
    [state.weightKg],
  );
  const verdictResult = useMemo(
    () => deriveVerdict(state, locale),
    [state, locale],
  );

  return {
    state,
    update,
    load,
    calorieTarget,
    reference,
    verdictResult,
  };
}
