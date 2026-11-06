/**
 * The ECHO data-quality controls (thresholds + include toggles), shared for
 * the session by the ECHO tab and the Skills tab's style matchup, so both
 * read the same quizzes as "flagged". In memory only — a reload starts from
 * the defaults (no browser storage: nothing here is worth persisting).
 */
import { useSyncExternalStore } from 'react';
import { clampThresholds } from '../../../src/shared/analytics/echoQuality';
import { DEFAULT_ECHO_OPTIONS, type EchoOptions } from './lib/echo';

let current: EchoOptions = { ...DEFAULT_ECHO_OPTIONS };
const listeners = new Set<() => void>();

export function getEchoOptions(): EchoOptions {
  return current;
}

export function setEchoOptions(patch: Partial<EchoOptions>): void {
  current = {
    ...current,
    ...patch,
    thresholds: clampThresholds({ ...current.thresholds, ...(patch.thresholds ?? {}) }),
  };
  for (const l of listeners) l();
}

export function resetEchoOptions(): void {
  current = { ...DEFAULT_ECHO_OPTIONS };
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useEchoOptions(): EchoOptions {
  return useSyncExternalStore(subscribe, getEchoOptions, getEchoOptions);
}
