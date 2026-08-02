/**
 * History list + session detail (scorecard / transcript) strings.
 *
 * Flat dotted keys; every key added here must be mirrored in EVERY other
 * locale's matching file (the `Catalog` type makes a missing key a compile
 * error — see CLAUDE.md "Translations (MANDATORY)").
 *
 * NOT here on purpose: pushback-category chip labels (data module,
 * `src/data/scenarios.ts`) and scoring dimension labels (admin-tunable via
 * `scoringRubric` / `simulationConfig`).
 */
export const history = {
  // ── List screen ───────────────────────────────────────────
  'history.title': 'History',
  'history.headline': 'Every conversation,\ntracked and tagged.',
  'history.sessionCount': '{count} sessions',
  'history.sessionCountOne': '1 session',
  /** {pct} is pre-formatted by src/i18n/format.ts (French inserts U+202F). */
  'history.avgScore': '{pct} avg score',
  'history.filter.all': 'All',
  'history.empty.none':
    "No sessions yet. Run a scenario and it'll show up here, tagged by pushback type.",
  'history.empty.filtered':
    'No sessions match this filter yet — try a different pushback type.',
  'history.empty.cta': 'Start your first session',
  'history.row.turns': '{count} turns',
  'history.row.notScoredAria': 'Not scored',
  'history.mode.text': 'text',
  'history.mode.voice': 'voice',

  // ── Detail screen ─────────────────────────────────────────
  'history.detail.title': 'Session',
  'history.detail.notFound.title': 'Session not found',
  'history.detail.notFound.body':
    'This session may have been deleted or the link is stale.',
  'history.detail.durationSeconds': '{seconds}s',
  'history.detail.viewAria': 'View',
  'history.detail.tab.scorecard': 'Scorecard',
  'history.detail.tab.transcript': 'Transcript',
  'history.detail.notScored.title': 'Not scored',
  'history.detail.notScored.body':
    "The AI scorer couldn't be reached when this session ended, so there's no evaluation on record. The full transcript is saved in the Transcript tab.",
  'history.detail.headline.good': 'Strong session.',
  'history.detail.headline.ok': 'Solid foundation.',
  'history.detail.headline.poor': 'Room to grow.',
  'history.detail.overall': 'Overall',
  'history.detail.turns': '{count} turns',
  'history.detail.breakdown': 'Breakdown',
  'history.detail.keyMoments': 'Key moments',
  'history.detail.coachNotes': 'Coach notes',
  'history.detail.betterAlternative': 'Better alternative',
  'history.detail.emptyTranscript': 'No transcript saved for this session.',
  'history.detail.speaker.customer': 'Customer',
  'history.detail.speaker.you': 'You',
  'history.detail.bottom.home': 'Home',
  'history.detail.bottom.back': 'Back to history',
} as const;
