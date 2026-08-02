/**
 * ECHO quiz UI chrome ONLY. The question prompts, part labels and answer
 * options live in `src/data/quizQuestions.ts` and are localised through the
 * authored-data overlay (see `src/i18n/dataRegistry.ts`) — never duplicate
 * them here.
 */
export const quiz = {
  'quiz.title': 'ECHO Driver Quiz',
  'quiz.back.aria': 'Back',
  'quiz.theme.toLight.aria': 'Switch to light mode',
  'quiz.theme.toDark.aria': 'Switch to dark mode',
  /** `{label}` is the authored part label from the quiz data module. */
  'quiz.part': 'Part {part} · {label}',
  'quiz.tieBreaker.label': 'Tie-breaker',
  'quiz.tieBreaker.heading': 'Final question · pick what fits best',
} as const;
