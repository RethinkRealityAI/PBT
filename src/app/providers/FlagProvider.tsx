/**
 * FlagProvider — fetches the audience-resolved flag snapshot from
 * `/.netlify/functions/flags-resolve` once on mount, and re-fetches when
 * the audience inputs (user id, primary driver) change.
 *
 * Preview mode: when the URL contains `?pbt_preview=1`, the provider also
 * listens for `pbt:preview-flags` postMessage from its parent (the admin
 * dashboard's iframe preview). Origin is checked against
 * `window.location.origin` (admin and consumer share the deploy origin).
 * Preview overrides are layered on top of the resolved snapshot so the
 * admin can preview rule changes before saving.
 *
 * All flag reads go through `useFlag()` / `useFlagValue()` — both safe to
 * call before the snapshot has loaded (they fall back to FLAG_DEFAULTS).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useProfile } from './ProfileProvider';
import { useSession } from './SessionProvider';
import { getOrCreateSessionId } from '../../lib/storage';
import {
  FLAG_DEFAULTS,
  fetchFlagSnapshot,
  findOverride,
  readFlag,
  type FlagKey,
  type FlagSnapshot,
  type ScenarioOverride,
} from '../../services/flagsClient';
import type { SimulationConfig } from '../../data/knowledge/simulationConfig';
import { isPreviewMode } from '../../lib/previewMode';

interface FlagContextValue {
  snapshot: FlagSnapshot | null;
  /** Layered preview overrides. Only set when the consumer is being rendered inside the admin preview iframe. */
  preview: Partial<Record<string, unknown>> | null;
  /** True once we've completed at least one fetch (success or fail). */
  ready: boolean;
  refresh: () => Promise<void>;
  getFlag: <T>(key: FlagKey, fallback: T) => T;
  getOverride: (scenarioId: string) => ScenarioOverride | null;
  /** Resolved admin simulation config (or null = use code defaults). */
  getSimulationConfig: () => SimulationConfig | null;
}

const FlagContext = createContext<FlagContextValue | null>(null);

interface PreviewMessage {
  type: 'pbt:preview-flags';
  flags?: Record<string, unknown>;
  scenarioOverrides?: ScenarioOverride[];
  simulationConfig?: SimulationConfig | null;
}

export function FlagProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const { user } = useSession();
  const [snapshot, setSnapshot] = useState<FlagSnapshot | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [previewOverrides, setPreviewOverrides] = useState<ScenarioOverride[] | null>(null);
  const [previewConfig, setPreviewConfig] = useState<SimulationConfig | null>(null);
  const [ready, setReady] = useState(false);
  const inFlightRef = useRef<Promise<void> | null>(null);
  /** When the last fetch settled — drives the on-focus staleness check. */
  const lastFetchRef = useRef(0);

  const audience = useMemo(
    () => ({
      user_id: user?.id ?? null,
      anon_session_id: getOrCreateSessionId(),
      driver: profile?.primary ?? null,
    }),
    [user?.id, profile?.primary],
  );

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;
    const p = (async () => {
      try {
        const snap = await fetchFlagSnapshot(audience);
        setSnapshot(snap);
      } catch (err) {
        console.warn('[flags] fetch failed; falling back to defaults', err);
      } finally {
        lastFetchRef.current = Date.now();
        setReady(true);
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = p;
    return p;
  }, [audience]);

  // Initial fetch + audience-change refresh.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Periodic refresh every 5 minutes — picks up admin flips without forcing
  // a page reload.
  useEffect(() => {
    const id = window.setInterval(() => void refresh(), 5 * 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  // Re-check when the tab comes back to the foreground. Background tabs get
  // their timers throttled (and are frozen outright on mobile), so the 5-minute
  // interval alone leaves a phone that was pocketed mid-session showing flags
  // and scenario overrides from whenever it was last awake. The 60s floor keeps
  // ordinary tab-switching from hammering the endpoint.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastFetchRef.current < 60_000) return;
      void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  // Preview-mode postMessage listener.
  useEffect(() => {
    if (!isPreviewMode()) return;
    const handler = (e: MessageEvent) => {
      // Same-origin only; admin and consumer ship from the same deploy.
      if (e.origin !== window.location.origin) return;
      const data = e.data as PreviewMessage | null;
      if (!data || data.type !== 'pbt:preview-flags') return;
      if (data.flags) setPreview(data.flags);
      if (data.scenarioOverrides) setPreviewOverrides(data.scenarioOverrides);
      if (data.simulationConfig !== undefined) setPreviewConfig(data.simulationConfig);
    };
    window.addEventListener('message', handler);
    // Tell the admin we're ready to receive flag overrides.
    window.parent?.postMessage({ type: 'pbt:preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', handler);
  }, []);

  const getFlag = useCallback(
    <T,>(key: FlagKey, fallback: T): T => {
      if (preview && key in preview) return preview[key] as T;
      return readFlag<T>(snapshot, key, fallback);
    },
    [snapshot, preview],
  );

  const getOverride = useCallback(
    (scenarioId: string): ScenarioOverride | null => {
      if (previewOverrides) {
        const previewMatch = previewOverrides.find((o) => o.scenario_id === scenarioId);
        if (previewMatch) return previewMatch;
      }
      return findOverride(snapshot, scenarioId);
    },
    [snapshot, previewOverrides],
  );

  const getSimulationConfig = useCallback(
    (): SimulationConfig | null =>
      previewConfig ?? snapshot?.simulationConfig ?? null,
    [snapshot, previewConfig],
  );

  const value = useMemo<FlagContextValue>(
    () => ({
      snapshot,
      preview,
      ready,
      refresh,
      getFlag,
      getOverride,
      getSimulationConfig,
    }),
    [snapshot, preview, ready, refresh, getFlag, getOverride, getSimulationConfig],
  );

  return <FlagContext.Provider value={value}>{children}</FlagContext.Provider>;
}

export function useFlags(): FlagContextValue {
  const ctx = useContext(FlagContext);
  if (!ctx) {
    // Pre-provider safety net: returns defaults so flag reads never crash.
    return {
      snapshot: null,
      preview: null,
      ready: false,
      refresh: async () => {},
      getFlag: <T,>(key: FlagKey, fallback: T): T =>
        (FLAG_DEFAULTS[key] as T) ?? fallback,
      getOverride: () => null,
      getSimulationConfig: () => null,
    };
  }
  return ctx;
}

/** Resolved admin simulation config (scoring/drivers/pushbacks/prompt wraps),
 *  or null to use the code defaults. */
export function useSimulationConfig(): SimulationConfig | null {
  return useFlags().getSimulationConfig();
}

/** Boolean flag — most common case. */
export function useFlag(key: FlagKey, fallback = true): boolean {
  return useFlags().getFlag<boolean>(key, fallback);
}

/** Typed flag value — string, number, json. */
export function useFlagValue<T>(key: FlagKey, fallback: T): T {
  return useFlags().getFlag<T>(key, fallback);
}

/** Scenario override (admin edits to library scenarios + AI prompt wraps). */
export function useScenarioOverride(scenarioId: string): ScenarioOverride | null {
  return useFlags().getOverride(scenarioId);
}

/**
 * Render-prop wrapper: hide a subtree when a flag is off.
 * Usage: <IfFlag flag="component.home.save_progress_banner"> ... </IfFlag>
 */
export function IfFlag({
  flag,
  fallback = true,
  children,
}: {
  flag: FlagKey;
  fallback?: boolean;
  children: ReactNode;
}) {
  const enabled = useFlag(flag, fallback);
  if (!enabled) return null;
  return <>{children}</>;
}
