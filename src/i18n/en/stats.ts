/**
 * Session scorecard (`src/screens/StatsScreen.tsx`) chrome.
 *
 * Only static chrome lives here. The scoring dimension labels, descriptions
 * and band examples come from `resolveDimensions(simulationConfig)` /
 * `src/data/knowledge/scoringRubric.ts` — admin-configurable data with a
 * documented single-language limitation — and the critique / key-moment
 * quotes are AI output, so both are interpolated as `{tokens}` rather than
 * translated.
 */
export const stats = {
  'stats.topbar.title': 'Scorecard',
  'stats.topbar.unavailable': 'Session scorecard',

  // No usable score report
  'stats.unavailable.title': 'Scoring unavailable',
  'stats.unavailable.body':
    "The AI scorer couldn't be reached. Your conversation is saved — you can retry scoring without redoing the session.",
  'stats.unavailable.retry': 'Retry scoring',
  'stats.unavailable.retrying': 'Scoring your conversation…',
  'stats.unavailable.retryFailed':
    "Still couldn't reach the scorer — check your connection and try again.",
  'stats.none.title': 'No session yet',
  'stats.none.body': 'Run a session first.',

  // Hero
  'stats.headline.good': 'Strong session.\nKeep that line of attack.',
  'stats.headline.ok': 'Solid foundation.\nSharpen {focus} next.',
  'stats.headline.poor': 'A lot to learn here —\nwhich is the point.',
  'stats.overall': 'Overall',
  'stats.turns': '{count} turns',
  'stats.turnsOne': '1 turn',

  // Progress-vs-history chip
  'stats.delta.personalBest': 'Personal best',
  'stats.delta.first': 'First scored session',
  'stats.delta.improved': '+{delta} vs last session',
  'stats.delta.dropped': '{delta} vs last session',
  'stats.delta.even': 'Even with last session',

  // Focus-next card
  'stats.focus.label': 'Focus next · {dimension}',
  'stats.focus.excellent': 'What excellent sounds like',

  // Breakdown + key moments + coach notes
  'stats.breakdown': 'Breakdown',
  'stats.keyMoments': 'Key moments',
  'stats.moment.win': 'Win · {label}',
  'stats.moment.miss': 'Miss · {label}',
  'stats.coachNotes': 'Coach notes',
  'stats.betterAlternative': 'Better alternative',
  'stats.reviewTranscript': 'Review the transcript',

  // Bottom CTAs
  'stats.cta.home': 'Home',
  'stats.cta.runAgain': 'Run it again',
} as const;
