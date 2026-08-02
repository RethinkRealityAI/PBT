import type { QuizOption, QuizQuestion, TieBreaker } from '../../data/quizQuestions';
import { getDataOverlay } from '../dataRegistry';
import { DEFAULT_LOCALE, type Locale } from '../locales';

/**
 * Display-only localization for the ECHO quiz.
 *
 * The canonical questions in `src/data/quizQuestions.ts` ARE the English text
 * and stay the single source of ids, parts, letters and driver mapping — the
 * scoring path (`useQuiz`) never sees a localized object. These helpers return
 * a *copy* with the display fields swapped for the locale overlay registered
 * in `dataRegistry.ts`; the canonical objects are never mutated.
 */

/** Registry domain key for the quiz overlay. */
export const QUIZ_DOMAIN = 'quiz';

/** Derived from the canonical option type, so a missing letter is a compile error. */
export type QuizOptionLetter = QuizOption['letter'];

/** Ids of the canonical questions. Locked to 1…15 so a locale that forgets a
 *  question fails `tsc`; `dataL10n/__tests__/quiz.test.ts` asserts the union
 *  still matches `QUIZ_QUESTIONS` at runtime. */
export type QuizQuestionId =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

export interface QuizQuestionL10n {
  partLabel: string;
  prompt: string;
  options: Record<QuizOptionLetter, string>;
}

export type QuizTieBreakerL10n = Omit<QuizQuestionL10n, 'partLabel'>;

export interface QuizOverlay {
  questions: Record<QuizQuestionId, QuizQuestionL10n>;
  tieBreaker: QuizTieBreakerL10n;
}

function quizOverlay(locale: Locale): QuizOverlay | undefined {
  if (locale === DEFAULT_LOCALE) return undefined;
  return getDataOverlay<QuizOverlay>(locale, QUIZ_DOMAIN);
}

function mergeOptions(
  options: QuizOption[],
  text: Record<QuizOptionLetter, string>,
): QuizOption[] {
  return options.map((opt) => {
    const translated = text[opt.letter];
    return translated ? { ...opt, text: translated } : { ...opt };
  });
}

/**
 * The canonical question for English (or any locale whose overlay hasn't
 * loaded), else a copy with `partLabel`, `prompt` and option `text` localized.
 * `id`, `part`, option `letter` and option `driver` always survive untouched.
 */
export function localizedQuizQuestion(q: QuizQuestion, locale: Locale): QuizQuestion {
  const l10n = quizOverlay(locale)?.questions[q.id as QuizQuestionId];
  if (!l10n) return q;
  return {
    ...q,
    partLabel: l10n.partLabel || q.partLabel,
    prompt: l10n.prompt || q.prompt,
    options: mergeOptions(q.options, l10n.options),
  };
}

/** Same contract as `localizedQuizQuestion`, for the tie-breaker. */
export function localizedTieBreaker(tb: TieBreaker, locale: Locale): TieBreaker {
  const l10n = quizOverlay(locale)?.tieBreaker;
  if (!l10n) return tb;
  return {
    prompt: l10n.prompt || tb.prompt,
    options: mergeOptions(tb.options, l10n.options),
  };
}
