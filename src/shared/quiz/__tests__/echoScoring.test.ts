import { describe, expect, it } from 'vitest';
import { QUIZ_QUESTIONS, TIE_BREAKER } from '../../../data/quizQuestions';
import {
  ALL_SAME_LETTER_FINGERPRINTS,
  TIE_BREAKER_ID,
  allSameLetterScore,
  driverFor,
  fingerprintLetter,
  letterFor,
  scoreLetters,
  type QuizLetter,
} from '../echoScoring';

const letters = (l: QuizLetter) => new Map<number, QuizLetter>(QUIZ_QUESTIONS.map((q) => [q.id, l]));

describe('ECHO scoring', () => {
  it('pins the all-same-letter fingerprints (they come from the quiz, never hard-coded)', () => {
    // If a question is re-mapped these change — on purpose: update the pins
    // and say so, because the admin "pattern match" flag reads them.
    expect(Object.fromEntries(ALL_SAME_LETTER_FINGERPRINTS.map((f) => [f.letter, f.tally]))).toEqual({
      A: { Activator: 3, Energizer: 3, Analyzer: 6, Harmonizer: 3 },
      B: { Activator: 8, Energizer: 3, Analyzer: 2, Harmonizer: 2 },
      C: { Activator: 3, Energizer: 5, Analyzer: 4, Harmonizer: 3 },
      D: { Activator: 1, Energizer: 4, Analyzer: 3, Harmonizer: 7 },
    });
    expect(allSameLetterScore('A').primary).toBe('Analyzer');
    expect(allSameLetterScore('B').primary).toBe('Activator');
    expect(allSameLetterScore('C').primary).toBe('Energizer');
    expect(allSameLetterScore('D').primary).toBe('Harmonizer');
  });

  it('maps letters to drivers per question, and back', () => {
    for (const q of QUIZ_QUESTIONS) {
      for (const o of q.options) {
        expect(driverFor(q.id, o.letter)).toBe(o.driver);
        expect(letterFor(q.id, o.driver)).toBe(o.letter);
      }
    }
    expect(driverFor(TIE_BREAKER_ID, 'A')).toBe(TIE_BREAKER.options[0].driver);
    expect(driverFor(99, 'A')).toBeNull();
  });

  it('uses the tie-breaker only when the top two tie', () => {
    const noTie = scoreLetters(letters('B'), 'D');
    expect(noTie.tieBreakerUsed).toBe(false);
    expect(noTie.tally.Activator).toBe(8);

    // Build a 7 / 7 / 1 tie: Activator ×7, Energizer ×7, Analyzer ×1.
    const tied = new Map<number, QuizLetter>();
    QUIZ_QUESTIONS.forEach((q, i) => {
      const want = i < 7 ? 'Activator' : i < 14 ? 'Energizer' : 'Analyzer';
      tied.set(q.id, letterFor(q.id, want) as QuizLetter);
    });
    const tb = letterFor(TIE_BREAKER_ID, 'Energizer') as QuizLetter;
    const r = scoreLetters(tied, tb);
    expect(r.tieBreakerUsed).toBe(true);
    expect(r.primary).toBe('Energizer');
    expect(r.secondary).toBe('Activator');
    // Without a tie-breaker, the stable DRIVER_KEYS order decides.
    expect(scoreLetters(tied, null).primary).toBe('Activator');
  });

  it('matches a tally against the fingerprints exactly', () => {
    expect(fingerprintLetter({ Analyzer: 6, Harmonizer: 3, Energizer: 3, Activator: 3 })).toBe('A');
    expect(fingerprintLetter({ Analyzer: 6, Harmonizer: 3, Energizer: 3, Activator: 4 })).toBeNull();
    expect(fingerprintLetter(null)).toBeNull();
    expect(fingerprintLetter({})).toBeNull();
  });
});
