/**
 * Records a completed ECHO style quiz on the server (`echo-quiz-save`) for the
 * admins' ECHO analytics. Fire-and-forget: it never blocks or slows the quiz
 * or the result screen, never throws, and the trainee sees nothing of it.
 *
 * Gates (the same as anonymous sessions): nothing leaves the device before the
 * current Terms were accepted (they say quiz answers are recorded), in the
 * admin preview frame, or — via `postAi` — with "Allow training data use" off
 * (`allowTelemetry: false`; the server writes nothing then either).
 */
import { postAi } from '../../services/aiApi';
import {
  AI_ENDPOINTS,
  type EchoQuizClaimRequest,
  type EchoQuizClaimResponse,
  type EchoQuizSaveRequest,
  type EchoQuizSaveResponse,
} from '../../shared/ai/contract';
import { getOrCreateSessionId } from '../../lib/storage';
import { hasAcceptedCurrentTerms } from '../../lib/terms';
import { isPreviewMode } from '../../lib/previewMode';
import { isTrainingUseAllowed } from '../../lib/privacy';
import type { Locale } from '../../i18n/locales';
import type { QuizCapture } from './useQuiz';

export function buildQuizSaveRequest(
  capture: QuizCapture,
  opts: { takenAt: string; locale: Locale; anonSessionId: string },
): EchoQuizSaveRequest {
  return {
    quizId: capture.id,
    anonSessionId: opts.anonSessionId,
    answers: capture.answers.map((a) => ({ questionId: a.questionId, letter: a.letter, ms: Math.round(a.ms) })),
    tieBreaker: capture.tieBreaker
      ? { letter: capture.tieBreaker.letter, ms: Math.round(capture.tieBreaker.ms) }
      : null,
    undoCount: capture.undoCount,
    totalMs: Math.round(capture.totalMs),
    takenAt: opts.takenAt,
    locale: opts.locale,
  };
}

export function recordQuizResult(capture: QuizCapture, opts: { takenAt: string; locale: Locale }): void {
  if (!hasAcceptedCurrentTerms() || isPreviewMode() || !isTrainingUseAllowed()) return;
  const body = buildQuizSaveRequest(capture, { ...opts, anonSessionId: getOrCreateSessionId() });
  void postAi<EchoQuizSaveResponse>(AI_ENDPOINTS.echoQuizSave, body, { timeoutMs: 15_000 }).catch((err) => {
    console.warn('[quiz] result not recorded', err);
  });
}

/**
 * After sign-in: hand this device's anonymous quiz row(s) to the account.
 * Only ids this device holds locally are sent (a shared clinic tablet's other
 * quizzes stay anonymous). Best-effort; `false` on failure.
 */
export async function claimQuizResults(quizIds: string[]): Promise<boolean> {
  const ids = quizIds.filter(Boolean);
  if (ids.length === 0) return true;
  try {
    const body: EchoQuizClaimRequest = { claim: true, anonSessionId: getOrCreateSessionId(), quizIds: ids };
    await postAi<EchoQuizClaimResponse>(AI_ENDPOINTS.echoQuizSave, body, { timeoutMs: 15_000 });
    return true;
  } catch (err) {
    console.warn('[quiz] claiming the quiz result failed', err);
    return false;
  }
}
