/**
 * Names for team-authored objections (`team:<slug>`) on the Skills tab.
 *
 * With `scenarios.read` the real titles come from `admin-objections`
 * (cached — the Studio's own store is separate); otherwise, or until that
 * answers, they're inferred from the sessions (`teamObjectionTitles`). A raw
 * `team:` id never reaches the screen either way (`pushbackLabel` humanises
 * the slug as a last resort).
 */
import { useMemo } from 'react';
import { useCachedQuery } from '../../data/cache';
import { fetchObjections } from '../../scenario-studio/api';
import { useAccess } from '../../primitives/access';
import type { SessionSummary } from '../../../../src/shared/analytics/contract';
import { teamObjectionTitles } from '../lib/skills';

function parseTitles(raw: unknown): Array<{ id: string; title: string }> {
  const list = raw && typeof raw === 'object' ? (raw as { objections?: unknown }).objections : null;
  if (!Array.isArray(list)) return [];
  const out: Array<{ id: string; title: string }> = [];
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const { id, title } = o as { id?: unknown; title?: unknown };
    if (typeof id === 'string' && typeof title === 'string' && title.trim()) out.push({ id, title: title.trim() });
  }
  return out;
}

export function useObjectionTitles(rows: readonly SessionSummary[]): Array<{ id: string; title: string }> {
  const { can } = useAccess();
  const q = useCachedQuery<unknown>(can('scenarios.read') ? 'analytics:objection-titles' : null, fetchObjections, null, 5 * 60_000);
  return useMemo(() => {
    const known = parseTitles(q.data);
    const ids = new Set(known.map((k) => k.id));
    return [...known, ...teamObjectionTitles(rows).filter((t) => !ids.has(t.id))];
  }, [q.data, rows]);
}
