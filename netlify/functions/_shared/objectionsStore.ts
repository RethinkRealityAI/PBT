/**
 * Team-authored objections (`scenario_objections`) and objection categories
 * (`scenario_objection_categories`), both from migration
 * 20261012000000_scenario_objections.sql — the server's one way to READ them
 * and to recognise "that migration has not been applied yet".
 *
 * Writes live in `admin-objections` only. Readers:
 *   • flags-resolve       — the public snapshot (retired ones included, so a
 *                           scenario built on one still resolves);
 *   • _shared/ai.ts       — merges their coaching into the simulation config
 *                           the AI functions build prompts from;
 *   • admin-scenario-*    — the Studio assistant, inspector and save path.
 * Categories (`readCategories`) have the same readers: the snapshot publishes
 * the stored rows, and every server-side retrieval reads a category's
 * knowledge for a scenario that picked none of its own.
 *
 * Until the migration runs every reader degrades to "no team objections"
 * (built-ins only) and "no stored categories" (the built-in ones, with no
 * knowledge attached) — never a failed request. `isMissingObjectionsTable` /
 * `isMissingCategoriesTable` are the tests for that state; any OTHER database
 * error is reported as such so a real fault is never mistaken for "not
 * migrated yet".
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  rowToTeamObjection,
  sortTeamObjections,
  type TeamObjection,
} from '../../../src/shared/scenarios/objections';
import {
  rowToCategory,
  sortCategories,
  type ObjectionCategory,
} from '../../../src/shared/scenarios/objectionCategories';

export const OBJECTIONS_MIGRATION = '20261012000000_scenario_objections.sql';

/** What the app needs to resolve and play an objection (no authorship columns). */
export const OBJECTION_READ_COLUMNS =
  'id, title, example, title_fr, example_fr, species, category_id, coaching, visible, sort_order, updated_at';

/** The admin list adds the lifecycle columns. */
export const OBJECTION_ADMIN_COLUMNS = `${OBJECTION_READ_COLUMNS}, created_at, deleted_at`;

export type DbError = { code?: string; message?: string } | null | undefined;

function codeAndMessage(error: unknown): { code: unknown; message: string } | null {
  if (!error || typeof error !== 'object') return null;
  const e = error as { code?: unknown; message?: unknown };
  return { code: e.code, message: typeof e.message === 'string' ? e.message : '' };
}

/**
 * True when the error says `scenario_objections` does not exist yet:
 * PostgREST's schema-cache miss (PGRST205 "Could not find the table
 * 'public.scenario_objections' in the schema cache") or Postgres' own
 * undefined_table (42P01). Must NAME the table — a different missing
 * relation is a real fault and keeps failing loudly.
 */
export function isMissingObjectionsTable(error: unknown): boolean {
  const e = codeAndMessage(error);
  if (!e || (e.code !== 'PGRST205' && e.code !== '42P01')) return false;
  return /\bscenario_objections\b/i.test(e.message);
}

/**
 * True when the error says `scenario_objection_categories` does not exist
 * yet — same codes as `isMissingObjectionsTable`, and it must NAME this
 * table (the two names differ, so neither test matches the other's table).
 */
export function isMissingCategoriesTable(error: unknown): boolean {
  const e = codeAndMessage(error);
  if (!e || (e.code !== 'PGRST205' && e.code !== '42P01')) return false;
  return /\bscenario_objection_categories\b/i.test(e.message);
}

/** Either table of the objections migration is missing. */
export function isMissingObjectionsMigration(error: unknown): boolean {
  return isMissingObjectionsTable(error) || isMissingCategoriesTable(error);
}

/**
 * True when the error says `scenario_overrides.copied_from` does not exist
 * yet (PGRST204 on a write, 42703 on a select). Named, like
 * `isMissingSpeciesColumn`, so no other missing column is swallowed.
 */
export function isMissingCopiedFromColumn(error: unknown): boolean {
  const e = codeAndMessage(error);
  if (!e || (e.code !== 'PGRST204' && e.code !== '42703')) return false;
  return /\bcopied_from\b/i.test(e.message);
}

export interface TeamObjectionsRead {
  /** Usable, non-deleted objections (retired included), display order. */
  objections: TeamObjection[];
  /** The table does not exist (migration pending). */
  missing: boolean;
  /** Any failure, including `missing`; null on success. */
  error: DbError;
}

/** Stored rows → usable objections. A malformed row is dropped, never half-rendered. */
export function toTeamObjections(rows: unknown): TeamObjection[] {
  if (!Array.isArray(rows)) return [];
  const out: TeamObjection[] = [];
  for (const row of rows) {
    const o = rowToTeamObjection(row);
    if (o) out.push(o);
  }
  return sortTeamObjections(out);
}

/**
 * Every non-deleted team objection, retired ones included (a scenario built
 * on a retired objection must still play). Never throws.
 */
export async function readTeamObjections(sb: SupabaseClient): Promise<TeamObjectionsRead> {
  try {
    const { data, error } = await sb
      .from('scenario_objections')
      .select(OBJECTION_READ_COLUMNS)
      .is('deleted_at', null);
    if (error) return { objections: [], missing: isMissingObjectionsTable(error), error };
    return { objections: toTeamObjections(data), missing: false, error: null };
  } catch (err) {
    return {
      objections: [],
      missing: false,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}

/**
 * Does this `team:` objection exist and is it not deleted? A missing table
 * (migration pending) means no team objection can exist → `unknown`; any
 * other database error is returned so the caller answers 500, not a
 * misleading "pick another one".
 */
export async function checkTeamObjection(
  sb: SupabaseClient,
  id: string,
): Promise<'ok' | 'unknown' | { error: string }> {
  const { data, error } = await sb
    .from('scenario_objections')
    .select('id, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return isMissingObjectionsTable(error) ? 'unknown' : { error: error.message ?? 'Database error' };
  }
  const row = data as { deleted_at?: string | null } | null;
  return row && !row.deleted_at ? 'ok' : 'unknown';
}

// ─────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────

/** What the app needs of a stored category (no authorship columns). */
export const CATEGORY_READ_COLUMNS =
  'id, name, name_fr, description, focus_area, knowledge_slugs, sort_order, updated_at';

/** The admin list adds the lifecycle columns. */
export const CATEGORY_ADMIN_COLUMNS = `${CATEGORY_READ_COLUMNS}, created_at, deleted_at`;

export interface CategoriesRead {
  /**
   * Usable, non-deleted STORED categories, display order: the team's own
   * plus admin edits of the built-ins. Merge with `mergeCategories` before
   * use — the built-ins themselves are not rows.
   */
  categories: ObjectionCategory[];
  /** The table does not exist (migration pending). */
  missing: boolean;
  /** Any failure, including `missing`; null on success. */
  error: DbError;
}

/** Stored rows → usable categories. A malformed row is dropped. */
export function toCategories(rows: unknown): ObjectionCategory[] {
  if (!Array.isArray(rows)) return [];
  const out: ObjectionCategory[] = [];
  for (const row of rows) {
    const c = rowToCategory(row);
    if (c) out.push(c);
  }
  return sortCategories(out);
}

/** Every non-deleted stored category. Never throws. */
export async function readCategories(sb: SupabaseClient): Promise<CategoriesRead> {
  try {
    const { data, error } = await sb
      .from('scenario_objection_categories')
      .select(CATEGORY_READ_COLUMNS)
      .is('deleted_at', null);
    if (error) return { categories: [], missing: isMissingCategoriesTable(error), error };
    return { categories: toCategories(data), missing: false, error: null };
  } catch (err) {
    return {
      categories: [],
      missing: false,
      error: { message: err instanceof Error ? err.message : String(err) },
    };
  }
}
