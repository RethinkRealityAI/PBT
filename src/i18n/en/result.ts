/**
 * Quiz result screen chrome — the reveal overlay and the card labels around
 * the driver content. Driver names, taglines, blurbs, traits and growth-edge
 * copy come from `src/data/echoDrivers.ts` (authored-data overlay), not here.
 *
 * `{pct}` is pre-formatted by `src/i18n/format.ts#formatPercent` so French
 * gets its narrow no-break space before the sign.
 */
export const result = {
  'result.intro.phase1': 'Finding your ECHO personality driver',
  'result.intro.phase2': 'Analyzing questions and answers',
  'result.intro.phase3': 'Configuring your driver profile',
  'result.intro.primaryLabel': 'Your primary ECHO driver',
  'result.intro.secondaryLabel': 'Your support driver',

  'result.primary.badge': 'Primary driver · {pct} match',
  'result.support.label': 'Support driver',
  'result.mix.title': 'Driver mix · {count} answers',
  'result.inPractice': '{driver} · in practice',
  'result.growthEdge': 'Growth Edge',
  'result.cta.startTraining': 'Start training',
} as const;
