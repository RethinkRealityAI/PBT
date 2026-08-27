/**
 * Admin: platform reports (bug reports + suggestions).
 *
 *   GET  /admin-reports                → list for the requested range
 *   POST /admin-reports?op=status      → { id, status } move one through triage
 *
 * `platform_reports.status` is declared by the June migration as a triage
 * workflow (open | triaged | resolved | dismissed) and the support role is
 * defined as the people who work it, but until now nothing could write it —
 * every report sat at `open` forever while the screen counted them.
 *
 * Both branches name `reports.read`: on this surface, access to the queue IS
 * the authority to work it (there is no separate reports.write in the
 * permission catalog, and triage is the stated purpose of the role that holds
 * this permission). Reads and writes go through the service role, so no RLS
 * policy change is required.
 */
import {
  errorResponse,
  jsonResponse,
  readRange,
  requireAdmin,
  writeAuditLog,
} from './_shared/admin';

/** Triage states, mirroring the CHECK on platform_reports.status. */
const STATUSES = ['open', 'triaged', 'resolved', 'dismissed'] as const;
type ReportStatus = (typeof STATUSES)[number];

function isStatus(v: unknown): v is ReportStatus {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

export default async (req: Request) => {
  const ctx = await requireAdmin(req, 'reports.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'POST') {
    const op = new URL(req.url).searchParams.get('op');
    if (op !== 'status') return errorResponse(400, 'Unknown operation');

    let body: { id?: unknown; status?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return errorResponse(400, 'Invalid JSON');
    }
    if (typeof body.id !== 'string' || body.id === '') {
      return errorResponse(400, 'id required');
    }
    if (!isStatus(body.status)) {
      return errorResponse(400, `status must be one of ${STATUSES.join(', ')}`);
    }

    const before = (
      await ctx.sb
        .from('platform_reports')
        .select('id, status')
        .eq('id', body.id)
        .maybeSingle()
    ).data;
    if (!before) return errorResponse(404, 'Report not found');

    const { data, error } = await ctx.sb
      .from('platform_reports')
      .update({ status: body.status })
      .eq('id', body.id)
      .select('*')
      .maybeSingle();
    if (error) return errorResponse(500, error.message);

    await writeAuditLog(ctx, {
      entity_type: 'report',
      entity_id: body.id,
      action: 'update',
      before,
      after: { id: body.id, status: body.status },
    });
    return jsonResponse(data);
  }

  if (req.method !== 'GET') return errorResponse(405, 'Method not allowed');

  const { since, limit } = readRange(req);
  const { data, error } = await ctx.sb
    .from('platform_reports')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return errorResponse(500, error.message);
  return jsonResponse(data ?? []);
};
