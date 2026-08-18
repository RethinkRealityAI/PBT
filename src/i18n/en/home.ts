/**
 * Home-screen strings — English (source catalog). Flat dotted keys; every key
 * added here must be mirrored in every other locale's matching file.
 *
 * NOT here on purpose: scenario titles/subcopy coming from `src/data/scenarios.ts`
 * (only the sentence template around them is a key), and the scoring dimension
 * labels/descriptions rendered from `resolveDimensions(simulationConfig)` —
 * those are admin-configurable data, localized through the data overlay.
 */
export const home = {
  // ── Streak strip (spec §9.4) ──────────────────────────────
  'home.streak.days': '{count}-day streak',
  'home.streak.daysOne': '1-day streak',
  'home.streak.practicedToday': 'Practiced today',
  'home.streak.keepItAlive': 'Practice today to keep it',
  'home.streak.thisWeek': '{count} this week',
  'home.streak.thisWeekOne': '1 this week',
  'home.streak.aria': 'Practice streak',

  // ── Greeting / welcome overlay / driver pill ──────────────
  'home.greeting.named': 'Good day, {name}.',
  'home.greeting.anonymous': 'Good day.',
  'home.welcome.named': 'Welcome, {name}.',
  'home.welcome.anonymous': 'Welcome, anonymous guest.',
  /** {name} is an ECHO driver name — a product proper noun, never localized. */
  'home.driverPill': 'ECHO Driver · {name}',
  'home.profileAria': 'Profile',
  'home.headline': 'What pushback are\nyou ready for today?',

  // ── ACT guide card ────────────────────────────────────────
  'home.actCard.title': 'ACT Guide',

  // ── ACT / scorecard dimension labels (ACT card + example) ─
  'home.dim.acknowledge': 'Acknowledge',
  'home.dim.clarify': 'Clarify',
  'home.dim.transform': 'Transform',
  'home.dim.empathy': 'Empathy',
  'home.dim.rapport': 'Rapport',

  // ── Today's pick hero card ────────────────────────────────
  'home.pick.subtitle': '{breed}, {age}. Driver: {driver}.',
  'home.pick.start': 'Start scenario',
  'home.pick.prevAria': 'Previous scenario',
  'home.pick.nextAria': 'Next scenario',
  'home.pick.startHere': 'Start here →',
  'home.pick.scoringAria': 'How sessions are scored',
  'home.pick.empty.title': 'No scenarios available right now',
  'home.pick.empty.body':
    'Every scenario is hidden at the moment. Build your own, or check back later.',

  // ── Quick actions ─────────────────────────────────────────
  'home.actions.build.title': 'Build a scenario',
  'home.actions.build.sub': 'Custom pushback',
  'home.actions.analyzer.title': 'Pet Analyzer',
  /** Clinical initialisms + unit only — identical in every locale (allowlisted). */
  'home.actions.analyzer.sub': 'BCS · MCS · kcal',

  // ── Library + ECHO profile cards ──────────────────────────
  'home.library.aria': 'Library',
  'home.library.title': 'Clinical library',
  'home.library.sub': 'WSAVA · BCS · MCS · calorie targets',
  'home.echo.aria': 'Your ECHO driver profile',
  'home.echo.title': 'Your ECHO profile',
  'home.echo.sub': 'ECHO Driver · {name} · tap to review',

  // ── Report a problem ──────────────────────────────────────
  'home.report.button': 'Report a problem',

  // ── Modal chrome (shared by both Home modals) ─────────────
  'home.modal.close': 'Close',
  'home.scenarioInfo.closeAria': 'Close scenario info',

  // ── Scoring guide modal ───────────────────────────────────
  'home.scoring.closeAria': 'Close scoring guide',
  'home.scoring.eyebrow': "How you're scored",
  'home.scoring.title': 'Five dimensions, one overall score',
  'home.scoring.scenariosEyebrow': 'How scenarios work',
  'home.scoring.voiceLabel': 'Voice',
  'home.scoring.voiceBody':
    'A live conversation — the AI customer speaks and listens in real time. Respond naturally, as you would on the clinic floor.',
  'home.scoring.chatLabel': 'Chat',
  'home.scoring.chatBody':
    'Turn-based — the AI sends a message, you reply, and so on. Take your time crafting each response.',
  'home.scoring.autoEnd':
    'The session ends automatically once the AI determines the conversation has reached a natural close — usually after you have acknowledged the concern, clarified the facts, and reframed the value.',
  'home.scoring.introLead':
    'Each session is scored 0–100 across five dimensions and rolled into a weighted overall score. The fastest path to a high score:',
  'home.scoring.introTail': "— don't pitch product before the client feels heard.",
  'home.scoring.exampleEyebrow': 'Example scorecard',
  'home.scoring.exampleOverall': 'Overall',
  'home.scoring.exampleBand': 'Strong',
  'home.scoring.coachNoteLabel': 'Coach note:',
  'home.scoring.coachNoteBody':
    'Strong acknowledge opener and a clean Royal Canin Satiety pivot. Next time, propose the week-two weigh-in earlier to lift Transform.',
  'home.scoring.dimensionsEyebrow': 'The five dimensions',
  'home.scoring.endEyebrow': 'How a scenario ends',
  'home.scoring.endIntro':
    "The customer's receptiveness moves through three states. Watch the dot under the orb to see how you're doing in real time:",
  'home.scoring.state.red.label': 'Red — Defensive',
  'home.scoring.state.red.body':
    'They start here. Push back, repeat the concern. Acknowledge feelings before anything else.',
  'home.scoring.state.yellow.label': 'Yellow — Receptive',
  'home.scoring.state.yellow.body':
    'They feel heard. Ask one specific clarifying question to surface the real concern.',
  'home.scoring.state.green.label': 'Green — Convinced',
  'home.scoring.state.green.body':
    "They're ready to act. Offer a concrete Royal Canin recommendation and the 12-week trial — the session ends as resolved.",
  'home.scoring.stalemate':
    'If you can\'t move them past Red after ~15 turns, the session ends as a "stalemate." Either way, the full transcript is scored against the five dimensions above.',
  'home.scoring.bands': 'Bands: 85+ Strong · 70–84 On track · <70 Needs work',
} as const;
