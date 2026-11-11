/**
 * ECHO quiz UI chrome ONLY. The question prompts, part labels and answer
 * options live in `src/data/quizQuestions.ts` and are localised through the
 * authored-data overlay (see `src/i18n/dataRegistry.ts`) — never duplicate
 * them here.
 */
export const quiz = {
  'quiz.title': 'ECHO Driver Quiz',
  'quiz.back.aria': 'Back',
  'quiz.previous.aria': 'Previous question',
  /** Read after the option chosen earlier, when the trainee went Back to it. */
  'quiz.previousChoice': 'your earlier answer',
  'quiz.leave.aria': 'Leave the quiz',
  'quiz.leave.title': 'Leave the quiz?',
  'quiz.leave.body':
    'Your answers so far will be lost. The quiz starts again from question 1.',
  'quiz.leave.confirm': 'Leave and lose my answers',
  'quiz.leave.cancel': 'Keep answering',
  'quiz.theme.toLight.aria': 'Switch to light mode',
  'quiz.theme.toDark.aria': 'Switch to dark mode',
  /** `{label}` is the authored part label from the quiz data module. */
  'quiz.part': 'Part {part} · {label}',
  'quiz.tieBreaker.label': 'Tie-breaker',
  'quiz.tieBreaker.heading': 'Final question · pick what fits best',
} as const;
