// PBT — RAG export Edge Function.
//
// Streams `rag_export_v1` rows as JSONL for downstream RAG / fine-tune jobs.
// Admin-only: callers must present a Supabase JWT whose `is_admin` profile
// flag is true. The view itself is RLS-protected, so a non-admin token
// yields zero rows.
//
// Deploy:
//   supabase functions deploy rag-export
//
// Use:
//   curl -H "Authorization: Bearer <admin-jwt>" \
//        "https://<project>.functions.supabase.co/rag-export?since=2026-01-01"
//
// Query params:
//   since      ISO timestamp; default = 90 days ago
//   limit      integer; default 1000, max 5000
//   completed  'true' to only export completed sessions
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return new Response('Missing bearer token', { status: 401 });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) {
    return new Response('Edge env not configured', { status: 500 });
  }

  // Use the caller's JWT so RLS gates the rows: only admins see anything.
  const sb = createClient(url, anonKey, {
    global: { headers: { Authorization: auth } },
  });

  const params = new URL(req.url).searchParams;
  const since =
    params.get('since') ??
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const limit = Math.min(5000, Number(params.get('limit') ?? 1000));
  const completedOnly = params.get('completed') === 'true';

  let q = sb
    .from('rag_export_v1')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (completedOnly) q = q.eq('completed', true);

  const { data, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!data || data.length === 0) {
    return new Response('', {
      status: 200,
      headers: {
        'content-type': 'application/x-ndjson',
        'x-row-count': '0',
      },
    });
  }

  const lines = (data as RagRow[]).map((r) => JSON.stringify(r)).join('\n');
  return new Response(lines + '\n', {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson',
      'x-row-count': String(data.length),
      'content-disposition': `attachment; filename="pbt-rag-${Date.now()}.jsonl"`,
    },
  });
});
