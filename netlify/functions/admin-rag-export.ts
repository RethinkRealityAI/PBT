/**
 * RAG export — streams `rag_export_v1` rows as JSONL for downstream
 * fine-tune / vector indexing.
 *
 * Replaces the earlier supabase/functions/rag-export Edge Function so all
 * admin reads share one Netlify Functions runtime + auth path.
 *
 *   GET /.netlify/functions/admin-rag-export?since=2026-01-01&completed=true
 */
import { errorResponse, requireAdmin } from './_shared/admin';

interface RagRow {
  session_id: string;
  user_id: string;
  created_at: string;
  driver: string | null;
  pushback_id: string | null;
  scenario_summary: string | null;
  scenario: unknown;
  transcript: unknown;
  score_report: unknown;
  score_overall: number | null;
  duration_seconds: number | null;
  turns: number | null;
  completed: boolean;
  ended_reason: string | null;
  flagged: boolean;
  flag_reason: string | null;
  mode: string | null;
  model_id: string | null;
  ai_signals: unknown;
  turn_signals: unknown;
}

export default async (req: Request) => {
  if (req.method !== 'GET') return errorResponse(405, 'Method not allowed');
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const params = new URL(req.url).searchParams;
  const since =
    params.get('since') ??
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const limit = Math.min(5000, Number(params.get('limit') ?? 1000));
  const completedOnly = params.get('completed') === 'true';

  let q = ctx.sb
    .from('rag_export_v1')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (completedOnly) q = q.eq('completed', true);

  const { data, error } = await q;
  if (error) return errorResponse(500, error.message);
  const rows = (data ?? []) as RagRow[];
  const lines = rows.length ? rows.map((r) => JSON.stringify(r)).join('\n') + '\n' : '';
  return new Response(lines, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson',
      'x-row-count': String(rows.length),
      'content-disposition': `attachment; filename="pbt-rag-${Date.now()}.jsonl"`,
    },
  });
};
