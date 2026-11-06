/**
 * Records COMPLETED ECHO style quizzes — `EchoQuizSaveRequest →
 * EchoQuizSaveResponse` — for the admins' ECHO analytics (Analytics → ECHO:
 * spotting rushed or straight-lined quizzes, e.g. a workshop told to "just
 * click A" to get in).
 *
 * Trust boundary: the body carries LETTERS and timings only. Drivers, tally,
 * primary and secondary are DERIVED here from the shared quiz definition
 * (`src/shared/quiz/echoScoring.ts`); a client tally is never read.
 *
 * Ownership (like anonymous sessions, `session-save`): signed in → `user_id`
 * from the verified JWT; anonymous → `anon_session_id`, the random device id
 * (`pbt:session_id`). Rows are written with the service role (RLS on, no
 * policies — browsers can't read or write `echo_quiz_results` at all).
 *
 * Two operations:
 *   • record (default) — insert-if-absent by the client's `quizId`, so a retry
 *     never duplicates and never rewrites a row (owned by anyone). Nothing is
 *     written with `allowTelemetry: false` (the "Allow training data use"
 *     opt-out) or `preview: true`.
 *   • claim — signed-in only: the quiz ids the device holds locally move from
 *     that device to the account, guarded IN the statement (`user_id is null
 *     and anon_session_id = <device>`), so a row of another device or account
 *     is never touched.
 *
 * Abuse bounds: per-IP buckets sized for a workshop room (`rateLimits.ts`), a
 * 16 KB body (a real quiz is ~1 KB), and at most `ECHO_QUIZ_DAILY_CAP` rows a
 * day per device / per account. Migration
 * `20261106000000_echo_quiz_results.sql`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { aiError, isUuid, ok, parseJsonBody, rateLimit, readCaller } from './_shared/ai';
import { RATE_LIMITS, perMinute } from './_shared/rateLimits';
import {
  isAnonSessionId,
  type EchoQuizClaimRequest,
  type EchoQuizClaimResponse,
  type EchoQuizSaveRequest,
  type EchoQuizSaveResponse,
} from '../../src/shared/ai/contract';
import { isLocale } from '../../src/i18n/locales';
import {
  QUIZ_QUESTION_IDS,
  TIE_BREAKER_ID,
  driverFor,
  isQuizLetter,
  scoreLetters,
  topTwoTie,
  tallyOf,
  type QuizLetter,
} from '../../src/shared/quiz/echoScoring';
import type { DriverKey } from '../../src/design-system/tokens';

const MAX_BODY_BYTES = 16 * 1024;
/** Answers one quiz may carry (15 questions; the tie-breaker rides separately). */
export const ECHO_MAX_ANSWERS = 16;
/** Longest believable time on one question (10 min) — longer is clamped. */
export const ECHO_MAX_ANSWER_MS = 600_000;
/** Longest believable quiz (2 h) — longer is clamped. */
export const ECHO_MAX_TOTAL_MS = 2 * 60 * 60 * 1000;
export const ECHO_MAX_UNDOS = 500;
/** Quiz rows one device (or account) may add per 24 hours. */
export const ECHO_QUIZ_DAILY_CAP = 50;
export const ECHO_CLAIM_MAX = 20;

export interface StoredAnswer {
  q: number;
  letter: QuizLetter;
  driver: DriverKey;
  ms: number;
}

function clampMs(v: unknown, max: number): number | null {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(max, Math.round(n)));
}

export type ParsedQuiz =
  | { ok: false; message: string }
  | {
      ok: true;
      answers: StoredAnswer[];
      tieBreaker: StoredAnswer | null;
      tally: Record<DriverKey, number>;
      primary: DriverKey;
      secondary: DriverKey;
      totalMs: number | null;
      undoCount: number | null;
    };

/**
 * Validate a quiz body and DERIVE its result. Every one of the 15 questions
 * exactly once, letters A–D, times clamped. The tie-breaker is kept only when
 * the 15 answers really leave the top two tied (as the app asks it).
 */
export function parseQuiz(body: Partial<EchoQuizSaveRequest>): ParsedQuiz {
  if (!Array.isArray(body.answers)) return { ok: false, message: 'answers must be an array' };
  if (body.answers.length > ECHO_MAX_ANSWERS) return { ok: false, message: 'too many answers' };
  const byQuestion = new Map<number, StoredAnswer>();
  for (const raw of body.answers as unknown[]) {
    if (!raw || typeof raw !== 'object') return { ok: false, message: 'answer must be an object' };
    const a = raw as { questionId?: unknown; letter?: unknown; ms?: unknown };
    const q = typeof a.questionId === 'number' ? a.questionId : Number.NaN;
    if (!QUIZ_QUESTION_IDS.includes(q)) return { ok: false, message: 'unknown questionId' };
    if (byQuestion.has(q)) return { ok: false, message: 'duplicate questionId' };
    if (!isQuizLetter(a.letter)) return { ok: false, message: 'letter must be A–D' };
    const driver = driverFor(q, a.letter);
    if (!driver) return { ok: false, message: 'unknown option' };
    const ms = clampMs(a.ms, ECHO_MAX_ANSWER_MS);
    if (ms === null) return { ok: false, message: 'ms must be a number' };
    byQuestion.set(q, { q, letter: a.letter, driver, ms });
  }
  if (byQuestion.size !== QUIZ_QUESTION_IDS.length) return { ok: false, message: 'every question must be answered' };
  const answers = QUIZ_QUESTION_IDS.map((q) => byQuestion.get(q) as StoredAnswer);

  let tieBreaker: StoredAnswer | null = null;
  const tb = body.tieBreaker as { letter?: unknown; ms?: unknown } | null | undefined;
  if (tb != null) {
    if (typeof tb !== 'object' || !isQuizLetter(tb.letter)) return { ok: false, message: 'tieBreaker is invalid' };
    const ms = clampMs(tb.ms, ECHO_MAX_ANSWER_MS);
    if (ms === null) return { ok: false, message: 'tieBreaker.ms must be a number' };
    if (topTwoTie(tallyOf(answers.map((a) => a.driver)))) {
      tieBreaker = { q: TIE_BREAKER_ID, letter: tb.letter, driver: driverFor(TIE_BREAKER_ID, tb.letter) as DriverKey, ms };
    }
  }
  const scored = scoreLetters(new Map(answers.map((a) => [a.q, a.letter])), tieBreaker?.letter ?? null);
  const undos = body.undoCount === undefined ? null : clampMs(body.undoCount, ECHO_MAX_UNDOS);
  return {
    ok: true,
    answers,
    tieBreaker,
    tally: scored.tally,
    primary: scored.primary,
    secondary: scored.secondary,
    totalMs: body.totalMs === undefined ? null : clampMs(body.totalMs, ECHO_MAX_TOTAL_MS),
    undoCount: undos,
  };
}

/** A device-stated time, kept only when it parses and isn't absurd (else null). */
function takenAtOf(v: unknown, now: number): string | null {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t > now + 5 * 60_000 || t < now - 30 * 24 * 60 * 60_000) return null;
  return new Date(t).toISOString();
}

async function claim(sb: SupabaseClient, userId: string, body: Partial<EchoQuizClaimRequest>): Promise<Response> {
  if (!isAnonSessionId(body.anonSessionId)) return aiError(400, 'bad_request', 'anonSessionId is invalid');
  const ids = Array.isArray(body.quizIds) ? [...new Set(body.quizIds.filter(isUuid))].slice(0, ECHO_CLAIM_MAX) : [];
  if (ids.length === 0) return ok<EchoQuizClaimResponse>({ claimed: [] });
  const { data, error } = await sb
    .from('echo_quiz_results')
    .update({ user_id: userId, anon_session_id: null })
    .in('id', ids)
    .is('user_id', null)
    .eq('anon_session_id', body.anonSessionId)
    .select('id');
  if (error) {
    console.warn('[echo-quiz-save] claim failed', error.message);
    return aiError(500, 'server', 'Could not claim quiz results');
  }
  return ok<EchoQuizClaimResponse>({ claimed: ((data ?? []) as Array<{ id: string }>).map((r) => r.id) });
}

export default async (req: Request): Promise<Response> => {
  const parsed = await parseJsonBody<EchoQuizSaveRequest | EchoQuizClaimRequest>(req, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body as Partial<EchoQuizSaveRequest> & Partial<EchoQuizClaimRequest>;

  const limited =
    body.claim === true
      ? rateLimit(req, 'echo-quiz-claim', perMinute(RATE_LIMITS.echoQuizClaim))
      : rateLimit(req, 'echo-quiz-save', perMinute(RATE_LIMITS.echoQuizSave));
  if (limited) return limited;

  const caller = await readCaller(req);
  if (caller instanceof Response) return caller;

  if (body.claim === true) {
    if (!caller.userId) return aiError(401, 'unauthorized', 'Sign in to claim quiz results');
    return claim(caller.sb, caller.userId, body);
  }

  const skip = (skipped: EchoQuizSaveResponse['skipped']) => ok<EchoQuizSaveResponse>({ persisted: false, skipped });
  if (body.preview === true) return skip('preview');
  if (body.allowTelemetry === false) return skip('opted_out');

  if (!isUuid(body.quizId)) return aiError(400, 'bad_request', 'quizId must be a UUID');
  const owner = caller.userId
    ? ({ user_id: caller.userId, anon_session_id: null } as const)
    : isAnonSessionId(body.anonSessionId)
      ? ({ user_id: null, anon_session_id: body.anonSessionId } as const)
      : null;
  if (!owner) return aiError(400, 'bad_request', 'anonSessionId is invalid');

  const quiz = parseQuiz(body);
  if (quiz.ok === false) return aiError(400, 'bad_request', quiz.message);

  const sb = caller.sb;
  const now = Date.now();
  const since = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const recentQ = sb.from('echo_quiz_results').select('id', { count: 'exact', head: true }).gte('created_at', since);
  const recent = await (owner.user_id ? recentQ.eq('user_id', owner.user_id) : recentQ.eq('anon_session_id', owner.anon_session_id));
  if (recent.error) {
    console.warn('[echo-quiz-save] cap lookup failed', recent.error.message);
    return skip('failed');
  }
  if ((recent.count ?? 0) >= ECHO_QUIZ_DAILY_CAP) return skip('limit');

  const totalAnswerMs = quiz.answers.reduce((n, a) => n + a.ms, 0) + (quiz.tieBreaker?.ms ?? 0);
  // Insert-if-absent: a retry of the same quiz is a no-op, and an existing row
  // (whoever owns it) is never rewritten. `created_at` is the database's now().
  const inserted = await sb
    .from('echo_quiz_results')
    .upsert(
      {
        id: body.quizId,
        ...owner,
        source: 'app',
        taken_at: takenAtOf(body.takenAt, now),
        locale: isLocale(body.locale) ? body.locale : null,
        answers: quiz.answers,
        tie_breaker: quiz.tieBreaker,
        primary_driver: quiz.primary,
        secondary_driver: quiz.secondary,
        tally: quiz.tally,
        total_ms: quiz.totalMs ?? Math.min(ECHO_MAX_TOTAL_MS, totalAnswerMs),
        undo_count: quiz.undoCount,
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    .select('id');
  if (inserted.error) {
    console.warn('[echo-quiz-save] insert failed', inserted.error.message);
    return skip('failed');
  }
  const wrote = Array.isArray(inserted.data) && inserted.data.length > 0;
  // Nothing written = the id already exists (a retry, or someone else's row).
  return wrote ? ok<EchoQuizSaveResponse>({ persisted: true }) : skip('duplicate');
};
