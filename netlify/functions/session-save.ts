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
 * Rate-limited per IP; the body is bounded like `ai-evaluate`'s.
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
import { checkSessionOwner, ownerColumns } from './_shared/anonSessions';
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

const MAX_BODY_BYTES = 1024 * 1024;
/** Sessions one claim may hand over (the app keeps at most 50 locally). */
export const CLAIM_MAX = 100;
/** Longest session we'll record (voice is capped at 5 min; text has no hard cap). */
const MAX_DURATION_SECONDS = 6 * 60 * 60;

const ENDED: readonly SessionEndedReason[] = ['completed', 'abandoned', 'timeout', 'error', 'user_exit'];

type ClaimRequest = SessionClaimRequest;
type ClaimResponse = SessionClaimResponse;

async function claim(
  sb: Parameters<typeof checkSessionOwner>[0],
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
    return ok<ClaimResponse>({ claimed: [] });
  }
  const rows = (data ?? []) as Array<{ id: string; origin?: string | null }>;
  return ok<ClaimResponse>({
    claimed: rows.map((r) => ({ id: r.id, complete: r.origin !== 'reconstructed' })),
  });
}

export default async (req: Request): Promise<Response> => {
  const limited = rateLimit(req, 'session-save', { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await parseJsonBody<SessionSaveRequest | ClaimRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body as Partial<SessionSaveRequest> & Partial<ClaimRequest>;

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
  if (!endedReason) return aiError(400, 'bad_request', 'endedReason is invalid');
  const transcript = sanitizeTurns(body.transcript);
  const duration = Number(body.durationSeconds);
  const durationSeconds = Number.isFinite(duration)
    ? Math.max(0, Math.min(MAX_DURATION_SECONDS, Math.round(duration)))
    : null;

  const owner = { anonId: body.anonSessionId };
  const ownership = await checkSessionOwner(caller.sb, body.sessionId, owner);
  if (ownership === 'not_owner') return skip('not_owner');
  if (ownership === 'error') return skip('failed');

  // No score columns: only `ai-evaluate` writes those, and an upsert leaves
  // the columns it doesn't name untouched, so a score already written stays.
  const { error } = await caller.sb.from('training_sessions').upsert(
    {
      id: body.sessionId,
      ...ownerColumns(owner),
      origin: 'app',
      scenario: scenario as unknown as Record<string, unknown>,
      transcript: transcript as unknown as Record<string, unknown>[],
      duration_seconds: durationSeconds,
      mode,
      completed: body.completed === true,
      ended_reason: endedReason,
      pushback_id: scenario.pushback.id,
      driver: scenario.suggestedDriver,
      scenario_summary: scenarioSummaryLine(scenario),
      model_id: mode === 'voice' ? MODEL_LIVE : MODEL_TEXT,
      turns: transcript.length,
      locale: isLocale(body.locale) ? body.locale : null,
    },
    { onConflict: 'id' },
  );
  if (error) {
    console.warn('[session-save] upsert failed', error.message);
    return skip('failed');
  }
  return ok<SessionSaveResponse>({ persisted: true });
};
