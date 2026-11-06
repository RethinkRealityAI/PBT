import { useCallback, useMemo, useRef, useState } from 'react';
import {
  QUIZ_QUESTIONS,
  TIE_BREAKER,
} from '../../data/quizQuestions';
import type { DriverKey } from '../../design-system/tokens';
import {
  TIE_BREAKER_ID,
  letterFor,
  rankTally,
  tallyOf,
  topTwoTie as tallyTopTwoTie,
  type QuizLetter,
} from '../../shared/quiz/echoScoring';
import { uuid } from '../../lib/id';

export interface QuizResult {
  primary: DriverKey;
  secondary: DriverKey;
  tally: Record<DriverKey, number>;
  answers: DriverKey[];
}

/** One answered question as it is recorded (the FINAL answer after any undo). */
export interface QuizAnswerRecord {
  questionId: number;
  letter: QuizLetter;
  driver: DriverKey;
  /** From the question being shown to the tap that answered it. */
  ms: number;
}

/**
 * What a completed quiz sends to `echo-quiz-save` (admin-only data quality:
 * per-answer letters and timings, undos). Never shown to the trainee and
 * never stored locally beyond `Profile.quizResultId`.
 */
export interface QuizCapture {
  /** Client-generated id of this completion (the server row's id). */
  id: string;
  answers: QuizAnswerRecord[];
  tieBreaker: QuizAnswerRecord | null;
  undoCount: number;
  /** From the first question being shown to the last answer. */
  totalMs: number;
}

export type QuizStep =
  | { kind: 'question'; index: number; total: number }
  | { kind: 'tieBreaker' }
  | { kind: 'complete'; result: QuizResult; capture: QuizCapture };

function computeResult(answers: DriverKey[]): QuizResult {
  const { primary, secondary, tally } = rankTally(tallyOf(answers));
  return { primary, secondary, tally, answers };
}

function topTwoTie(answers: DriverKey[]): boolean {
  return tallyTopTwoTie(tallyOf(answers));
}

const now = () => Date.now();

export function useQuiz() {
  const [answers, setAnswers] = useState<DriverKey[]>([]);
  const [tieBreakerAsked, setTieBreakerAsked] = useState(false);
  // Timing + letters, kept beside `answers` (index-aligned; the tie-breaker is
  // the 16th entry, exactly like `answers`). Refs: they never drive a render.
  const recordsRef = useRef<QuizAnswerRecord[]>([]);
  const shownAtRef = useRef<number>(now());
  const startedAtRef = useRef<number>(shownAtRef.current);
  const undoCountRef = useRef(0);
  const lastAnswerAtRef = useRef<number>(shownAtRef.current);

  const step: QuizStep = useMemo(() => {
    if (answers.length < QUIZ_QUESTIONS.length) {
      return {
        kind: 'question',
        index: answers.length,
        total: QUIZ_QUESTIONS.length,
      };
    }
    if (topTwoTie(answers) && !tieBreakerAsked) {
      return { kind: 'tieBreaker' };
    }
    const records = recordsRef.current.slice(0, answers.length);
    const capture: QuizCapture = {
      id: uuid(),
      answers: records.filter((r) => r.questionId !== TIE_BREAKER_ID),
      tieBreaker: records.find((r) => r.questionId === TIE_BREAKER_ID) ?? null,
      undoCount: undoCountRef.current,
      totalMs: Math.max(0, lastAnswerAtRef.current - startedAtRef.current),
    };
    return { kind: 'complete', result: computeResult(answers), capture };
  }, [answers, tieBreakerAsked]);

  /**
   * Record an answer. `at` is when the trainee tapped (the screen animates the
   * choice before calling this) — the answer's time is measured to it.
   */
  const answer = useCallback((driver: DriverKey, at?: number) => {
    const index = answers.length;
    const questionId = index < QUIZ_QUESTIONS.length ? QUIZ_QUESTIONS[index].id : TIE_BREAKER_ID;
    const tapped = typeof at === 'number' && Number.isFinite(at) ? at : now();
    const letter = letterFor(questionId, driver);
    if (letter && index <= QUIZ_QUESTIONS.length) {
      recordsRef.current = [
        ...recordsRef.current.slice(0, index),
        { questionId, letter, driver, ms: Math.max(0, tapped - shownAtRef.current) },
      ];
    }
    lastAnswerAtRef.current = tapped;
    // The next question appears now.
    shownAtRef.current = now();
    setAnswers((prev) => {
      if (prev.length < QUIZ_QUESTIONS.length) return [...prev, driver];
      // Tie-breaker resolves with a +1 vote for the chosen driver.
      return [...prev, driver];
    });
    if (answers.length >= QUIZ_QUESTIONS.length) {
      setTieBreakerAsked(true);
    }
  }, [answers.length]);

  const undo = useCallback(() => {
    setAnswers((prev) => prev.slice(0, -1));
    undoCountRef.current += 1;
    // The question stepped back to is shown again from now.
    shownAtRef.current = now();
    // Stepping back past the tie-breaker has to re-arm it, or the quiz would
    // complete on a tally that is still tied.
    setTieBreakerAsked(false);
  }, []);

  const reset = useCallback(() => {
    setAnswers([]);
    setTieBreakerAsked(false);
    recordsRef.current = [];
    undoCountRef.current = 0;
    shownAtRef.current = now();
    startedAtRef.current = shownAtRef.current;
    lastAnswerAtRef.current = shownAtRef.current;
  }, []);

  const currentQuestion =
    step.kind === 'question' ? QUIZ_QUESTIONS[step.index] : null;
  const tieBreaker = step.kind === 'tieBreaker' ? TIE_BREAKER : null;

  return {
    step,
    currentQuestion,
    tieBreaker,
    answer,
    undo,
    canUndo: answers.length > 0,
    reset,
  };
}
