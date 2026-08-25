import {
  can,
  errorResponse,
  jsonResponse,
  readRange,
  requireAdmin,
  writeAuditLog,
} from './_shared/admin';

const REPORT_STATUSES = ['open', 'triaged', 'resolved', 'dismissed'] as const;
type ReportStatus = (typeof REPORT_STATUSES)[number];

const isReportStatus = (v: unknown): v is ReportStatus =>
  typeof v === 'string' && (REPORT_STATUSES as readonly string[]).includes(v);

/**
 * Admin: platform reports (bug reports + suggestions).
 *   GET               — list for triage.
 *   POST ?op=set_status — move a report through the triage workflow
 *                         (open → triaged → resolved / dismissed), audited.
 */
export default async (req: Request) => {
  const ctx = await requireAdmin(req, 'reports.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'POST') {
    if (!can(ctx, 'reports.write')) {
      return errorResponse(403, 'Missing permission: reports.write');
    }
    const op = new URL(req.url).searchParams.get('op') ?? 'set_status';
    if (op !== 'set_status') return errorResponse(400, `Unknown op: ${op}`);

    let body: { id?: unknown; status?: unknown };
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }
    const id = typeof body.id === 'string' ? body.id : null;
    if (!id) return errorResponse(400, 'id required');
    if (!isReportStatus(body.status)) {
      return errorResponse(400, `status must be one of: ${REPORT_STATUSES.join(', ')}`);
    }

    const { data: before, error: readError } = await ctx.sb
      .from('platform_reports')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (readError) return errorResponse(500, readError.message);
    if (!before) return errorResponse(404, 'Report not found');

    const { data, error } = await ctx.sb
      .from('platform_reports')
      .update({ status: body.status })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return errorResponse(500, error.message);

    await writeAuditLog(ctx, {
      entity_type: 'platform_report',
      entity_id: id,
      action: 'update',
      before: { status: before.status },
      after: { status: data.status },
    });
    return jsonResponse(data);
  }

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
