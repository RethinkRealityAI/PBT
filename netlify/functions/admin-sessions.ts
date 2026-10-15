/**
 * Admin: training sessions. Permission `sessions.read` for every view.
 *
 *   GET admin-sessions?since=&limit=        → full rows (array), newest first —
 *                                              the Sessions / Insights / Quality
 *                                              screens; `limit` ≤ 5,000
 *   GET admin-sessions?view=summary&since=&limit=
 *                                           → { rows: SessionSummary[], truncated }
 *                                              — the Analytics tabs; `limit` ≤ 10,000
 *   GET admin-sessions?id=<uuid>            → ONE full row (same shape as a list
 *                                              element) or 404 — a session opened
 *                                              from the Analytics tabs
 *
 * Every list pages (`.range()`), because Supabase answers at most 1,000 rows
 * per request whatever `limit` says — the screens used to count a busy window
 * as if it held 1,000 sessions. The summary view reads each transcript to
 * derive reply times, message counts and the owner's final mood
 * (`src/shared/analytics/sessionSummary.ts`) but never returns it; coach-hint
 * counts come from the `coach_hint_request` nav events of the same window.
 */
import {
  errorResponse,
  largeJsonResponse,
  readRange,
  requireAdmin,
  UUID_RE,
  type AdminCtx,
} from './_shared/admin';
import { selectAll } from './_shared/paging';
import { applyScenarioTitles } from './_shared/scenarioTitles';
import { difficultyFromScenario } from '../../src/shared/scenarios/difficulty';
import {
  SESSION_SUMMARY_COLUMNS,
  countHintsBySession,
  scoreUnavailableOf,
  toSessionSummary,
} from '../../src/shared/analytics/sessionSummary';
import type { SessionSummaryResponse } from '../../src/shared/analytics/contract';

const FULL_COLUMNS =
  'id, user_id, scenario, scenario_summary, pushback_id, driver, transcript, score_report, score_overall, duration_seconds, mode, completed, ended_reason, flagged, flag_reason, model_id, turns, created_at';

/** Full rows (with transcripts) per list. */
export const LIST_MAX = 5000;
/** Summaries per list (no transcripts — ~1 KB each). */
export const SUMMARY_MAX = 10_000;
/** Hint events read for a summary window (≤ 3 hints per session). */
const HINT_EVENTS_MAX = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

/**
 * A scoring failure is persisted as a placeholder report with every dimension
 * at 0, so downstream aggregates would read it as a genuine 0/100 and drag
 * every average down. Derive the distinction once, here, rather than in each
 * of the screens that consume these rows. A row with no report at all was
 * never scored (abandoned mid-session) — a missing score, not a failed one.
 *
 * `difficulty` (1–4, or null) is read the same way, from the scenario the
 * session stored — the app writes the full Scenario, so no column or
 * migration is needed; backfilled and older rows simply have none. It is
 * context shown beside a score: the scorer holds every level to the same
 * standard, so it never adjusts `score_overall`.
 */
function withDerived(row: Row): Row {
  return {
    ...row,
    score_unavailable: scoreUnavailableOf(row.score_report),
    difficulty: difficultyFromScenario(row.scenario),
  };
}

function clampLimit(raw: string | null, fallback: number, max: number): number {
  const n = raw === null || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(max, Math.floor(n));
}

async function listFull(ctx: AdminCtx, req: Request): Promise<Response> {
  const { since } = readRange(req);
  const limit = clampLimit(new URL(req.url).searchParams.get('limit'), 1000, LIST_MAX);
  const { rows, error } = await selectAll<Row>(
    (from, to) =>
      ctx.sb
        .from('training_sessions')
        .select(FULL_COLUMNS)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    { max: limit, dedupeBy: (r) => r.id },
  );
  if (error) return errorResponse(500, error.message);
  return largeJsonResponse(rows.map(withDerived));
}

async function listSummary(ctx: AdminCtx, req: Request): Promise<Response> {
  const { since } = readRange(req);
  const sinceMs = Date.parse(since);
  if (!Number.isFinite(sinceMs)) return errorResponse(400, 'since must be an ISO date');
  const limit = clampLimit(new URL(req.url).searchParams.get('limit'), SUMMARY_MAX, SUMMARY_MAX);

  // A session's row is written when it ENDS; its hints were requested while
  // it ran, so the hint window opens a day earlier.
  const hintsSince = new Date(sinceMs - DAY_MS).toISOString();

  const [sessions, hints] = await Promise.all([
    selectAll<Row>(
      (from, to) =>
        ctx.sb
          .from('training_sessions')
          .select(SESSION_SUMMARY_COLUMNS)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      { max: limit, concurrency: 3, dedupeBy: (r) => r.id },
    ),
    selectAll<Row>(
      (from, to) =>
        ctx.sb
          .from('nav_events')
          .select('id, meta, created_at')
          .eq('target', 'coach_hint_request')
          .gte('created_at', hintsSince)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      { max: HINT_EVENTS_MAX, concurrency: 2, dedupeBy: (r) => r.id },
    ),
  ]);
  if (sessions.error) return errorResponse(500, sessions.error.message);
  // Hints are context, not the list: a failed read shows "unknown" (null),
  // never a confident 0.
  if (hints.error) console.warn('[admin-sessions] hint events read failed', hints.error.message);
  const hintsBySession = hints.error ? undefined : countHintsBySession(hints.rows);

  const summaries = sessions.rows.map((row) => toSessionSummary(row, { hintsBySession }));
  await applyScenarioTitles(ctx.sb, summaries);
  const body: SessionSummaryResponse = { rows: summaries, truncated: sessions.truncated };
  return largeJsonResponse(body);
}

async function one(ctx: AdminCtx, id: string): Promise<Response> {
  if (!UUID_RE.test(id)) return errorResponse(400, 'id must be a session uuid');
  const { data, error } = await ctx.sb.from('training_sessions').select(FULL_COLUMNS).eq('id', id).maybeSingle();
  if (error) return errorResponse(500, error.message);
  if (!data) return errorResponse(404, 'Session not found');
  return largeJsonResponse(withDerived(data as Row));
}

export default async (req: Request) => {
  const ctx = await requireAdmin(req, 'sessions.read');
  if (ctx instanceof Response) return ctx;
  const params = new URL(req.url).searchParams;

  const id = params.get('id');
  if (id !== null) return one(ctx, id.trim());

  const view = params.get('view');
  if (view === 'summary') return listSummary(ctx, req);
  if (view !== null && view !== '' && view !== 'full') return errorResponse(400, 'Unknown view');
  return listFull(ctx, req);
};
