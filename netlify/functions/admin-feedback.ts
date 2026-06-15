import {
  errorResponse,
  jsonResponse,
  readRange,
  requireAdmin,
} from './_shared/admin';

/** Admin: list session feedback ("rate the simulation") responses. */
export default async (req: Request) => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  const { since, limit } = readRange(req);
  const { data, error } = await ctx.sb
    .from('session_feedback')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return errorResponse(500, error.message);
  return jsonResponse(data ?? []);
};
