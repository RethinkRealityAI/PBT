/**
 * The deferred `scenario_overrides.species` column
 * (supabase/migrations/20260925000000_scenario_species.sql) — one test for
 * "this error means the column isn't there yet", shared by the write path
 * (admin-scenario-overrides) and the trainee snapshot (flags-resolve).
 */
export type DbError = { code?: string; message?: string } | null | undefined;

/**
 * True when the error says `scenario_overrides.species` does not exist yet:
 * PostgREST's schema-cache miss (PGRST204 "Could not find the 'species'
 * column of 'scenario_overrides' in the schema cache") or Postgres' own
 * undefined_column (42703). Must name `species` — a missing column that is
 * NOT this deferred one is a real fault and keeps failing loudly.
 */
export function isMissingSpeciesColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code !== 'PGRST204' && e.code !== '42703') return false;
  return /\bspecies\b/i.test(typeof e.message === 'string' ? e.message : '');
}
