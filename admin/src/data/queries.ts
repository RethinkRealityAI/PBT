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
  AuditLogRow,
  FlagDef,
  FlagRule,
  NavEvent,
  ScenarioOverrideRow,
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

// ─────────────────────────────────────────────────────────────
// Flags & rules
// ─────────────────────────────────────────────────────────────

export interface FlagsSnapshot {
  flags: FlagDef[];
  rules: FlagRule[];
}

export function useFlagsSnapshot(refreshKey: number = 0) {
  return useQuery<FlagsSnapshot>(
    () => apiFetch<FlagsSnapshot>('admin-flags'),
    [refreshKey],
    { flags: [], rules: [] },
  );
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`/.netlify/functions/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function upsertFlagRule(rule: Partial<FlagRule>): Promise<FlagRule> {
  return postJson<FlagRule>('admin-flags', { type: 'rule', op: 'upsert', rule });
}

export function deleteFlagRule(id: string): Promise<{ ok: true }> {
  return postJson<{ ok: true }>('admin-flags', { type: 'rule', op: 'delete', id });
}

export function upsertFlagDef(flag: Partial<FlagDef>): Promise<FlagDef> {
  return postJson<FlagDef>('admin-flags', { type: 'flag', op: 'upsert', flag });
}

// ─────────────────────────────────────────────────────────────
// Scenario overrides
// ─────────────────────────────────────────────────────────────

export function useScenarioOverrides(refreshKey: number = 0) {
  return useQuery<ScenarioOverrideRow[]>(
    () => apiFetch<ScenarioOverrideRow[]>('admin-scenario-overrides'),
    [refreshKey],
    [],
  );
}

export function upsertScenarioOverride(
  row: Partial<ScenarioOverrideRow> & { scenario_id: string },
): Promise<ScenarioOverrideRow> {
  return postJson<ScenarioOverrideRow>('admin-scenario-overrides', row);
}

export async function deleteScenarioOverride(
  scenario_id: string,
): Promise<{ ok: true }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(
    `/.netlify/functions/admin-scenario-overrides?op=delete`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ scenario_id }),
    },
  );
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
  return (await res.json()) as { ok: true };
}

// ─────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────

export function useAuditLog(limit = 100, refreshKey: number = 0) {
  return useQuery<AuditLogRow[]>(
    () => apiFetch<AuditLogRow[]>('admin-audit-log', { limit }),
    [limit, refreshKey],
    [],
  );
}

export async function revertAuditEntry(id: string): Promise<{ ok: true }> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(`/.netlify/functions/admin-audit-log?op=revert`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(`Revert failed (${res.status})`);
  return (await res.json()) as { ok: true };
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
