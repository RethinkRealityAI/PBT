/**
 * Admin: the team's scenario tag library (Scenario Studio gallery).
 *
 * Tables `scenario_tags` + `scenario_tag_assignments`, migration
 * 20261107000000_scenario_tags_archive.sql; shared contract
 * src/shared/scenarios/tags.ts.
 *
 *   GET  /admin-scenario-tags  (scenarios.read)
 *        → { tags: AdminScenarioTag[], assignments: { scenarioId, tagId }[] }
 *        every LIVE tag A→Z with `usage` (scenarios carrying it), and every
 *        assignment of a live tag. Both lists are paged (_shared/paging.ts).
 *   POST /admin-scenario-tags  (scenarios.write) — `ScenarioTagWriteRequest`:
 *        { op: 'upsert-tag', tag: { id?, name, color }, baseUpdatedAt? }
 *            → { tag }       create (no id) or rename / recolour (with id).
 *              A name already used by another live tag (case- and
 *              space-insensitive) → 409 { code: 'duplicate' }; more than
 *              TAG_LIMITS.maxTags live tags → 409 { code: 'limit' };
 *              `baseUpdatedAt` that no longer matches → 409
 *              { code: 'stale', current }; a deleted / unknown id → 404.
 *        { op: 'delete-tag', id }
 *            → { ok: true, removed }  soft delete, then its assignments go
 *              (the Studio confirms first, showing how many scenarios carry it).
 *        { op: 'set-tags', scenarioId, tagIds }
 *            → { scenarioId, tagIds, _dropped }  REPLACES that scenario's
 *              tags. Unknown / deleted ids are dropped and listed; more than
 *              TAG_LIMITS.perScenario → 400. Only `seed:` and `admin:`
 *              scenarios carry tags (never a trainee's own `user:` one), and
 *              an `admin:` id must be a live scenario.
 *
 * Tags are ADMIN-ONLY: no other function reads these tables — not the public
 * flags snapshot, not any AI prompt builder.
 *
 * Writes are bounded (16 KB body), audited as entity `scenario_tag`
 * (best-effort, like every audit write — the CHECK that allows it is in the
 * same migration), and never touch `scenario_overrides`, so tagging can't
 * create an override row or bump one's `updated_at`.
 *
 * Until the migration runs: GET answers 200 with nothing and
 * `_notice: 'tags_table_missing'` (the gallery hides tags); POST is a 503.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';
import { selectAll } from './_shared/paging';
import {
  TAGS_TABLE_MISSING,
  TAG_LIMITS,
  isTagId,
  isTaggableScenarioId,
  normalizeTagName,
  rowToScenarioTag,
  sortTags,
  tagNameKey,
  validateTagInput,
  type AdminScenarioTag,
  type ScenarioTag,
  type ScenarioTagAssignment,
  type TagColor,
} from '../../src/shared/scenarios/tags';

const MAX_BODY_BYTES = 16 * 1024;
const TAG_COLUMNS = 'id, name, color, updated_at';
/** Generous bound on assignment reads: 100 tags × every scenario. */
const MAX_ASSIGNMENTS = 20_000;

export const TAGS_MIGRATION = '20261107000000_scenario_tags_archive.sql';
export const MIGRATION_NEEDED_MESSAGE = `Tags need a database update first (migration ${TAGS_MIGRATION}).`;

type DbError = { code?: string; message?: string } | null | undefined;

/** Either tags table is missing (PostgREST schema-cache miss or undefined_table), named. */
export function isMissingTagsTable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code !== 'PGRST205' && e.code !== '42P01') return false;
  return /\bscenario_tag(s|_assignments)\b/i.test(typeof e.message === 'string' ? e.message : '');
}

function dbFailure(error: DbError, fallback = 'Database error'): Response {
  if (isMissingTagsTable(error)) return errorResponse(503, MIGRATION_NEEDED_MESSAGE);
  return errorResponse(500, error?.message ?? fallback);
}

async function readLiveTags(sb: SupabaseClient): Promise<{ tags: ScenarioTag[]; error: DbError }> {
  const res = await selectAll<Record<string, unknown>>(
    (from, to) =>
      sb
        .from('scenario_tags')
        .select(TAG_COLUMNS)
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to),
    { max: TAG_LIMITS.maxTags * 5, dedupeBy: (r) => r.id },
  );
  if (res.error) return { tags: [], error: res.error };
  const tags = res.rows.map(rowToScenarioTag).filter((t): t is ScenarioTag => t !== null);
  return { tags: sortTags(tags), error: null };
}

async function readAssignments(
  sb: SupabaseClient,
  filter?: { scenarioId?: string; tagId?: string },
): Promise<{ rows: ScenarioTagAssignment[]; error: DbError }> {
  const res = await selectAll<Record<string, unknown>>(
    (from, to) => {
      let q = sb.from('scenario_tag_assignments').select('scenario_id, tag_id');
      if (filter?.scenarioId) q = q.eq('scenario_id', filter.scenarioId);
      if (filter?.tagId) q = q.eq('tag_id', filter.tagId);
      return q.order('scenario_id', { ascending: true }).order('tag_id', { ascending: true }).range(from, to);
    },
    { max: MAX_ASSIGNMENTS, dedupeBy: (r) => `${String(r.scenario_id)}|${String(r.tag_id)}` },
  );
  if (res.error) return { rows: [], error: res.error };
  const rows: ScenarioTagAssignment[] = [];
  for (const r of res.rows) {
    if (typeof r.scenario_id === 'string' && isTagId(r.tag_id)) rows.push({ scenarioId: r.scenario_id, tagId: r.tag_id });
  }
  return { rows, error: null };
}

async function handleGet(sb: SupabaseClient): Promise<Response> {
  const live = await readLiveTags(sb);
  if (live.error) {
    if (isMissingTagsTable(live.error)) return jsonResponse({ tags: [], assignments: [], _notice: TAGS_TABLE_MISSING });
    return errorResponse(500, live.error.message ?? 'Database error');
  }
  const assigned = await readAssignments(sb);
  if (assigned.error) {
    if (isMissingTagsTable(assigned.error)) return jsonResponse({ tags: [], assignments: [], _notice: TAGS_TABLE_MISSING });
    return errorResponse(500, assigned.error.message ?? 'Database error');
  }
  const liveIds = new Set(live.tags.map((t) => t.id));
  const assignments = assigned.rows.filter((a) => liveIds.has(a.tagId));
  const usage = new Map<string, number>();
  for (const a of assignments) usage.set(a.tagId, (usage.get(a.tagId) ?? 0) + 1);
  const tags: AdminScenarioTag[] = live.tags.map((t) => ({ ...t, usage: usage.get(t.id) ?? 0 }));
  return jsonResponse({ tags, assignments });
}

interface UpsertBody {
  op: 'upsert-tag';
  tag: { id?: string | null; name: string; color: TagColor };
  baseUpdatedAt?: string | null;
}

async function upsertTag(ctx: Exclude<Awaited<ReturnType<typeof requireAdmin>>, Response>, body: UpsertBody): Promise<Response> {
  const invalid = validateTagInput(body.tag);
  if (invalid) return errorResponse(400, invalid);
  const name = normalizeTagName(body.tag.name);
  const color = body.tag.color;
  const id = body.tag.id ?? null;

  const live = await readLiveTags(ctx.sb);
  if (live.error) return dbFailure(live.error);
  const key = tagNameKey(name);
  const clash = live.tags.find((t) => t.id !== id && tagNameKey(t.name) === key);
  if (clash) {
    return jsonResponse(
      { error: `There is already a tag called “${clash.name}”.`, code: 'duplicate', existing: clash },
      { status: 409 },
    );
  }

  if (!id) {
    if (live.tags.length >= TAG_LIMITS.maxTags) {
      return jsonResponse(
        { error: `The team already has ${TAG_LIMITS.maxTags} tags — delete one you no longer use first.`, code: 'limit' },
        { status: 409 },
      );
    }
    const res = await ctx.sb
      .from('scenario_tags')
      .insert({ name, color, created_by: ctx.user.id })
      .select(TAG_COLUMNS)
      .maybeSingle();
    if (res.error) {
      // The unique index lost a race with another admin's create.
      if (res.error.code === '23505') {
        return jsonResponse({ error: `There is already a tag called “${name}”.`, code: 'duplicate' }, { status: 409 });
      }
      return dbFailure(res.error);
    }
    const tag = rowToScenarioTag(res.data);
    if (!tag) return errorResponse(500, 'The tag was not saved');
    await writeAuditLog(ctx, { entity_type: 'scenario_tag', entity_id: tag.id, action: 'create', after: res.data });
    return jsonResponse({ tag: { ...tag, usage: 0 } });
  }

  const before = live.tags.find((t) => t.id === id) ?? null;
  if (!before) return errorResponse(404, 'That tag no longer exists.');
  if (body.baseUpdatedAt !== undefined && (body.baseUpdatedAt ?? null) !== before.updatedAt) {
    return jsonResponse(
      { error: 'Someone else changed this tag just now — check it and try again.', code: 'stale', current: before },
      { status: 409 },
    );
  }
  const res = await ctx.sb
    .from('scenario_tags')
    .update({ name, color })
    .eq('id', id)
    .is('deleted_at', null)
    .select(TAG_COLUMNS)
    .maybeSingle();
  if (res.error) {
    if (res.error.code === '23505') {
      return jsonResponse({ error: `There is already a tag called “${name}”.`, code: 'duplicate' }, { status: 409 });
    }
    return dbFailure(res.error);
  }
  const tag = rowToScenarioTag(res.data);
  // Deleted between our read and our write.
  if (!tag) return errorResponse(404, 'That tag no longer exists.');
  await writeAuditLog(ctx, { entity_type: 'scenario_tag', entity_id: id, action: 'update', before, after: res.data });
  return jsonResponse({ tag });
}

async function deleteTag(ctx: Exclude<Awaited<ReturnType<typeof requireAdmin>>, Response>, id: unknown): Promise<Response> {
  if (!isTagId(id)) return errorResponse(400, 'Unknown tag.');
  const res = await ctx.sb
    .from('scenario_tags')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)
    .select(TAG_COLUMNS)
    .maybeSingle();
  if (res.error) return dbFailure(res.error);
  if (!res.data) return errorResponse(404, 'That tag no longer exists.');
  // The tag is gone from every picker already; its assignments follow. A
  // failure here leaves rows that the GET ignores (it lists live tags only).
  const assigned = await readAssignments(ctx.sb, { tagId: id });
  const removed = assigned.error ? 0 : assigned.rows.length;
  const del = await ctx.sb.from('scenario_tag_assignments').delete().eq('tag_id', id);
  if (del.error) console.error('[admin-scenario-tags] could not remove the deleted tag’s assignments', del.error);
  await writeAuditLog(ctx, {
    entity_type: 'scenario_tag',
    entity_id: id,
    action: 'delete',
    before: res.data,
    note: `Removed from ${removed} scenario${removed === 1 ? '' : 's'}`,
  });
  return jsonResponse({ ok: true, removed });
}

async function setTags(
  ctx: Exclude<Awaited<ReturnType<typeof requireAdmin>>, Response>,
  scenarioId: unknown,
  tagIds: unknown,
): Promise<Response> {
  if (!isTaggableScenarioId(scenarioId)) {
    return errorResponse(400, 'Only library and Studio scenarios carry tags.');
  }
  if (!Array.isArray(tagIds) || tagIds.some((t) => typeof t !== 'string')) {
    return errorResponse(400, 'tagIds must be a list of tag ids');
  }
  const wanted = [...new Set(tagIds as string[])];
  if (wanted.length > TAG_LIMITS.perScenario) {
    return errorResponse(400, `A scenario can carry up to ${TAG_LIMITS.perScenario} tags.`);
  }
  if (scenarioId.startsWith('admin:')) {
    const row = await ctx.sb
      .from('scenario_overrides')
      .select('scenario_id')
      .eq('scenario_id', scenarioId)
      .is('deleted_at', null)
      .maybeSingle();
    if (row.error) return errorResponse(500, row.error.message ?? 'Database error');
    if (!row.data) return errorResponse(404, 'That scenario no longer exists.');
  }

  const live = await readLiveTags(ctx.sb);
  if (live.error) return dbFailure(live.error);
  const liveIds = new Set(live.tags.map((t) => t.id));
  const keep = wanted.filter((id) => isTagId(id) && liveIds.has(id));
  const dropped = wanted.filter((id) => !keep.includes(id));

  const current = await readAssignments(ctx.sb, { scenarioId });
  if (current.error) return dbFailure(current.error);
  const had = current.rows.map((a) => a.tagId);
  const remove = had.filter((id) => !keep.includes(id));
  const add = keep.filter((id) => !had.includes(id));

  if (remove.length > 0) {
    const del = await ctx.sb
      .from('scenario_tag_assignments')
      .delete()
      .eq('scenario_id', scenarioId)
      .in('tag_id', remove);
    if (del.error) return dbFailure(del.error);
  }
  if (add.length > 0) {
    const ins = await ctx.sb
      .from('scenario_tag_assignments')
      .upsert(
        add.map((tagId) => ({ scenario_id: scenarioId, tag_id: tagId, created_by: ctx.user.id })),
        { onConflict: 'scenario_id,tag_id', ignoreDuplicates: true },
      );
    if (ins.error) return dbFailure(ins.error);
  }
  if (remove.length > 0 || add.length > 0) {
    const names = new Map(live.tags.map((t) => [t.id, t.name] as const));
    await writeAuditLog(ctx, {
      entity_type: 'scenario_tag',
      entity_id: scenarioId,
      action: 'update',
      before: { tagIds: had },
      after: { tagIds: keep },
      note: [
        add.length ? `Tagged ${add.map((id) => names.get(id) ?? id).join(', ')}` : '',
        remove.length ? `Untagged ${remove.map((id) => names.get(id) ?? id).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    });
  }
  return jsonResponse({ scenarioId, tagIds: keep, _dropped: dropped });
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'scenarios.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') return handleGet(ctx.sb);
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');
  if (!can(ctx, 'scenarios.write')) return errorResponse(403, 'Missing permission: scenarios.write');

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return errorResponse(413, 'Request too large');
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return errorResponse(400, 'Invalid JSON');
    body = parsed as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  switch (body.op) {
    case 'upsert-tag':
      return upsertTag(ctx, body as unknown as UpsertBody);
    case 'delete-tag':
      return deleteTag(ctx, body.id);
    case 'set-tags':
      return setTags(ctx, body.scenarioId, body.tagIds);
    default:
      return errorResponse(400, 'Unknown op');
  }
};
