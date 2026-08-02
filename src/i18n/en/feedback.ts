/**
 * Post-session "rate this simulation" card
 * (`src/features/feedback/SessionFeedbackCard.tsx`).
 */
export const feedback = {
  'feedback.title': 'Rate this simulation',
  'feedback.realism': 'Scenario realism',
  'feedback.aiQuality': 'AI response quality',
  'feedback.comfort': 'How comfortable did you feel',
  'feedback.starAria': '{n} of 5',
  'feedback.commentPlaceholder': 'Anything else? (optional)',
  'feedback.submit': 'Submit feedback',
  'feedback.submitting': 'Submitting…',
  'feedback.error': "Couldn't save that — tap submit to try again.",
  'feedback.thanks': 'Thanks — your feedback helps us tune the simulations.',
  'feedback.alreadyRated': 'Thanks — you already rated this session.',
} as const;
