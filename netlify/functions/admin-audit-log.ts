/**
 * Admin: paginated audit log + revert endpoint.
 *
 *   GET  /admin-audit-log                        → recent entries (most recent first)
 *   GET  /admin-audit-log?entity_type=&entity_id=&limit=
 *   POST /admin-audit-log?op=revert              → restore an entity to its `before`
 *                                                   state from a specific log row
 */
import { can, errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';
import type { Permission } from '../../src/shared/access/permissions';

type AuditEntityType =
  | 'flag'
  | 'flag_rule'
  | 'scenario_override'
  | 'simulation_config'
  | 'user'
  | 'role'
  | 'invite'
  | 'email_settings'
  | 'email_template'
  | 'knowledge_document';

interface AuditRow {
  id: string;
  actor_id: string | null;
  entity_type: AuditEntityType;
  entity_id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}

/**
 * Reverting is a WRITE to the target entity, so `audit.read` alone is not the
 * right bar — the caller must also hold whatever permission the original
 * mutation required. An entity type absent from this map cannot be reverted at
 * all (see the 400 below): silently doing nothing while reporting `{ok:true}`
 * is worse than refusing.
 */
const REVERT_PERMISSION: Partial<Record<AuditEntityType, Permission>> = {
  flag: 'flags.write',
  flag_rule: 'flags.write',
  scenario_override: 'scenarios.write',
  simulation_config: 'simulation.write',
  knowledge_document: 'knowledge.write',
};

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'audit.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    const limit = Math.min(500, Number(params.get('limit') ?? 100));
    const entityType = params.get('entity_type');
    const entityId = params.get('entity_id');
    let q = ctx.sb
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (entityType) q = q.eq('entity_type', entityType);
    if (entityId) q = q.eq('entity_id', entityId);
    const { data, error } = await q;
    if (error) return errorResponse(500, error.message);
    return jsonResponse(data ?? []);
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  const op = new URL(req.url).searchParams.get('op');
  if (op !== 'revert') return errorResponse(400, 'Unknown op');

  let body: { id: string };
  try {
    body = (await req.json()) as { id: string };
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }
  if (!body.id) return errorResponse(400, 'Missing id');

  const { data: entry, error: fetchErr } = await ctx.sb
    .from('admin_audit_log')
    .select('*')
    .eq('id', body.id)
    .maybeSingle();
  if (fetchErr) return errorResponse(500, fetchErr.message);
  if (!entry) return errorResponse(404, 'Audit entry not found');

  const row = entry as AuditRow;

  const needed = REVERT_PERMISSION[row.entity_type];
  if (!needed) {
    return errorResponse(400, `Revert not supported for ${row.entity_type}`);
  }
  if (!can(ctx, needed)) return errorResponse(403, `Missing permission: ${needed}`);

  // Restore strategy: write `before` back. If the original action was
  // 'create', reverting means deleting the current row.
  //
  // Every mutation result is checked — a silent failure here would leave
  // the DB in a state inconsistent with the audit row we're about to
  // write below ("revert succeeded" while the entity wasn't actually
  // touched), making any later recovery much harder to reason about.
  let mutErr: { message: string } | null = null;
  if (row.entity_type === 'flag_rule') {
    if (row.action === 'create') {
      mutErr = (await ctx.sb.from('flag_rules').delete().eq('id', row.entity_id)).error;
    } else if (row.before) {
      mutErr = (await ctx.sb.from('flag_rules').upsert(row.before)).error;
    }
  } else if (row.entity_type === 'flag') {
    if (row.before) mutErr = (await ctx.sb.from('flags').upsert(row.before)).error;
  } else if (row.entity_type === 'scenario_override') {
    if (row.action === 'create') {
      mutErr = (
        await ctx.sb.from('scenario_overrides').delete().eq('scenario_id', row.entity_id)
      ).error;
    } else if (row.before) {
      mutErr = (await ctx.sb.from('scenario_overrides').upsert(row.before)).error;
    }
  } else if (row.entity_type === 'knowledge_document') {
    // Knowledge deletes are soft, so `before` is the document as it stood and
    // the row itself is usually still there — reverting means writing those
    // fields back and clearing the tombstone. A `before` with no `content` is
    // an oversized body the delete deliberately left out of the audit row; the
    // stored text is still the right one, so keep it rather than nulling a
    // NOT NULL column.
    const before = row.before as Record<string, unknown> | null;
    if (before) {
      const slug = String(before.slug ?? row.entity_id);
      const patch: Record<string, unknown> = {
        ...before,
        slug,
        deleted_at: null,
        updated_by: ctx.user.id,
      };
      const { data: existing } = await ctx.sb
        .from('knowledge_documents')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (existing) {
        delete patch.id;
        if (patch.content == null) delete patch.content;
        mutErr = (
          await ctx.sb.from('knowledge_documents').update(patch).eq('id', existing.id)
        ).error;
      } else if (patch.content == null) {
        return errorResponse(
          400,
          'Cannot restore: this audit entry omitted the document body and the row no longer exists — re-ingest the document instead.',
        );
      } else {
        mutErr = (
          await ctx.sb.from('knowledge_documents').upsert(patch, { onConflict: 'slug' })
        ).error;
      }
    }
  } else if (row.entity_type === 'simulation_config') {
    // `before`/`after` here are the FULL config JSON, not a table row — so the
    // revert writes it back into the singleton's `config` column. A null
    // `before` means "no config existed yet", which reverts to the empty
    // config (i.e. pure code defaults), not a no-op.
    mutErr = (
      await ctx.sb.from('simulation_config').upsert({
        id: 'global',
        config: row.before ?? {},
        updated_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      })
    ).error;
  }
  if (mutErr) return errorResponse(500, `Revert failed: ${mutErr.message}`);

  await writeAuditLog(ctx, {
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: 'revert',
    before: row.after,
    after: row.before,
    note: `Reverted to state from audit row ${row.id}`,
  });
  return jsonResponse({ ok: true });
};
