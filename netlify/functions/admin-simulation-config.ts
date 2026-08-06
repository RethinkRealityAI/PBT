/**
 * Admin: read + write the global simulation config.
 *
 *   GET  /admin-simulation-config   → { config: Record<string, unknown> }
 *   POST /admin-simulation-config   → body: { config: Record<string, unknown> }
 *                                   → { config: Record<string, unknown> }
 *
 * The config is stored as opaque JSONB in public.simulation_config (id='global').
 * Every write is mirrored to admin_audit_log with entity_type 'simulation_config'.
 *
 * The consumer reads the resolved value through the public flags-resolve
 * endpoint (service role); the table is not directly readable by anon/auth roles.
 */
import { can, errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'simulation.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const { data, error } = await ctx.sb
      .from('simulation_config')
      .select('config')
      .eq('id', 'global')
      .maybeSingle();
    if (error) return errorResponse(500, error.message);
    const config = (data?.config ?? {}) as Record<string, unknown>;
    return jsonResponse({ config });
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'Method not allowed');
  }
  if (!can(ctx, 'simulation.write')) return errorResponse(403, 'Missing permission: simulation.write');

  let body: { config: unknown };
  try {
    body = (await req.json()) as { config: unknown };
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  const incoming = body.config;
  if (
    incoming === null ||
    typeof incoming !== 'object' ||
    Array.isArray(incoming)
  ) {
    return errorResponse(400, 'config must be a plain object');
  }
  const config = incoming as Record<string, unknown>;

  // Fetch current value for the audit log "before" snapshot.
  const { data: existing } = await ctx.sb
    .from('simulation_config')
    .select('config')
    .eq('id', 'global')
    .maybeSingle();
  const before = (existing?.config ?? null) as Record<string, unknown> | null;

  // Upsert the global row.
  const { data, error } = await ctx.sb
    .from('simulation_config')
    .upsert({
      id: 'global',
      config,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    })
    .select('config')
    .maybeSingle();
  if (error) return errorResponse(500, error.message);

  const after = (data?.config ?? config) as Record<string, unknown>;

  await writeAuditLog(ctx, {
    entity_type: 'simulation_config',
    entity_id: 'global',
    action: 'update',
    before,
    after,
  });

  return jsonResponse({ config: after });
};
