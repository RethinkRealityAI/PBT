import type { Scenario } from '../../data/scenarios';
import { getSupabase } from '../auth/supabaseClient';
import { logEvent } from '../../lib/analytics';

/**
 * Persist a user-built scenario to Supabase `user_scenarios` for the admin
 * dashboard's Scenarios screen. Best-effort: silent on failure.
 *
 * Anonymous users can't write here (RLS) — the analytics event still fires
 * so we know how often custom scenarios are built even without auth.
 */
export async function persistUserScenario(scenario: Scenario): Promise<void> {
  logEvent({
    type: 'custom',
    screen: 'create',
    target: 'scenario_save',
    meta: {
      pushback: scenario.pushback.id,
      breed: scenario.breed,
      difficulty: scenario.difficulty,
      driver: scenario.suggestedDriver,
    },
  });

  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    await sb.from('user_scenarios').insert({
      creator_id: user.id,
      title: scenario.pushback.title,
      breed: scenario.breed,
      life_stage: scenario.age,
      difficulty: scenario.difficulty,
      pushback_id: scenario.pushback.id,
      pushback_notes: scenario.pushbackNotes ?? null,
      weight_kg: scenario.weightKg ? parseFloat(scenario.weightKg) : null,
      is_public: false,
    });
  } catch (err) {
    console.warn('[persistScenario] failed', err);
  }
}
