import {
  errorResponse,
  jsonResponse,
  readRange,
  requireAdmin,
} from './_shared/admin';
import { selectAll } from './_shared/paging';

/** Admin: list session feedback ("rate the simulation") responses. */
export default async (req: Request) => {
  const ctx = await requireAdmin(req, 'feedback.read');
  if (ctx instanceof Response) return ctx;
  const { since, limit } = readRange(req);
  // Paged: Supabase answers at most 1,000 rows per request whatever
  // `.limit()` says, so a single read silently stopped at 1,000.
  const { rows, error } = await selectAll<Record<string, unknown>>(
    (from, to) =>
      ctx.sb
        .from('session_feedback')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    { max: limit, dedupeBy: (r) => r.id },
  );
  if (error) return errorResponse(500, error.message);
  return jsonResponse(rows);
};
