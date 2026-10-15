/**
 * Admin: the Analytics destination's server-side reads. GET only (405
 * otherwise). Wire contract: src/shared/analytics/contract.ts.
 *
 *   GET admin-analytics?op=directory
 *        → TraineeDirectoryResponse — everyone with a profile, named.
 *          Permission `sessions.read` (NOT `team.read`: an Analyst reads
 *          sessions but doesn't manage people, and used to see every trainee
 *          as "Anonymous"). `email` only for a caller who also holds
 *          `team.read` (`emails: false` says it was withheld);
 *          `last_sign_in_at` for everyone, best-effort (an Auth hiccup
 *          leaves it null, never fails the list).
 *
 *   GET admin-analytics?op=engagement&range=28d&tz=-240
 *        → EngagementReport. Permission `analytics.read`. Pages through
 *          EVERY `nav_events` row of twice the window (the previous window
 *          is the comparison) — or all of them for `range=all` — up to
 *          ENGAGEMENT_MAX_ROWS (`truncated` says the cap was hit), and folds
 *          them server-side (`src/shared/analytics/engagement.ts`). `tz` is
 *          `Date#getTimezoneOffset()` (minutes WEST of UTC), clamped to
 *          ±14 h; it places days, hours and weekdays in the caller's
 *          calendar.
 *
 *   GET admin-analytics?op=trainee&id=<uuid>&tz=-240
 *        → TraineeDetail. Permission `sessions.read` for the profile and the
 *          trainee's sessions (SessionSummary, ≤ 2,000, with coach-hint
 *          counts). Every other section is read ONLY when the caller holds
 *          its own permission — activity `analytics.read`, feedback
 *          `feedback.read`, scenarios `scenarios.read`, analyzer
 *          `analyzer.read`, reports `reports.read`, ai_usage `quality.read` —
 *          and is otherwise null and named in `withheld`, so the profile can
 *          say why a card is missing. A failing optional read degrades that
 *          section to null (logged); only a failing profile or sessions read
 *          fails the request.
 *
 * Unknown `op` → 400. Nothing here writes, and nothing is read from a
 * request body. Transcripts never leave this function (summaries only).
 * Every list pages with `.range()` (`_shared/paging.ts`): Supabase answers at
 * most 1,000 rows per request whatever `limit` says.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  can,
  errorResponse,
  jsonResponse,
  largeJsonResponse,
  requireAdmin,
  UUID_RE,
  type AdminCtx,
} from './_shared/admin';
import { selectAll, type PageResult, type SelectAllOptions, type SelectAllResult } from './_shared/paging';
import { authInfoByUserId, type AuthUserInfo } from './_shared/users';
import { applyScenarioTitles } from './_shared/scenarioTitles';
import type { Permission } from '../../src/shared/access/permissions';
import type {
  EngagementReport,
  TraineeAiUsage,
  TraineeAnalyzerRow,
  TraineeDetail,
  TraineeDirectoryEntry,
  TraineeDirectoryResponse,
  TraineeFeedbackRow,
  TraineeReportRow,
  TraineeScenarioRow,
} from '../../src/shared/analytics/contract';
import {
  DAY_MS,
  FUTURE_SKEW_MS,
  NAV_EVENT_COLUMNS,
  aggregateEngagement,
  aggregateTraineeActivity,
  engagementRangeDays,
  isEngagementRange,
  type CompactNavRow,
} from '../../src/shared/analytics/engagement';
import {
  SESSION_SUMMARY_COLUMNS,
  countHintsBySession,
  toSessionSummary,
} from '../../src/shared/analytics/sessionSummary';

/** Hard cap on `nav_events` rows one engagement report reads. */
export const ENGAGEMENT_MAX_ROWS = 100_000;
/** Sessions on one trainee's profile. */
export const TRAINEE_SESSIONS_MAX = 2000;
/** One trainee's events for the activity card (last 365 days). */
export const TRAINEE_EVENTS_MAX = 20_000;
/** Rows per optional section (feedback, scenarios, analyzer, reports). */
const SECTION_MAX = 2000;
const AI_CALLS_MAX = 100_000;
const PROFILES_MAX = 20_000;
/** ±14 h — the widest real UTC offsets. */
const TZ_LIMIT_MINUTES = 840;

const OPS = ['directory', 'engagement', 'trainee'] as const;
type Op = (typeof OPS)[number];

type Row = Record<string, unknown>;
type Section = TraineeDetail['withheld'][number];

// ─── Readers ───────────────────────────────────────────────────────────

function str(v: unknown): string | null {
  return typeof v === 'string' && v !== '' ? v : null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function idOf(v: unknown): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}

/** `tz` as integer minutes west of UTC, clamped; 'bad' for a non-number. */
export function parseTz(raw: string | null): number | 'bad' {
  if (raw === null || raw.trim() === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 'bad';
  return Math.max(-TZ_LIMIT_MINUTES, Math.min(TZ_LIMIT_MINUTES, Math.round(n)));
}

/**
 * Page a query, trying each column list in turn: a database that hasn't run
 * a later migration answers a select naming its column with an error, and
 * the next (narrower) list still reads the rest.
 */
async function pagedWithFallback(
  columnSets: readonly string[],
  build: (columns: string, from: number, to: number) => PromiseLike<PageResult>,
  options: SelectAllOptions<Row>,
): Promise<SelectAllResult<Row>> {
  let last: SelectAllResult<Row> = { rows: [], truncated: false, error: { message: 'no columns' } };
  for (const columns of columnSets) {
    last = await selectAll<Row>((from, to) => build(columns, from, to), options);
    if (!last.error) return last;
  }
  return last;
}

// ─── Profiles ──────────────────────────────────────────────────────────

/** Newest schema first; `admin_role` (RBAC) and `locale` may be missing on an old database. */
const PROFILE_COLUMN_SETS: readonly string[] = [
  'user_id, display_name, echo_primary, echo_secondary, created_at, locale, disabled, admin_role, is_admin',
  'user_id, display_name, echo_primary, echo_secondary, created_at, locale, disabled, is_admin',
  'user_id, display_name, echo_primary, echo_secondary, created_at, disabled, is_admin',
];

function toDirectoryEntry(row: Row, auth: AuthUserInfo | undefined, withEmail: boolean): TraineeDirectoryEntry {
  return {
    user_id: idOf(row.user_id),
    display_name: str(row.display_name),
    echo_primary: str(row.echo_primary),
    echo_secondary: str(row.echo_secondary),
    created_at: idOf(row.created_at),
    locale: str(row.locale),
    disabled: row.disabled === true,
    // A pre-RBAC database only has the legacy flag, which meant "admin".
    admin_role: str(row.admin_role) ?? (row.is_admin === true ? 'admin' : null),
    email: withEmail ? (auth?.email ?? null) : null,
    last_sign_in_at: auth?.last_sign_in_at ?? null,
  };
}

async function readOneProfile(sb: SupabaseClient, userId: string): Promise<{ row: Row | null; error: string | null }> {
  let lastError = 'profile read failed';
  for (const columns of PROFILE_COLUMN_SETS) {
    const { data, error } = await sb.from('profiles').select(columns).eq('user_id', userId).maybeSingle();
    if (!error) return { row: (data as unknown as Row | null) ?? null, error: null };
    lastError = error.message;
  }
  return { row: null, error: lastError };
}

async function oneAuthUser(sb: SupabaseClient, userId: string): Promise<AuthUserInfo | undefined> {
  try {
    const { data, error } = await sb.auth.admin.getUserById(userId);
    if (error || !data?.user) return undefined;
    const u = data.user;
    return {
      email: u.email ? u.email : null,
      last_sign_in_at: typeof u.last_sign_in_at === 'string' && u.last_sign_in_at ? u.last_sign_in_at : null,
    };
  } catch (err) {
    console.warn('[admin-analytics] auth user lookup failed', err);
    return undefined;
  }
}

async function directory(ctx: AdminCtx): Promise<Response> {
  const withEmail = can(ctx, 'team.read');
  const [profiles, auth] = await Promise.all([
    pagedWithFallback(
      PROFILE_COLUMN_SETS,
      (columns, from, to) =>
        ctx.sb
          .from('profiles')
          .select(columns)
          .order('created_at', { ascending: false })
          .order('user_id', { ascending: true })
          .range(from, to),
      { max: PROFILES_MAX, dedupeBy: (r) => r.user_id },
    ),
    // Best-effort: Auth only adds the address and the last sign-in.
    authInfoByUserId(ctx.sb).catch((err: unknown) => {
      console.warn('[admin-analytics] auth users read failed', err);
      return new Map<string, AuthUserInfo>();
    }),
  ]);
  if (profiles.error) return errorResponse(500, profiles.error.message);
  const body: TraineeDirectoryResponse = {
    rows: profiles.rows.map((r) => toDirectoryEntry(r, auth.get(idOf(r.user_id)), withEmail)),
    emails: withEmail,
  };
  return largeJsonResponse(body);
}

// ─── Engagement ────────────────────────────────────────────────────────

async function engagement(ctx: AdminCtx, params: URLSearchParams): Promise<Response> {
  const rawRange = params.get('range') ?? '28d';
  if (!isEngagementRange(rawRange)) return errorResponse(400, 'range must be one of 24h, 7d, 28d, 90d, all');
  const tz = parseTz(params.get('tz'));
  if (tz === 'bad') return errorResponse(400, 'tz must be minutes west of UTC');

  const now = Date.now();
  const since =
    rawRange === 'all' ? null : new Date(now - 2 * engagementRangeDays(rawRange) * DAY_MS).toISOString();
  const until = new Date(now + FUTURE_SKEW_MS).toISOString();

  const { rows, truncated, error } = await selectAll<Row>(
    (from, to) => {
      // Bounded above too: client-stamped junk from the future would otherwise
      // sort first and fill the read cap (`FUTURE_SKEW_MS`).
      let q = ctx.sb.from('nav_events').select(NAV_EVENT_COLUMNS).lte('created_at', until);
      if (since) q = q.gte('created_at', since);
      return q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to);
    },
    { max: ENGAGEMENT_MAX_ROWS, concurrency: 4, dedupeBy: (r) => r.id },
  );
  if (error) return errorResponse(500, error.message);

  const report: EngagementReport = {
    ...aggregateEngagement(rows as unknown as CompactNavRow[], { range: rawRange, now, tzOffsetMinutes: tz }),
    generated_at: new Date(now).toISOString(),
    scanned: rows.length,
    truncated,
  };
  return jsonResponse(report);
}

// ─── One trainee ───────────────────────────────────────────────────────

/** Run an optional section's read; a failure is logged and degrades to null. */
async function section<T>(name: Section, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    console.warn(`[admin-analytics] trainee ${name} read failed`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Unwrap a paged read for `section()`: an error throws (→ null), rows pass through. */
function rowsOrThrow(res: SelectAllResult<Row>): Row[] {
  if (res.error) throw new Error(res.error.message);
  return res.rows;
}

async function trainee(ctx: AdminCtx, params: URLSearchParams): Promise<Response> {
  const id = (params.get('id') ?? '').trim();
  if (!UUID_RE.test(id)) return errorResponse(400, 'id must be a user uuid');
  const tz = parseTz(params.get('tz'));
  if (tz === 'bad') return errorResponse(400, 'tz must be minutes west of UTC');
  const now = Date.now();
  const sb = ctx.sb;

  const profileRead = await readOneProfile(sb, id);
  if (profileRead.error) return errorResponse(500, profileRead.error);
  if (!profileRead.row) return errorResponse(404, 'Trainee not found');

  const allowed = (perm: Permission) => can(ctx, perm);
  const plan: Array<[Section, Permission]> = [
    ['activity', 'analytics.read'],
    ['feedback', 'feedback.read'],
    ['scenarios', 'scenarios.read'],
    ['analyzer', 'analyzer.read'],
    ['reports', 'reports.read'],
    ['ai_usage', 'quality.read'],
  ];
  const withheld = plan.filter(([, perm]) => !allowed(perm)).map(([name]) => name);
  const may = (name: Section) => !withheld.includes(name);
  const byNewest = { ascending: false } as const;

  const [auth, sessions, hints, activity, feedback, scenarios, analyzer, reports, aiUsage] = await Promise.all([
    oneAuthUser(sb, id),
    selectAll<Row>(
      (from, to) =>
        sb
          .from('training_sessions')
          .select(SESSION_SUMMARY_COLUMNS)
          .eq('user_id', id)
          .order('created_at', byNewest)
          .order('id', byNewest)
          .range(from, to),
      { max: TRAINEE_SESSIONS_MAX, dedupeBy: (r) => r.id },
    ),
    selectAll<Row>(
      (from, to) =>
        sb
          .from('nav_events')
          .select('id, meta, created_at')
          .eq('user_id', id)
          .eq('target', 'coach_hint_request')
          .lte('created_at', new Date(Date.now() + FUTURE_SKEW_MS).toISOString())
          .order('created_at', byNewest)
          .order('id', byNewest)
          .range(from, to),
      { max: TRAINEE_EVENTS_MAX, dedupeBy: (r) => r.id },
    ),
    may('activity')
      ? section('activity', async () => {
          const since = new Date(now - 365 * DAY_MS).toISOString();
          const rows = rowsOrThrow(
            await selectAll<Row>(
              (from, to) =>
                sb
                  .from('nav_events')
                  .select(NAV_EVENT_COLUMNS)
                  .eq('user_id', id)
                  .gte('created_at', since)
                  .lte('created_at', new Date(now + FUTURE_SKEW_MS).toISOString())
                  .order('created_at', byNewest)
                  .order('id', byNewest)
                  .range(from, to),
              { max: TRAINEE_EVENTS_MAX, concurrency: 2, dedupeBy: (r) => r.id },
            ),
          );
          return aggregateTraineeActivity(rows as unknown as CompactNavRow[], { now, tzOffsetMinutes: tz });
        })
      : null,
    may('feedback')
      ? section('feedback', async () =>
          rowsOrThrow(
            await selectAll<Row>(
              (from, to) =>
                sb
                  .from('session_feedback')
                  .select('id, session_id, realism, ai_quality, comfort, comment, created_at')
                  .eq('user_id', id)
                  .order('created_at', byNewest)
                  .order('id', byNewest)
                  .range(from, to),
              { max: SECTION_MAX, dedupeBy: (r) => r.id },
            ),
          ).map(
            (r): TraineeFeedbackRow => ({
              id: idOf(r.id),
              session_id: str(r.session_id),
              realism: num(r.realism),
              ai_quality: num(r.ai_quality),
              comfort: num(r.comfort),
              comment: typeof r.comment === 'string' ? r.comment : null,
              created_at: idOf(r.created_at),
            }),
          ),
        )
      : null,
    may('scenarios')
      ? section('scenarios', async () =>
          rowsOrThrow(
            // `species` arrived with 20261012000000_scenario_objections.sql.
            await pagedWithFallback(
              [
                'id, title, pushback_id, difficulty, species, created_at',
                'id, title, pushback_id, difficulty, created_at',
              ],
              (columns, from, to) =>
                sb
                  .from('user_scenarios')
                  .select(columns)
                  .eq('creator_id', id)
                  .order('created_at', byNewest)
                  .order('id', byNewest)
                  .range(from, to),
              { max: SECTION_MAX, dedupeBy: (r) => r.id },
            ),
          ).map(
            (r): TraineeScenarioRow => ({
              id: idOf(r.id),
              title: typeof r.title === 'string' ? r.title : '',
              pushback_id: str(r.pushback_id),
              difficulty: num(r.difficulty),
              species: str(r.species),
              created_at: idOf(r.created_at),
            }),
          ),
        )
      : null,
    may('analyzer')
      ? section('analyzer', async () =>
          rowsOrThrow(
            // `source` arrived with 20260601000000_phase2_june.sql.
            await pagedWithFallback(
              ['id, breed, bcs, verdict, source, created_at', 'id, breed, bcs, verdict, created_at'],
              (columns, from, to) =>
                sb
                  .from('analyzer_events')
                  .select(columns)
                  .eq('user_id', id)
                  .order('created_at', byNewest)
                  .order('id', byNewest)
                  .range(from, to),
              { max: SECTION_MAX, dedupeBy: (r) => r.id },
            ),
          ).map(
            (r): TraineeAnalyzerRow => ({
              id: idOf(r.id),
              breed: str(r.breed),
              bcs: num(r.bcs),
              verdict: str(r.verdict),
              source: str(r.source),
              created_at: idOf(r.created_at),
            }),
          ),
        )
      : null,
    may('reports')
      ? section('reports', async () =>
          rowsOrThrow(
            await selectAll<Row>(
              (from, to) =>
                sb
                  .from('platform_reports')
                  .select('id, kind, status, message, created_at')
                  .eq('user_id', id)
                  .order('created_at', byNewest)
                  .order('id', byNewest)
                  .range(from, to),
              { max: SECTION_MAX, dedupeBy: (r) => r.id },
            ),
          ).map(
            (r): TraineeReportRow => ({
              id: idOf(r.id),
              kind: idOf(r.kind),
              status: idOf(r.status),
              message: typeof r.message === 'string' ? r.message : '',
              created_at: idOf(r.created_at),
            }),
          ),
        )
      : null,
    may('ai_usage')
      ? section('ai_usage', async () =>
          aiUsageOf(
            rowsOrThrow(
              await selectAll<Row>(
                (from, to) =>
                  sb
                    .from('ai_call_telemetry')
                    .select('id, call_type, cost_usd')
                    .eq('user_id', id)
                    .order('created_at', byNewest)
                    .order('id', byNewest)
                    .range(from, to),
                { max: AI_CALLS_MAX, concurrency: 2, dedupeBy: (r) => r.id },
              ),
            ),
          ),
        )
      : null,
  ]);

  if (sessions.error) return errorResponse(500, sessions.error.message);
  // Hint counts are context on each session: a failed read reads "unknown"
  // (null), never a confident 0.
  if (hints.error) console.warn('[admin-analytics] trainee hint events read failed', hints.error.message);
  const hintsBySession = hints.error ? undefined : countHintsBySession(hints.rows);

  const summaries = sessions.rows.map((row) => toSessionSummary(row, { hintsBySession }));
  await applyScenarioTitles(ctx.sb, summaries);
  const body: TraineeDetail = {
    profile: toDirectoryEntry(profileRead.row, auth, can(ctx, 'team.read')),
    sessions: summaries,
    activity,
    feedback,
    scenarios,
    analyzer,
    reports,
    ai_usage: aiUsage,
    withheld,
  };
  return largeJsonResponse(body);
}

/** Sum one trainee's AI calls and spend, overall and per call type. */
export function aiUsageOf(rows: readonly Row[]): TraineeAiUsage {
  const byType = new Map<string, { calls: number; cost: number }>();
  let calls = 0;
  let cost = 0;
  for (const r of rows) {
    const type = str(r.call_type) ?? 'unknown';
    const c = num(r.cost_usd) ?? 0;
    calls += 1;
    cost += c;
    const t = byType.get(type) ?? { calls: 0, cost: 0 };
    t.calls += 1;
    t.cost += c;
    byType.set(type, t);
  }
  const money = (n: number) => Math.round(n * 1e6) / 1e6;
  return {
    calls,
    cost_usd: money(cost),
    by_type: [...byType.entries()]
      .map(([call_type, t]) => ({ call_type, calls: t.calls, cost_usd: money(t.cost) }))
      .sort((a, b) => b.cost_usd - a.cost_usd || b.calls - a.calls || a.call_type.localeCompare(b.call_type)),
  };
}

// ─── Entry ─────────────────────────────────────────────────────────────

const OP_PERMISSION: Record<Op, Permission> = {
  directory: 'sessions.read',
  engagement: 'analytics.read',
  trainee: 'sessions.read',
};

function isOp(v: unknown): v is Op {
  return typeof v === 'string' && (OPS as readonly string[]).includes(v);
}

export default async (req: Request) => {
  if (req.method !== 'GET') return errorResponse(405, 'Method not allowed');
  const params = new URL(req.url).searchParams;
  const op = params.get('op');
  if (!isOp(op)) return errorResponse(400, 'Unknown op');

  const ctx = await requireAdmin(req, OP_PERMISSION[op]);
  if (ctx instanceof Response) return ctx;

  switch (op) {
    case 'directory':
      return directory(ctx);
    case 'engagement':
      return engagement(ctx, params);
    case 'trainee':
      return trainee(ctx, params);
  }
};
