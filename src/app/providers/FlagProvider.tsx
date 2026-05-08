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

interface FlagContextValue {
  snapshot: FlagSnapshot | null;
  /** Layered preview overrides. Only set when the consumer is being rendered inside the admin preview iframe. */
  preview: Partial<Record<string, unknown>> | null;
  /** True once we've completed at least one fetch (success or fail). */
  ready: boolean;
  refresh: () => Promise<void>;
  getFlag: <T>(key: FlagKey, fallback: T) => T;
  getOverride: (scenarioId: string) => ScenarioOverride | null;
}

const FlagContext = createContext<FlagContextValue | null>(null);

const PREVIEW_PARAM = 'pbt_preview';

function isPreviewMode(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).has(PREVIEW_PARAM);
}

interface PreviewMessage {
  type: 'pbt:preview-flags';
  flags?: Record<string, unknown>;
  scenarioOverrides?: ScenarioOverride[];
}

export function FlagProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const { user } = useSession();
  const [snapshot, setSnapshot] = useState<FlagSnapshot | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [previewOverrides, setPreviewOverrides] = useState<ScenarioOverride[] | null>(null);
  const [ready, setReady] = useState(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

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

  const value = useMemo<FlagContextValue>(
    () => ({
      snapshot,
      preview,
      ready,
      refresh,
      getFlag,
      getOverride,
    }),
    [snapshot, preview, ready, refresh, getFlag, getOverride],
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
    };
  }
  return ctx;
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
