/**
 * A small shared cache for admin reads.
 *
 * The Analytics destination is seven tabs over the same few datasets — the
 * Overview, Trainees, Sessions and Skills tabs all read the same sessions for
 * the same window. Before this, every tab switch refetched everything from
 * scratch (and the Overview and the old Insights screen fetched the same
 * sessions twice, with different caps, and disagreed). This keeps the latest
 * answer per key so a tab switch paints instantly, and revalidates in the
 * background once the entry is older than `staleMs`.
 *
 * Deliberately tiny — no library: entries live for the life of the tab, an
 * in-flight request is shared by everyone who asks for the same key, and
 * `invalidate(prefix)` is how a write (or a "Refresh" button) forces fresh data.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Entry<T> {
  data?: T;
  error?: string | null;
  at: number;
  inflight?: Promise<T>;
}

const store = new Map<string, Entry<unknown>>();
const listeners = new Map<string, Set<() => void>>();

/** How long an answer counts as fresh before a revisit refetches it. */
export const DEFAULT_STALE_MS = 60_000;

function notify(key: string): void {
  for (const fn of listeners.get(key) ?? []) fn();
}

function subscribe(key: string, fn: () => void): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
  };
}

/** Fetch through the cache: one request per key at a time. */
export function fetchCached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = store.get(key) as Entry<T> | undefined;
  if (existing?.inflight) return existing.inflight;
  const inflight = fn().then(
    (data) => {
      store.set(key, { data, error: null, at: Date.now() });
      notify(key);
      return data;
    },
    (err: unknown) => {
      const prev = store.get(key) as Entry<T> | undefined;
      store.set(key, {
        data: prev?.data,
        error: err instanceof Error ? err.message : 'Query failed',
        at: Date.now(),
      });
      notify(key);
      throw err;
    },
  );
  store.set(key, { ...(existing ?? { at: 0 }), inflight } as Entry<unknown>);
  return inflight;
}

/** Drop every cached answer whose key starts with `prefix` ('' = everything). */
export function invalidate(prefix = ''): void {
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      notify(key);
    }
  }
}

/** Test seam — forget everything. */
export function resetCache(): void {
  store.clear();
}

export interface CachedQueryState<T> {
  data: T;
  loading: boolean;
  /** True while a background refresh runs behind data already on screen. */
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
  /** When the data on screen was fetched (ms epoch), or null before the first answer. */
  updatedAt: number | null;
}

/**
 * `useQuery` with a shared, keyed cache. `key = null` skips the fetch (a tab
 * that has nothing to load yet, e.g. a profile with no id) and returns the
 * fallback.
 */
export function useCachedQuery<T>(
  key: string | null,
  fn: () => Promise<T>,
  fallback: T,
  staleMs: number = DEFAULT_STALE_MS,
): CachedQueryState<T> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  useEffect(() => {
    if (key == null) return;
    const unsubscribe = subscribe(key, rerender);
    const entry = store.get(key);
    const fresh = entry && entry.data !== undefined && Date.now() - entry.at < staleMs;
    if (!fresh && !entry?.inflight) {
      fetchCached(key, () => fnRef.current()).catch(() => {
        /* surfaced through the entry's error */
      });
      rerender();
    }
    return unsubscribe;
  }, [key, staleMs, rerender]);

  const refetch = useCallback(() => {
    if (key == null) return;
    const entry = store.get(key);
    if (entry) store.set(key, { ...entry, at: 0 });
    fetchCached(key, () => fnRef.current()).catch(() => {
      /* surfaced through the entry's error */
    });
    rerender();
  }, [key, rerender]);

  if (key == null) {
    return { data: fallback, loading: false, refreshing: false, error: null, refetch, updatedAt: null };
  }
  const entry = store.get(key) as Entry<T> | undefined;
  const hasData = entry?.data !== undefined;
  const busy = Boolean(entry?.inflight) || !entry;
  return {
    data: hasData ? (entry!.data as T) : fallback,
    loading: !hasData && busy && !entry?.error,
    refreshing: hasData && Boolean(entry?.inflight),
    // A failed background refresh keeps the last good data on screen; only a
    // fetch that never produced data is an error state.
    error: hasData ? null : entry?.error ?? null,
    refetch,
    updatedAt: hasData ? entry!.at : null,
  };
}
