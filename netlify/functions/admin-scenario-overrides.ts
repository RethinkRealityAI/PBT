/**
 * Admin: read + write scenario overrides.
 *
 *   GET  /admin-scenario-overrides          → all rows
 *   POST /admin-scenario-overrides          → upsert one row
 *   POST /admin-scenario-overrides?op=delete → delete by scenario_id
 *
 * Bounded AI overrides: prompt_prefix / prompt_suffix are length-capped at
 * 1500 chars each (also enforced by the migration). The canonical customer
 * prompt + scoring rubric remain authoritative — these wrap the customer
 * turn only.
 */
import { errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';

interface OverrideUpsert {
  scenario_id: string;
  visible?: boolean;
  sort_order?: number | null;
  title_override?: string | null;
  context_override?: string | null;
  opening_line_override?: string | null;
  difficulty_override?: number | null;
  persona_override?: string | null;
  prompt_prefix?: string | null;
  prompt_suffix?: string | null;
}

const MAX_PROMPT_LEN = 1500;

function validateOverride(o: OverrideUpsert): string | null {
  if (!o.scenario_id || typeof o.scenario_id !== 'string') return 'scenario_id required';
  if (o.prompt_prefix && o.prompt_prefix.length > MAX_PROMPT_LEN)
    return `prompt_prefix too long (max ${MAX_PROMPT_LEN})`;
  if (o.prompt_suffix && o.prompt_suffix.length > MAX_PROMPT_LEN)
    return `prompt_suffix too long (max ${MAX_PROMPT_LEN})`;
  if (
    o.difficulty_override != null &&
    (o.difficulty_override < 1 || o.difficulty_override > 4)
  )
    return 'difficulty_override must be 1–4';
  return null;
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const { data, error } = await ctx.sb
      .from('scenario_overrides')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) return errorResponse(500, error.message);
    return jsonResponse(data ?? []);
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  const op = new URL(req.url).searchParams.get('op') ?? 'upsert';
  let body: OverrideUpsert;
  try {
    body = (await req.json()) as OverrideUpsert;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  if (op === 'delete') {
    const before = (
      await ctx.sb
        .from('scenario_overrides')
        .select('*')
        .eq('scenario_id', body.scenario_id)
        .maybeSingle()
    ).data;
    const { error } = await ctx.sb
      .from('scenario_overrides')
      .delete()
      .eq('scenario_id', body.scenario_id);
    if (error) return errorResponse(500, error.message);
    await writeAuditLog(ctx, {
      entity_type: 'scenario_override',
      entity_id: body.scenario_id,
      action: 'delete',
      before,
    });
    return jsonResponse({ ok: true });
  }

  const invalid = validateOverride(body);
  if (invalid) return errorResponse(400, invalid);

  const before = (
    await ctx.sb
      .from('scenario_overrides')
      .select('*')
      .eq('scenario_id', body.scenario_id)
      .maybeSingle()
  ).data;
  const { data, error } = await ctx.sb
    .from('scenario_overrides')
    .upsert({ ...body, updated_by: ctx.user.id })
    .select('*')
    .maybeSingle();
  if (error) return errorResponse(500, error.message);
  await writeAuditLog(ctx, {
    entity_type: 'scenario_override',
    entity_id: body.scenario_id,
    action: before ? 'update' : 'create',
    before,
    after: data,
  });
  return jsonResponse(data);
};
