/**
 * Admin data hooks.
 *
 * All reads go through Netlify Functions (`/.netlify/functions/admin-*`)
 * which verify the caller's JWT + `is_admin` flag server-side and then
 * query Supabase with the service role. The browser never holds the
 * service role key, and admin RLS policies are no longer required for
 * cross-user reads.
 */
import { useEffect, useState } from 'react';
import { apiFetch, rangeToSince } from '../lib/api';
import { getAccessToken } from '../lib/supabase';
import type {
  AdminSession,
  AdminUser,
  AiCall,
  AnalyzerEvent,
  NavEvent,
  UserScenario,
} from './types';

interface QueryState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

function useQuery<T>(
  fn: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
  fallback: T,
): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({
    data: fallback,
    loading: true,
    error: null,
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => {
        if (cancelled) return;
        setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Query failed';
        setState((s) => ({ ...s, loading: false, error: msg }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export { rangeToSince };

export function useAdminUsers() {
  return useQuery<AdminUser[]>(
    () => apiFetch<AdminUser[]>('admin-users'),
    [],
    [],
  );
}

export function useAdminSessions(range = '28d', limit = 500) {
  return useQuery<AdminSession[]>(
    () =>
      apiFetch<AdminSession[]>('admin-sessions', {
        since: rangeToSince(range),
        limit,
      }),
    [range, limit],
    [],
  );
}

export function useAiCalls(range = '28d', limit = 5000) {
  return useQuery<AiCall[]>(
    () =>
      apiFetch<AiCall[]>('admin-ai-calls', {
        since: rangeToSince(range),
        limit,
      }),
    [range, limit],
    [],
  );
}

export function useUserScenarios(limit = 200) {
  return useQuery<UserScenario[]>(
    () => apiFetch<UserScenario[]>('admin-scenarios', { limit }),
    [limit],
    [],
  );
}

export function useAnalyzerEvents(range = '28d', limit = 500) {
  return useQuery<AnalyzerEvent[]>(
    () =>
      apiFetch<AnalyzerEvent[]>('admin-analyzer', {
        since: rangeToSince(range),
        limit,
      }),
    [range, limit],
    [],
  );
}

export function useNavEvents(range = '7d', limit = 5000) {
  return useQuery<NavEvent[]>(
    () =>
      apiFetch<NavEvent[]>('admin-nav-events', {
        since: rangeToSince(range),
        limit,
      }),
    [range, limit],
    [],
  );
}

/** Trigger a JSONL download from the rag-export Netlify Function. */
export async function downloadRagExport(opts: {
  since?: string;
  limit?: number;
  completedOnly?: boolean;
}): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  const url = new URL('/.netlify/functions/admin-rag-export', window.location.origin);
  if (opts.since) url.searchParams.set('since', opts.since);
  if (opts.limit) url.searchParams.set('limit', String(opts.limit));
  if (opts.completedOnly) url.searchParams.set('completed', 'true');
  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pbt-rag-${Date.now()}.jsonl`;
  a.click();
}
