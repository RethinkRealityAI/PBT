import {
  errorResponse,
  largeJsonResponse,
  readRange,
  requireAdmin,
} from './_shared/admin';
import { selectAll } from './_shared/paging';

/** Hard cap on one AI-call list. */
const AI_CALLS_MAX = 20_000;

export default async (req: Request) => {
  const ctx = await requireAdmin(req, 'quality.read');
  if (ctx instanceof Response) return ctx;
  const { since } = readRange(req);
  // AI-call rows are small (~300 bytes), and the AI quality + Overview tabs
  // read twice the window to compare periods, so this list allows more than
  // the generic 5,000 (`readRange`). Large answers stream (`largeJsonResponse`).
  const raw = Number(new URL(req.url).searchParams.get('limit') ?? 1000);
  const limit = Number.isFinite(raw) && raw >= 1 ? Math.min(AI_CALLS_MAX, Math.floor(raw)) : 1000;
  // Paged: Supabase answers at most 1,000 rows per request whatever
  // `.limit()` says, so a single read silently stopped at 1,000.
  const { rows, error } = await selectAll<Record<string, unknown>>(
    (from, to) =>
      ctx.sb
        .from('ai_call_telemetry')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    { max: limit, dedupeBy: (r) => r.id },
  );
  if (error) return errorResponse(500, error.message);
  return largeJsonResponse(rows);
};
