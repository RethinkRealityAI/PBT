/**
 * Chat / live-voice screen strings. Namespaces use flat dotted keys;
 * every key added here must be added to EVERY other locale's matching file
 * (the `Catalog` type makes a missing key a compile error — see
 * CLAUDE.md "Translations (MANDATORY)").
 *
 * Covers `src/screens/ChatScreen.tsx` (header, scenario details panel,
 * composer, voice mode, end/exit modals) and the in-chat coach drawer
 * (`src/features/chat/CoachHint.tsx`, `chat.coach.*`).
 *
 * NOT covered here (deliberately): transcript content, scenario/pushback
 * copy, and the scoring rubric — those are runtime or admin-configurable
 * data, not UI chrome.
 */
export const chat = {
  'chat.voice.capWarning': 'Voice sessions wrap up at 5 minutes — about a minute left.',

  // Customer-state vocabulary. The enum keys (red/yellow/green) are machine
  // values and never translate; these display labels do.
  'chat.emotion.defensive': 'Defensive',
  'chat.emotion.receptive': 'Receptive',
  'chat.emotion.convinced': 'Convinced',

  // Header + scenario rotation
  'chat.header.backAria': 'Back to dashboard',
  'chat.header.eyebrowVoice': 'PBT · Voice practice',
  'chat.header.eyebrowText': 'PBT · Text practice',
  'chat.scenarioNav.eyebrow': 'Scenario',
  'chat.scenarioNav.prev': 'Previous scenario',
  'chat.scenarioNav.next': 'Next scenario',
  'chat.scenarioInfo': 'Scenario info',

  // No-scenario empty state
  'chat.empty.title': 'Live scenario',
  'chat.empty.body': 'No active scenario. Pick one from Home.',

  // Scenario details panel
  'chat.details.closeScrimAria': 'Close scenario details',
  'chat.details.counter': 'Scenario {index} of {total}',
  'chat.details.custom': 'Custom scenario',
  'chat.details.objectiveLabel': 'Objective:',
  'chat.details.objectiveText': 'Guide this client from pushback to resolution with ACT.',
  'chat.details.contextLabel': 'Context:',
  'chat.details.openingLabel': 'Opening pushback:',
  'chat.details.begin': 'Begin simulation',

  // Session controls
  'chat.controls.driverEyebrow': 'Echo driver · {driver}',
  'chat.controls.modeAria': 'Conversation mode',
  'chat.controls.end': 'End',

  // Text mode
  'chat.composer.placeholder': 'Acknowledge, ask, recommend…',
  'chat.composer.aria': 'Your reply to the client',
  'chat.composer.send': 'Send',
  'chat.transcript.aria': 'Conversation transcript',
  'chat.bubble.you': 'You',
  'chat.typing.aria': 'Customer is typing',
  'chat.status.scoring': 'Scoring conversation…',
  'chat.error.connect': 'Could not connect — check your network.',
  'chat.error.retry': 'Try again',
  /** Shown when the AI is not reachable for a reason the trainee cannot fix —
   *  they need their administrator, not a retry. */
  'chat.error.notConfigured':
    'Practice sessions are unavailable right now. Let your administrator know, then try again later.',
  'chat.error.openFailed':
    'Could not reach the AI — check your network and tap "Try again".',
  'chat.error.sendFailed':
    'Connection issue — your message was saved. Tap send to try again.',
  'chat.error.sendRetry': 'Tap send again to retry.',

  // Voice mode
  'chat.voice.status.idle': 'Initializing…',
  'chat.voice.status.connecting': 'Connecting…',
  'chat.voice.status.listening': 'Go ahead — I\'m listening',
  'chat.voice.status.thinking': 'Processing…',
  'chat.voice.status.aiSpeaking': 'Speaking…',
  'chat.voice.status.ended': 'Session complete',
  'chat.voice.status.error': 'Connection error',
  'chat.voice.ready': 'Voice ready',
  'chat.voice.processing': 'Processing',
  'chat.voice.analyzing': 'Analyzing session…',
  'chat.voice.scorecardReady': 'Your scorecard is ready',
  'chat.voice.analyzeFailed': 'Failed to analyze session — check your network and try again.',
  'chat.voice.retryVoice': 'Try voice again',

  // Live-voice transport failures (`src/services/voiceSession.ts`)
  'chat.voice.error.micStart':
    'Microphone could not be started. Please check your microphone and try again.',
  'chat.voice.error.micDenied':
    'Microphone access denied or unavailable. Please allow microphone access and try again.',
  'chat.voice.error.connection':
    'Voice connection error. Check your microphone and network, then try again.',
  'chat.voice.error.lost':
    'Voice connection lost. Check your network and tap Begin simulation to restart.',
  /** {reason} is the raw transport error — never translated. */
  'chat.voice.error.startFailed': 'Voice could not start: {reason}',
  'chat.voice.error.unknown': 'unknown error',

  // Session-ending overlay (`src/features/chat/SessionEndingOverlay.tsx`)
  /** Stand-in when a scenario has no pushback title to celebrate by name. */
  'chat.ending.defaultTitle': 'pushback',
  'chat.ending.closing.eyebrow': 'Session complete',
  'chat.ending.closing.title': 'Great work finishing the\n{title} training.',
  'chat.ending.closing.sub': 'Holding for a beat so the closing line lands…',
  'chat.ending.analyzing.eyebrow': 'Analyzing your performance',
  'chat.ending.analyzing.title': 'Building your scorecard',
  'chat.ending.analyzing.sub':
    'Scoring how you Acknowledged, Clarified, and Transformed the pushback — plus empathy and rapport.',
  'chat.ending.ready.eyebrow': 'Done',
  'chat.ending.ready.title': 'Your scorecard is ready',
  'chat.ending.ready.sub': 'Opening it now…',

  // End-session + exit modals
  'chat.modal.close': 'Close',
  'chat.endModal.title': 'End this session?',
  'chat.endModal.subtitleVoice':
    'Save it to your history with a full scorecard, or end without saving.',
  'chat.endModal.subtitleText':
    'Save it to your history with a full scorecard, restart with the same opener, or end without saving.',
  'chat.endModal.save': 'Save & score',
  'chat.endModal.restart': 'Restart with same opener',
  'chat.endModal.end': 'End without saving',
  'chat.exitModal.title': 'Save your progress?',
  'chat.exitModal.subtitle':
    "You're leaving mid-session. Save it to your history with a full scorecard, or discard and head back.",
  'chat.exitModal.discard': 'Discard & leave',

  // In-chat coach drawer
  'chat.coach.thinking': 'Coach is thinking…',
  'chat.coach.unavailable': 'Coach unavailable',
  'chat.coach.hintCount': 'Coach · hint {used}/{max}',
  'chat.coach.errorBody':
    "Couldn't reach the coach — check your connection and tap the coach button to try again (it won't cost a hint).",
  'chat.coach.dismiss': 'Dismiss hint',
  'chat.coach.exhaustedAria': 'No coach hints left this session',
  'chat.coach.requestAria': 'Get a coach hint ({count} left)',
  'chat.coach.exhausted': 'No hints left',
  'chat.coach.label': 'Coach · {count}',
} as const;
