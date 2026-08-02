/**
 * Platform reporting modal (bug report / suggestion).
 *
 * The quick-subject chips are stored on the report row as a STABLE ENGLISH id
 * (`[Feature not working]` etc.) so the admin queue reads consistently no
 * matter which locale the reporter used — only the chip's visible label is
 * localised. See `ReportModal.tsx` (`SUBJECTS`).
 */
export const report = {
  'report.eyebrow': 'Help us improve',
  'report.title': 'Report or suggest',
  'report.title.done': 'Thank you',
  'report.close': 'Close',

  'report.done.bug': 'Your report reached our triage queue. We read every one.',
  'report.done.suggestion':
    'Your suggestion reached our triage queue. We read every one.',
  'report.done.cta': 'Done',

  'report.kind.aria': 'Report type',
  'report.kind.bug': 'Bug report',
  'report.kind.suggestion': 'Suggestion',

  'report.subject.label': 'Quick subject',
  'report.subject.featureNotWorking': 'Feature not working',
  'report.subject.aiNotResponding': 'AI not responding',
  'report.subject.voiceMode': 'Voice mode issue',
  'report.subject.buttonNotWorking': 'Button not working',
  'report.subject.crashes': 'App crashes / glitches',
  'report.subject.scoring': 'Scoring issue',
  'report.subject.newFeature': 'New feature idea',
  'report.subject.ui': 'UI improvement',
  'report.subject.content': 'Content request',
  'report.subject.betterAi': 'Better AI responses',
  'report.subject.accessibility': 'Accessibility',
  'report.subject.other': 'Other',

  'report.message.label.bug': 'What happened?',
  'report.message.label.suggestion': 'Your idea',
  'report.message.placeholder.bug':
    'What happened? What did you expect instead?',
  'report.message.placeholder.suggestion':
    'What would make this better? Any details help.',
  'report.charCount': '{count} chars',

  'report.error.empty': 'Add a short description first.',
  'report.error.send': "Couldn't send that — tap submit to try again.",

  'report.submit': 'Submit',
  'report.submitting': 'Sending…',
} as const;
