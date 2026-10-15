/**
 * The name a team gave a scenario, for the Analytics session lists.
 *
 * A session stores its scenario through `sanitizeScenario`, which keeps
 * `_overrideId` (`admin:<uuid>`, `seed:<n>`) but no title — so without this
 * every session read as its objection ("Cost / price pushback") even when the
 * team had authored "Senior lab, cost-sensitive owner" in the Studio. This
 * looks the titles up in `scenario_overrides` (card title, else scenario
 * title) and fills `scenario_title` in place.
 *
 * Best-effort: the table is small and the lookup is one `in()` query; a
 * failed read leaves the objection title in place rather than failing the
 * list.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionSummary } from '../../../src/shared/analytics/contract';

/** At most this many distinct ids per lookup (PostgREST URL length). */
const MAX_IDS = 300;

export async function applyScenarioTitles(sb: SupabaseClient, rows: SessionSummary[]): Promise<void> {
  const ids = [
    ...new Set(
      rows
        .map((r) => r.scenario_id)
        .filter((id): id is string => typeof id === 'string' && /^(admin|seed):/.test(id)),
    ),
  ].slice(0, MAX_IDS);
  if (ids.length === 0) return;
  try {
    const { data, error } = await sb
      .from('scenario_overrides')
      .select('scenario_id, card_title_override, title_override')
      .in('scenario_id', ids);
    if (error || !Array.isArray(data)) {
      if (error) console.warn('[analytics] scenario title lookup failed', error.message);
      return;
    }
    const titles = new Map<string, string>();
    for (const row of data as Array<Record<string, unknown>>) {
      const title = [row.card_title_override, row.title_override].find(
        (v): v is string => typeof v === 'string' && v.trim() !== '',
      );
      if (typeof row.scenario_id === 'string' && title) titles.set(row.scenario_id, title.trim().slice(0, 120));
    }
    for (const r of rows) {
      const t = r.scenario_id ? titles.get(r.scenario_id) : undefined;
      if (t) r.scenario_title = t;
    }
  } catch (err) {
    console.warn('[analytics] scenario title lookup threw', err instanceof Error ? err.message : String(err));
  }
}
