import {
  errorResponse,
  jsonResponse,
  readRange,
  requireAdmin,
} from './_shared/admin';
import { isScoreUnavailable, type ScoreReport } from '../../src/services/types';
import { difficultyFromScenario } from '../../src/shared/scenarios/difficulty';

type SessionRow = { score_report: ScoreReport | null; scenario: unknown };

export default async (req: Request) => {
  const ctx = await requireAdmin(req, 'sessions.read');
  if (ctx instanceof Response) return ctx;
  const { since, limit } = readRange(req);
  const { data, error } = await ctx.sb
    .from('training_sessions')
    .select(
      'id, user_id, scenario, scenario_summary, pushback_id, driver, transcript, score_report, score_overall, duration_seconds, mode, completed, ended_reason, flagged, flag_reason, model_id, turns, created_at',
    )
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return errorResponse(500, error.message);
  // A scoring failure is persisted as a placeholder report with every
  // dimension at 0, so downstream aggregates would read it as a genuine
  // 0/100 and drag every average down. Derive the distinction once, here,
  // rather than in each of the screens that consume these rows. A row with
  // no report at all was never scored (abandoned mid-session) — that is a
  // missing score, not a failed one.
  //
  // `difficulty` (1–4, or null) is read the same way, from the scenario the
  // session stored — the app writes the full Scenario, so no column or
  // migration is needed; backfilled and older rows simply have none. It is
  // context shown beside a score: the scorer holds every level to the same
  // standard, so it never adjusts `score_overall`.
  const rows = ((data ?? []) as SessionRow[]).map((row) => ({
    ...row,
    score_unavailable: row.score_report != null && isScoreUnavailable(row.score_report),
    difficulty: difficultyFromScenario(row.scenario),
  }));
  return jsonResponse(rows);
};
