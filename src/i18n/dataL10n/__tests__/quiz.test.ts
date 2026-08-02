import { describe, it, expect } from 'vitest';
import { QUIZ_QUESTIONS, TIE_BREAKER } from '../../../data/quizQuestions';
import { registerDataCatalog } from '../../dataRegistry';
import { quiz as frQuiz } from '../../fr/data/quiz';
import {
  localizedQuizQuestion,
  localizedTieBreaker,
  type QuizQuestionId,
} from '../quiz';

/**
 * Guard rails for the quiz data overlay. The overlay is registered directly
 * (the lazy `loadCatalog` path is covered in the catalog tests) so these
 * assertions are about coverage and merge semantics, not module loading.
 */
registerDataCatalog('fr', { quiz: frQuiz });

describe('quiz data overlay — coverage', () => {
  it('translates every canonical question, with every option letter', () => {
    for (const q of QUIZ_QUESTIONS) {
      const l10n = frQuiz.questions[q.id as QuizQuestionId];
      expect(l10n, `missing fr overlay for question ${q.id}`).toBeTruthy();
      expect(l10n.partLabel.trim()).not.toBe('');
      expect(l10n.prompt.trim()).not.toBe('');
      for (const opt of q.options) {
        expect(
          l10n.options[opt.letter],
          `question ${q.id} option ${opt.letter}`,
        ).toBeTruthy();
        expect(l10n.options[opt.letter].trim()).not.toBe('');
      }
    }
  });

  it('covers the tie-breaker', () => {
    expect(frQuiz.tieBreaker.prompt.trim()).not.toBe('');
    for (const opt of TIE_BREAKER.options) {
      expect(frQuiz.tieBreaker.options[opt.letter]?.trim()).toBeTruthy();
    }
  });

  it('adds no overlay entries beyond the canonical question ids', () => {
    const canonical = new Set(QUIZ_QUESTIONS.map((q) => String(q.id)));
    for (const id of Object.keys(frQuiz.questions)) {
      expect(canonical.has(id), `overlay has unknown question id ${id}`).toBe(true);
    }
    expect(Object.keys(frQuiz.questions)).toHaveLength(QUIZ_QUESTIONS.length);
  });

  it('leaves no English text behind', () => {
    for (const q of QUIZ_QUESTIONS) {
      const l10n = frQuiz.questions[q.id as QuizQuestionId];
      expect(l10n.prompt).not.toBe(q.prompt);
      expect(l10n.partLabel).not.toBe(q.partLabel);
      for (const opt of q.options) {
        expect(l10n.options[opt.letter]).not.toBe(opt.text);
      }
    }
    expect(frQuiz.tieBreaker.prompt).not.toBe(TIE_BREAKER.prompt);
  });
});

describe('localizedQuizQuestion', () => {
  it('returns the canonical object untouched for English', () => {
    for (const q of QUIZ_QUESTIONS) {
      expect(localizedQuizQuestion(q, 'en')).toBe(q);
    }
    expect(localizedTieBreaker(TIE_BREAKER, 'en')).toBe(TIE_BREAKER);
  });

  it('replaces display fields for French and keeps ids/letters/drivers', () => {
    for (const q of QUIZ_QUESTIONS) {
      const fr = localizedQuizQuestion(q, 'fr');
      const l10n = frQuiz.questions[q.id as QuizQuestionId];
      expect(fr.id).toBe(q.id);
      expect(fr.part).toBe(q.part);
      expect(fr.partLabel).toBe(l10n.partLabel);
      expect(fr.prompt).toBe(l10n.prompt);
      expect(fr.options).toHaveLength(q.options.length);
      fr.options.forEach((opt, i) => {
        expect(opt.letter).toBe(q.options[i].letter);
        expect(opt.driver).toBe(q.options[i].driver);
        expect(opt.text).toBe(l10n.options[opt.letter]);
      });
    }
  });

  it('localizes the tie-breaker the same way', () => {
    const fr = localizedTieBreaker(TIE_BREAKER, 'fr');
    expect(fr.prompt).toBe(frQuiz.tieBreaker.prompt);
    fr.options.forEach((opt, i) => {
      expect(opt.letter).toBe(TIE_BREAKER.options[i].letter);
      expect(opt.driver).toBe(TIE_BREAKER.options[i].driver);
      expect(opt.text).toBe(frQuiz.tieBreaker.options[opt.letter]);
    });
  });

  it('never mutates the canonical question or its options', () => {
    const before = JSON.stringify(QUIZ_QUESTIONS);
    const beforeTb = JSON.stringify(TIE_BREAKER);
    QUIZ_QUESTIONS.forEach((q) => localizedQuizQuestion(q, 'fr'));
    localizedTieBreaker(TIE_BREAKER, 'fr');
    expect(JSON.stringify(QUIZ_QUESTIONS)).toBe(before);
    expect(JSON.stringify(TIE_BREAKER)).toBe(beforeTb);
    const fr = localizedQuizQuestion(QUIZ_QUESTIONS[0], 'fr');
    expect(fr.options[0]).not.toBe(QUIZ_QUESTIONS[0].options[0]);
  });
});
