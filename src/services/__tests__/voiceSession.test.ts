import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * voiceSession is a socket + WebAudio hook, so these tests keep the harness
 * deliberately thin: a fake `ai.live.connect` that just hands back its
 * callbacks, a fake AudioContext, and a fake mic stream. That's enough to
 * pin the two behaviours that are cheap to break and expensive to lose —
 *
 *  1. the session id allocated at start() is what the scorer is told about
 *     and what endSession() hands back (telemetry attribution), and
 *  2. the duration cap warns at 4:00 and ends GRACEFULLY at 5:00 (via the
 *     natural-end path) instead of killing the socket.
 *
 * Audio decode/playback is not exercised — that would need a real WebAudio
 * mock and buys nothing these assertions don't already cover.
 */

const { evaluateConversation, connect, retrieveContext } = vi.hoisted(() => ({
  evaluateConversation: vi.fn(),
  connect: vi.fn(),
  retrieveContext: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class GoogleGenAI {
    live = { connect };
  }
  return {
    GoogleGenAI,
    Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
    Type: { OBJECT: 'OBJECT', STRING: 'STRING' },
  };
});
vi.mock('../geminiService', () => ({
  evaluateConversation,
  MODEL_LIVE: 'gemini-2.0-flash-live-001',
}));
vi.mock('../ragClient', () => ({ retrieveContext }));
vi.mock('../../app/providers/FlagProvider', () => ({ useSimulationConfig: () => null }));

import { useVoiceSession, VOICE_SESSION_CAPS } from '../voiceSession';
import { LIBRARY_SCENARIOS } from '../../data/scenarios';

const SCENARIO = LIBRARY_SCENARIOS[0];

type Callbacks = {
  onopen: () => void;
  onmessage: (msg: Record<string, unknown>) => void;
  onerror: (e: unknown) => void;
  onclose: (e: unknown) => void;
};

let callbacks: Callbacks;
let liveSession: { sendRealtimeInput: ReturnType<typeof vi.fn>; sendToolResponse: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createBuffer() {
    return { duration: 0.1, getChannelData: () => new Float32Array(1) };
  }
  createBufferSource() {
    return { buffer: null, connect() {}, start() {}, onended: null };
  }
  createMediaStreamSource() {
    return { connect() {} };
  }
  createScriptProcessor() {
    return { onaudioprocess: null, connect() {}, disconnect() {} };
  }
}

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  vi.useFakeTimers();
  evaluateConversation.mockReset();
  connect.mockReset();
  retrieveContext.mockReset();
  retrieveContext.mockResolvedValue([]);

  (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ readyState: 'live', stop: vi.fn() }],
      })),
    },
  });

  connect.mockImplementation((opts: { callbacks: Callbacks }) => {
    callbacks = opts.callbacks;
    liveSession = {
      sendRealtimeInput: vi.fn(),
      sendToolResponse: vi.fn(),
      close: vi.fn(),
    };
    // The real socket opens after connect() returns — mirror that ordering.
    queueMicrotask(() => opts.callbacks.onopen());
    return Promise.resolve(liveSession);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function startSession() {
  const hook = renderHook(() => useVoiceSession());
  await act(async () => {
    await hook.result.current.start(SCENARIO);
  });
  return hook;
}

/** Drive one completed AI turn through the message callback. */
function deliverAiTurn(text: string) {
  act(() => {
    callbacks.onmessage({
      serverContent: { outputTranscription: { text }, turnComplete: true },
    });
  });
}

describe('voiceSession — telemetry attribution', () => {
  it('scores under the id allocated at start() and returns it', async () => {
    evaluateConversation.mockResolvedValue(null);
    const { result } = await startSession();
    deliverAiTurn('That price feels steep to me.');

    let outcome: Awaited<ReturnType<typeof result.current.endSession>> | undefined;
    await act(async () => {
      outcome = await result.current.endSession();
    });

    expect(evaluateConversation).toHaveBeenCalledTimes(1);
    const [, , options] = evaluateConversation.mock.calls[0];
    expect(typeof options.sessionId).toBe('string');
    expect(options.sessionId).toHaveLength(36);
    // The scorer's telemetry id IS the id the consumer saves the record under.
    expect(outcome?.sessionId).toBe(options.sessionId);
    expect(outcome?.transcript).toHaveLength(1);
  });

  it('mints a fresh id per session', async () => {
    evaluateConversation.mockResolvedValue(null);
    const first = await startSession();
    deliverAiTurn('First session.');
    let a: string | null = null;
    await act(async () => {
      a = (await first.result.current.endSession()).sessionId;
    });

    const second = await startSession();
    deliverAiTurn('Second session.');
    let b: string | null = null;
    await act(async () => {
      b = (await second.result.current.endSession()).sessionId;
    });

    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });
});

describe('voiceSession — 5-minute duration cap', () => {
  it('raises capWarning at the warning threshold, not before', async () => {
    const { result } = await startSession();
    expect(result.current.status).toBe('listening');
    expect(result.current.capWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.warnMs - 1000);
    });
    expect(result.current.capWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.capWarning).toBe(true);
  });

  it('ends gracefully at the hard cap — natural-end handler after playback drains, socket left alone', async () => {
    const { result } = await startSession();
    const onNaturalEnd = vi.fn();
    act(() => {
      result.current.registerNaturalEndHandler(onNaturalEnd);
    });

    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs);
    });
    // Same contract as endSimulation: queued TTS drains first.
    expect(onNaturalEnd).not.toHaveBeenCalled();
    expect(liveSession.close).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onNaturalEnd).toHaveBeenCalledTimes(1);
  });

  it('clears the cap timers on stop()', async () => {
    const { result } = await startSession();
    const onNaturalEnd = vi.fn();
    act(() => {
      result.current.registerNaturalEndHandler(onNaturalEnd);
      result.current.stop();
    });

    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs + 5000);
    });
    expect(result.current.capWarning).toBe(false);
    expect(onNaturalEnd).not.toHaveBeenCalled();
  });

  it('leaves a minute between the warning and the cap', () => {
    expect(VOICE_SESSION_CAPS.hardCapMs).toBe(5 * 60_000);
    expect(VOICE_SESSION_CAPS.hardCapMs - VOICE_SESSION_CAPS.warnMs).toBe(60_000);
  });
});
