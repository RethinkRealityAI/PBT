/**
 * Supabase data access for the admin dashboard.
 *
 * All reads are gated by RLS: only `is_admin = true` profiles get rows back.
 * Hooks return `{ data, loading, error }` and refetch on dependency change.
 */
import { useEffect, useState } from 'react';
import { getSupabase } from '../lib/supabase';
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

const RANGE_DAYS: Record<string, number> = { '24h': 1, '7d': 7, '28d': 28, '90d': 90 };

export function rangeStart(range: string): string {
  const days = RANGE_DAYS[range] ?? 28;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ── Users ────────────────────────────────────────────────────
export function useAdminUsers() {
  return useQuery<AdminUser[]>(
    async () => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('profiles')
        .select('user_id, display_name, echo_primary, echo_secondary, is_admin, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminUser[];
    },
    [],
    [],
  );
}

// ── Sessions ─────────────────────────────────────────────────
export function useAdminSessions(range = '28d', limit = 500) {
  return useQuery<AdminSession[]>(
    async () => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('training_sessions')
        .select(
          'id, user_id, scenario, scenario_summary, pushback_id, driver, transcript, score_report, score_overall, duration_seconds, mode, completed, ended_reason, flagged, flag_reason, model_id, turns, created_at',
        )
        .gte('created_at', rangeStart(range))
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AdminSession[];
    },
    [range, limit],
    [],
  );
}

// ── AI calls ─────────────────────────────────────────────────
export function useAiCalls(range = '28d', limit = 5000) {
  return useQuery<AiCall[]>(
    async () => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('ai_call_telemetry')
        .select('*')
        .gte('created_at', rangeStart(range))
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AiCall[];
    },
    [range, limit],
    [],
  );
}

// ── User scenarios ───────────────────────────────────────────
export function useUserScenarios(limit = 200) {
  return useQuery<UserScenario[]>(
    async () => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('user_scenarios')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as UserScenario[];
    },
    [limit],
    [],
  );
}

// ── Analyzer events ──────────────────────────────────────────
export function useAnalyzerEvents(range = '28d', limit = 500) {
  return useQuery<AnalyzerEvent[]>(
    async () => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('analyzer_events')
        .select('*')
        .gte('created_at', rangeStart(range))
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AnalyzerEvent[];
    },
    [range, limit],
    [],
  );
}

// ── Nav events (lightweight rollup) ──────────────────────────
export function useNavEvents(range = '7d', limit = 5000) {
  return useQuery<NavEvent[]>(
    async () => {
      const sb = getSupabase();
      const { data, error } = await sb
        .from('nav_events')
        .select('*')
        .gte('created_at', rangeStart(range))
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as NavEvent[];
    },
    [range, limit],
    [],
  );
}
