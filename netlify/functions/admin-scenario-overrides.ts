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
import { can, errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';
import { isFocusAreaKey } from '../../src/shared/knowledge/focusAreas';
import { isLifeStage, isPersona, isPushbackId } from '../../src/shared/scenarios/enums';

export interface OverrideUpsert {
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
  // Knowledge & focus — restrict what RAG retrieval may draw on.
  focus_area?: string | null;
  knowledge_slugs?: string[] | null;
}

/**
 * Columns a client may write. Everything else on the row (created_by,
 * updated_by, deleted_at, timestamps) is server-owned — the upsert used to
 * spread the whole request body, which let a crafted payload clobber them.
 */
const WRITABLE_COLUMNS = [
  'scenario_id',
  'visible',
  'sort_order',
  'title_override',
  'context_override',
  'opening_line_override',
  'difficulty_override',
  'persona_override',
  'prompt_prefix',
  'prompt_suffix',
  'card_title_override',
  'card_subtitle_override',
  'info_modal_title',
  'info_modal_body',
  'start_button_label',
  'card_driver_override',
  'breed',
  'life_stage',
  'pushback_id',
  'pushback_notes',
  'suggested_driver',
  'weight_kg',
  'focus_area',
  'knowledge_slugs',
] as const satisfies readonly (keyof OverrideUpsert)[];

export function pickWritable(body: OverrideUpsert): Record<string, unknown> {
  const src = body as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of WRITABLE_COLUMNS) {
    if (key in src) out[key] = src[key];
  }
  return out;
}

const MAX_PROMPT_LEN = 1500;
const MAX_KNOWLEDGE_SLUGS = 40;
const MAX_SLUG_LEN = 200;
const MAX_CARD_TITLE_LEN = 120;
const MAX_CARD_SUBTITLE_LEN = 240;
const MAX_INFO_BODY_LEN = 4000;
const MAX_START_BTN_LEN = 40;
const MAX_BREED_LEN = 80;
/** Body weight sanity window, kg. Open interval — 0 is not a weight. */
const MAX_WEIGHT_KG = 200;
const DRIVERS = ['Activator', 'Energizer', 'Analyzer', 'Harmonizer'];

/**
 * @param options.requireAdminFields — admin-authored scenarios normally must
 * carry enough fields to run the customer prompt. A duplicate is created
 * hidden (`visible: false`) and is edited before it can go live, so the
 * duplicate path validates everything EXCEPT that completeness rule.
 */
export function validateOverride(
  o: OverrideUpsert,
  options: { requireAdminFields?: boolean } = {},
): string | null {
  const { requireAdminFields = true } = options;
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
  if (o.focus_area != null && !isFocusAreaKey(o.focus_area))
    return 'focus_area must be a known focus area key';
  // Scenario-defining enums. These are interpolated into the customer prompt
  // (and pushback_id keys into the taxonomy), so an unrecognised value doesn't
  // fail loudly — it quietly produces a degraded roleplay. Reject at the door.
  if (o.pushback_id != null && !isPushbackId(o.pushback_id))
    return 'pushback_id must be a known pushback category';
  if (o.life_stage != null && !isLifeStage(o.life_stage))
    return 'life_stage must be a known life stage';
  if (o.persona_override != null && !isPersona(o.persona_override))
    return 'persona_override must be a known persona';
  if (o.weight_kg != null) {
    if (typeof o.weight_kg !== 'number' || !Number.isFinite(o.weight_kg))
      return 'weight_kg must be a number';
    if (o.weight_kg <= 0 || o.weight_kg > MAX_WEIGHT_KG)
      return `weight_kg must be between 0 and ${MAX_WEIGHT_KG}`;
  }
  if (o.breed != null && o.breed.length > MAX_BREED_LEN)
    return `breed too long (max ${MAX_BREED_LEN})`;
  if (o.knowledge_slugs != null) {
    if (!Array.isArray(o.knowledge_slugs)) return 'knowledge_slugs must be an array';
    if (o.knowledge_slugs.length > MAX_KNOWLEDGE_SLUGS)
      return `knowledge_slugs too long (max ${MAX_KNOWLEDGE_SLUGS})`;
    for (const slug of o.knowledge_slugs) {
      if (typeof slug !== 'string' || slug.length > MAX_SLUG_LEN)
        return `knowledge_slugs entries must be strings of ≤ ${MAX_SLUG_LEN} chars`;
    }
  }
  // For admin-authored scenarios we require enough fields to actually run
  // the AI customer prompt — otherwise the consumer would render a broken
  // scenario.
  if (requireAdminFields && o.scenario_id.startsWith('admin:')) {
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
  const ctx = await requireAdmin(req, 'scenarios.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    // Match the consumer's flags-resolve filter: soft-deleted admin
    // scenarios are tombstones, not part of the live library. Without
    // this, the Scenario Builder list would show admin-authored
    // scenarios that the admin had already deleted — they're still
    // physically present so audit-log revert can resurrect them.
    const { data, error } = await ctx.sb
      .from('scenario_overrides')
      .select('*')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false });
    if (error) return errorResponse(500, error.message);
    return jsonResponse(data ?? []);
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');
  if (!can(ctx, 'scenarios.write')) return errorResponse(403, 'Missing permission: scenarios.write');

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
    // Only admin-authored rows are self-contained. A seed/user override row is
    // a sparse overlay on a base scenario that lives in code (or in
    // user_scenarios) — copying just the overlay would produce a hollow
    // scenario missing everything the base supplied.
    if (!body.scenario_id?.startsWith('admin:')) {
      return errorResponse(
        400,
        'Duplicate library/user scenarios from the editor (it copies the full scenario)',
      );
    }
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
    // `??` binds tighter than `?:`, so the old expression was
    // `(x ?? null) ? … : …` — a truthiness test wearing a nullish-coalescing
    // costume. Same result here, but it now says what it means.
    const srcCardTitle = rest.card_title_override as string | null;
    const payload = {
      ...rest,
      scenario_id: newId,
      visible: false,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
      deleted_at: null,
      card_title_override: srcCardTitle ? `${srcCardTitle} (copy)` : 'Copy of scenario',
    };
    // The copy is hidden, so the "admin scenarios need every field" rule
    // doesn't apply — but its column VALUES must still be legal, or a bad row
    // stored before this validation existed would clone itself forward.
    const invalidCopy = validateOverride(payload as unknown as OverrideUpsert, {
      requireAdminFields: false,
    });
    if (invalidCopy) return errorResponse(400, `Cannot duplicate: ${invalidCopy}`);
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
      ...pickWritable(body),
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
