/**
 * Admin: paginated audit log + revert endpoint.
 *
 *   GET  /admin-audit-log               → recent entries (most recent first)
 *   POST /admin-audit-log?op=revert     → restore an entity to its `before`
 *                                          state from a specific log row
 */
import { errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';

interface AuditRow {
  id: string;
  actor_id: string | null;
  entity_type: 'flag' | 'flag_rule' | 'scenario_override';
  entity_id: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const params = new URL(req.url).searchParams;
    const limit = Math.min(500, Number(params.get('limit') ?? 100));
    const entityType = params.get('entity_type');
    let q = ctx.sb
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (entityType) q = q.eq('entity_type', entityType);
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
