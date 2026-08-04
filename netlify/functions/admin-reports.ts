import {
  errorResponse,
  jsonResponse,
  readRange,
  requireAdmin,
} from './_shared/admin';

/** Admin: list platform reports (bug reports + suggestions) for triage. */
export default async (req: Request) => {
  const ctx = await requireAdmin(req, 'reports.read');
  if (ctx instanceof Response) return ctx;
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
