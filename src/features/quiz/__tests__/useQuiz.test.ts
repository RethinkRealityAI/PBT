import { describe, expect, it, vi } from 'vitest';
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

describe('useQuiz undo', () => {
  it('cannot undo on the first question, so leaving there loses nothing', () => {
    const { result } = renderHook(() => useQuiz());
    expect(result.current.canUndo).toBe(false);
  });

  it('steps back one question and drops that answer', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => result.current.answer('Activator'));
    act(() => result.current.answer('Harmonizer'));
    expect(result.current.step).toMatchObject({ kind: 'question', index: 2 });
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(result.current.step).toMatchObject({ kind: 'question', index: 1 });

    // The discarded answer must not survive into the tally.
    for (let i = 1; i < QUIZ_QUESTIONS.length; i++) {
      act(() => result.current.answer('Activator'));
    }
    expect(result.current.step.kind).toBe('complete');
    if (result.current.step.kind === 'complete') {
      expect(result.current.step.result.tally.Harmonizer).toBe(0);
      expect(result.current.step.result.tally.Activator).toBe(15);
    }
  });

  it('re-arms the tie-breaker when stepping back out of it', () => {
    const { result } = renderHook(() => useQuiz());
    // 7 Activator, 7 Energizer, 1 Analyzer → the top two tie.
    for (let i = 0; i < 7; i++) act(() => result.current.answer('Activator'));
    for (let i = 0; i < 7; i++) act(() => result.current.answer('Energizer'));
    act(() => result.current.answer('Analyzer'));
    expect(result.current.step.kind).toBe('tieBreaker');

    act(() => result.current.undo());
    expect(result.current.step).toMatchObject({ kind: 'question' });

    // Re-answering into the same tied tally must offer the tie-breaker again
    // rather than completing on a tally that is still tied.
    act(() => result.current.answer('Analyzer'));
    expect(result.current.step.kind).toBe('tieBreaker');
  });
});

describe('useQuiz capture (admin ECHO analytics)', () => {
  it('records the final letter, driver and time per question, undos and the total', () => {
    const now = vi.spyOn(Date, 'now');
    let t = 1_000_000;
    now.mockImplementation(() => t);
    const { result } = renderHook(() => useQuiz());
    // Q1: 3 s → Activator; Q2: Harmonizer, then undo and re-answer Analyzer after 5 s.
    t += 3000;
    act(() => result.current.answer('Activator', t));
    t += 1000;
    act(() => result.current.answer('Harmonizer', t));
    t += 500;
    act(() => result.current.undo());
    t += 5000;
    act(() => result.current.answer('Analyzer', t));
    for (let i = 2; i < QUIZ_QUESTIONS.length; i++) {
      t += 2000;
      act(() => result.current.answer('Activator', t));
    }
    expect(result.current.step.kind).toBe('complete');
    if (result.current.step.kind !== 'complete') return;
    const { capture } = result.current.step;
    expect(capture.answers).toHaveLength(15);
    expect(capture.answers[0]).toMatchObject({ questionId: 1, driver: 'Activator', ms: 3000 });
    const q1 = QUIZ_QUESTIONS[0].options.find((o) => o.driver === 'Activator');
    expect(capture.answers[0].letter).toBe(q1?.letter);
    // The undone answer is gone; the re-answer is timed from when Q2 came back.
    expect(capture.answers[1]).toMatchObject({ questionId: 2, driver: 'Analyzer', ms: 5000 });
    expect(capture.undoCount).toBe(1);
    expect(capture.tieBreaker).toBeNull();
    expect(capture.totalMs).toBe(t - 1_000_000);
    expect(capture.id).toMatch(/^[0-9a-f-]{36}$/);
    now.mockRestore();
  });

  it('records the tie-breaker separately', () => {
    const { result } = renderHook(() => useQuiz());
    for (let i = 0; i < 7; i++) act(() => result.current.answer('Activator'));
    for (let i = 0; i < 7; i++) act(() => result.current.answer('Energizer'));
    act(() => result.current.answer('Analyzer'));
    act(() => result.current.answer('Energizer'));
    expect(result.current.step.kind).toBe('complete');
    if (result.current.step.kind !== 'complete') return;
    expect(result.current.step.capture.answers).toHaveLength(15);
    expect(result.current.step.capture.tieBreaker).toMatchObject({ questionId: 16, driver: 'Energizer' });
    expect(result.current.step.result.primary).toBe('Energizer');
  });
});

describe('useQuiz previousLetter (Back highlights the earlier choice)', () => {
  const letterOf = (index: number, driver: string) =>
    QUIZ_QUESTIONS[index].options.find((o) => o.driver === driver)?.letter;

  it('is null on a first visit and the earlier letter after Back', () => {
    const { result } = renderHook(() => useQuiz());
    expect(result.current.previousLetter).toBeNull();
    act(() => result.current.answer('Harmonizer'));
    act(() => result.current.answer('Analyzer'));
    // Q3 has never been answered.
    expect(result.current.previousLetter).toBeNull();
    act(() => result.current.undo());
    expect(result.current.previousLetter).toBe(letterOf(1, 'Analyzer'));
    act(() => result.current.undo());
    expect(result.current.previousLetter).toBe(letterOf(0, 'Harmonizer'));
  });

  it('follows a changed answer and leaves the capture to record only the final one', () => {
    let t = 2_000_000;
    const now = vi.spyOn(Date, 'now').mockImplementation(() => t);
    const { result } = renderHook(() => useQuiz());
    t += 1000;
    act(() => result.current.answer('Activator'));
    t += 1000;
    act(() => result.current.undo());
    expect(result.current.previousLetter).toBe(letterOf(0, 'Activator'));
    t += 4000;
    act(() => result.current.answer('Energizer'));
    act(() => result.current.undo());
    expect(result.current.previousLetter).toBe(letterOf(0, 'Energizer'));
    act(() => result.current.answer('Energizer'));
    for (let i = 1; i < QUIZ_QUESTIONS.length; i++) act(() => result.current.answer('Analyzer'));
    expect(result.current.step.kind).toBe('complete');
    if (result.current.step.kind !== 'complete') return;
    expect(result.current.step.capture.answers[0]).toMatchObject({
      questionId: 1,
      driver: 'Energizer',
      letter: letterOf(0, 'Energizer'),
    });
    expect(result.current.step.capture.undoCount).toBe(2);
    now.mockRestore();
  });

  it('reset forgets every earlier choice', () => {
    const { result } = renderHook(() => useQuiz());
    act(() => result.current.answer('Activator'));
    act(() => result.current.undo());
    act(() => result.current.reset());
    expect(result.current.previousLetter).toBeNull();
  });
});
