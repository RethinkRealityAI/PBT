/**
 * Records ANONYMOUS practice sessions — `SessionSaveRequest → SessionSaveResponse`.
 *
 * PBT is anonymous-first, but a session nobody records is a session the
 * training team can't learn from. Signed-in sessions are upserted by the app
 * itself (RLS: the trainee's own row); a trainee without an account has no
 * row they could write, so the app posts the finished (or abandoned)
 * conversation here and the server writes it with the service role, owned by
 * the device's random id (`anon_session_id`) — no name, no email, no account.
 * See `_shared/anonSessions.ts` for the ownership rules and migration
 * `20261015000000_anonymous_sessions.sql` for the columns.
 *
 * Two operations:
 *   • record (default) — anonymous callers only. Writes the conversation,
 *     never a score (`ai-evaluate` is the only score writer). A signed-in
 *     caller is told `skipped: 'signed_in'` (their app writes its own row).
 *     Nothing is written with `allowTelemetry: false` (the trainee's "Allow
 *     training data use" opt-out) or `preview: true`.
 *   • claim — a trainee who practised anonymously and then signs in hands
 *     over the ids of the sessions on their device (`claim: true`,
 *     `anonSessionId`, `sessionIds`); the anonymous rows of THAT device among
 *     them become theirs. The app sends only the sessions saved in its own
 *     local history — the same sessions the sign-up backfill uploads, so a
 *     shared device behaves exactly as before.
 *
 * Abuse bounds (the endpoint is open to anyone, like the rest of the
 * anonymous-first app): per-IP rate limits (recording and claiming have their
 * own buckets, so a clinic behind one IP can't lose a claim to its own
 * recording), a 128 KB body (a real 16-turn session is a few KB; turns are
 * capped by `sanitizeTurns`) and at most `ANON_DAILY_CAP` new rows per device
 * a day. Writes are ownership-guarded in the statement itself
 * (`writeAnonymousSession`), so a claim racing a save can't be undone.
 */
import {
  aiError,
  isUuid,
  ok,
  parseJsonBody,
  rateLimit,
  readCaller,
  sanitizeScenario,
  sanitizeTurns,
} from './_shared/ai';
import { RATE_LIMITS, perMinute } from './_shared/rateLimits';
import { writeAnonymousSession } from './_shared/anonSessions';
import { scenarioSummaryLine } from '../../src/data/scenarioSummary';
import { MODEL_LIVE, MODEL_TEXT } from '../../src/shared/ai/models';
import {
  isAnonSessionId,
  type SessionClaimRequest,
  type SessionClaimResponse,
  type SessionEndedReason,
  type SessionSaveRequest,
  type SessionSaveResponse,
} from '../../src/shared/ai/contract';
import { isLocale } from '../../src/i18n/locales';

const MAX_BODY_BYTES = 128 * 1024;
/** Sessions one claim may hand over (the app keeps at most 50 locally). */
export const CLAIM_MAX = 100;
/** Longest session we'll record (voice is capped at 5 min; text has no hard cap). */
const MAX_DURATION_SECONDS = 6 * 60 * 60;

const ENDED: readonly SessionEndedReason[] = ['completed', 'abandoned', 'timeout', 'error', 'user_exit'];

type ClaimRequest = SessionClaimRequest;
type ClaimResponse = SessionClaimResponse;

async function claim(
  sb: Parameters<typeof writeAnonymousSession>[0],
  userId: string,
  body: Partial<ClaimRequest>,
): Promise<Response> {
  if (!isAnonSessionId(body.anonSessionId)) return aiError(400, 'bad_request', 'anonSessionId is invalid');
  const ids = Array.isArray(body.sessionIds) ? [...new Set(body.sessionIds.filter(isUuid))].slice(0, CLAIM_MAX) : [];
  if (ids.length === 0) return ok<ClaimResponse>({ claimed: [] });
  const { data, error } = await sb
    .from('training_sessions')
    .update({ user_id: userId, anon_session_id: null })
    .in('id', ids)
    .is('user_id', null)
    .eq('anon_session_id', body.anonSessionId)
    .select('id, origin');
  if (error) {
    console.warn('[session-save] claim failed', error.message);
    return aiError(500, 'server', 'Could not claim sessions');
  }
  const rows = (data ?? []) as Array<{ id: string; origin?: string | null }>;
  return ok<ClaimResponse>({
    claimed: rows.map((r) => ({ id: r.id, complete: r.origin !== 'reconstructed' })),
  });
}

export default async (req: Request): Promise<Response> => {
  const parsed = await parseJsonBody<SessionSaveRequest | ClaimRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body as Partial<SessionSaveRequest> & Partial<ClaimRequest>;

  const checkpoint = body.claim !== true && body.checkpoint === true;
  // Checkpoints arrive after every exchange — a workshop room shares one IP —
  // so they get their own, larger bucket; they only ever update a row (the
  // daily per-device row cap still bounds inserts).
  const limited =
    body.claim === true
      ? rateLimit(req, 'session-claim', perMinute(RATE_LIMITS.sessionClaim))
      : checkpoint
        ? rateLimit(req, 'session-checkpoint', perMinute(RATE_LIMITS.sessionCheckpoint))
        : rateLimit(req, 'session-save', perMinute(RATE_LIMITS.sessionSave));
  if (limited) return limited;

  const caller = await readCaller(req);
  if (caller instanceof Response) return caller;

  if (body.claim === true) {
    if (!caller.userId) return aiError(401, 'unauthorized', 'Sign in to claim sessions');
    return claim(caller.sb, caller.userId, body);
  }

  const skip = (skipped: SessionSaveResponse['skipped']) => ok<SessionSaveResponse>({ persisted: false, skipped });
  if (caller.userId) return skip('signed_in');
  if (body.preview === true) return skip('preview');
  if (body.allowTelemetry === false) return skip('opted_out');

  if (!isUuid(body.sessionId)) return aiError(400, 'bad_request', 'sessionId must be a UUID');
  if (!isAnonSessionId(body.anonSessionId)) return aiError(400, 'bad_request', 'anonSessionId is invalid');
  const scenario = sanitizeScenario(body.scenario);
  if (!scenario) return aiError(400, 'bad_request', 'scenario is missing required fields');
  const mode = body.mode === 'voice' ? 'voice' : body.mode === 'text' ? 'text' : null;
  if (!mode) return aiError(400, 'bad_request', 'mode must be "text" or "voice"');
  const endedReason = ENDED.includes(body.endedReason as SessionEndedReason)
    ? (body.endedReason as SessionEndedReason)
    : null;
  if (!endedReason && !checkpoint) return aiError(400, 'bad_request', 'endedReason is invalid');
  const transcript = sanitizeTurns(body.transcript);
  const duration = Number(body.durationSeconds);
  const durationSeconds = Number.isFinite(duration)
    ? Math.max(0, Math.min(MAX_DURATION_SECONDS, Math.round(duration)))
    : null;

  // No score columns: only `ai-evaluate` writes those, and a write leaves the
  // columns it doesn't name untouched, so a score already written stays.
  const written = await writeAnonymousSession(caller.sb, body.sessionId, body.anonSessionId, {
    origin: 'app',
    scenario: scenario as unknown as Record<string, unknown>,
    transcript: transcript as unknown as Record<string, unknown>[],
    duration_seconds: durationSeconds,
    mode,
    // In progress: no ending yet (`sessions-recover` scores it if it never ends).
    completed: checkpoint ? false : body.completed === true,
    ended_reason: checkpoint ? null : endedReason,
    pushback_id: scenario.pushback.id,
    driver: scenario.suggestedDriver,
    scenario_summary: scenarioSummaryLine(scenario),
    model_id: mode === 'voice' ? MODEL_LIVE : MODEL_TEXT,
    turns: transcript.length,
    locale: isLocale(body.locale) ? body.locale : null,
  }, { onlyInProgress: checkpoint });
  if (written === 'ok') return ok<SessionSaveResponse>({ persisted: true });
  return skip(written === 'error' ? 'failed' : written);
};
