import type { Scenario } from '../../data/scenarios';
import { getSupabase } from '../auth/supabaseClient';
import { logEvent } from '../../lib/analytics';
import { speciesOf } from '../../shared/scenarios/species';

/**
 * True when a PostgREST / Postgres error says `user_scenarios.species` does
 * not exist yet: PostgREST's schema-cache miss (PGRST204 "Could not find the
 * 'species' column …") or Postgres' undefined_column (42703). It must name
 * `species` — any other missing column is a real fault, not this migration
 * lagging behind the deploy.
 */
export function isMissingSpeciesColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code !== 'PGRST204' && e.code !== '42703') return false;
  return /\bspecies\b/i.test(typeof e.message === 'string' ? e.message : '');
}

/**
 * Persist a user-built scenario to Supabase `user_scenarios` for the admin
 * dashboard's Scenarios screen. Best-effort: silent on failure.
 *
 * Anonymous users can't write here (RLS) — the analytics event still fires
 * so we know how often custom scenarios are built even without auth.
 */
export async function persistUserScenario(scenario: Scenario): Promise<void> {
  const species = speciesOf(scenario.species);
  logEvent({
    type: 'custom',
    screen: 'create',
    target: 'scenario_save',
    meta: {
      pushback: scenario.pushback.id,
      breed: scenario.breed,
      difficulty: scenario.difficulty,
      driver: scenario.suggestedDriver,
      species,
    },
  });

  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    // Persist the full scenario shape so admins can view what was built.
    // Earlier versions only saved title/breed/life_stage/difficulty/pushback,
    // which left the admin row opaque. New columns
    // (persona/suggested_driver/context/opening_line/scenario_summary)
    // come from migration 20260507200000_user_scenarios_full_details.sql.
    const summary = scenario.pushbackNotes?.trim()
      ? `${scenario.pushback.title} (${scenario.pushbackNotes.trim().slice(0, 60)}) · ${scenario.breed}`
      : `${scenario.pushback.title} · ${scenario.breed}`;
    const row = {
      creator_id: user.id,
      title: scenario.pushback.title,
      breed: scenario.breed,
      life_stage: scenario.age,
      difficulty: scenario.difficulty,
      pushback_id: scenario.pushback.id,
      pushback_notes: scenario.pushbackNotes ?? null,
      weight_kg: scenario.weightKg ? parseFloat(scenario.weightKg) : null,
      persona: scenario.persona,
      suggested_driver: scenario.suggestedDriver,
      context: scenario.context ?? null,
      opening_line: scenario.openingLine ?? null,
      scenario_summary: summary,
      is_public: false,
      // Which animal (migration 20261012000000_scenario_objections.sql).
      species,
    };
    const { error } = await sb.from('user_scenarios').insert(row);
    if (error && isMissingSpeciesColumn(error)) {
      // The column ships with a hand-run migration; until it is applied the
      // insert must still land — retry once without it (NULL reads as dog).
      const { species: _species, ...legacyRow } = row;
      void _species;
      const retry = await sb.from('user_scenarios').insert(legacyRow);
      if (retry.error) console.warn('[persistScenario] failed', retry.error);
    } else if (error) {
      console.warn('[persistScenario] failed', error);
    }
  } catch (err) {
    console.warn('[persistScenario] failed', err);
  }
}
