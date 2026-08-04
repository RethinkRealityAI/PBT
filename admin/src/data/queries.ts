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
import { apiFetch, postJson, rangeToSince } from '../lib/api';
import { getAccessToken } from '../lib/supabase';
import type {
  AdminSession,
  AdminUser,
  AiCall,
  AnalyzerEvent,
  AuditLogRow,
  FlagDef,
  FlagRule,
  KnowledgeDocument,
  NavEvent,
  PlatformReportRow,
  ScenarioOverrideRow,
  SessionFeedbackRow,
  UserAction,
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

export function useAdminUsers(refreshKey: number = 0) {
  return useQuery<AdminUser[]>(
    () => apiFetch<AdminUser[]>('admin-users'),
    [refreshKey],
    [],
  );
}

/** Run a user/admin management action (promote, disable, create, delete). */
export function runUserAction(action: UserAction): Promise<{ ok: true; user_id?: string }> {
  return postJson<{ ok: true; user_id?: string }>('admin-user-actions', action);
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

export function useSessionFeedback(range = '28d', limit = 1000) {
  return useQuery<SessionFeedbackRow[]>(
    () =>
      apiFetch<SessionFeedbackRow[]>('admin-feedback', {
        since: rangeToSince(range),
        limit,
      }),
    [range, limit],
    [],
  );
}

export function usePlatformReports(range = '28d', limit = 1000) {
  return useQuery<PlatformReportRow[]>(
    () =>
      apiFetch<PlatformReportRow[]>('admin-reports', {
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

export async function duplicateScenario(
  scenario_id: string,
): Promise<ScenarioOverrideRow> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not signed in');
  const res = await fetch(
    `/.netlify/functions/admin-scenario-overrides?op=duplicate`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ scenario_id }),
    },
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Duplicate failed (${res.status})`);
  }
  return (await res.json()) as ScenarioOverrideRow;
}

// ─────────────────────────────────────────────────────────────
// Simulation config
// ─────────────────────────────────────────────────────────────

export function useAdminSimulationConfig(refreshKey: number = 0) {
  return useQuery<Record<string, unknown>>(
    () =>
      apiFetch<{ config: Record<string, unknown> }>('admin-simulation-config').then(
        (res) => res.config ?? {},
      ),
    [refreshKey],
    {},
  );
}

export function saveSimulationConfig(
  config: Record<string, unknown>,
): Promise<{ config: Record<string, unknown> }> {
  return postJson<{ config: Record<string, unknown> }>('admin-simulation-config', { config });
}

// ─────────────────────────────────────────────────────────────
// Knowledge base (RAG)
// ─────────────────────────────────────────────────────────────

export function useKnowledgeDocuments(refreshKey: number = 0) {
  return useQuery<KnowledgeDocument[]>(
    () =>
      apiFetch<{ documents: KnowledgeDocument[] }>('admin-knowledge').then(
        (res) => res.documents ?? [],
      ),
    [refreshKey],
    [],
  );
}

export interface IngestKnowledgeBody {
  pdfBase64?: string;
  text?: string;
  title?: string;
  category: 'clinical' | 'custom';
  tags?: Record<string, unknown>;
}

export function ingestKnowledge(
  body: IngestKnowledgeBody,
): Promise<{ ok: true; slug: string; chunks: number }> {
  return postJson<{ ok: true; slug: string; chunks: number }>(
    'admin-knowledge-ingest',
    { op: 'ingest', ...body },
  );
}

export function reembedKnowledge(slug: string): Promise<{ ok: true; chunks: number }> {
  return postJson<{ ok: true; chunks: number }>('admin-knowledge-ingest', {
    op: 're-embed',
    slug,
  });
}

export function ingestBundledStudies(): Promise<{ ok: true; ingested: number }> {
  return postJson<{ ok: true; ingested: number }>('admin-knowledge-ingest', {
    op: 'ingest-bundled',
  });
}

export function seedKnowledge(): Promise<{ ok: true; seeded: number }> {
  return postJson<{ ok: true; seeded: number }>('admin-knowledge', { op: 'seed' });
}

export function deleteKnowledge(slug: string): Promise<{ ok: true }> {
  return postJson<{ ok: true }>('admin-knowledge', { op: 'delete', slug });
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
