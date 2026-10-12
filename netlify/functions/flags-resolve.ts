/**
 * Public flag-resolve endpoint.
 *
 * Consumer apps (anonymous + authed) POST a small audience descriptor and
 * receive a `{ flagKey: value }` map for every registered flag, plus any
 * scenario_overrides keyed by scenario_id, the team-authored objections
 * (`objections`, see `loadPublicObjections`) and the stored objection
 * categories (`objectionCategories`, see `loadPublicCategories` — the team's
 * own plus admin edits of the built-ins; clients merge them with the code's
 * built-ins via `mergeCategories`).
 *
 * Caching: in-function memoization keyed by (audience hash). TTL 60s. The
 * function itself reads with the service role; no JWT required from the
 * caller (resolved values are not sensitive — they're effectively
 * public configuration the consumer would receive anyway).
 *
 * Audience matching for a rule (all keys AND-ed; arrays are OR within):
 *   drivers          — caller's primary driver matches
 *   user_ids         — caller's auth user id matches
 *   anon_session_ids — caller's pbt:session_id matches
 *   percentage       — sticky bucket (hash session id) < percentage
 *   clinic_ids       — reserved (Phase 5)
 *
 * Highest-priority enabled rule whose audience matches wins. If none match,
 * the flag's default_value is returned.
 */
import { errorResponse, getServiceClient, jsonResponse } from './_shared/admin';
import { isMissingSpeciesColumn } from './_shared/speciesColumn';
import {
  readCategories,
  readTeamObjections,
  type CategoriesRead,
  type TeamObjectionsRead,
} from './_shared/objectionsStore';
import { triggerKnowledgeSync, type NetlifyContextLike } from './_shared/knowledgeTrigger';
import type { TeamObjection } from '../../src/shared/scenarios/objections';
import type { ObjectionCategory } from '../../src/shared/scenarios/objectionCategories';

const CACHE_TTL_MS = 60_000;

interface AudienceInput {
  user_id?: string | null;
  anon_session_id?: string | null;
  driver?: string | null;
  clinic_id?: string | null;
  preview?: boolean;
}

interface FlagRow {
  key: string;
  default_value: unknown;
  value_type: string;
}

interface RuleRow {
  id: string;
  flag_key: string;
  priority: number;
  audience: Record<string, unknown>;
  value: unknown;
  enabled: boolean;
}

interface OverrideRow {
  scenario_id: string;
  visible: boolean;
  sort_order: number | null;
  title_override: string | null;
  context_override: string | null;
  opening_line_override: string | null;
  difficulty_override: number | null;
  persona_override: string | null;
  prompt_prefix: string | null;
  prompt_suffix: string | null;
  card_title_override: string | null;
  card_subtitle_override: string | null;
  info_modal_title: string | null;
  info_modal_body: string | null;
  start_button_label: string | null;
  card_driver_override: string | null;
  breed: string | null;
  life_stage: string | null;
  pushback_id: string | null;
  pushback_notes: string | null;
  suggested_driver: string | null;
  weight_kg: number | null;
  /** 'dog' | 'cat' — present once 20260925000000_scenario_species.sql is applied. */
  species?: string | null;
}

interface ResolvedSnapshot {
  flags: Record<string, unknown>;
  scenarioOverrides: OverrideRow[];
  simulationConfig: Record<string, unknown> | null;
  /** Team-authored objections (non-deleted; retired ones with visible:false). */
  objections: TeamObjection[];
  /** Stored objection categories (non-deleted). */
  objectionCategories: ObjectionCategory[];
  fetchedAt: number;
}

let snapshotCache: { value: ResolvedSnapshot; expiresAt: number } | null = null;

/**
 * Columns the snapshot wants, and the subset that predates the August
 * scenario↔knowledge migration.
 *
 * A deploy can land before its migration is applied (they're hand-run — see
 * CLAUDE.md). Selecting a column that doesn't exist yet fails the WHOLE
 * select, which would take the public flag snapshot down for every consumer
 * over two optional scenario fields. So: try the full list, and on any error
 * retry once with the pre-migration list before giving up.
 */
const OVERRIDE_COLUMNS_BASE =
  'scenario_id, visible, sort_order, title_override, context_override, opening_line_override, difficulty_override, persona_override, prompt_prefix, prompt_suffix, card_title_override, card_subtitle_override, info_modal_title, info_modal_body, start_button_label, card_driver_override, breed, life_stage, pushback_id, pushback_notes, suggested_driver, weight_kg';
const OVERRIDE_COLUMNS_FULL = `${OVERRIDE_COLUMNS_BASE}, focus_area, knowledge_slugs`;
/**
 * Scenario Studio's `species` (dog | cat) column arrived with migration
 * 20260925000000_scenario_species.sql (applied to production 2026-09-27; a
 * project that has not run it must still boot). It is tried first and dropped on
 * failure WITHOUT losing focus_area/knowledge_slugs — folding it into FULL
 * would have sent a pre-migration deploy all the way down to BASE.
 */
const OVERRIDE_COLUMNS_WITH_SPECIES = `${OVERRIDE_COLUMNS_FULL}, species`;

/**
 * Once the species select has failed, skip it for a while instead of paying
 * a failed query on every snapshot load; re-probe periodically so applying
 * the migration takes effect without a redeploy.
 */
const SPECIES_REPROBE_MS = 10 * 60_000;
let speciesSelectFailedAt = 0;

/** Test hook: forget a remembered species-select failure. */
export function resetSpeciesProbe(): void {
  speciesSelectFailedAt = 0;
}

type OverrideSelect = (columns: string) => PromiseLike<{ data: unknown; error: unknown }>;

/**
 * Load override rows with the richest column list the database supports:
 * species → full (focus/knowledge) → base. Throws only when even the base
 * select fails.
 */
export async function selectOverrideRows(select: OverrideSelect, now = Date.now()): Promise<unknown> {
  if (now - speciesSelectFailedAt >= SPECIES_REPROBE_MS) {
    const withSpecies = await select(OVERRIDE_COLUMNS_WITH_SPECIES);
    if (!withSpecies.error) return withSpecies.data;
    // Only a genuinely missing column is remembered. A transient failure
    // (timeout, blip) must not serve every cat scenario as a dog for the
    // next ten minutes — it just falls through for this one load.
    if (isMissingSpeciesColumn(withSpecies.error)) speciesSelectFailedAt = now;
    console.warn(
      '[flags-resolve] scenario_overrides select with species failed (migration pending?), retrying without it',
      withSpecies.error,
    );
  }
  const full = await select(OVERRIDE_COLUMNS_FULL);
  if (!full.error) return full.data;
  console.warn(
    '[flags-resolve] scenario_overrides full select failed, retrying without focus_area/knowledge_slugs',
    full.error,
  );
  const base = await select(OVERRIDE_COLUMNS_BASE);
  if (base.error) throw full.error;
  return base.data;
}

/**
 * Team-authored objections (`scenario_objections`, migration
 * 20261012000000_scenario_objections.sql — hand-run, so a deploy may land
 * first). Like the species column: a genuinely MISSING table is remembered
 * for ten minutes (no failed query on every snapshot load, and applying the
 * migration takes effect without a redeploy); a transient error is not
 * remembered and serves the last good list, so one blip cannot make every
 * scenario built on a team objection vanish for a cache period.
 */
const OBJECTIONS_REPROBE_MS = 10 * 60_000;
let objectionsTableMissingAt: number | null = null;
let lastGoodObjections: TeamObjection[] = [];
/** True once this instance has read the table successfully at least once. */
let hadGoodObjectionsRead = false;
/**
 * True when the LAST read failed transiently on an instance that has never
 * read the table successfully: the "last good list" it served is just the
 * empty initial value, not the team's objections. A snapshot built on that
 * must not be cached — every scenario on a team objection would vanish from
 * every trainee app for the cache window (60 s here, up to 5 minutes in the
 * browser), and a library scenario re-pointed at one would be hidden.
 */
let objectionsDegraded = false;

/** See `objectionsDegraded`. */
export function objectionsReadDegraded(): boolean {
  return objectionsDegraded;
}

/**
 * What a team objection may say in PUBLIC. The snapshot is anonymous and
 * cached, so it carries only what the trainee app renders: the three hint
 * lists. `rootConcerns` (what the AI owner hides until asked — the answer
 * key, like the admin's AI notes) and `watchOuts` stay server-side; the AI
 * functions read them from the database (`_shared/ai.ts`).
 */
export function publicObjection(o: TeamObjection): TeamObjection {
  const { acknowledgePatterns, clarifyQuestions, takeActionPatterns } = o.coaching;
  return {
    ...o,
    coaching: {
      ...(acknowledgePatterns ? { acknowledgePatterns } : {}),
      ...(clarifyQuestions ? { clarifyQuestions } : {}),
      ...(takeActionPatterns ? { takeActionPatterns } : {}),
    },
  };
}

/** Test hook: forget a remembered missing table and the last good list. */
export function resetObjectionsProbe(): void {
  objectionsTableMissingAt = null;
  lastGoodObjections = [];
  hadGoodObjectionsRead = false;
  objectionsDegraded = false;
}

/**
 * The objections the snapshot publishes: every non-deleted one, retired
 * included (the consumer needs them to RESOLVE a saved scenario; its pickers
 * hide `visible: false`). Rows go through `rowToTeamObjection`, so only the
 * public shape leaves — never `created_by` / `updated_by`. Never throws: the
 * snapshot must not go down over an optional feature.
 */
export async function loadPublicObjections(
  read: () => Promise<TeamObjectionsRead>,
  now = Date.now(),
): Promise<TeamObjection[]> {
  if (objectionsTableMissingAt !== null && now - objectionsTableMissingAt < OBJECTIONS_REPROBE_MS) {
    objectionsDegraded = false;
    return [];
  }
  const res = await read();
  if (!res.error) {
    objectionsTableMissingAt = null;
    hadGoodObjectionsRead = true;
    objectionsDegraded = false;
    lastGoodObjections = res.objections.map(publicObjection);
    return lastGoodObjections;
  }
  if (res.missing) {
    objectionsTableMissingAt = now;
    objectionsDegraded = false;
    lastGoodObjections = [];
    console.warn(
      '[flags-resolve] scenario_objections missing — apply 20261012000000_scenario_objections.sql; serving built-in objections only',
    );
    return [];
  }
  console.warn('[flags-resolve] scenario_objections fetch failed; serving the last good list', res.error);
  objectionsDegraded = !hadGoodObjectionsRead;
  return lastGoodObjections;
}

/**
 * Objection categories (`scenario_objection_categories`, same migration) —
 * the same degrade rules as the objections, with their own state: a MISSING
 * table is remembered for ten minutes (none: the built-in categories, with
 * no knowledge attached, which is how every scenario retrieved before
 * categories existed); a transient error serves the last good list, and on
 * an instance that never read one it degrades the snapshot (served
 * `no-store`, not cached) — a category's knowledge would otherwise silently
 * vanish from every trainee's provenance retrieval for a cache period.
 */
let categoriesTableMissingAt: number | null = null;
let lastGoodCategories: ObjectionCategory[] = [];
let hadGoodCategoriesRead = false;
let categoriesDegraded = false;

/** The last categories load fell back to an empty list it never read. */
export function categoriesReadDegraded(): boolean {
  return categoriesDegraded;
}

/**
 * Either half of the objection catalogue was built on a failed COLD read:
 * the snapshot is served but never cached (here or by the browser).
 */
export function catalogueReadDegraded(): boolean {
  return objectionsDegraded || categoriesDegraded;
}

/** Test hook: forget a remembered missing categories table and the last good list. */
export function resetCategoriesProbe(): void {
  categoriesTableMissingAt = null;
  lastGoodCategories = [];
  hadGoodCategoriesRead = false;
  categoriesDegraded = false;
}

/**
 * The stored categories the snapshot publishes: every non-deleted row, in
 * the public `ObjectionCategory` shape (`rowToCategory` — never `created_by`
 * / `updated_by`). Never throws.
 */
export async function loadPublicCategories(
  read: () => Promise<CategoriesRead>,
  now = Date.now(),
): Promise<ObjectionCategory[]> {
  if (categoriesTableMissingAt !== null && now - categoriesTableMissingAt < OBJECTIONS_REPROBE_MS) {
    categoriesDegraded = false;
    return [];
  }
  const res = await read();
  if (!res.error) {
    categoriesTableMissingAt = null;
    hadGoodCategoriesRead = true;
    categoriesDegraded = false;
    lastGoodCategories = res.categories;
    return lastGoodCategories;
  }
  if (res.missing) {
    categoriesTableMissingAt = now;
    categoriesDegraded = false;
    lastGoodCategories = [];
    console.warn(
      '[flags-resolve] scenario_objection_categories missing — apply 20261012000000_scenario_objections.sql; serving built-in categories only',
    );
    return [];
  }
  console.warn('[flags-resolve] scenario_objection_categories fetch failed; serving the last good list', res.error);
  categoriesDegraded = !hadGoodCategoriesRead;
  return lastGoodCategories;
}

async function loadSnapshot(): Promise<{
  flags: FlagRow[];
  rules: RuleRow[];
  overrides: OverrideRow[];
  simulationConfig: Record<string, unknown> | null;
  objections: TeamObjection[];
  objectionCategories: ObjectionCategory[];
}> {
  const sb = getServiceClient();
  const [flagsRes, rulesRes, overrideRows, simCfgRes, objections, objectionCategories] = await Promise.all([
    sb.from('flags').select('key, default_value, value_type'),
    sb
      .from('flag_rules')
      .select('id, flag_key, priority, audience, value, enabled')
      .eq('enabled', true)
      .order('priority', { ascending: false }),
    // `unknown` because the fallback selects return narrower row shapes; they
    // are coerced to OverrideRow[] below, where missing fields read undefined.
    selectOverrideRows((columns) =>
      sb.from('scenario_overrides').select(columns).is('deleted_at', null),
    ),
    sb.from('simulation_config').select('config').eq('id', 'global').maybeSingle(),
    loadPublicObjections(() => readTeamObjections(sb)),
    loadPublicCategories(() => readCategories(sb)),
  ]);
  if (flagsRes.error) throw flagsRes.error;
  if (rulesRes.error) throw rulesRes.error;
  // simCfgRes is best-effort — log but don't fail if the table doesn't exist yet.
  if (simCfgRes.error) console.warn('[flags-resolve] simulation_config fetch failed', simCfgRes.error);
  return {
    flags: (flagsRes.data ?? []) as FlagRow[],
    rules: (rulesRes.data ?? []) as RuleRow[],
    overrides: publicOverrideRows((overrideRows ?? []) as unknown as OverrideRow[]),
    simulationConfig: publicSimulationConfig(
      (simCfgRes.data?.config ?? null) as Record<string, unknown> | null,
    ),
    objections,
    objectionCategories,
  };
}

/**
 * What an ANONYMOUS caller may see of the override rows. This endpoint is
 * public (`cache-control: public`), so it must publish only what the trainee
 * app actually renders:
 *   • `prompt_prefix` / `prompt_suffix` are the admin's AI notes — often the
 *     answer key ("only yield once a recheck date is offered"). The server
 *     loads them by `_overrideId` when it builds the prompt; the browser
 *     never needs them (outside preview, where they arrive by postMessage).
 *   • A hidden row (`visible: false`) is the Studio's "not published" state.
 *     The app needs to know the scenario is hidden — nothing else about it.
 *   • `copied_from` ("added to the library from a trainee's scenario") is
 *     admin-only provenance: it names a trainee's `user:<uuid>`. The select
 *     above never asks for it; it is stripped here too so a future
 *     `select('*')` cannot leak it.
 */
export function publicOverrideRows(rows: OverrideRow[]): OverrideRow[] {
  return rows.map((row) => {
    if (row.visible === false) {
      return {
        scenario_id: row.scenario_id,
        visible: false,
        sort_order: row.sort_order ?? null,
      } as OverrideRow;
    }
    const { copied_from: _provenance, ...rest } = row as OverrideRow & { copied_from?: unknown };
    return { ...rest, prompt_prefix: null, prompt_suffix: null };
  });
}

/**
 * The simulation config minus the prompt tuning. The consumer reads `rag`
 * and the scoring dimension labels / weights from it; the global customer
 * and scorer prefix / suffix are applied server-side and are AI-tuning text
 * that `admin-scenario-inspect` deliberately withholds from roles without
 * `simulation.read` — publishing it here would make that gate pointless.
 */
export function publicSimulationConfig(
  config: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!config) return config;
  const { customerPromptPrefix: _cp, customerPromptSuffix: _cs, ...rest } = config;
  const scoring = rest.scoring;
  if (scoring && typeof scoring === 'object' && !Array.isArray(scoring)) {
    const { promptPrefix: _sp, promptSuffix: _ss, ...scoringRest } = scoring as Record<string, unknown>;
    return { ...rest, scoring: scoringRest };
  }
  return rest;
}

/**
 * Stable 0–99 bucket for percentage rollout. djb2 over a salt + identifier
 * keeps the same caller in the same bucket across requests (sticky).
 */
function bucketFor(salt: string, id: string): number {
  let h = 5381;
  const s = `${salt}:${id}`;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 100;
}

function audienceMatches(
  audience: Record<string, unknown>,
  flagKey: string,
  who: AudienceInput,
): boolean {
  const a = audience ?? {};
  const drivers = Array.isArray(a.drivers) ? (a.drivers as string[]) : null;
  if (drivers && drivers.length > 0) {
    if (!who.driver || !drivers.includes(who.driver)) return false;
  }
  const userIds = Array.isArray(a.user_ids) ? (a.user_ids as string[]) : null;
  if (userIds && userIds.length > 0) {
    if (!who.user_id || !userIds.includes(who.user_id)) return false;
  }
  const anonIds = Array.isArray(a.anon_session_ids)
    ? (a.anon_session_ids as string[])
    : null;
  if (anonIds && anonIds.length > 0) {
    if (!who.anon_session_id || !anonIds.includes(who.anon_session_id)) return false;
  }
  const clinicIds = Array.isArray(a.clinic_ids) ? (a.clinic_ids as string[]) : null;
  if (clinicIds && clinicIds.length > 0) {
    if (!who.clinic_id || !clinicIds.includes(who.clinic_id)) return false;
  }
  if (typeof a.percentage === 'number') {
    const pct = Math.max(0, Math.min(100, a.percentage));
    const id = who.user_id ?? who.anon_session_id ?? '';
    if (!id) return false;
    if (bucketFor(flagKey, id) >= pct) return false;
  }
  return true;
}

function resolveFlags(
  flags: FlagRow[],
  rules: RuleRow[],
  who: AudienceInput,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of flags) out[f.key] = f.default_value;
  // Rules already sorted by priority desc — first matching rule per key wins.
  const claimed = new Set<string>();
  for (const r of rules) {
    if (claimed.has(r.flag_key)) continue;
    if (audienceMatches(r.audience, r.flag_key, who)) {
      out[r.flag_key] = r.value;
      claimed.add(r.flag_key);
    }
  }
  return out;
}

export default async (req: Request, context?: NetlifyContextLike): Promise<Response> => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return errorResponse(405, 'Method not allowed');
  }
  let who: AudienceInput = {};
  if (req.method === 'POST') {
    try {
      who = (await req.json()) as AudienceInput;
    } catch {
      return errorResponse(400, 'Invalid JSON');
    }
  } else {
    const params = new URL(req.url).searchParams;
    who = {
      user_id: params.get('user_id'),
      anon_session_id: params.get('anon_session_id'),
      driver: params.get('driver'),
      clinic_id: params.get('clinic_id'),
    };
  }

  try {
    const now = Date.now();
    if (!snapshotCache || snapshotCache.expiresAt < now) {
      const raw = await loadSnapshot();
      snapshotCache = {
        value: {
          // The flags map is audience-dependent so it's recomputed per request,
          // but the underlying rows are reused for CACHE_TTL_MS.
          flags: {},
          scenarioOverrides: raw.overrides,
          simulationConfig: raw.simulationConfig,
          objections: raw.objections,
          objectionCategories: raw.objectionCategories,
          fetchedAt: now,
        },
        // Built on a failed cold objections OR categories read: serve it,
        // don't keep it.
        expiresAt: catalogueReadDegraded() ? now : now + CACHE_TTL_MS,
      };
      // Stash the raw rows on the snapshot for resolve.
      (snapshotCache.value as ResolvedSnapshot & {
        _flags?: FlagRow[];
        _rules?: RuleRow[];
      })._flags = raw.flags;
      (snapshotCache.value as ResolvedSnapshot & {
        _flags?: FlagRow[];
        _rules?: RuleRow[];
      })._rules = raw.rules;
    }
    const snap = snapshotCache.value as ResolvedSnapshot & {
      _flags?: FlagRow[];
      _rules?: RuleRow[];
    };
    const resolved = resolveFlags(snap._flags ?? [], snap._rules ?? [], who);

    // Every app boot passes through here, which makes this the one place that
    // can keep the built-in knowledge base seeded without anyone asking.
    // Production only, at most one successful kick per instance, always aimed
    // at the site's primary URL (never this deploy's own host), and handed to
    // `context.waitUntil` so it survives the response without delaying it. It
    // cannot throw, so the flags response is byte-identical either way.
    triggerKnowledgeSync(context);

    return jsonResponse(
      {
        flags: resolved,
        scenarioOverrides: snap.scenarioOverrides,
        simulationConfig: snap.simulationConfig,
        objections: snap.objections,
        objectionCategories: snap.objectionCategories,
        fetchedAt: snapshotCache.value.fetchedAt,
      },
      {
        headers: {
          'cache-control': catalogueReadDegraded() ? 'no-store' : 'public, max-age=30',
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to resolve flags';
    console.error('[flags-resolve]', msg);
    return errorResponse(500, msg);
  }
};
