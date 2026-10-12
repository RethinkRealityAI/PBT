/**
 * Admin: team-authored objections ("pushback categories") — the subject
 * areas an admin adds beside the seven built into the code (probiotics,
 * feline topics, …) without a deploy. Table `scenario_objections`, migration
 * 20261012000000_scenario_objections.sql; shared contract
 * src/shared/scenarios/objections.ts.
 *
 *   GET  /admin-objections            → { objections: AdminObjection[] }
 *        every non-deleted objection (retired included), each with
 *        `usage: { scenarios, live, trainee }` — the non-deleted scenario_overrides
 *        rows built on it, how many of those are published, and how many
 *        trainees' own scenarios (user_scenarios) use it — informational.
 *   GET  /admin-objections?deleted=1  → the same plus soft-deleted ones
 *        (`deletedAt` set), so the editor can offer Restore.
 *   POST /admin-objections            → `ObjectionWriteRequest`:
 *        { op: 'upsert', objection, baseUpdatedAt? } → { objection }
 *        { op: 'delete', id }                        → { ok: true, objection }
 *        { op: 'restore', id }                       → { objection }
 *
 * Gating: `scenarios.read` to list, `scenarios.write` to change — an
 * objection is part of scenario authoring, and the AI customer of every
 * scenario built on it reads its coaching.
 *
 * Trust: the objection's text reaches the AI customer's prompt (as data) and
 * trainees' screens, so every write goes through `validateObjectionInput`
 * (shape, caps, vocabulary) and only the columns `teamObjectionToRow` names
 * are written; `created_by` / `updated_by` / timestamps are server-owned.
 *
 * Lifecycle:
 *   • upsert without an id CREATES (id allocated from the title — `team:` +
 *     slug — so it can never collide with a built-in), capped at
 *     OBJECTION_LIMITS.maxTeamObjections live objections (409 `limit`).
 *     With an id it UPDATES the live row; `baseUpdatedAt` (the row's
 *     `updated_at` the editor loaded) makes a concurrent edit a 409
 *     `{ code: 'stale', current }` instead of a silent overwrite. Editing a
 *     soft-deleted objection is a 409 `deleted` (restore it first).
 *   • `visible: false` RETIRES an objection: hidden from pickers, but every
 *     scenario already built on it keeps playing.
 *   • delete is a soft delete, refused (409 `in_use`, with the scenarios)
 *     while any non-deleted scenario uses it — a deleted objection resolves
 *     to nothing and its scenarios would silently drop out of the library.
 *
 * Until the migration runs: GET answers 200 with no objections and
 * `_notice: 'objections_table_missing'`; POST answers 503 with a plain
 * "run the migration" message. Nothing else degrades — the trainee app,
 * the AI functions and the Studio all fall back to the built-ins.
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
  OBJECTION_ADMIN_COLUMNS,
  OBJECTIONS_MIGRATION,
  isMissingObjectionsTable,
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
} from '../../src/shared/scenarios/objections';

/** An objection is a few short lists; anything bigger is not one. */
const MAX_BODY_BYTES = 32 * 1024;

export const OBJECTIONS_TABLE_MISSING = 'objections_table_missing';
export const MIGRATION_NEEDED_MESSAGE = `Objections need a database update first (migration ${OBJECTIONS_MIGRATION}).`;
export const DELETED_OBJECTION_MESSAGE =
  'This objection was deleted. Restore it from "Recently deleted" before editing it.';

type DbError = { code?: string; message?: string };
type Usage = AdminObjection['usage'];
type StoredRow = { id: string; title?: unknown; deleted_at?: string | null; updated_at?: string | null };

const NO_USAGE: Usage = { scenarios: 0, live: 0, trainee: 0 };

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

/** 503 when the table is missing, else 500 with the database's message. */
function readFailure(error: DbError): Response {
  if (isMissingObjectionsTable(error)) return errorResponse(503, MIGRATION_NEEDED_MESSAGE);
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
  if (isMissingObjectionsTable(error)) return errorResponse(503, MIGRATION_NEEDED_MESSAGE);
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

async function list(sb: SupabaseClient, includeDeleted: boolean): Promise<Response> {
  let q = sb.from('scenario_objections').select(OBJECTION_ADMIN_COLUMNS);
  if (!includeDeleted) q = q.is('deleted_at', null);
  const { data, error } = await q;
  if (error) {
    if (isMissingObjectionsTable(error)) {
      return jsonResponse({ objections: [], _notice: OBJECTIONS_TABLE_MISSING });
    }
    return errorResponse(500, error.message ?? 'Database error');
  }
  const rows = (data ?? []) as StoredRow[];
  let usage: Map<string, Usage>;
  try {
    usage = await loadUsage(
      sb,
      rows.map((r) => r.id),
    );
  } catch (err) {
    return errorResponse(500, err instanceof Error ? err.message : 'Database error');
  }
  const objections: AdminObjection[] = [];
  for (const row of rows) {
    const o = toAdminObjection(row, usage.get(row.id));
    if (o) objections.push(o);
    else console.warn('[admin-objections] unreadable row skipped', row.id);
  }
  return jsonResponse({ objections: sortTeamObjections(objections) });
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
  if (!isRecord(body) || typeof body.op !== 'string') {
    return errorResponse(400, "op must be 'upsert', 'delete' or 'restore'");
  }

  switch (body.op) {
    case 'upsert':
      return upsert(ctx, body);
    case 'delete':
    case 'restore': {
      if (!isTeamObjectionId(body.id)) return errorResponse(400, 'id must be a team objection id (team:…)');
      return body.op === 'delete' ? remove(ctx, body.id) : restore(ctx, body.id);
    }
    default:
      return errorResponse(400, "op must be 'upsert', 'delete' or 'restore'");
  }
};
