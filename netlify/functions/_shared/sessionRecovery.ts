/**
 * Score every session that was SAVED but never SCORED.
 *
 * Why this exists (2026-10-29): workshop trainees closed tabs, locked phones,
 * lost connections and left mid-conversation. Their transcripts reached the
 * database (the app checkpoints after every exchange — `useTextChat`), but
 * nothing ever asked the scorer about them, so the training team saw
 * conversations with no score and trainees saw nothing at all. This engine
 * finds those rows and grades them with the SAME scorer `ai-evaluate` uses
 * (`scoreTranscript`), telling it the conversation was interrupted.
 *
 * Rules:
 *  - Only rows with at least one trainee (staff) turn — there is nothing to
 *    grade otherwise, and a 0 for silence is not a score.
 *  - A row that is still "in progress" (not completed, no ending recorded)
 *    is left alone until it is clearly dead (`IN_PROGRESS_GRACE_MS`), so a
 *    live conversation is never scored under the trainee.
 *  - Ended rows (left early, error, timeout) wait `ENDED_GRACE_MS` so the
 *    trainee's own app gets the first chance to score it (and show them).
 *  - The write is guarded `score_overall is null`: if the trainee's app (or
 *    another run) scored it meanwhile, nothing is overwritten.
 *  - The report carries `recovered: { at, endedReason }` so a recovered score
 *    is always distinguishable from one the trainee saw live.
 *  - A failure leaves the row for the next run. Rows older than
 *    `MAX_AGE_MS` are no longer retried.
 */
import type { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { errorMessage, sanitizeScenario, sanitizeTurns } from './ai';
import { scoreTranscript, staffTurnCount } from './scoring';
import { MODEL_LIVE, MODEL_TEXT } from '../../../src/shared/ai/models';
import { DEFAULT_LOCALE, isLocale } from '../../../src/i18n/locales';

export const ENDED_GRACE_MS = 30 * 60_000;
export const IN_PROGRESS_GRACE_MS = 2 * 60 * 60_000;
export const MAX_AGE_MS = 14 * 24 * 60 * 60_000;
/** Rows scored per run — bounds cost and the background budget. */
export const RECOVERY_BATCH = 40;

const LOG = '[session-recovery]';

/** Internal auth for the background function (see `sessions-recover-background`). */
export const RECOVER_KEY_HEADER = 'x-pbt-recover-key';
export const RECOVER_KEY_LABEL = 'pbt:sessions-recover:v1';
export const RECOVER_PATH = '/.netlify/functions/sessions-recover-background';

export interface RecoveryCandidate {
  id: string;
  user_id: string | null;
  created_at: string;
  completed: boolean | null;
  ended_reason: string | null;
  mode: string | null;
  locale: string | null;
  scenario: unknown;
  transcript: unknown;
}

/** Pure: is this row ready to be recovered at `now`? */
export function isRecoverable(row: RecoveryCandidate, now: number): boolean {
  const created = Date.parse(row.created_at);
  if (!Number.isFinite(created)) return false;
  const age = now - created;
  if (age > MAX_AGE_MS) return false;
  const inProgress = !row.completed && !row.ended_reason;
  if (age < (inProgress ? IN_PROGRESS_GRACE_MS : ENDED_GRACE_MS)) return false;
  return staffTurnCount(sanitizeTurns(row.transcript)) > 0;
}

export interface RecoveryResult {
  scanned: number;
  scored: number;
  skipped: number;
  failed: number;
}

export async function runSessionRecovery(opts: {
  sb: SupabaseClient;
  ai: GoogleGenAI;
  now?: number;
  /** Stop starting new scores after this epoch ms (background budget). */
  deadline?: number;
}): Promise<RecoveryResult> {
  const now = opts.now ?? Date.now();
  const result: RecoveryResult = { scanned: 0, scored: 0, skipped: 0, failed: 0 };

  const { data, error } = await opts.sb
    .from('training_sessions')
    .select('id, user_id, created_at, completed, ended_reason, mode, locale, scenario, transcript')
    .is('score_overall', null)
    .gte('created_at', new Date(now - MAX_AGE_MS).toISOString())
    .lte('created_at', new Date(now - ENDED_GRACE_MS).toISOString())
    // jsonb containment: some element of the transcript has role "user".
    .contains('transcript', [{ role: 'user' }])
    .order('created_at', { ascending: true })
    .limit(RECOVERY_BATCH);
  if (error) {
    console.warn(`${LOG} candidate read failed`, error.message);
    return result;
  }

  for (const row of (data ?? []) as RecoveryCandidate[]) {
    result.scanned += 1;
    if (opts.deadline && Date.now() > opts.deadline) break;
    if (!isRecoverable(row, now)) {
      result.skipped += 1;
      continue;
    }
    const scenario = sanitizeScenario(row.scenario);
    if (!scenario) {
      result.skipped += 1;
      continue;
    }
    const transcript = sanitizeTurns(row.transcript);
    const mode = row.mode === 'voice' ? 'voice' : 'text';
    try {
      const report = await scoreTranscript(opts.sb, opts.ai, {
        scenario,
        transcript,
        locale: isLocale(row.locale) ? row.locale : DEFAULT_LOCALE,
        sessionId: row.id,
        userId: row.user_id,
        // The trainee's "Allow training data use" choice lives on their
        // device, so the server can't read it for a signed-in row: record AI
        // usage only for anonymous rows, which exist only when it was allowed.
        allowTelemetry: row.user_id == null,
        preview: false,
        endedEarly: 'interrupted',
      });
      const recovered = {
        at: new Date(now).toISOString(),
        endedReason: row.ended_reason ?? 'interrupted',
      };
      // Same columns `ai-evaluate` writes with a score. The service role
      // passes the server-authoritative-scores trigger; the guard keeps a
      // score the trainee's own app wrote in the meantime.
      const { data: written, error: writeError } = await opts.sb
        .from('training_sessions')
        .update({
          score_report: { ...report, recovered },
          score_overall: report.overall,
          model_id: mode === 'voice' ? MODEL_LIVE : MODEL_TEXT,
          completed: true,
          ended_reason: 'completed',
          turns: transcript.length,
        })
        .eq('id', row.id)
        .is('score_overall', null)
        .select('id');
      if (writeError) throw new Error(writeError.message);
      if (Array.isArray(written) && written.length > 0) result.scored += 1;
      else result.skipped += 1;
    } catch (err) {
      result.failed += 1;
      console.warn(`${LOG} could not score ${row.id}`, errorMessage(err));
    }
  }
  return result;
}
