/**
 * ACT-first scoring — `EvaluateRequest → EvaluateResponse`.
 *
 * Server-side port of the browser's `evaluateConversation`: same scoring
 * prompt (`buildScoringSystemPrompt`), same JSON schema (with the French
 * field descriptions when the locale is `fr`), same 2-attempt retry, same
 * dimension clamping and the same config-weighted `overall`.
 *
 * Honest failure: when the scorer cannot be reached after the retry, the
 * response is HTTP 200 with a report flagged `scoreUnavailable: true` — the
 * exact placeholder the browser used to build — so `isScoreUnavailable()`
 * and the Retry-scoring affordance keep working unchanged. Never a fake 0.
 *
 * Persistence: the score is written into the caller's OWN `training_sessions`
 * row (service role, ownership-guarded) when the call is not an admin
 * preview, the score is real and `sessionId` is a UUID — for a signed-in
 * caller their row, for an anonymous caller the row owned by their device id
 * (`anonSessionId`, see `_shared/anonSessions.ts`), and for the anonymous
 * case only when the trainee allows training data use. The client never
 * writes score columns — a database trigger
 * (`20260911000000_server_authoritative_scores.sql`) rejects it. This
 * function is the only writer of `score_report` / `score_overall`.
 */
import type { GoogleGenAI } from '@google/genai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGeminiClient } from './_shared/gemini';
import {
  aiError,
  errorMessage,
  isUuid,
  ok,
  parseJsonBody,
  rateLimit,
  readCaller,
  readLocale,
  sanitizeScenario,
  sanitizeTurns,
} from './_shared/ai';
import { scenarioSummaryLine } from '../../src/data/scenarioSummary';
import type { Scenario } from '../../src/data/scenarios';
import { MODEL_LIVE, MODEL_TEXT } from '../../src/shared/ai/models';
import {
  ENDED_EARLY_VALUES,
  isAnonSessionId,
  type EndedEarly,
  type EvaluateRequest,
  type EvaluateResponse,
} from '../../src/shared/ai/contract';
import { isLocale, type Locale } from '../../src/i18n/locales';
import {
  checkSessionOwner,
  ownerColumns,
  writeAnonymousSession,
  type SessionOwner,
} from './_shared/anonSessions';
import type { ChatMessage, ScoreReport } from '../../src/services/types';
import { scoreTranscript, unavailableReport } from './_shared/scoring';

const MAX_BODY_BYTES = 1024 * 1024;

interface PersistArgs {
  owner: SessionOwner;
  sessionId: string;
  scenario: Scenario;
  transcript: ChatMessage[];
  report: ScoreReport;
  mode: 'text' | 'voice';
  locale: Locale | null;
}

/**
 * Write the score into the caller's own row. Ownership guard first: a
 * client-supplied `sessionId` must never let one user (or device) overwrite
 * another's session — for a device the guard is inside the write itself
 * (`writeAnonymousSession`: still anonymous, same device, daily row cap).
 * `duration_seconds` is deliberately not sent — the client (or
 * `session-save`) fills it with its own write, which omits the score columns.
 */
async function persistScore(sb: SupabaseClient, args: PersistArgs): Promise<boolean> {
  const fields = {
    ...(args.locale ? { locale: args.locale } : {}),
    scenario: args.scenario as unknown as Record<string, unknown>,
    transcript: args.transcript as unknown as Record<string, unknown>[],
    score_report: args.report as unknown as Record<string, unknown>,
    score_overall: args.report.overall,
    mode: args.mode,
    model_id: args.mode === 'voice' ? MODEL_LIVE : MODEL_TEXT,
    turns: args.transcript.length,
    completed: true,
    ended_reason: 'completed',
    pushback_id: args.scenario.pushback.id,
    driver: args.scenario.suggestedDriver,
    scenario_summary: scenarioSummaryLine(args.scenario),
  };
  const refuse = () => {
    console.warn('[ai-evaluate] refusing to write a score into another owner\'s session', {
      sessionId: args.sessionId,
    });
    return false;
  };

  if ('anonId' in args.owner) {
    const written = await writeAnonymousSession(sb, args.sessionId, args.owner.anonId, fields);
    if (written === 'not_owner') return refuse();
    return written === 'ok';
  }

  const ownership = await checkSessionOwner(sb, args.sessionId, args.owner);
  if (ownership !== 'ok') return ownership === 'not_owner' ? refuse() : false;

  const { error } = await sb
    .from('training_sessions')
    .upsert({ id: args.sessionId, ...ownerColumns(args.owner), ...fields }, { onConflict: 'id' });
  if (error) {
    console.warn('[ai-evaluate] score upsert failed', error.message);
    return false;
  }
  return true;
}

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'evaluate', { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await parseJsonBody<EvaluateRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;

  const caller = await readCaller(req);
  if (caller instanceof Response) return caller;

  const scenario = sanitizeScenario(body.scenario);
  if (!scenario) return aiError(400, 'bad_request', 'scenario is missing required fields');
  const mode = body.mode === 'voice' ? 'voice' : body.mode === 'text' ? 'text' : null;
  if (!mode) return aiError(400, 'bad_request', 'mode must be "text" or "voice"');

  const locale = readLocale(body.locale);
  const transcript = sanitizeTurns(body.transcript);
  const preview = body.preview === true;
  const allowTelemetry = body.allowTelemetry !== false;
  const sessionId = isUuid(body.sessionId) ? body.sessionId : null;

  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[ai-evaluate]', errorMessage(err));
    return aiError(500, 'server', 'AI is not configured');
  }

  const endedEarly = ENDED_EARLY_VALUES.includes(body.endedEarly as EndedEarly)
    ? (body.endedEarly as EndedEarly)
    : null;
  let report: ScoreReport;
  try {
    report = await scoreTranscript(caller.sb, ai, {
      scenario,
      transcript,
      locale,
      sessionId,
      userId: caller.userId,
      body,
      allowTelemetry,
      preview,
      endedEarly,
    });
  } catch (err) {
    console.error('[ai-evaluate] evaluateConversation failed', errorMessage(err));
    const payload: EvaluateResponse = { report: unavailableReport(), persisted: false };
    return ok(payload);
  }

  // Signed in → their own row. Anonymous → the row owned by their device id,
  // and only when they allow training data use (their session is recorded
  // for the training team, not for them, so the opt-out decides).
  const owner: SessionOwner | null = caller.userId
    ? { userId: caller.userId }
    : allowTelemetry && isAnonSessionId(body.anonSessionId)
      ? { anonId: body.anonSessionId }
      : null;
  let persisted = false;
  if (owner && !preview && sessionId) {
    try {
      persisted = await persistScore(caller.sb, {
        owner,
        sessionId,
        scenario,
        transcript,
        report,
        mode,
        locale: isLocale(body.locale) ? body.locale : null,
      });
    } catch (err) {
      console.warn('[ai-evaluate] persist threw', errorMessage(err));
      persisted = false;
    }
  }

  const payload: EvaluateResponse = { report, persisted };
  return ok(payload);
};
