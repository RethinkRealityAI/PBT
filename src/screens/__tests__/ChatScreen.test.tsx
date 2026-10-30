import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { ChatScreen } from '../ChatScreen';
import { SEED_SCENARIOS, type Scenario } from '../../data/scenarios';
import { __resetPreviewRuns, startPreviewRun } from '../../lib/previewMode';
import { adminOverrideToScenario } from '../../data/scenarioOverrides';
import type { FlagSnapshot, ScenarioOverride } from '../../services/flagsClient';

const go = vi.fn();
const setScenario = vi.fn();
const voiceStart = vi.fn();
const voiceStop = vi.fn();
const voiceEndSession = vi.fn();
const registerNaturalEndHandler = vi.fn();
const chatOpen = vi.fn();
const chatEnd = vi.fn();
const chatApplyVoiceSessionComplete = vi.fn();
const chatReset = vi.fn();
const chatSend = vi.fn();
const chatCheckpointVoice = vi.fn();
const chatRecordVoiceUnscored = vi.fn();

let currentScenario: Scenario = SEED_SCENARIOS[0];
/** The flag snapshot `useResolvedLibraryScenarios` sees (null = none loaded). */
let flagSnapshot: FlagSnapshot | null = null;
let voiceStatus:
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'aiSpeaking'
  | 'ended'
  | 'error' = 'idle';
let voiceError: string | null = null;
/** Time-limit state the voice hook reports (see VOICE_SESSION_CAPS). */
let voiceTimeUp = false;
let voiceCapWarning = false;
let voiceCapDeadline: number | null = null;
let voiceTimeUpAutoEndAt: number | null = null;
let voiceExtensionsLeft = 2;
let voiceMessages: Array<{ role: 'ai' | 'user'; text: string; timestamp: number }> = [];
const extendSession = vi.fn(() => true);
const noteTimeUpChoice = vi.fn();
/** Switch values a test sets; anything absent reads its fallback (on). */
let flagValues: Record<string, unknown> = {};

vi.mock('../../design-system/Orb', () => ({
  Orb: ({ size }: { size?: number }) => <div data-testid="orb">Orb {size}</div>,
}));

vi.mock('../../shell/TopBar', () => ({
  TopBar: ({ title }: { title?: string }) => <div>{title}</div>,
}));

vi.mock('../../design-system/Glass', () => ({
  Glass: ({ children, onClick, ariaLabel }: { children: ReactNode; onClick?: () => void; ariaLabel?: string }) => (
    <div aria-label={ariaLabel} onClick={onClick}>
      {children}
    </div>
  ),
}));

vi.mock('../../design-system/Segmented', () => ({
  Segmented: ({
    value,
    onChange,
  }: {
    value: 'text' | 'voice';
    onChange: (mode: 'text' | 'voice') => void;
  }) => (
    <div>
      <button aria-pressed={value === 'text'} onClick={() => onChange('text')}>
        Text
      </button>
      <button aria-pressed={value === 'voice'} onClick={() => onChange('voice')}>
        Voice
      </button>
    </div>
  ),
}));

// Only `useFlags` (what the resolved library reads) is driven by the test;
// everything else in the module is the real, provider-less fallback.
vi.mock('../../app/providers/FlagProvider', async () => {
  const actual = await vi.importActual<typeof import('../../app/providers/FlagProvider')>(
    '../../app/providers/FlagProvider',
  );
  const { findOverride } = await vi.importActual<typeof import('../../services/flagsClient')>(
    '../../services/flagsClient',
  );
  return {
    ...actual,
    useFlags: () => ({
      snapshot: flagSnapshot,
      preview: null,
      ready: true,
      refresh: async () => {},
      getFlag: <T,>(key: string, fallback: T) => (key in flagValues ? (flagValues[key] as T) : fallback),
      getOverride: (id: string) => findOverride(flagSnapshot, id),
      getSimulationConfig: () => null,
    }),
    useFlag: (key: string, fallback = true) =>
      key in flagValues ? (flagValues[key] as boolean) : fallback,
  };
});

vi.mock('../../app/providers/NavigationProvider', () => ({
  useNavigation: () => ({ go }),
}));

vi.mock('../../app/providers/ScenarioProvider', () => ({
  useScenario: () => ({ scenario: currentScenario, setScenario }),
}));

vi.mock('../../app/providers/ChatProvider', () => ({
  useChat: () => ({
    messages: [{ role: 'ai', text: 'Opening text', timestamp: 1 }],
    status: 'awaitingUser',
    scoreReport: null,
    transientError: null,
    open: chatOpen,
    send: chatSend,
    end: chatEnd,
    applyVoiceSessionComplete: chatApplyVoiceSessionComplete,
    reset: chatReset,
    checkpointVoice: chatCheckpointVoice,
    recordVoiceUnscored: chatRecordVoiceUnscored,
    startedAt: null,
  }),
}));

vi.mock('../../services/voiceSession', () => ({
  VOICE_SESSION_CAPS: { extensionMs: 3 * 60_000 },
  useVoiceSession: () => ({
    status: voiceStatus,
    emotion: 'red',
    messages: voiceMessages,
    liveAiText: '',
    capWarning: voiceCapWarning,
    capDeadline: voiceCapDeadline,
    timeUp: voiceTimeUp,
    timeUpAutoEndAt: voiceTimeUpAutoEndAt,
    extensionsLeft: voiceExtensionsLeft,
    extendSession,
    noteTimeUpChoice,
    sessionId: 'voice-session-1',
    start: voiceStart,
    stop: voiceStop,
    endSession: voiceEndSession,
    registerNaturalEndHandler,
    error: voiceError,
  }),
}));

function resetVoiceMock() {
  voiceStatus = 'idle';
  voiceError = null;
  voiceTimeUp = false;
  voiceCapWarning = false;
  voiceCapDeadline = null;
  voiceTimeUpAutoEndAt = null;
  voiceExtensionsLeft = 2;
  voiceMessages = [];
}

describe('ChatScreen voice-first flow', () => {
  beforeEach(() => {
    currentScenario = SEED_SCENARIOS[0];
    flagSnapshot = null;
    flagValues = {};
    __resetPreviewRuns();
    resetVoiceMock();
    vi.clearAllMocks();
    voiceEndSession.mockResolvedValue({ report: null, transcript: [] });
  });

  it('is text only when Voice mode in chat is switched off: no toggle, no voice start', () => {
    flagValues = { 'screen.voice.enabled': false };
    render(<ChatScreen />);
    expect(screen.queryByRole('button', { name: 'Voice' })).toBeNull();
    expect(screen.queryByText('Voice ready')).toBeNull();
    expect(screen.queryByRole('button', { name: /begin simulation/i })).toBeNull();
    expect(voiceStart).not.toHaveBeenCalled();
    // The text conversation is on screen instead.
    expect(screen.getByText('Opening text')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('falls back to text when an admin preview asks for voice but voice is off', () => {
    flagValues = { 'screen.voice.enabled': false };
    startPreviewRun('voice');
    render(<ChatScreen />);
    expect(screen.queryByRole('button', { name: /begin simulation/i })).toBeNull();
    expect(voiceStart).not.toHaveBeenCalled();
  });

  it('hides the coach hint button when coach hints are switched off', () => {
    flagValues = { 'screen.voice.enabled': false, 'component.chat.coach_drawer': false };
    render(<ChatScreen />);
    expect(screen.queryByRole('button', { name: /coach/i })).toBeNull();
  });

  it('defaults to voice visually without starting the microphone until Begin simulation is clicked', async () => {
    const user = userEvent.setup();

    render(<ChatScreen />);

    expect(screen.getByText('Voice ready')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /begin simulation/i })).toBeInTheDocument();
    expect(voiceStart).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /begin simulation/i }));

    expect(voiceStart).toHaveBeenCalledWith(SEED_SCENARIOS[0], {
      locale: 'en',
      // en passes the canonical opening line through unchanged
      openingLine: SEED_SCENARIOS[0].openingLine ?? null,
      // Per-scenario prompt wraps — voice now gets the same admin overrides
      // text mode does; this seed has no override row, hence the null pair.
      overrides: { promptPrefix: null, promptSuffix: null },
      // The trainee's driver rides along so the server resolves the voice
      // switch for the same audience (no profile in this test).
      driver: null,
    });
  });

  it('uses a retry button to start voice again after a connection or microphone error', async () => {
    const user = userEvent.setup();
    voiceStatus = 'error';
    voiceError = 'We could not access your microphone. Allow microphone access, then try again.';

    render(<ChatScreen />);

    await user.click(screen.getByRole('button', { name: /try voice again/i }));

    expect(voiceStart).toHaveBeenCalledWith(SEED_SCENARIOS[0], {
      locale: 'en',
      // en passes the canonical opening line through unchanged
      openingLine: SEED_SCENARIOS[0].openingLine ?? null,
      // Per-scenario prompt wraps — voice now gets the same admin overrides
      // text mode does; this seed has no override row, hence the null pair.
      overrides: { promptPrefix: null, promptSuffix: null },
      // The trainee's driver rides along so the server resolves the voice
      // switch for the same audience (no profile in this test).
      driver: null,
    });
  });

  it('rotates to the next seeded scenario in place and closes any active voice session first', async () => {
    const user = userEvent.setup();
    voiceStatus = 'listening';

    render(<ChatScreen />);

    await user.click(screen.getByRole('button', { name: /next scenario/i }));

    expect(voiceStop).toHaveBeenCalled();
    // The arrows walk the RESOLVED library now (what Home and the Library tab
    // show), so the next scenario carries its stable override handle — the
    // id its admin edits and per-scenario prompt wraps are looked up by.
    expect(setScenario).toHaveBeenCalledWith({ ...SEED_SCENARIOS[1], _overrideId: 'seed:1' });
    expect(go).not.toHaveBeenCalledWith('create');
  });
});

describe('ChatScreen scenario rotation (resolved library)', () => {
  const ROW: ScenarioOverride = {
    scenario_id: 'admin:x',
    visible: true,
    sort_order: null,
    title_override: null,
    context_override: null,
    opening_line_override: null,
    difficulty_override: null,
    persona_override: null,
    prompt_prefix: null,
    prompt_suffix: null,
    card_title_override: null,
    card_subtitle_override: null,
    info_modal_title: null,
    info_modal_body: null,
    start_button_label: null,
    card_driver_override: null,
    breed: 'Maine Coon',
    life_stage: 'Adult (3-7)',
    pushback_id: 'cost',
    pushback_notes: null,
    suggested_driver: 'Analyzer',
    weight_kg: null,
    species: 'cat',
  };
  const CAT_A: ScenarioOverride = { ...ROW, scenario_id: 'admin:cat-a', sort_order: 10 };
  const CAT_B: ScenarioOverride = { ...ROW, scenario_id: 'admin:cat-b', breed: 'Persian', sort_order: 11 };

  beforeEach(() => {
    currentScenario = SEED_SCENARIOS[0];
    flagSnapshot = null;
    voiceStatus = 'idle';
    voiceError = null;
    vi.clearAllMocks();
  });

  it('skips a seed the admin has hidden', async () => {
    const user = userEvent.setup();
    flagSnapshot = {
      flags: {},
      scenarioOverrides: [{ ...ROW, scenario_id: 'seed:1', visible: false, species: null, breed: null }],
      fetchedAt: 0,
    };
    render(<ChatScreen />);
    await user.click(screen.getByRole('button', { name: /next scenario/i }));
    // seed:1 is hidden → straight to seed:2 (the third library scenario).
    expect(setScenario).toHaveBeenCalledWith({ ...SEED_SCENARIOS[5], _overrideId: 'seed:2' });
  });

  it('keeps a cat session among the cat scenarios (cats switched on)', async () => {
    const user = userEvent.setup();
    flagValues = { 'scenario.cat.enabled': true };
    flagSnapshot = { flags: {}, scenarioOverrides: [CAT_A, CAT_B], fetchedAt: 0 };
    currentScenario = adminOverrideToScenario(CAT_A)!;
    render(<ChatScreen />);
    await user.click(screen.getByRole('button', { name: /next scenario/i }));
    const next = setScenario.mock.calls[0][0] as Scenario;
    expect(next._overrideId).toBe('admin:cat-b');
    expect(next.species).toBe('cat');
    setScenario.mockClear();
    await user.click(screen.getByRole('button', { name: /previous scenario/i }));
    // Two cats: previous wraps to the other cat too — never a dog seed.
    expect((setScenario.mock.calls[0][0] as Scenario)._overrideId).toBe('admin:cat-b');
  });

  it('offers no rotation for a cat session while scenario.cat.enabled is off (published cats are not listed)', () => {
    flagValues = {};
    flagSnapshot = { flags: {}, scenarioOverrides: [CAT_A, CAT_B], fetchedAt: 0 };
    currentScenario = adminOverrideToScenario(CAT_A)!;
    render(<ChatScreen />);
    // Nothing to walk to: the pager is disabled rather than jumping to a dog.
    expect(screen.getByRole('button', { name: /next scenario/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous scenario/i })).toBeDisabled();
  });
});

/**
 * Admin "Test in app": the builder names the mode it wants to exercise.
 * ChatScreen's own default is voice, so a text preview used to land the admin
 * in the voice orb with no way to see the chat prompt they were editing.
 */
describe('ChatScreen preview runs', () => {
  beforeEach(() => {
    currentScenario = SEED_SCENARIOS[0];
    voiceStatus = 'idle';
    voiceError = null;
    vi.clearAllMocks();
    voiceEndSession.mockResolvedValue({ report: null, transcript: [] });
    __resetPreviewRuns();
  });

  afterEach(() => {
    __resetPreviewRuns();
  });

  it('opens in text mode when the builder asks for text', () => {
    startPreviewRun('text');
    render(<ChatScreen />);
    expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The text composer is live, not the voice orb's Begin CTA.
    expect(screen.queryByRole('button', { name: /begin simulation/i })).toBeNull();
  });

  it('still opens in voice when the builder asks for voice', () => {
    startPreviewRun('voice');
    render(<ChatScreen />);
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('resets the open session and switches mode when a new run arrives', async () => {
    startPreviewRun('voice');
    render(<ChatScreen />);
    chatReset.mockClear();
    voiceStop.mockClear();

    // The admin edits the draft and hits "Test in app" again, this time in text.
    await act(async () => {
      startPreviewRun('text');
    });

    // Re-running must not continue the previous draft's conversation.
    expect(voiceStop).toHaveBeenCalled();
    expect(chatReset).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Text' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('ChatScreen voice time limit — ask, never cut off', () => {
  beforeEach(() => {
    currentScenario = SEED_SCENARIOS[0];
    flagSnapshot = null;
    flagValues = {};
    __resetPreviewRuns();
    resetVoiceMock();
    vi.clearAllMocks();
    voiceEndSession.mockResolvedValue({ report: null, transcript: [], sessionId: 's1' });
    voiceStatus = 'listening';
    voiceMessages = [
      { role: 'ai', text: 'That price feels steep.', timestamp: 1 },
      { role: 'user', text: 'I hear you.', timestamp: 2 },
    ];
  });

  function showTimeUp(extensionsLeft = 2) {
    voiceTimeUp = true;
    voiceCapWarning = true;
    voiceExtensionsLeft = extensionsLeft;
    voiceTimeUpAutoEndAt = Date.now() + 45_000;
    render(<ChatScreen />);
    return screen.getByRole('dialog', { name: "Time's up" });
  }

  it('offers score, keep going and start over — and says it will auto-score', () => {
    showTimeUp();
    expect(screen.getByRole('button', { name: 'End and get my score' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep going (+3 min)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start over/i })).toBeInTheDocument();
    expect(screen.getByRole('timer')).toHaveTextContent(/score it for you in 0:4[45]/);
    // Nothing has been ended or scored just because time ran out.
    expect(voiceEndSession).not.toHaveBeenCalled();
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('"End and get my score" scores the conversation', async () => {
    const user = userEvent.setup();
    showTimeUp();
    await user.click(screen.getByRole('button', { name: 'End and get my score' }));
    expect(noteTimeUpChoice).toHaveBeenCalledWith('score');
    expect(voiceEndSession).toHaveBeenCalledTimes(1);
    expect(chatApplyVoiceSessionComplete).toHaveBeenCalledWith(null, [], 's1');
  });

  it('"Keep going" extends the session without ending it', async () => {
    const user = userEvent.setup();
    showTimeUp();
    await user.click(screen.getByRole('button', { name: 'Keep going (+3 min)' }));
    expect(extendSession).toHaveBeenCalledTimes(1);
    expect(voiceEndSession).not.toHaveBeenCalled();
    expect(voiceStop).not.toHaveBeenCalled();
  });

  it('"Start over" restarts the same scenario unscored', async () => {
    const user = userEvent.setup();
    showTimeUp();
    await user.click(screen.getByRole('button', { name: /start over/i }));
    expect(noteTimeUpChoice).toHaveBeenCalledWith('restart');
    expect(voiceStop).toHaveBeenCalled();
    expect(voiceStart).toHaveBeenCalledWith(SEED_SCENARIOS[0], expect.objectContaining({ locale: 'en' }));
    expect(voiceEndSession).not.toHaveBeenCalled();
  });

  it('drops "Keep going" once the extensions are used up', () => {
    showTimeUp(0);
    expect(screen.queryByRole('button', { name: /keep going/i })).toBeNull();
    expect(screen.getByText(/longest a voice session can run/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End and get my score' })).toBeInTheDocument();
  });

  it('is not dismissed by Escape — the trainee must choose', async () => {
    const user = userEvent.setup();
    showTimeUp();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: "Time's up" })).toBeInTheDocument();
    expect(voiceEndSession).not.toHaveBeenCalled();
  });

  it('never shows the prompt once the session is no longer live', () => {
    voiceTimeUp = true;
    voiceStatus = 'ended';
    render(<ChatScreen />);
    expect(screen.queryByRole('dialog', { name: "Time's up" })).toBeNull();
  });

  it('shows a countdown in the last minute', () => {
    voiceCapWarning = true;
    voiceCapDeadline = Date.now() + 42_000;
    render(<ChatScreen />);
    expect(screen.getByText(/0:4[12] left/)).toBeInTheDocument();
    expect(screen.getByText(/keep going or get your score/i)).toBeInTheDocument();
  });

  it('does not promise "keep going" in the final minute when no extension is left', () => {
    voiceCapWarning = true;
    voiceExtensionsLeft = 0;
    voiceCapDeadline = Date.now() + 42_000;
    render(<ChatScreen />);
    expect(screen.queryByText(/keep going/i)).toBeNull();
    expect(screen.getByText(/you'll get your score/i)).toBeInTheDocument();
  });
});

describe('ChatScreen voice connection lost mid-conversation', () => {
  beforeEach(() => {
    currentScenario = SEED_SCENARIOS[0];
    flagSnapshot = null;
    flagValues = {};
    __resetPreviewRuns();
    resetVoiceMock();
    vi.clearAllMocks();
    voiceEndSession.mockResolvedValue({ report: null, transcript: [], sessionId: 's1' });
    voiceStatus = 'error';
    voiceError = 'Voice connection lost.';
  });

  it('offers to score the conversation the trainee already had', async () => {
    const user = userEvent.setup();
    voiceMessages = [
      { role: 'ai', text: 'That price feels steep.', timestamp: 1 },
      { role: 'user', text: 'I hear you.', timestamp: 2 },
    ];
    render(<ChatScreen />);
    await user.click(screen.getByRole('button', { name: 'Score what you have' }));
    expect(voiceEndSession).toHaveBeenCalledTimes(1);
    expect(voiceStart).not.toHaveBeenCalled();
  });

  it('"Start over" begins a fresh session', async () => {
    const user = userEvent.setup();
    voiceMessages = [{ role: 'user', text: 'I hear you.', timestamp: 2 }];
    render(<ChatScreen />);
    await user.click(screen.getByRole('button', { name: 'Start over' }));
    expect(voiceStop).toHaveBeenCalled();
    expect(voiceStart).toHaveBeenCalledTimes(1);
    expect(voiceEndSession).not.toHaveBeenCalled();
  });

  it('keeps the plain retry when the trainee never spoke (nothing to score)', () => {
    voiceMessages = [{ role: 'ai', text: 'That price feels steep.', timestamp: 1 }];
    render(<ChatScreen />);
    expect(screen.queryByRole('button', { name: 'Score what you have' })).toBeNull();
    expect(screen.getByRole('button', { name: /try voice again/i })).toBeInTheDocument();
  });
});

describe('ChatScreen — a voice conversation is never silently lost', () => {
  beforeEach(() => {
    currentScenario = SEED_SCENARIOS[0];
    flagSnapshot = null;
    flagValues = {};
    __resetPreviewRuns();
    resetVoiceMock();
    vi.clearAllMocks();
    voiceStatus = 'listening';
    voiceMessages = [
      { role: 'ai', text: 'That price feels steep.', timestamp: 1 },
      { role: 'user', text: 'I hear you.', timestamp: 2 },
    ];
  });

  it('checkpoints the live voice transcript', () => {
    render(<ChatScreen />);
    expect(chatCheckpointVoice).toHaveBeenCalledWith(voiceMessages, 'voice-session-1');
  });

  it('asks before switching to text mid-conversation — and scores it on request', async () => {
    const user = userEvent.setup();
    voiceEndSession.mockResolvedValue({ report: null, transcript: voiceMessages, sessionId: 'voice-session-1', heardTrainee: true });
    render(<ChatScreen />);
    await user.click(screen.getByRole('button', { name: 'Text' }));
    expect(screen.getByRole('dialog', { name: 'Switch to text?' })).toBeInTheDocument();
    expect(voiceStop).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Get my score first' }));
    expect(voiceEndSession).toHaveBeenCalledTimes(1);
  });

  it('"Switch without scoring" still saves the conversation', async () => {
    const user = userEvent.setup();
    render(<ChatScreen />);
    await user.click(screen.getByRole('button', { name: 'Text' }));
    await user.click(screen.getByRole('button', { name: 'Switch without scoring' }));
    expect(chatRecordVoiceUnscored).toHaveBeenCalledWith(voiceMessages, 'voice-session-1', 'user_exit');
    expect(voiceStop).toHaveBeenCalled();
  });

  it('switches straight away when the trainee has not spoken yet', async () => {
    const user = userEvent.setup();
    voiceMessages = [{ role: 'ai', text: 'That price feels steep.', timestamp: 1 }];
    render(<ChatScreen />);
    await user.click(screen.getByRole('button', { name: 'Text' }));
    expect(screen.queryByRole('dialog', { name: 'Switch to text?' })).toBeNull();
    expect(voiceStop).toHaveBeenCalled();
  });

  it('the scenario arrows save the conversation before moving on', async () => {
    const user = userEvent.setup();
    render(<ChatScreen />);
    await user.click(screen.getByRole('button', { name: /next scenario/i }));
    expect(chatRecordVoiceUnscored).toHaveBeenCalledWith(voiceMessages, 'voice-session-1', 'user_exit');
  });

  it('leaving the screen mid-conversation saves it', () => {
    const { unmount } = render(<ChatScreen />);
    unmount();
    expect(chatRecordVoiceUnscored).toHaveBeenCalledWith(voiceMessages, 'voice-session-1', 'user_exit');
  });

  it('a session in which the trainee was never heard is not scored — they are told why', async () => {
    const user = userEvent.setup();
    const aiOnly = [{ role: 'ai' as const, text: 'Hello? Are you there?', timestamp: 1 }];
    voiceEndSession.mockResolvedValue({ report: null, transcript: aiOnly, sessionId: 'voice-session-1', heardTrainee: false });
    voiceTimeUp = true;
    voiceTimeUpAutoEndAt = Date.now() + 40_000;
    render(<ChatScreen />);
    await user.click(screen.getByRole('button', { name: 'End and get my score' }));
    await vi.waitFor(() => expect(chatRecordVoiceUnscored).toHaveBeenCalledWith(aiOnly, 'voice-session-1', 'error'));
    expect(chatApplyVoiceSessionComplete).not.toHaveBeenCalled();
    expect(screen.getByText(/couldn't hear you/i)).toBeInTheDocument();
  });
});
