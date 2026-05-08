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
  // Card-level
  card_title_override?: string | null;
  card_subtitle_override?: string | null;
  info_modal_title?: string | null;
  info_modal_body?: string | null;
  start_button_label?: string | null;
  card_driver_override?: string | null;
  // Scenario-defining (required for admin:<uuid> ids)
  breed?: string | null;
  life_stage?: string | null;
  pushback_id?: string | null;
  pushback_notes?: string | null;
  suggested_driver?: string | null;
  weight_kg?: number | null;
}

const MAX_PROMPT_LEN = 1500;
const MAX_CARD_TITLE_LEN = 120;
const MAX_CARD_SUBTITLE_LEN = 240;
const MAX_INFO_BODY_LEN = 4000;
const MAX_START_BTN_LEN = 40;
const DRIVERS = ['Activator', 'Energizer', 'Analyzer', 'Harmonizer'];

function validateOverride(o: OverrideUpsert): string | null {
  if (!o.scenario_id || typeof o.scenario_id !== 'string') return 'scenario_id required';
  if (o.prompt_prefix && o.prompt_prefix.length > MAX_PROMPT_LEN)
    return `prompt_prefix too long (max ${MAX_PROMPT_LEN})`;
  if (o.prompt_suffix && o.prompt_suffix.length > MAX_PROMPT_LEN)
    return `prompt_suffix too long (max ${MAX_PROMPT_LEN})`;
  if (o.card_title_override && o.card_title_override.length > MAX_CARD_TITLE_LEN)
    return `card_title_override too long (max ${MAX_CARD_TITLE_LEN})`;
  if (o.card_subtitle_override && o.card_subtitle_override.length > MAX_CARD_SUBTITLE_LEN)
    return `card_subtitle_override too long (max ${MAX_CARD_SUBTITLE_LEN})`;
  if (o.info_modal_body && o.info_modal_body.length > MAX_INFO_BODY_LEN)
    return `info_modal_body too long (max ${MAX_INFO_BODY_LEN})`;
  if (o.start_button_label && o.start_button_label.length > MAX_START_BTN_LEN)
    return `start_button_label too long (max ${MAX_START_BTN_LEN})`;
  if (o.card_driver_override && !DRIVERS.includes(o.card_driver_override))
    return 'card_driver_override must be a known driver';
  if (o.suggested_driver && !DRIVERS.includes(o.suggested_driver))
    return 'suggested_driver must be a known driver';
  if (
    o.difficulty_override != null &&
    (o.difficulty_override < 1 || o.difficulty_override > 4)
  )
    return 'difficulty_override must be 1–4';
  // For admin-authored scenarios we require enough fields to actually run
  // the AI customer prompt — otherwise the consumer would render a broken
  // scenario.
  if (o.scenario_id.startsWith('admin:')) {
    const required: Array<[keyof OverrideUpsert, string]> = [
      ['breed', 'breed'],
      ['life_stage', 'life_stage'],
      ['pushback_id', 'pushback_id'],
      ['suggested_driver', 'suggested_driver'],
    ];
    for (const [field, label] of required) {
      const val = o[field];
      if (val == null || (typeof val === 'string' && val.trim() === '')) {
        return `admin scenarios require ${label}`;
      }
    }
  }
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
    // Admin-authored scenarios soft-delete (so audit revert can resurrect
    // them); seed/user override rows hard-delete (the base scenario remains
    // in code/Supabase, only the overlay is removed).
    if (body.scenario_id.startsWith('admin:')) {
      const { error } = await ctx.sb
        .from('scenario_overrides')
        .update({ deleted_at: new Date().toISOString(), updated_by: ctx.user.id })
        .eq('scenario_id', body.scenario_id);
      if (error) return errorResponse(500, error.message);
    } else {
      const { error } = await ctx.sb
        .from('scenario_overrides')
        .delete()
        .eq('scenario_id', body.scenario_id);
      if (error) return errorResponse(500, error.message);
    }
    await writeAuditLog(ctx, {
      entity_type: 'scenario_override',
      entity_id: body.scenario_id,
      action: 'delete',
      before,
    });
    return jsonResponse({ ok: true });
  }

  if (op === 'duplicate') {
    const src = (
      await ctx.sb
        .from('scenario_overrides')
        .select('*')
        .eq('scenario_id', body.scenario_id)
        .maybeSingle()
    ).data;
    if (!src) return errorResponse(404, 'Source scenario not found');
    const { scenario_id: _sid, updated_at: _ua, updated_by: _ub, ...rest } = src as Record<
      string,
      unknown
    >;
    const newId = `admin:${crypto.randomUUID()}`;
    const payload = {
      ...rest,
      scenario_id: newId,
      visible: false,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
      deleted_at: null,
      card_title_override:
        (rest.card_title_override as string | null) ?? null
          ? `${rest.card_title_override} (copy)`
          : 'Copy of scenario',
    };
    const { data, error } = await ctx.sb
      .from('scenario_overrides')
      .upsert(payload)
      .select('*')
      .maybeSingle();
    if (error) return errorResponse(500, error.message);
    await writeAuditLog(ctx, {
      entity_type: 'scenario_override',
      entity_id: newId,
      action: 'create',
      after: data,
      note: `Duplicated from ${body.scenario_id}`,
    });
    return jsonResponse(data);
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
  const isNewAdmin =
    body.scenario_id.startsWith('admin:') && (!before || before.created_by == null);
  const { data, error } = await ctx.sb
    .from('scenario_overrides')
    .upsert({
      ...body,
      updated_by: ctx.user.id,
      ...(isNewAdmin ? { created_by: ctx.user.id } : {}),
    })
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
