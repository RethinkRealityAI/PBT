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
 *
 * Species (dog / cat) — `scenario_overrides.species`, migration
 * 20260925000000_scenario_species.sql (applied to production 2026-09-27).
 * The degrade path is kept for a project that has not run it: a write that
 * carries `species` fails at PostgREST with "column not found"; instead of
 * failing the admin's save, the upsert / duplicate is retried ONCE without
 * `species` and — when a species (dog or cat) was actually requested — the
 * response is the saved row plus
 *
 *   "_notice": "species_column_missing"
 *
 * (a non-column key the Studio shows as "saved — species not stored yet").
 * The scenario then runs exactly as it did before species existed: a dog.
 * Any other database error is unchanged (500).
 *
 * Concurrency: a save may carry `baseUpdatedAt` — the row's `updated_at` as
 * the editor last saw it. When it no longer matches, the save is refused
 * with 409 `{ code: 'stale', current }` so the editor can re-apply the
 * admin's own edits on top of the row that won, instead of two admins
 * silently overwriting each other whole-row (library saves write NULL for
 * every field equal to the seed, so the loser's edits used to vanish).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { can, errorResponse, jsonResponse, requireAdmin, writeAuditLog } from './_shared/admin';
import { isMissingSpeciesColumn } from './_shared/speciesColumn';
import { isFocusAreaKey } from '../../src/shared/knowledge/focusAreas';
import { isLifeStage, isPersona, isPushbackId } from '../../src/shared/scenarios/enums';
import { SCENARIO_LIMITS } from '../../src/shared/scenarios/limits';
import { isScenarioSpecies } from '../../src/shared/scenarios/species';

/** Request bodies are small rows; anything bigger is not a scenario. */
const MAX_BODY_BYTES = 64 * 1024;

export interface OverrideUpsert {
  scenario_id: string;
  /**
   * Optimistic-concurrency token: the row's `updated_at` the editor loaded
   * (`null` = "there was no row"). Not a column — never written. Omit to
   * skip the check (older clients).
   */
  baseUpdatedAt?: string | null;
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
  /** 'dog' | 'cat' | null (null = dog). See the header for the degrade path. */
  species?: string | null;
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
  'species',
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

// One source for every cap: src/shared/scenarios/limits.ts (the Studio counts
// against the same numbers while the admin types).
const MAX_PROMPT_LEN = SCENARIO_LIMITS.promptMax;
const MAX_KNOWLEDGE_SLUGS = SCENARIO_LIMITS.knowledgeSlugsMax;
const MAX_SLUG_LEN = SCENARIO_LIMITS.knowledgeSlugLenMax;
/** Body weight sanity window, kg. Open interval — 0 is not a weight. */
const MAX_WEIGHT_KG = SCENARIO_LIMITS.weightMaxKg;
const DRIVERS = ['Activator', 'Energizer', 'Analyzer', 'Harmonizer'];

/** Every text column and its cap. Card fields are also DB CHECKs. */
const TEXT_CAPS: ReadonlyArray<readonly [keyof OverrideUpsert, number]> = [
  ['prompt_prefix', MAX_PROMPT_LEN],
  ['prompt_suffix', MAX_PROMPT_LEN],
  ['card_title_override', SCENARIO_LIMITS.cardTitleMax],
  ['card_subtitle_override', SCENARIO_LIMITS.cardSubtitleMax],
  ['info_modal_title', SCENARIO_LIMITS.infoTitleMax],
  ['info_modal_body', SCENARIO_LIMITS.infoBodyMax],
  ['start_button_label', SCENARIO_LIMITS.startButtonMax],
  ['title_override', SCENARIO_LIMITS.titleMax],
  ['context_override', SCENARIO_LIMITS.contextMax],
  ['opening_line_override', SCENARIO_LIMITS.openingLineMax],
  ['pushback_notes', SCENARIO_LIMITS.pushbackNotesMax],
  ['breed', SCENARIO_LIMITS.breedMax],
];

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
  if (o.visible != null && typeof o.visible !== 'boolean') return 'visible must be true or false';
  if (o.sort_order != null) {
    if (
      typeof o.sort_order !== 'number' ||
      !Number.isInteger(o.sort_order) ||
      Math.abs(o.sort_order) > SCENARIO_LIMITS.sortOrderMax
    ) {
      return `sort_order must be a whole number within ±${SCENARIO_LIMITS.sortOrderMax}`;
    }
  }
  // Every text column: a string (a number here used to 500 at the database)
  // and within its cap.
  for (const [field, max] of TEXT_CAPS) {
    const v = o[field];
    if (v == null) continue;
    if (typeof v !== 'string') return `${field} must be text`;
    if (v.length > max) return `${field} too long (max ${max})`;
  }
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
  // "Something else" only works when the owner knows what they object to —
  // the notes ARE the pushback. The Studio blocks this client-side; the
  // server must too, or an API caller publishes an owner with nothing to say.
  if (o.pushback_id === 'custom' && !(typeof o.pushback_notes === 'string' && o.pushback_notes.trim()))
    return 'a custom pushback needs pushback_notes — what the owner is objecting to';
  if (o.life_stage != null && !isLifeStage(o.life_stage))
    return 'life_stage must be a known life stage';
  if (o.persona_override != null && !isPersona(o.persona_override))
    return 'persona_override must be a known persona';
  // Species switches the prompt wording and the knowledge scope; null / absent
  // means dog (every legacy row), so only the two real values are storable.
  if (o.species != null && !isScenarioSpecies(o.species))
    return 'species must be dog or cat';
  if (o.weight_kg != null) {
    if (typeof o.weight_kg !== 'number' || !Number.isFinite(o.weight_kg))
      return 'weight_kg must be a number';
    if (o.weight_kg <= 0 || o.weight_kg > MAX_WEIGHT_KG)
      return `weight_kg must be between 0 and ${MAX_WEIGHT_KG}`;
  }
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

/** Response key + value when a save had to drop `species` (see the header). */
export const SPECIES_NOTICE_KEY = '_notice';
export const SPECIES_COLUMN_MISSING = 'species_column_missing';

type DbError = { code?: string; message?: string } | null;

export { isMissingSpeciesColumn };

/**
 * Write one override row. For a row that already exists this is an UPDATE
 * guarded by `deleted_at is null`, so a soft-delete that lands between the
 * handler's read and its write cannot be overwritten (`conflict: true` — no
 * row matched); a brand-new id is an upsert.
 *
 * If the `species` column is missing (a project that has not run
 * 20260925000000_scenario_species.sql), the SAME write is retried without
 * it. Only retried when the payload actually carried a `species` key.
 * `speciesDropped` (→ the notice) is true when the admin asked for a species
 * (dog or cat) that could not be stored; a `species: null` dropped the same
 * way loses nothing (null already means dog), so it saves silently.
 */
export async function upsertOverrideRow(
  sb: SupabaseClient,
  payload: Record<string, unknown>,
  options: { existing?: boolean } = {},
): Promise<{ data: unknown; error: DbError; speciesDropped: boolean; conflict: boolean }> {
  const write = (row: Record<string, unknown>) => {
    if (options.existing) {
      // The same payload as the upsert path (the primary key set to itself is
      // a no-op), so both paths carry identical column sets.
      return sb
        .from('scenario_overrides')
        .update(row)
        .eq('scenario_id', row.scenario_id as string)
        .is('deleted_at', null)
        .select('*')
        .maybeSingle();
    }
    return sb.from('scenario_overrides').upsert(row).select('*').maybeSingle();
  };
  const first = await write(payload);
  if (!first.error || !('species' in payload) || !isMissingSpeciesColumn(first.error)) {
    return {
      data: first.data,
      error: first.error,
      speciesDropped: false,
      conflict: Boolean(options.existing && !first.error && !first.data),
    };
  }
  console.warn(
    '[admin-scenario-overrides] species column missing — apply 20260925000000_scenario_species.sql; saving without it',
  );
  const { species: requestedSpecies, ...withoutSpecies } = payload;
  const retry = await write(withoutSpecies);
  return {
    data: retry.data,
    error: retry.error,
    speciesDropped: !retry.error && Boolean(retry.data) && requestedSpecies != null,
    conflict: Boolean(options.existing && !retry.error && !retry.data),
  };
}

const DELETED_MESSAGE =
  'This scenario was deleted. Ask an admin to restore it from Audit → Revert, or use Duplicate to save your version as a new scenario.';

/** The saved row, plus the notice when `species` could not be stored. */
function savedResponse(data: unknown, speciesDropped: boolean): Response {
  if (!speciesDropped) return jsonResponse(data);
  const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return jsonResponse({ ...row, [SPECIES_NOTICE_KEY]: SPECIES_COLUMN_MISSING });
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'scenarios.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    // `?op=capabilities` — what this database can store. Today: whether the
    // `species` column exists (it does in production since 2026-09-27; a
    // project that has not run the migration answers false), so the Studio
    // can refuse to publish a cat scenario that would reach trainees as a
    // dog (and say why) BEFORE a save, and keep saying it after a reload.
    if (new URL(req.url).searchParams.get('op') === 'capabilities') {
      const probe = await ctx.sb.from('scenario_overrides').select('species').limit(1);
      if (probe.error && !isMissingSpeciesColumn(probe.error)) {
        return errorResponse(500, probe.error.message);
      }
      return jsonResponse({ species: !probe.error });
    }
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
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return errorResponse(413, 'Request too large');
    body = JSON.parse(text) as OverrideUpsert;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }
  if (!body || typeof body !== 'object' || typeof body.scenario_id !== 'string' || !body.scenario_id) {
    return errorResponse(400, 'scenario_id required');
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
    // Identity and timestamps are the copy's own, never the source's.
    const {
      scenario_id: _sid,
      updated_at: _ua,
      updated_by: _ub,
      created_at: _ca,
      ...rest
    } = src as Record<string, unknown>;
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
    const { data, error, speciesDropped } = await upsertOverrideRow(ctx.sb, payload);
    if (error) return errorResponse(500, error.message ?? 'Database error');
    await writeAuditLog(ctx, {
      entity_type: 'scenario_override',
      entity_id: newId,
      action: 'create',
      after: data,
      note: `Duplicated from ${body.scenario_id}`,
    });
    return savedResponse(data, speciesDropped);
  }

  const invalid = validateOverride(body);
  if (invalid) return errorResponse(400, invalid);

  const before = (
    await ctx.sb
      .from('scenario_overrides')
      .select('*')
      .eq('scenario_id', body.scenario_id)
      .maybeSingle()
  ).data as (Record<string, unknown> & { deleted_at?: string | null; updated_at?: string | null }) | null;
  // A soft-deleted admin scenario is a tombstone kept for Audit → Revert.
  // Writing over it would leave `deleted_at` set (it is not writable), so
  // the save would "succeed" while the scenario stayed invisible to everyone
  // — e.g. a draft resumed in one browser after another admin deleted it.
  // Say so instead; restoring is Audit's job, or the admin saves a copy.
  if (before?.deleted_at) return errorResponse(409, DELETED_MESSAGE);
  // Optimistic concurrency (see the header). `null` means the editor saw no
  // row; any mismatch means someone else saved since — including creating a
  // row for a library scenario that had none.
  if (body.baseUpdatedAt !== undefined) {
    const current = before?.updated_at ?? null;
    if ((body.baseUpdatedAt ?? null) !== current) {
      return jsonResponse(
        {
          error:
            'Someone else saved this scenario after you opened it. Your edits are still here — they have been re-applied on top of the latest version; review and save again.',
          code: 'stale',
          current: before ?? null,
        },
        { status: 409 },
      );
    }
  }
  const isNewAdmin =
    body.scenario_id.startsWith('admin:') && (!before || before.created_by == null);
  const { data, error, speciesDropped, conflict } = await upsertOverrideRow(
    ctx.sb,
    {
      ...pickWritable(body),
      updated_by: ctx.user.id,
      ...(isNewAdmin ? { created_by: ctx.user.id } : {}),
    },
    { existing: Boolean(before) },
  );
  if (error) return errorResponse(500, error.message ?? 'Database error');
  // The row was soft-deleted between our read and our write.
  if (conflict) return errorResponse(409, DELETED_MESSAGE);
  await writeAuditLog(ctx, {
    entity_type: 'scenario_override',
    entity_id: body.scenario_id,
    action: before ? 'update' : 'create',
    before,
    after: data,
  });
  return savedResponse(data, speciesDropped);
};
