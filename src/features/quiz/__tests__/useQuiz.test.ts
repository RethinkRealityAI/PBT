import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useQuiz } from '../useQuiz';
import { QUIZ_QUESTIONS } from '../../../data/quizQuestions';

describe('useQuiz', () => {
  it('starts on question 0', () => {
    const { result } = renderHook(() => useQuiz());
    expect(result.current.step).toEqual({
      kind: 'question',
      index: 0,
      total: QUIZ_QUESTIONS.length,
    });
  });

  it('advances through 15 questions and produces a result', () => {
    const { result } = renderHook(() => useQuiz());
    // Answer all 15 with Activator → forces tie-break-free Activator primary
    for (let i = 0; i < QUIZ_QUESTIONS.length; i++) {
      act(() => result.current.answer('Activator'));
    }
    expect(result.current.step.kind).toBe('complete');
    if (result.current.step.kind === 'complete') {
      expect(result.current.step.result.primary).toBe('Activator');
      expect(result.current.step.result.tally.Activator).toBe(15);
    }
  });

  it('asks tie-breaker when top two scores tie', () => {
    const { result } = renderHook(() => useQuiz());
    // 7 Activator, 7 Energizer, 1 Analyzer → tie at top → tie-breaker
    for (let i = 0; i < 7; i++) act(() => result.current.answer('Activator'));
    for (let i = 0; i < 7; i++) act(() => result.current.answer('Energizer'));
    act(() => result.current.answer('Analyzer'));

    expect(result.current.step.kind).toBe('tieBreaker');

    // Resolve the tie with one Activator vote
    act(() => result.current.answer('Activator'));
    expect(result.current.step.kind).toBe('complete');
    if (result.current.step.kind === 'complete') {
      expect(result.current.step.result.primary).toBe('Activator');
    }
  });

  it('reset clears progress', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => result.current.answer('Activator'));
    act(() => result.current.reset());
    expect(result.current.step).toEqual({
      kind: 'question',
      index: 0,
      total: QUIZ_QUESTIONS.length,
    });
  });
});
