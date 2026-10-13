/**
 * Which feature switch turns each screen off — the ONE map.
 *
 * Switching a screen off must hide every way into it, not just redirect the
 * user home once they arrive. So the route guard (`useScreenGate` in
 * App.tsx), the desktop sidebar, the mobile tab bar and every in-app link
 * (Home tiles and cards, the ACT Guide's "build a scenario" buttons, the Pet
 * Analyzer → Fecal Scan link, the scorecard → History link) all read this map
 * through `useScreenEnabled()`.
 *
 * A screen absent from the map is always on (home, chat, settings, the
 * onboarding flow).
 */
import { useCallback } from 'react';
import { useFlags } from './providers/FlagProvider';
import type { FlagKey } from '../services/flagsClient';
import type { Screen } from './routes';

export const SCREEN_FLAGS: Partial<Record<Screen, FlagKey>> = {
  analyzer: 'screen.analyzer.enabled',
  actGuide: 'screen.act_guide.enabled',
  resources: 'screen.resources.enabled',
  stats: 'screen.stats.enabled',
  history: 'screen.history.enabled',
  historyDetail: 'screen.history.enabled',
  create: 'screen.create.enabled',
  fecalScan: 'screen.fecalScan.enabled',
};

/** Pure lookup — exported for tests and for non-React callers. */
export function isScreenEnabled(
  screen: Screen,
  getFlag: <T>(key: FlagKey, fallback: T) => T,
): boolean {
  const flag = SCREEN_FLAGS[screen];
  return flag ? getFlag<boolean>(flag, true) !== false : true;
}

/** `(screen) => boolean` — is this screen switched on for the current user? */
export function useScreenEnabled(): (screen: Screen) => boolean {
  const { getFlag } = useFlags();
  return useCallback((screen: Screen) => isScreenEnabled(screen, getFlag), [getFlag]);
}
