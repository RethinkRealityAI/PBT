/**
 * Admin: team-authored objections and the CATEGORIES they live in — the
 * subject areas training is organised by ("Weight management", "Probiotics",
 * …), which also own the knowledge their scenarios read. Tables
 * `scenario_objections` + `scenario_objection_categories`, migration
 * 20261012000000_scenario_objections.sql; shared contracts
 * src/shared/scenarios/objections.ts and objectionCategories.ts.
 *
 *   GET  /admin-objections            → { objections: AdminObjection[],
 *                                         categories: AdminObjectionCategory[] }
 *        every non-deleted objection (retired included), each with
 *        `usage: { scenarios, live, trainee }` — the non-deleted scenario_overrides
 *        rows built on it, how many of those are published, and how many
 *        trainees' own scenarios (user_scenarios) use it — informational.
 *        `categories` = the MERGED list (`mergeCategories`: the three built-ins,
 *        overlaid by an admin's stored edit of them, then the team's own), each
 *        with `customised` (a built-in with a stored row), `createdAt` /
 *        `deletedAt` and `usage: { objections, scenarios }` — the non-deleted
 *        team objections filed under it (retired included), and the
 *        non-deleted scenarios built on any objection in it (built-in
 *        objections count for their built-in category).
 *   GET  /admin-objections?deleted=1  → the same plus soft-deleted objections
 *        and soft-deleted TEAM categories (`deletedAt` set), so the editor can
 *        offer Restore.
 *   POST /admin-objections            → `ObjectionWriteRequest`:
 *        { op: 'upsert', objection, baseUpdatedAt? } → { objection }
 *        { op: 'delete', id }                        → { ok: true, objection }
 *        { op: 'restore', id }                       → { objection }
 *        { op: 'upsert-category', category, baseUpdatedAt? }
 *                                                    → { category, _dropped: string[] }
 *        { op: 'delete-category', id }               → { ok: true, category }
 *        { op: 'restore-category', id }              → { category }
 *
 * Gating: `scenarios.read` to list, `scenarios.write` to change — an
 * objection is part of scenario authoring, and the AI customer of every
 * scenario built on it reads its coaching (and its category's knowledge).
 *
 * Trust: the objection's text reaches the AI customer's prompt (as data) and
 * trainees' screens, so every write goes through `validateObjectionInput` /
 * `validateCategoryInput` (shape, caps, vocabulary) and only the columns
 * `teamObjectionToRow` / `categoryToRow` name are written; `created_by` /
 * `updated_by` / timestamps are server-owned.
 *
 * Objection lifecycle:
 *   • upsert without an id CREATES (id allocated from the title — `team:` +
 *     slug — so it can never collide with a built-in), capped at
 *     OBJECTION_LIMITS.maxTeamObjections live objections (409 `limit`).
 *     With an id it UPDATES the live row; `baseUpdatedAt` (the row's
 *     `updated_at` the editor loaded) makes a concurrent edit a 409
 *     `{ code: 'stale', current }` instead of a silent overwrite. Editing a
 *     soft-deleted objection is a 409 `deleted` (restore it first).
 *   • `categoryId` must name a built-in category or a live (non-deleted)
 *     team category — else 400 "That category no longer exists".
 *   • `visible: false` RETIRES an objection: hidden from pickers, but every
 *     scenario already built on it keeps playing.
 *   • delete is a soft delete, refused (409 `in_use`, with the scenarios)
 *     while any non-deleted scenario uses it — a deleted objection resolves
 *     to nothing and its scenarios would silently drop out of the library.
 *
 * Category lifecycle:
 *   • upsert-category with a BUILT-IN id stores (or updates) that built-in's
 *     edit row — name, French name, description, knowledge topic, documents,
 *     sort order. Without an id it CREATES a team category (`category:` +
 *     slug from the name, never reusing a deleted id), capped at
 *     CATEGORY_LIMITS.maxTeamCategories live ones (409 `limit`); with a team
 *     id it updates the live row. `baseUpdatedAt` works as for objections
 *     (`null` = "the editor saw no row", which is how a never-edited
 *     built-in is sent). Names are unique, case- and space-insensitively,
 *     across the MERGED list. Document slugs that are not a live
 *     `knowledge_documents` row are dropped and named in `_dropped` (the
 *     save still succeeds — a document may have been deleted meanwhile).
 *   • delete-category: a built-in → 400 (rename it instead); a team category
 *     with any non-deleted objection filed under it → 409 `in_use` with
 *     those objections; else a soft delete. restore-category re-checks the
 *     name and the cap.
 *
 * Until the migration runs: GET answers 200 with no objections, the
 * built-in categories (usage 0) and `_notice: 'objections_table_missing'`;
 * POST answers 503 with a plain "run the migration" message. Nothing else
 * degrades — the trainee app, the AI functions and the Studio all fall back
 * to the built-ins (with no category knowledge).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  can,
  errorResponse,
  jsonResponse,
  requireAdmin,
  writeAuditLog,
  type AdminCtx,
} from './_shared/admin';
import {
  CATEGORY_ADMIN_COLUMNS,
  OBJECTION_ADMIN_COLUMNS,
  OBJECTIONS_MIGRATION,
  isMissingObjectionsMigration,
  toCategories,
} from './_shared/objectionsStore';
import { PUSHBACK_LABELS } from '../../src/shared/scenarios/enums';
import { SCENARIO_WIRE_MAX } from '../../src/shared/scenarios/limits';
import {
  OBJECTION_LIMITS,
  isTeamObjectionId,
  objectionIdFromTitle,
  rowToTeamObjection,
  sortTeamObjections,
  teamObjectionToRow,
  validateObjectionInput,
  type AdminObjection,
  type TeamObjection,
} from '../../src/shared/scenarios/objections';
import {
  BUILT_IN_CATEGORIES,
  BUILT_IN_OBJECTION_CATEGORY,
  CATEGORY_LIMITS,
  categoryIdFromName,
  categoryToRow,
  isBuiltInCategoryId,
  isCategoryIdShape,
  isTeamCategoryId,
  mergeCategories,
  rowToCategory,
  sortCategories,
  validateCategoryInput,
  type AdminObjectionCategory,
  type ObjectionCategory,
} from '../../src/shared/scenarios/objectionCategories';

/** An objection is a few short lists; anything bigger is not one. */
const MAX_BODY_BYTES = 32 * 1024;

export const OBJECTIONS_TABLE_MISSING = 'objections_table_missing';
export const MIGRATION_NEEDED_MESSAGE = `Objections need a database update first (migration ${OBJECTIONS_MIGRATION}).`;
export const DELETED_OBJECTION_MESSAGE =
  'This objection was deleted. Restore it from "Recently deleted" before editing it.';
export const CATEGORY_GONE_MESSAGE = 'That category no longer exists — pick another.';
export const RESTORE_CATEGORY_FIRST_MESSAGE =
  'Its category was deleted. Restore the category from "Recently deleted" first, then this objection.';
export const CATEGORY_DELETED_WHILE_SAVING_MESSAGE =
  'That category was deleted while you were saving — nothing was saved. Pick another category and save again.';
export const DELETED_CATEGORY_MESSAGE =
  'This category was deleted. Restore it from "Recently deleted" before editing it.';
export const BUILT_IN_CATEGORY_DELETE_MESSAGE = "Built-in categories can't be deleted — rename them instead.";

type DbError = { code?: string; message?: string };
type Usage = AdminObjection['usage'];
type CategoryUsage = AdminObjectionCategory['usage'];
type StoredRow = {
  id: string;
  title?: unknown;
  category_id?: unknown;
  deleted_at?: string | null;
  updated_at?: string | null;
};
type StoredCategoryRow = {
  id: string;
  name?: unknown;
  created_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
};

const NO_USAGE: Usage = { scenarios: 0, live: 0, trainee: 0 };
const NO_CATEGORY_USAGE: CategoryUsage = { objections: 0, scenarios: 0 };

/** The ids of the built-in objections that belong to a category (`custom` belongs to none). */
const BUILT_IN_CATEGORISED_OBJECTIONS: readonly string[] = Object.keys(BUILT_IN_OBJECTION_CATEGORY);

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** A stored row as the admin sees it, or null for a row that can't be one. */
export function toAdminObjection(row: unknown, usage: Usage = NO_USAGE): AdminObjection | null {
  const o = rowToTeamObjection(row);
  if (!o) return null;
  const r = row as Record<string, unknown>;
  return {
    ...o,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
    deletedAt: typeof r.deleted_at === 'string' ? r.deleted_at : null,
    usage: { ...usage },
  };
}

/** 503 when either table is missing, else 500 with the database's message. */
function readFailure(error: DbError): Response {
  if (isMissingObjectionsMigration(error)) return errorResponse(503, MIGRATION_NEEDED_MESSAGE);
  return errorResponse(500, error.message ?? 'Database error');
}

/**
 * Non-deleted scenario_overrides rows per objection id. Throws the database
 * error — a usage count is what stands between an admin and deleting
 * something in use, so it is never guessed.
 */
export async function loadUsage(sb: SupabaseClient, ids: readonly string[]): Promise<Map<string, Usage>> {
  const out = new Map<string, Usage>();
  if (ids.length === 0) return out;
  const { data, error } = await sb
    .from('scenario_overrides')
    .select('scenario_id, pushback_id, visible')
    .in('pushback_id', [...ids])
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as Array<{ pushback_id?: unknown; visible?: unknown }>) {
    if (typeof r.pushback_id !== 'string') continue;
    const u = out.get(r.pushback_id) ?? { ...NO_USAGE };
    u.scenarios += 1;
    if (r.visible === true) u.live += 1;
    out.set(r.pushback_id, u);
  }
  // Trainees' own scenarios. Informational only (they never block a delete),
  // so a failed read leaves the count at 0 rather than failing the list.
  const trainee = await sb.from('user_scenarios').select('pushback_id').in('pushback_id', [...ids]);
  if (!trainee.error) {
    for (const r of (trainee.data ?? []) as Array<{ pushback_id?: unknown }>) {
      if (typeof r.pushback_id !== 'string') continue;
      const u = out.get(r.pushback_id) ?? { ...NO_USAGE };
      u.trainee += 1;
      out.set(r.pushback_id, u);
    }
  }
  return out;
}

async function usageOf(sb: SupabaseClient, id: string): Promise<Usage> {
  return (await loadUsage(sb, [id])).get(id) ?? NO_USAGE;
}

/**
 * Non-deleted scenario_overrides rows per pushback id (no trainee count —
 * used for the built-in objections, whose trainee scenarios are numerous and
 * irrelevant to a category). Throws the database error.
 */
export async function countScenariosByPushback(
  sb: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const { data, error } = await sb
    .from('scenario_overrides')
    .select('scenario_id, pushback_id')
    .in('pushback_id', [...ids])
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as Array<{ pushback_id?: unknown }>) {
    if (typeof r.pushback_id !== 'string') continue;
    out.set(r.pushback_id, (out.get(r.pushback_id) ?? 0) + 1);
  }
  return out;
}

// ── Categories: pure helpers ─────────────────────────────────────────────

/**
 * A category's usage: the non-deleted team objections filed under it
 * (retired included — they still play), and the scenarios built on any
 * objection in it. Built-in objections count for their built-in category.
 */
export function categoryUsage(
  categoryId: string,
  liveTeam: ReadonlyArray<Pick<TeamObjection, 'id' | 'categoryId'>>,
  scenarioCounts: ReadonlyMap<string, number>,
): CategoryUsage {
  const team = liveTeam.filter((o) => o.categoryId === categoryId).map((o) => o.id);
  const builtIn = BUILT_IN_CATEGORISED_OBJECTIONS.filter((id) => BUILT_IN_OBJECTION_CATEGORY[id] === categoryId);
  let scenarios = 0;
  for (const id of [...team, ...builtIn]) scenarios += scenarioCounts.get(id) ?? 0;
  return { objections: team.length, scenarios };
}

/**
 * A stored category row as the admin sees it, or null for a row that can't
 * be one. A built-in id's row is the admin's edit of that built-in.
 */
export function toAdminCategory(row: unknown, usage: CategoryUsage = NO_CATEGORY_USAGE): AdminObjectionCategory | null {
  const c = rowToCategory(row);
  if (!c) return null;
  const r = row as Record<string, unknown>;
  return {
    ...c,
    createdAt: typeof r.created_at === 'string' ? r.created_at : null,
    deletedAt: typeof r.deleted_at === 'string' ? r.deleted_at : null,
    customised: c.builtIn,
    usage: { ...usage },
  };
}

/** A built-in category nobody has edited (no stored row). */
function defaultBuiltInCategory(id: string, usage: CategoryUsage = NO_CATEGORY_USAGE): AdminObjectionCategory | null {
  const b = BUILT_IN_CATEGORIES.find((c) => c.id === id);
  if (!b) return null;
  return {
    ...b,
    knowledgeSlugs: [...b.knowledgeSlugs],
    createdAt: null,
    deletedAt: null,
    customised: false,
    usage: { ...usage },
  };
}

/**
 * Every category the admin manages: the MERGED list (built-ins overlaid by
 * their stored edits, then the team's live categories), plus — on request —
 * soft-deleted TEAM categories. `rows` = stored rows, deleted ones included
 * when `includeDeleted`.
 */
export function adminCategories(
  rows: readonly StoredCategoryRow[],
  liveTeam: ReadonlyArray<Pick<TeamObjection, 'id' | 'categoryId'>>,
  scenarioCounts: ReadonlyMap<string, number>,
  includeDeleted = false,
): AdminObjectionCategory[] {
  const live = rows.filter((r) => !r.deleted_at);
  const rowById = new Map(live.map((r) => [r.id, r]));
  const out: AdminObjectionCategory[] = [];
  for (const c of mergeCategories(toCategories(live))) {
    const usage = categoryUsage(c.id, liveTeam, scenarioCounts);
    const row = rowById.get(c.id);
    const admin = row ? toAdminCategory(row, usage) : defaultBuiltInCategory(c.id, usage);
    if (admin) out.push(admin);
  }
  if (includeDeleted) {
    for (const r of rows) {
      if (!r.deleted_at || !isTeamCategoryId(r.id)) continue;
      const admin = toAdminCategory(r, categoryUsage(r.id, liveTeam, scenarioCounts));
      if (admin) out.push(admin);
    }
  }
  return sortCategories(out);
}

/**
 * Another category in the MERGED list already called this (case- and
 * space-insensitive)? Two categories with one name are indistinguishable in
 * every picker, and the Studio assistant reads them by name.
 */
export function categoryNameClash(
  name: string,
  id: string,
  merged: ReadonlyArray<Pick<ObjectionCategory, 'id' | 'name'>>,
): string | null {
  const wanted = normTitle(name);
  if (!wanted) return null;
  for (const c of merged) {
    if (c.id === id) continue;
    if (normTitle(c.name) === wanted) return c.name;
  }
  return null;
}

function normTitle(t: unknown): string {
  return typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().toLowerCase() : '';
}

/**
 * Another live objection — or a built-in — already called this? Two
 * objections with one name are indistinguishable in a picker, and the Studio
 * assistant resolves an objection by its name as well as its id.
 */
export function titleClash(title: string, id: string, rows: readonly StoredRow[]): string | null {
  const wanted = normTitle(title);
  if (!wanted) return null;
  for (const label of Object.values(PUSHBACK_LABELS)) {
    if (normTitle(label) === wanted) return label;
  }
  for (const r of rows) {
    if (r.id === id || r.deleted_at) continue;
    if (normTitle(r.title) === wanted) return typeof r.title === 'string' ? r.title : title;
  }
  return null;
}

function limitResponse(): Response {
  return jsonResponse(
    {
      error: `There are already ${OBJECTION_LIMITS.maxTeamObjections} team objections. Delete one you no longer use first.`,
      code: 'limit',
    },
    { status: 409 },
  );
}

/** A write the database refused: a CHECK is the admin's input; a race is a 409. */
function writeFailure(error: DbError): Response {
  if (isMissingObjectionsMigration(error)) return errorResponse(503, MIGRATION_NEEDED_MESSAGE);
  if (error.code === '23505') {
    return jsonResponse(
      { error: 'Someone else just created an objection with this name. Reload and try again.', code: 'conflict' },
      { status: 409 },
    );
  }
  if (error.code === '23514') {
    return errorResponse(400, 'The objection could not be saved — one of its fields is too long.');
  }
  return errorResponse(500, error.message ?? 'Database error');
}

// ── GET ──────────────────────────────────────────────────────────────────

/** The answer while the migration is pending: no team content, built-in categories. */
function migrationPendingList(): Response {
  return jsonResponse({
    objections: [],
    categories: adminCategories([], [], new Map()),
    _notice: OBJECTIONS_TABLE_MISSING,
  });
}

async function list(sb: SupabaseClient, includeDeleted: boolean): Promise<Response> {
  let objectionsQuery = sb.from('scenario_objections').select(OBJECTION_ADMIN_COLUMNS);
  if (!includeDeleted) objectionsQuery = objectionsQuery.is('deleted_at', null);
  let categoriesQuery = sb.from('scenario_objection_categories').select(CATEGORY_ADMIN_COLUMNS);
  if (!includeDeleted) categoriesQuery = categoriesQuery.is('deleted_at', null);
  const [objRes, catRes] = await Promise.all([objectionsQuery, categoriesQuery]);
  if (isMissingObjectionsMigration(objRes.error) || isMissingObjectionsMigration(catRes.error)) {
    return migrationPendingList();
  }
  const failed = objRes.error ?? catRes.error;
  if (failed) return errorResponse(500, failed.message ?? 'Database error');

  const rows = (objRes.data ?? []) as StoredRow[];
  const categoryRows = (catRes.data ?? []) as StoredCategoryRow[];
  let usage: Map<string, Usage>;
  let builtInCounts: Map<string, number>;
  try {
    [usage, builtInCounts] = await Promise.all([
      loadUsage(
        sb,
        rows.map((r) => r.id),
      ),
      countScenariosByPushback(sb, BUILT_IN_CATEGORISED_OBJECTIONS),
    ]);
  } catch (err) {
    return errorResponse(500, err instanceof Error ? err.message : 'Database error');
  }
  const objections: AdminObjection[] = [];
  for (const row of rows) {
    const o = toAdminObjection(row, usage.get(row.id));
    if (o) objections.push(o);
    else console.warn('[admin-objections] unreadable row skipped', row.id);
  }

  // Category usage counts LIVE objections only, even when the list carries
  // the deleted ones too.
  const liveTeam = objections.filter((o) => !o.deletedAt);
  const scenarioCounts = new Map(builtInCounts);
  for (const o of liveTeam) scenarioCounts.set(o.id, usage.get(o.id)?.scenarios ?? 0);
  return jsonResponse({
    objections: sortTeamObjections(objections),
    categories: adminCategories(categoryRows, liveTeam, scenarioCounts, includeDeleted),
  });
}

// ── POST ─────────────────────────────────────────────────────────────────

async function upsert(ctx: AdminCtx, body: Record<string, unknown>): Promise<Response> {
  const raw = body.objection;
  if (!isRecord(raw)) return errorResponse(400, 'objection must be an object');
  if (raw.id != null && typeof raw.id !== 'string') return errorResponse(400, 'id must be text');

  // Every row, deleted included: ids for allocation (a deleted id stays
  // taken — Restore must be able to bring it back), the live count, and the
  // row being edited. The table is small (≤ 100 live rows by design).
  const all = await ctx.sb.from('scenario_objections').select(OBJECTION_ADMIN_COLUMNS);
  if (all.error) return readFailure(all.error);
  const rows = (all.data ?? []) as StoredRow[];

  const requestedId = typeof raw.id === 'string' ? raw.id.trim() : '';
  let id: string;
  if (requestedId) {
    // The wire cap matters: every AI call re-validates `scenario.pushback.id`
    // against SCENARIO_WIRE_MAX.pushbackId, so a longer id would save here
    // and then fail every conversation built on it.
    if (!isTeamObjectionId(requestedId) || requestedId.length > SCENARIO_WIRE_MAX.pushbackId) {
      return errorResponse(
        400,
        `id must look like team:<lowercase-words> (at most ${SCENARIO_WIRE_MAX.pushbackId} characters)`,
      );
    }
    id = requestedId;
  } else {
    id = objectionIdFromTitle(
      typeof raw.title === 'string' ? raw.title : '',
      rows.map((r) => r.id),
    );
  }

  const valid = validateObjectionInput({ ...raw, id });
  if (!valid.ok) return errorResponse(400, valid.error);
  const clash = titleClash(valid.value.title, id, rows);
  if (clash) {
    return errorResponse(400, `An objection called "${clash}" already exists — give this one a different name.`);
  }
  // The category must EXIST (shape was checked above): a built-in one, or a
  // live team row. An objection filed under a deleted category would read no
  // category knowledge and show up under nothing in every picker.
  const category = await checkCategory(ctx.sb, valid.value.categoryId);
  if (category instanceof Response) return category;
  if (category === 'unknown') return errorResponse(400, CATEGORY_GONE_MESSAGE);
  const { id: _id, ...columns } = teamObjectionToRow(valid.value);

  const existing = rows.find((r) => r.id === id);
  if (existing?.deleted_at) {
    return jsonResponse({ error: DELETED_OBJECTION_MESSAGE, code: 'deleted' }, { status: 409 });
  }

  if (!existing) {
    if (rows.filter((r) => !r.deleted_at).length >= OBJECTION_LIMITS.maxTeamObjections) {
      return limitResponse();
    }
    const ins = await ctx.sb
      .from('scenario_objections')
      .insert({ id, ...columns, created_by: ctx.user.id, updated_by: ctx.user.id })
      .select(OBJECTION_ADMIN_COLUMNS)
      .single();
    if (ins.error) return writeFailure(ins.error);
    // A category deleted between the check above and this insert (another
    // admin's delete-category ran in the gap): take the row back out.
    if (await categoryVanished(ctx.sb, valid.value.categoryId)) {
      await ctx.sb.from('scenario_objections').delete().eq('id', id);
      return jsonResponse({ error: CATEGORY_DELETED_WHILE_SAVING_MESSAGE, code: 'category_deleted' }, { status: 409 });
    }
    await writeAuditLog(ctx, {
      entity_type: 'scenario_objection',
      entity_id: id,
      action: 'create',
      after: ins.data,
    });
    return jsonResponse({ objection: toAdminObjection(ins.data) });
  }

  // Optimistic concurrency, as in admin-scenario-overrides: `null` means the
  // editor saw no row. The update is ALSO guarded by the timestamp, so an
  // edit landing between this read and the write is caught too.
  const checked = body.baseUpdatedAt !== undefined;
  const stale = async (): Promise<Response> => {
    const cur = await ctx.sb
      .from('scenario_objections')
      .select(OBJECTION_ADMIN_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    const row = cur.data as StoredRow | null;
    if (!row || row.deleted_at) {
      return jsonResponse({ error: DELETED_OBJECTION_MESSAGE, code: 'deleted' }, { status: 409 });
    }
    let usage = NO_USAGE;
    try {
      usage = await usageOf(ctx.sb, id);
    } catch {
      /* the conflict is the news; a usage count is decoration here */
    }
    return jsonResponse(
      {
        error:
          'Someone else saved this objection after you opened it. Your edits are still here — review them against the latest version and save again.',
        code: 'stale',
        current: toAdminObjection(row, usage),
      },
      { status: 409 },
    );
  };
  if (checked && (body.baseUpdatedAt ?? null) !== (existing.updated_at ?? null)) return stale();

  let q = ctx.sb
    .from('scenario_objections')
    .update({ ...columns, updated_by: ctx.user.id })
    .eq('id', id)
    .is('deleted_at', null);
  if (checked && existing.updated_at) q = q.eq('updated_at', existing.updated_at);
  const upd = await q.select(OBJECTION_ADMIN_COLUMNS).maybeSingle();
  if (upd.error) return writeFailure(upd.error);
  if (!upd.data) return stale();
  // Moved INTO a category deleted in the gap: move it back (its old
  // category had it live all along, so that one can't have been deleted).
  if (
    valid.value.categoryId !== existing.category_id &&
    (await categoryVanished(ctx.sb, valid.value.categoryId))
  ) {
    await ctx.sb
      .from('scenario_objections')
      .update({ category_id: existing.category_id })
      .eq('id', id);
    return jsonResponse({ error: CATEGORY_DELETED_WHILE_SAVING_MESSAGE, code: 'category_deleted' }, { status: 409 });
  }
  await writeAuditLog(ctx, {
    entity_type: 'scenario_objection',
    entity_id: id,
    action: 'update',
    before: existing,
    after: upd.data,
  });
  let usage = NO_USAGE;
  try {
    usage = await usageOf(ctx.sb, id);
  } catch (err) {
    console.warn('[admin-objections] usage count failed after save', err);
  }
  return jsonResponse({ objection: toAdminObjection(upd.data, usage) });
}

/**
 * Does this category exist? Built-in ids always do (they need no row); a
 * team id needs a non-deleted row. A missing table is the migration message
 * (503), any other read error a 500 — never a misleading "pick another".
 */
async function checkCategory(sb: SupabaseClient, id: string): Promise<'ok' | 'unknown' | Response> {
  if (isBuiltInCategoryId(id)) return 'ok';
  if (!isTeamCategoryId(id)) return 'unknown';
  const { data, error } = await sb
    .from('scenario_objection_categories')
    .select('id, deleted_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return readFailure(error);
  const row = data as { deleted_at?: string | null } | null;
  return row && !row.deleted_at ? 'ok' : 'unknown';
}

/**
 * Post-write re-check: was this TEAM category deleted after the pre-write
 * check passed? Built-ins can't be. A read error counts as "still there" —
 * the pre-check already passed, and a rollback on a hiccup would lose a
 * good save.
 */
async function categoryVanished(sb: SupabaseClient, id: string): Promise<boolean> {
  if (!isTeamCategoryId(id)) return false;
  const res = await checkCategory(sb, id);
  return res === 'unknown';
}

async function readOne(ctx: AdminCtx, id: string): Promise<{ row: StoredRow | null } | Response> {
  const cur = await ctx.sb
    .from('scenario_objections')
    .select(OBJECTION_ADMIN_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (cur.error) return readFailure(cur.error);
  return { row: (cur.data as StoredRow | null) ?? null };
}

async function remove(ctx: AdminCtx, id: string): Promise<Response> {
  const read = await readOne(ctx, id);
  if (read instanceof Response) return read;
  if (!read.row) return errorResponse(404, 'Objection not found');
  if (read.row.deleted_at) return jsonResponse({ ok: true, objection: toAdminObjection(read.row) });

  const using = await ctx.sb
    .from('scenario_overrides')
    .select('scenario_id, card_title_override')
    .eq('pushback_id', id)
    .is('deleted_at', null);
  if (using.error) return errorResponse(500, using.error.message ?? 'Database error');
  const scenarios = ((using.data ?? []) as Array<{ scenario_id: string; card_title_override?: string | null }>).map(
    (s) => ({ scenario_id: s.scenario_id, title: s.card_title_override?.trim() || s.scenario_id }),
  );
  if (scenarios.length > 0) {
    return jsonResponse(
      {
        error: `${scenarios.length === 1 ? 'A scenario uses' : `${scenarios.length} scenarios use`} this objection. Move ${scenarios.length === 1 ? 'it' : 'them'} to another objection first, or retire this one instead — retired objections are hidden from pickers but keep their scenarios playing.`,
        code: 'in_use',
        scenarios,
      },
      { status: 409 },
    );
  }

  const del = await ctx.sb
    .from('scenario_objections')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.user.id })
    .eq('id', id)
    .is('deleted_at', null)
    .select(OBJECTION_ADMIN_COLUMNS)
    .maybeSingle();
  if (del.error) return writeFailure(del.error);
  await writeAuditLog(ctx, {
    entity_type: 'scenario_objection',
    entity_id: id,
    action: 'delete',
    before: read.row,
    after: del.data ?? null,
  });
  return jsonResponse({ ok: true, objection: del.data ? toAdminObjection(del.data) : null });
}

async function restore(ctx: AdminCtx, id: string): Promise<Response> {
  const read = await readOne(ctx, id);
  if (read instanceof Response) return read;
  if (!read.row) return errorResponse(404, 'Objection not found');
  if (!read.row.deleted_at) {
    let usage = NO_USAGE;
    try {
      usage = await usageOf(ctx.sb, id);
    } catch {
      /* decoration only */
    }
    return jsonResponse({ objection: toAdminObjection(read.row, usage) });
  }

  const live = await ctx.sb.from('scenario_objections').select('id, title').is('deleted_at', null);
  if (live.error) return readFailure(live.error);
  if ((live.data ?? []).length >= OBJECTION_LIMITS.maxTeamObjections) return limitResponse();
  // The duplicate-name rule holds on restore too: a new objection may have
  // taken this name while it sat in Recently deleted.
  const clash = titleClash(String(read.row.title ?? ''), id, (live.data ?? []) as StoredRow[]);
  if (clash) {
    return errorResponse(
      409,
      `An objection called "${clash}" already exists. Rename or delete it before restoring this one.`,
    );
  }

  // Its category must still exist: restoring into a deleted one would leave
  // a live objection no picker offers and no category knowledge reaches.
  const category = await checkCategory(ctx.sb, String(read.row.category_id ?? ''));
  if (category instanceof Response) return category;
  if (category === 'unknown') {
    return jsonResponse({ error: RESTORE_CATEGORY_FIRST_MESSAGE, code: 'category_deleted' }, { status: 409 });
  }

  const res = await ctx.sb
    .from('scenario_objections')
    .update({ deleted_at: null, updated_by: ctx.user.id })
    .eq('id', id)
    .select(OBJECTION_ADMIN_COLUMNS)
    .maybeSingle();
  if (res.error) return writeFailure(res.error);
  if (!res.data) return errorResponse(404, 'Objection not found');
  await writeAuditLog(ctx, {
    entity_type: 'scenario_objection',
    entity_id: id,
    action: 'update',
    before: read.row,
    after: res.data,
    note: 'Restored from Recently deleted',
  });
  return jsonResponse({ objection: toAdminObjection(res.data) });
}

// ── POST: categories ─────────────────────────────────────────────────────

function categoryLimitResponse(): Response {
  return jsonResponse(
    {
      error: `There are already ${CATEGORY_LIMITS.maxTeamCategories} categories. Delete one you no longer use first.`,
      code: 'limit',
    },
    { status: 409 },
  );
}

/** A category write the database refused. */
function categoryWriteFailure(error: DbError): Response {
  if (isMissingObjectionsMigration(error)) return errorResponse(503, MIGRATION_NEEDED_MESSAGE);
  if (error.code === '23505') {
    return jsonResponse(
      { error: 'Someone else just created this category. Reload and try again.', code: 'conflict' },
      { status: 409 },
    );
  }
  if (error.code === '23514') {
    return errorResponse(400, 'The category could not be saved — one of its fields is too long.');
  }
  return errorResponse(500, error.message ?? 'Database error');
}

/** Every stored category row, deleted included (ids stay taken; Restore needs them). */
async function readCategoryRows(sb: SupabaseClient): Promise<StoredCategoryRow[] | Response> {
  const all = await sb.from('scenario_objection_categories').select(CATEGORY_ADMIN_COLUMNS);
  if (all.error) return readFailure(all.error);
  return (all.data ?? []) as StoredCategoryRow[];
}

function liveTeamCategoryCount(rows: readonly StoredCategoryRow[]): number {
  return rows.filter((r) => !r.deleted_at && isTeamCategoryId(r.id)).length;
}

/** The merged list as it stands (built-ins + their live edits + live team categories). */
function mergedFromRows(rows: readonly StoredCategoryRow[]): ObjectionCategory[] {
  return mergeCategories(toCategories(rows.filter((r) => !r.deleted_at)));
}

/**
 * Which of these document slugs are live `knowledge_documents` rows. A
 * read error is a 500: dropping a document the admin attached because the
 * check failed would silently strip a category's knowledge.
 */
async function liveDocumentSlugs(sb: SupabaseClient, slugs: readonly string[]): Promise<Set<string> | Response> {
  if (slugs.length === 0) return new Set();
  const { data, error } = await sb
    .from('knowledge_documents')
    .select('slug')
    .in('slug', [...slugs])
    .is('deleted_at', null);
  if (error) return errorResponse(500, error.message ?? 'Database error');
  const out = new Set<string>();
  for (const r of (data ?? []) as Array<{ slug?: unknown }>) {
    if (typeof r.slug === 'string') out.add(r.slug);
  }
  return out;
}

/**
 * One category's usage, for the answer to a write. Decoration only — a
 * failed count reads 0 rather than failing a save that already happened.
 */
async function categoryUsageOf(sb: SupabaseClient, id: string): Promise<CategoryUsage> {
  try {
    const team = await sb
      .from('scenario_objections')
      .select('id, category_id')
      .eq('category_id', id)
      .is('deleted_at', null);
    if (team.error) throw new Error(team.error.message);
    const liveTeam = ((team.data ?? []) as Array<{ id?: unknown; category_id?: unknown }>)
      .filter((r): r is { id: string; category_id: string } => typeof r.id === 'string')
      .map((r) => ({ id: r.id, categoryId: String(r.category_id) }));
    const builtIn = BUILT_IN_CATEGORISED_OBJECTIONS.filter((o) => BUILT_IN_OBJECTION_CATEGORY[o] === id);
    const counts = await countScenariosByPushback(sb, [...liveTeam.map((o) => o.id), ...builtIn]);
    return categoryUsage(id, liveTeam, counts);
  } catch (err) {
    console.warn('[admin-objections] category usage count failed', err);
    return NO_CATEGORY_USAGE;
  }
}

async function upsertCategory(ctx: AdminCtx, body: Record<string, unknown>): Promise<Response> {
  const raw = body.category;
  if (!isRecord(raw)) return errorResponse(400, 'category must be an object');
  if (raw.id != null && typeof raw.id !== 'string') return errorResponse(400, 'id must be text');

  const rows = await readCategoryRows(ctx.sb);
  if (rows instanceof Response) return rows;

  const requestedId = typeof raw.id === 'string' ? raw.id.trim() : '';
  let id: string;
  if (requestedId) {
    if (!isCategoryIdShape(requestedId)) {
      return errorResponse(400, 'id must be a built-in category or look like category:<lowercase-words>');
    }
    id = requestedId;
  } else {
    id = categoryIdFromName(
      typeof raw.name === 'string' ? raw.name : '',
      rows.map((r) => r.id),
    );
  }
  const builtIn = isBuiltInCategoryId(id);

  const valid = validateCategoryInput({ ...raw, id });
  if (!valid.ok) return errorResponse(400, valid.error);
  const clash = categoryNameClash(valid.value.name, id, mergedFromRows(rows));
  if (clash) {
    return errorResponse(400, `A category called "${clash}" already exists — give this one a different name.`);
  }

  // Documents: a slug that is no longer a live document is dropped (and
  // reported) rather than refused — it may have been deleted since the
  // editor loaded the library.
  const live = await liveDocumentSlugs(ctx.sb, valid.value.knowledgeSlugs);
  if (live instanceof Response) return live;
  const dropped = valid.value.knowledgeSlugs.filter((slug) => !live.has(slug));
  const { id: _id, ...columns } = categoryToRow({
    ...valid.value,
    knowledgeSlugs: valid.value.knowledgeSlugs.filter((slug) => live.has(slug)),
  });

  const found = rows.find((r) => r.id === id);
  if (found?.deleted_at && !builtIn) {
    return jsonResponse({ error: DELETED_CATEGORY_MESSAGE, code: 'deleted' }, { status: 409 });
  }
  // A built-in is never soft-deleted by this endpoint; a row that somehow is
  // counts as "no edit" (the merged list ignores it too) and is revived.
  const existing = found && !found.deleted_at ? found : null;

  const stale = async (): Promise<Response> => {
    const cur = await ctx.sb
      .from('scenario_objection_categories')
      .select(CATEGORY_ADMIN_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    const row = cur.data as StoredCategoryRow | null;
    const usage = await categoryUsageOf(ctx.sb, id);
    let current: AdminObjectionCategory | null;
    if (row && !row.deleted_at) current = toAdminCategory(row, usage);
    else if (builtIn) current = defaultBuiltInCategory(id, usage);
    else return jsonResponse({ error: DELETED_CATEGORY_MESSAGE, code: 'deleted' }, { status: 409 });
    return jsonResponse(
      {
        error:
          'Someone else saved this category after you opened it. Your edits are still here — review them against the latest version and save again.',
        code: 'stale',
        current,
      },
      { status: 409 },
    );
  };

  // Optimistic concurrency: `null` = the editor saw no row (a never-edited
  // built-in, or a new category).
  const checked = body.baseUpdatedAt !== undefined;
  if (checked && (body.baseUpdatedAt ?? null) !== (existing?.updated_at ?? null)) return stale();

  if (!existing) {
    if (!builtIn && liveTeamCategoryCount(rows) >= CATEGORY_LIMITS.maxTeamCategories) {
      return categoryLimitResponse();
    }
    const write = found
      ? // the revived built-in row (see above)
        ctx.sb
          .from('scenario_objection_categories')
          .update({ ...columns, deleted_at: null, updated_by: ctx.user.id })
          .eq('id', id)
          .select(CATEGORY_ADMIN_COLUMNS)
          .single()
      : ctx.sb
          .from('scenario_objection_categories')
          .insert({ id, ...columns, created_by: ctx.user.id, updated_by: ctx.user.id })
          .select(CATEGORY_ADMIN_COLUMNS)
          .single();
    const ins = await write;
    if (ins.error) {
      // Two admins editing the same never-edited built-in: whoever lands
      // second is told, like any other concurrent edit.
      if (builtIn && ins.error.code === '23505') return stale();
      return categoryWriteFailure(ins.error);
    }
    await writeAuditLog(ctx, {
      entity_type: 'scenario_objection_category',
      entity_id: id,
      action: found ? 'update' : 'create',
      before: found ?? null,
      after: ins.data,
    });
    const usage = await categoryUsageOf(ctx.sb, id);
    return jsonResponse({ category: toAdminCategory(ins.data, usage), _dropped: dropped });
  }

  let q = ctx.sb
    .from('scenario_objection_categories')
    .update({ ...columns, updated_by: ctx.user.id })
    .eq('id', id)
    .is('deleted_at', null);
  if (checked && existing.updated_at) q = q.eq('updated_at', existing.updated_at);
  const upd = await q.select(CATEGORY_ADMIN_COLUMNS).maybeSingle();
  if (upd.error) return categoryWriteFailure(upd.error);
  if (!upd.data) return stale();
  await writeAuditLog(ctx, {
    entity_type: 'scenario_objection_category',
    entity_id: id,
    action: 'update',
    before: existing,
    after: upd.data,
  });
  const usage = await categoryUsageOf(ctx.sb, id);
  return jsonResponse({ category: toAdminCategory(upd.data, usage), _dropped: dropped });
}

async function readOneCategory(ctx: AdminCtx, id: string): Promise<{ row: StoredCategoryRow | null } | Response> {
  const cur = await ctx.sb
    .from('scenario_objection_categories')
    .select(CATEGORY_ADMIN_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (cur.error) return readFailure(cur.error);
  return { row: (cur.data as StoredCategoryRow | null) ?? null };
}

async function removeCategory(ctx: AdminCtx, id: string): Promise<Response> {
  const read = await readOneCategory(ctx, id);
  if (read instanceof Response) return read;
  if (!read.row) return errorResponse(404, 'Category not found');
  if (read.row.deleted_at) return jsonResponse({ ok: true, category: toAdminCategory(read.row) });

  // Every non-deleted objection filed under it — retired ones included: they
  // still play their scenarios, which would lose the category's knowledge.
  const using = await ctx.sb
    .from('scenario_objections')
    .select('id, title')
    .eq('category_id', id)
    .is('deleted_at', null);
  if (using.error) return readFailure(using.error);
  const objections = ((using.data ?? []) as Array<{ id: string; title?: unknown }>).map((o) => ({
    id: o.id,
    title: typeof o.title === 'string' && o.title.trim() ? o.title : o.id,
  }));
  if (objections.length > 0) {
    const one = objections.length === 1;
    return jsonResponse(
      {
        error: `${one ? 'An objection is' : `${objections.length} objections are`} filed under this category (retired ones count too). Move ${one ? 'it' : 'them'} to another category first.`,
        code: 'in_use',
        objections,
      },
      { status: 409 },
    );
  }

  const del = await ctx.sb
    .from('scenario_objection_categories')
    .update({ deleted_at: new Date().toISOString(), updated_by: ctx.user.id })
    .eq('id', id)
    .is('deleted_at', null)
    .select(CATEGORY_ADMIN_COLUMNS)
    .maybeSingle();
  if (del.error) return categoryWriteFailure(del.error);
  // An objection filed under it between the check above and this write
  // (another admin saving at the same moment): undo the delete.
  const after = await ctx.sb
    .from('scenario_objections')
    .select('id, title')
    .eq('category_id', id)
    .is('deleted_at', null);
  if (!after.error && (after.data ?? []).length > 0) {
    await ctx.sb.from('scenario_objection_categories').update({ deleted_at: null }).eq('id', id);
    const late = ((after.data ?? []) as Array<{ id: string; title?: unknown }>).map((o) => ({
      id: o.id,
      title: typeof o.title === 'string' && o.title.trim() ? o.title : o.id,
    }));
    return jsonResponse(
      {
        error: 'An objection was just filed under this category, so it was not deleted. Move it to another category first.',
        code: 'in_use',
        objections: late,
      },
      { status: 409 },
    );
  }
  await writeAuditLog(ctx, {
    entity_type: 'scenario_objection_category',
    entity_id: id,
    action: 'delete',
    before: read.row,
    after: del.data ?? null,
  });
  return jsonResponse({ ok: true, category: del.data ? toAdminCategory(del.data) : null });
}

async function restoreCategory(ctx: AdminCtx, id: string): Promise<Response> {
  const rows = await readCategoryRows(ctx.sb);
  if (rows instanceof Response) return rows;
  const row = rows.find((r) => r.id === id);
  if (!row) return errorResponse(404, 'Category not found');
  if (!row.deleted_at) {
    return jsonResponse({ category: toAdminCategory(row, await categoryUsageOf(ctx.sb, id)) });
  }

  if (liveTeamCategoryCount(rows) >= CATEGORY_LIMITS.maxTeamCategories) return categoryLimitResponse();
  // The duplicate-name rule holds on restore too: another category may have
  // taken this name while it sat in Recently deleted.
  const clash = categoryNameClash(String(row.name ?? ''), id, mergedFromRows(rows));
  if (clash) {
    return errorResponse(
      409,
      `A category called "${clash}" already exists. Rename or delete it before restoring this one.`,
    );
  }

  const res = await ctx.sb
    .from('scenario_objection_categories')
    .update({ deleted_at: null, updated_by: ctx.user.id })
    .eq('id', id)
    .select(CATEGORY_ADMIN_COLUMNS)
    .maybeSingle();
  if (res.error) return categoryWriteFailure(res.error);
  if (!res.data) return errorResponse(404, 'Category not found');
  await writeAuditLog(ctx, {
    entity_type: 'scenario_objection_category',
    entity_id: id,
    action: 'update',
    before: row,
    after: res.data,
    note: 'Restored from Recently deleted',
  });
  return jsonResponse({ category: toAdminCategory(res.data, await categoryUsageOf(ctx.sb, id)) });
}

const OPS_MESSAGE =
  "op must be 'upsert', 'delete', 'restore', 'upsert-category', 'delete-category' or 'restore-category'";

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'scenarios.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    return list(ctx.sb, new URL(req.url).searchParams.get('deleted') === '1');
  }
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');
  if (!can(ctx, 'scenarios.write')) return errorResponse(403, 'Missing permission: scenarios.write');

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return errorResponse(413, 'Request too large');
    body = JSON.parse(text);
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }
  if (!isRecord(body) || typeof body.op !== 'string') return errorResponse(400, OPS_MESSAGE);

  switch (body.op) {
    case 'upsert':
      return upsert(ctx, body);
    case 'delete':
    case 'restore': {
      if (!isTeamObjectionId(body.id)) return errorResponse(400, 'id must be a team objection id (team:…)');
      return body.op === 'delete' ? remove(ctx, body.id) : restore(ctx, body.id);
    }
    case 'upsert-category':
      return upsertCategory(ctx, body);
    case 'delete-category':
    case 'restore-category': {
      if (isBuiltInCategoryId(body.id)) {
        return errorResponse(
          400,
          body.op === 'delete-category'
            ? BUILT_IN_CATEGORY_DELETE_MESSAGE
            : 'Built-in categories are never deleted, so there is nothing to restore.',
        );
      }
      if (!isTeamCategoryId(body.id)) return errorResponse(400, 'id must be a category id (category:…)');
      return body.op === 'delete-category' ? removeCategory(ctx, body.id) : restoreCategory(ctx, body.id);
    }
    default:
      return errorResponse(400, OPS_MESSAGE);
  }
};
