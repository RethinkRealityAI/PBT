import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { ChatScreen } from '../ChatScreen';
import { SEED_SCENARIOS } from '../../data/scenarios';
import { __resetPreviewRuns, startPreviewRun } from '../../lib/previewMode';

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

let currentScenario = SEED_SCENARIOS[0];
let voiceStatus:
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'aiSpeaking'
  | 'ended'
  | 'error' = 'idle';
let voiceError: string | null = null;

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
    startedAt: null,
  }),
}));

vi.mock('../../services/voiceSession', () => ({
  useVoiceSession: () => ({
    status: voiceStatus,
    emotion: 'red',
    messages: [],
    start: voiceStart,
    stop: voiceStop,
    endSession: voiceEndSession,
    registerNaturalEndHandler,
    error: voiceError,
  }),
}));

describe('ChatScreen voice-first flow', () => {
  beforeEach(() => {
    currentScenario = SEED_SCENARIOS[0];
    voiceStatus = 'idle';
    voiceError = null;
    vi.clearAllMocks();
    voiceEndSession.mockResolvedValue({ report: null, transcript: [] });
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
    });
  });

  it('rotates to the next seeded scenario in place and closes any active voice session first', async () => {
    const user = userEvent.setup();
    voiceStatus = 'listening';

    render(<ChatScreen />);

    await user.click(screen.getByRole('button', { name: /next scenario/i }));

    expect(voiceStop).toHaveBeenCalled();
    expect(setScenario).toHaveBeenCalledWith(SEED_SCENARIOS[1]);
    expect(go).not.toHaveBeenCalledWith('create');
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
