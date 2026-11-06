/**
 * ECHO style quiz — the ONE scoring rule, shared by the trainee app
 * (`useQuiz`), the server (`echo-quiz-save`, which DERIVES the result from the
 * letters and never trusts a client tally) and the admin analytics
 * (`echoQuality.ts`, whose all-same-letter fingerprints are computed here from
 * `QUIZ_QUESTIONS`, never hard-coded).
 *
 * Rule (unchanged from the original hook): one vote per answered question for
 * the driver its option maps to; when the top two drivers tie after the 15
 * questions, the tie-breaker adds one more vote. Ranking is a STABLE sort by
 * votes in `DRIVER_KEYS` order, so a remaining tie resolves the same way on
 * every side.
 *
 * Pure and dependency-free (data + types only).
 */
import { QUIZ_QUESTIONS, TIE_BREAKER, type QuizOption } from '../../data/quizQuestions';
import { DRIVER_KEYS, type DriverKey } from '../../design-system/tokens';

export type QuizLetter = QuizOption['letter'];

export const QUIZ_LETTERS: readonly QuizLetter[] = ['A', 'B', 'C', 'D'];

/** Question id of the tie-breaker in recorded answers (the app shows it as "16"). */
export const TIE_BREAKER_ID = 16;

export type DriverTally = Record<DriverKey, number>;

export interface EchoScore {
  primary: DriverKey;
  secondary: DriverKey;
  tally: DriverTally;
}

export function isQuizLetter(v: unknown): v is QuizLetter {
  return typeof v === 'string' && (QUIZ_LETTERS as readonly string[]).includes(v);
}

export function isDriverKey(v: unknown): v is DriverKey {
  return typeof v === 'string' && (DRIVER_KEYS as readonly string[]).includes(v);
}

export function zeroTally(): DriverTally {
  return { Activator: 0, Energizer: 0, Analyzer: 0, Harmonizer: 0 };
}

export function tallyOf(drivers: readonly DriverKey[]): DriverTally {
  const t = zeroTally();
  for (const d of drivers) t[d] += 1;
  return t;
}

/** Primary / secondary from a tally — stable sort in `DRIVER_KEYS` order. */
export function rankTally(tally: DriverTally): EchoScore {
  const sorted = DRIVER_KEYS.map((k) => [k, tally[k] ?? 0] as const)
    .slice()
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  return { primary: sorted[0], secondary: sorted[1], tally: { ...tally } };
}

/** Do the top two drivers tie? (The app then asks the tie-breaker.) */
export function topTwoTie(tally: DriverTally): boolean {
  const counts = DRIVER_KEYS.map((k) => tally[k] ?? 0).sort((a, b) => b - a);
  return counts[0] === counts[1];
}

/** The driver a letter maps to on one question (`TIE_BREAKER_ID` = the tie-breaker). */
export function driverFor(questionId: number, letter: QuizLetter): DriverKey | null {
  const options =
    questionId === TIE_BREAKER_ID ? TIE_BREAKER.options : QUIZ_QUESTIONS.find((q) => q.id === questionId)?.options;
  return options?.find((o) => o.letter === letter)?.driver ?? null;
}

/** The letter a driver sits under on one question (each question maps each driver once). */
export function letterFor(questionId: number, driver: DriverKey): QuizLetter | null {
  const options =
    questionId === TIE_BREAKER_ID ? TIE_BREAKER.options : QUIZ_QUESTIONS.find((q) => q.id === questionId)?.options;
  return options?.find((o) => o.driver === driver)?.letter ?? null;
}

export const QUIZ_QUESTION_IDS: readonly number[] = QUIZ_QUESTIONS.map((q) => q.id);

/**
 * Score a quiz from its letters. `answers` maps question id → letter (every
 * one of the 15); `tieBreaker` is used only when the 15 leave the top two
 * tied — exactly when the app asks it — and ignored otherwise.
 * `tieBreakerUsed` says whether it counted.
 */
export function scoreLetters(
  answers: ReadonlyMap<number, QuizLetter>,
  tieBreaker: QuizLetter | null,
): EchoScore & { tieBreakerUsed: boolean } {
  const drivers: DriverKey[] = [];
  for (const q of QUIZ_QUESTIONS) {
    const letter = answers.get(q.id);
    const d = letter ? driverFor(q.id, letter) : null;
    if (d) drivers.push(d);
  }
  const tally = tallyOf(drivers);
  let tieBreakerUsed = false;
  if (topTwoTie(tally) && tieBreaker) {
    const d = driverFor(TIE_BREAKER_ID, tieBreaker);
    if (d) {
      tally[d] += 1;
      tieBreakerUsed = true;
    }
  }
  return { ...rankTally(tally), tieBreakerUsed };
}

/**
 * The result of answering every question — tie-breaker included — with the
 * same letter. Computed from the quiz definition, so a reworded or re-mapped
 * question updates the fingerprints with it (pinned in a test).
 */
export function allSameLetterScore(letter: QuizLetter): EchoScore {
  const answers = new Map<number, QuizLetter>(QUIZ_QUESTIONS.map((q) => [q.id, letter]));
  const { primary, secondary, tally } = scoreLetters(answers, letter);
  return { primary, secondary, tally };
}

/** All-A, all-B, all-C, all-D results — the "just click A" fingerprints. */
export const ALL_SAME_LETTER_FINGERPRINTS: ReadonlyArray<{ letter: QuizLetter; tally: DriverTally }> =
  QUIZ_LETTERS.map((letter) => ({ letter, tally: allSameLetterScore(letter).tally }));

/** The letter whose all-same fingerprint this tally equals exactly, or null. */
export function fingerprintLetter(tally: Partial<Record<string, unknown>> | null | undefined): QuizLetter | null {
  if (!tally || typeof tally !== 'object') return null;
  for (const f of ALL_SAME_LETTER_FINGERPRINTS) {
    if (DRIVER_KEYS.every((k) => Number(tally[k]) === f.tally[k])) return f.letter;
  }
  return null;
}
