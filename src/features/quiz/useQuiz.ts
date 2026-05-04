import { useCallback, useMemo, useState } from 'react';
import {
  QUIZ_QUESTIONS,
  TIE_BREAKER,
} from '../../data/quizQuestions';
import { DRIVER_KEYS, type DriverKey } from '../../design-system/tokens';

export interface QuizResult {
  primary: DriverKey;
  secondary: DriverKey;
  tally: Record<DriverKey, number>;
  answers: DriverKey[];
}

export type QuizStep =
  | { kind: 'question'; index: number; total: number }
  | { kind: 'tieBreaker' }
  | { kind: 'complete'; result: QuizResult };

const ZERO_TALLY = (): Record<DriverKey, number> =>
  DRIVER_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: 0 }),
    {} as Record<DriverKey, number>,
  );

function computeResult(answers: DriverKey[]): QuizResult {
  const tally = ZERO_TALLY();
  for (const a of answers) tally[a] += 1;
  const sorted = (Object.entries(tally) as [DriverKey, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  return {
    primary: sorted[0],
    secondary: sorted[1],
    tally,
    answers,
  };
}

function topTwoTie(answers: DriverKey[]): boolean {
  const tally = ZERO_TALLY();
  for (const a of answers) tally[a] += 1;
  const counts = Object.values(tally).sort((a, b) => b - a);
  return counts[0] === counts[1];
}

export function useQuiz() {
  const [answers, setAnswers] = useState<DriverKey[]>([]);
  const [tieBreakerAsked, setTieBreakerAsked] = useState(false);

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
    return { kind: 'complete', result: computeResult(answers) };
  }, [answers, tieBreakerAsked]);

  const answer = useCallback((driver: DriverKey) => {
    setAnswers((prev) => {
      if (prev.length < QUIZ_QUESTIONS.length) return [...prev, driver];
      // Tie-breaker resolves with a +1 vote for the chosen driver.
      return [...prev, driver];
    });
    if (answers.length >= QUIZ_QUESTIONS.length) {
      setTieBreakerAsked(true);
    }
  }, [answers.length]);

  const reset = useCallback(() => {
    setAnswers([]);
    setTieBreakerAsked(false);
  }, []);

  const currentQuestion =
    step.kind === 'question' ? QUIZ_QUESTIONS[step.index] : null;
  const tieBreaker = step.kind === 'tieBreaker' ? TIE_BREAKER : null;

  return { step, currentQuestion, tieBreaker, answer, reset };
}
