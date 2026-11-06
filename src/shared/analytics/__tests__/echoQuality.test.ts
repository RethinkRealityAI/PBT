import { describe, expect, it } from 'vitest';
import { QUIZ_QUESTIONS } from '../../../data/quizQuestions';
import type { EchoQuizAnswer, EchoQuizRow } from '../contract';
import {
  DEFAULT_ECHO_THRESHOLDS,
  assessEchoQuiz,
  clampThresholds,
  echoQuizMetrics,
  parseEchoAnswers,
} from '../echoQuality';
import { ALL_SAME_LETTER_FINGERPRINTS, TIE_BREAKER_ID, driverFor, type QuizLetter } from '../../quiz/echoScoring';

const CYCLE: QuizLetter[] = ['A', 'B', 'C', 'D'];

function answers(letterOf: (i: number) => QuizLetter, msOf: (i: number) => number = () => 4000): EchoQuizAnswer[] {
  return QUIZ_QUESTIONS.map((q, i) => {
    const letter = letterOf(i);
    return { q: q.id, letter, driver: driverFor(q.id, letter) ?? '', ms: msOf(i) };
  });
}

function row(over: Partial<EchoQuizRow> = {}): Pick<EchoQuizRow, 'answers' | 'tally' | 'review_status'> {
  return { answers: answers((i) => CYCLE[i % 4]), tally: {}, review_status: 'auto', ...over };
}

describe('echoQuizMetrics', () => {
  it('measures a varied, thoughtful quiz as clean', () => {
    const a = assessEchoQuiz(row());
    expect(a.metrics.answered).toBe(15);
    expect(a.metrics.medianMs).toBe(4000);
    expect(a.metrics.longestRun).toBe(1);
    expect(a.metrics.maxLetterShare).toBeCloseTo(4 / 15);
    expect(a.autoFlagged).toBe(false);
    expect(a.excluded).toBe(false);
  });

  it('flags "just click A" as straight-lined, and rushed when fast', () => {
    const a = assessEchoQuiz(row({ answers: answers(() => 'A', () => 600) }));
    expect(a.metrics.maxLetter).toBe('A');
    expect(a.metrics.maxLetterShare).toBe(1);
    expect(a.metrics.longestRun).toBe(15);
    expect(a.flags).toEqual({ rushed: true, straightLined: true, pattern: false });
    expect(a.metrics.fastShare).toBe(1);
    expect(a.excluded).toBe(true);
  });

  it('applies the thresholds at their edges', () => {
    // 12 of 15 = 80 % one letter, runs of 3.
    const letterOf = (i: number): QuizLetter => (i % 4 === 3 ? 'B' : 'A');
    const r = row({ answers: answers(letterOf) });
    const m = echoQuizMetrics(r);
    expect(m.maxLetterShare).toBeCloseTo(12 / 15);
    expect(m.longestRun).toBe(3);
    expect(assessEchoQuiz(r).flags.straightLined).toBe(true);
    expect(assessEchoQuiz(r, { ...DEFAULT_ECHO_THRESHOLDS, sameLetterPct: 85 }).flags.straightLined).toBe(false);
    // A run of exactly 6 trips the default.
    const run6 = row({ answers: answers((i) => (i < 6 ? 'C' : CYCLE[i % 4])) });
    expect(echoQuizMetrics(run6).longestRun).toBeGreaterThanOrEqual(6);
    expect(assessEchoQuiz(run6).flags.straightLined).toBe(true);
    expect(assessEchoQuiz(run6, { ...DEFAULT_ECHO_THRESHOLDS, runLength: 8 }).flags.straightLined).toBe(false);
    // Median exactly at the threshold is not rushed.
    expect(assessEchoQuiz(row({ answers: answers((i) => CYCLE[i % 4], () => 2000) })).flags.rushed).toBe(false);
    expect(assessEchoQuiz(row({ answers: answers((i) => CYCLE[i % 4], () => 1999) })).flags.rushed).toBe(true);
  });

  it('keeps the tie-breaker out of the letter metrics', () => {
    const a = answers((i) => CYCLE[i % 4]);
    a.push({ q: TIE_BREAKER_ID, letter: 'A', driver: 'Activator', ms: 10 });
    const m = echoQuizMetrics({ answers: a, tally: {} });
    expect(m.answered).toBe(15);
    expect(m.medianMs).toBe(4000);
  });

  it('does not call a short partial record 100 % one letter', () => {
    const short = answers(() => 'A').slice(0, 3);
    const a = assessEchoQuiz(row({ answers: short }));
    expect(a.metrics.answered).toBe(3);
    expect(a.flags.straightLined).toBe(false);
    // A gap in the questions breaks a run.
    const gappy = answers(() => 'A').filter((x) => x.q !== 4 && x.q !== 9 && x.q !== 13);
    expect(echoQuizMetrics({ answers: gappy, tally: {} }).longestRun).toBe(4);
  });

  it('pattern-matches backfilled profiles by their tally only', () => {
    for (const f of ALL_SAME_LETTER_FINGERPRINTS) {
      const a = assessEchoQuiz({ answers: null, tally: f.tally, review_status: 'auto' });
      expect(a.flags.pattern).toBe(true);
      expect(a.metrics.fingerprint).toBe(f.letter);
      expect(a.flags.rushed).toBe(false);
    }
    const clean = assessEchoQuiz({ answers: null, tally: { Activator: 9, Energizer: 3, Analyzer: 2, Harmonizer: 1 }, review_status: 'auto' });
    expect(clean.autoFlagged).toBe(false);
    expect(clean.metrics.medianMs).toBeNull();
  });

  it('lets a review override the automatic flags', () => {
    const fast = { answers: answers(() => 'A', () => 300), tally: {} };
    expect(assessEchoQuiz({ ...fast, review_status: 'include' }).excluded).toBe(false);
    expect(assessEchoQuiz({ ...fast, review_status: 'include' }).autoFlagged).toBe(true);
    expect(assessEchoQuiz({ ...row(), review_status: 'exclude' }).excluded).toBe(true);
    expect(assessEchoQuiz({ ...row(), review_status: 'exclude' }).reviewed).toBe(true);
  });
});

describe('parseEchoAnswers / clampThresholds', () => {
  it('drops malformed answers', () => {
    expect(parseEchoAnswers(null)).toBeNull();
    expect(parseEchoAnswers([{ q: 1, letter: 'E', ms: 1 }, { q: 2, letter: 'A', ms: -5 }, 'x', { q: 40, letter: 'A' }])).toEqual([
      { q: 2, letter: 'A', driver: '', ms: 0 },
    ]);
  });
  it('clamps thresholds into the control ranges', () => {
    expect(clampThresholds({ fastMs: 1, sameLetterPct: 500, runLength: Number.NaN })).toEqual({
      fastMs: 250,
      sameLetterPct: 100,
      runLength: 6,
    });
  });
});
