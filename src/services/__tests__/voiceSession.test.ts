import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/**
 * voiceSession is a socket + WebAudio hook, so these tests keep the harness
 * deliberately thin: a fake `ai.live.connect` that just hands back its
 * callbacks, a fake AudioContext, a fake mic stream, and a mocked
 * `postAi` standing in for the `ai-voice-token` function. That's enough to
 * pin the behaviours that are cheap to break and expensive to lose —
 *
 *  1. the session id allocated at start() is what the scorer is told about
 *     and what endSession() hands back (telemetry attribution),
 *  2. the duration cap warns at 4:00 and ends GRACEFULLY at 5:00 (via the
 *     natural-end path) instead of killing the socket, and
 *  3. the Live socket opens with the EPHEMERAL token minted server-side
 *     (never a long-lived key), after the mic grant, with no client-side
 *     system prompt, and
 *  4. a voice session logs exactly one `session_open` (voice never calls
 *     useTextChat.open(), which logs text's), once the socket is open.
 *
 * Audio decode/playback is not exercised — that would need a real WebAudio
 * mock and buys nothing these assertions don't already cover.
 */

const { evaluateConversation, connect, postAi, genaiCtor, logEvent } = vi.hoisted(() => ({
  evaluateConversation: vi.fn(),
  connect: vi.fn(),
  postAi: vi.fn(),
  genaiCtor: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class GoogleGenAI {
    live = { connect };
    constructor(opts: unknown) {
      genaiCtor(opts);
    }
  }
  return {
    GoogleGenAI,
    Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
    Type: { OBJECT: 'OBJECT', STRING: 'STRING' },
  };
});
vi.mock('../geminiService', () => ({ evaluateConversation }));
vi.mock('../aiApi', () => ({ postAi }));
vi.mock('../../lib/analytics', () => ({ logEvent }));

import { sanitizeAiText, useVoiceSession, VOICE_SESSION_CAPS } from '../voiceSession';
import { LIBRARY_SCENARIOS } from '../../data/scenarios';
import { AI_ENDPOINTS } from '../../shared/ai/contract';
import { translate } from '../../i18n/translate';

const SCENARIO = LIBRARY_SCENARIOS[0];

/** What `ai-voice-token` hands back — a single-use token pinned to a model. */
const TOKEN_RESPONSE = {
  token: 'auth_tokens/ephemeral-abc123',
  model: 'gemini-live-model-from-server',
  expiresAt: '2026-09-11T00:30:00.000Z',
  newSessionExpiresAt: '2026-09-11T00:01:00.000Z',
};

type Callbacks = {
  onopen: () => void;
  onmessage: (msg: Record<string, unknown>) => void;
  onerror: (e: unknown) => void;
  onclose: (e: unknown) => void;
};

let callbacks: Callbacks;
let liveSession: { sendRealtimeInput: ReturnType<typeof vi.fn>; sendToolResponse: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };

type FakeProcessor = { onaudioprocess: ((e: unknown) => void) | null; connect(): void; disconnect(): void };
const processorCreated: FakeProcessor[] = [];
const audioContexts: FakeAudioContext[] = [];

class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  sampleRate: number;
  /** Duration of the next buffer the hook creates (s) — lets a test queue audio. */
  nextBufferDuration = 0.1;
  constructor(opts?: { sampleRate?: number }) {
    this.sampleRate = opts?.sampleRate ?? 0;
    audioContexts.push(this);
  }
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  createBuffer() {
    return { duration: this.nextBufferDuration, getChannelData: () => new Float32Array(1) };
  }
  createBufferSource() {
    return { buffer: null, connect() {}, start() {}, onended: null };
  }
  createMediaStreamSource() {
    return { connect() {} };
  }
  createScriptProcessor() {
    const p: FakeProcessor = { onaudioprocess: null, connect() {}, disconnect() {} };
    processorCreated.push(p);
    return p;
  }
}

let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  evaluateConversation.mockReset();
  connect.mockReset();
  postAi.mockReset();
  genaiCtor.mockReset();
  logEvent.mockReset();
  processorCreated.length = 0;
  audioContexts.length = 0;
  postAi.mockResolvedValue(TOKEN_RESPONSE);

  (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  getUserMedia = vi.fn(async () => ({
    getTracks: () => [{ readyState: 'live', stop: vi.fn() }],
  }));
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
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

async function startSession(
  options?: Parameters<ReturnType<typeof useVoiceSession>['start']>[1],
) {
  const hook = renderHook(() => useVoiceSession());
  await act(async () => {
    await hook.result.current.start(SCENARIO, options);
  });
  return hook;
}

/** The config object handed to `ai.live.connect` for the latest session. */
function connectConfig(): Record<string, any> {
  return connect.mock.calls.at(-1)![0].config;
}

/** The body posted to `ai-voice-token` for the latest session. */
function tokenRequest(): Record<string, any> {
  const call = postAi.mock.calls.at(-1)!;
  expect(call[0]).toBe(AI_ENDPOINTS.voiceToken);
  return call[1];
}

/** Drive one finished trainee utterance through the input transcription. */
function deliverUserTurn(text: string) {
  act(() => {
    callbacks.onmessage({ serverContent: { inputTranscription: { text, finished: true } } });
  });
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
    deliverUserTurn('I hear you — what matters most to you?');

    let outcome: Awaited<ReturnType<typeof result.current.endSession>> | undefined;
    await act(async () => {
      outcome = await result.current.endSession();
    });

    expect(evaluateConversation).toHaveBeenCalledTimes(1);
    const [, , options] = evaluateConversation.mock.calls[0];
    expect(typeof options.sessionId).toBe('string');
    expect(options.sessionId).toHaveLength(36);
    // The scorer's telemetry id IS the id the consumer saves the record under…
    expect(outcome?.sessionId).toBe(options.sessionId);
    expect(outcome?.transcript).toHaveLength(2);
    expect(outcome?.heardTrainee).toBe(true);
    // …and the same id was attributed to the token mint, so the server-side
    // telemetry for the voice turns lines up with the scorer's row.
    expect(tokenRequest().sessionId).toBe(options.sessionId);
  });

  it('scores a voice transcript as voice, never sending the simulation config', async () => {
    evaluateConversation.mockResolvedValue(null);
    const { result } = await startSession();
    deliverAiTurn('That price feels steep to me.');
    deliverUserTurn('Tell me more.');
    await act(async () => {
      await result.current.endSession();
    });
    const options = evaluateConversation.mock.calls[0][2];
    expect(options.mode).toBe('voice');
    expect(options).not.toHaveProperty('endedEarly');
    expect(options).not.toHaveProperty('config');
    expect(options).not.toHaveProperty('retrieved');
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

describe('sanitizeAiText — tool-call narration never reaches the transcript', () => {
  it('keeps ordinary dialogue untouched in both languages', () => {
    expect(sanitizeAiText('That price feels steep to me.')).toBe(
      'That price feels steep to me.',
    );
    expect(sanitizeAiText("Ben, ça coûte pas mal cher pour de la bouffe.")).toBe(
      "Ben, ça coûte pas mal cher pour de la bouffe.",
    );
  });

  it('strips English narration (unchanged behaviour)', () => {
    expect(sanitizeAiText("Okay, I'll try it. I'll call endSimulation now.")).toBe(
      'Okay, I\'ll try it.',
    );
    expect(sanitizeAiText('[END_SIMULATION]')).toBe('');
  });

  it('strips the French narration variants', () => {
    expect(
      sanitizeAiText("OK, on va l'essayer. J'appelle endSimulation maintenant."),
    ).toBe("OK, on va l'essayer.");
    expect(
      sanitizeAiText("Correct, je te fais confiance. En appelant updateEmotion."),
    ).toBe('Correct, je te fais confiance.');
    expect(sanitizeAiText("Merci beaucoup. Je vais arrêter la simulation ici.")).toBe(
      'Merci beaucoup.',
    );
  });

  it('strips a French-translated bracket token even though we never ask for one', () => {
    // The prompt forbids translating the token, but a drifting model may do
    // it anyway — it must never survive into the RAG corpus.
    expect(sanitizeAiText("On va l'essayer. [fin de simulation]")).toBe(
      "On va l'essayer.",
    );
  });
});

describe('voiceSession — session_open analytics', () => {
  const sessionOpens = () =>
    logEvent.mock.calls.map((c) => c[0]).filter((e) => e.target === 'session_open');

  it('logs one session_open, shaped like text mode\'s, once the socket opens', async () => {
    evaluateConversation.mockResolvedValue(null);
    const { result } = await startSession();
    expect(sessionOpens()).toEqual([
      {
        type: 'custom',
        screen: 'chat',
        target: 'session_open',
        meta: {
          sessionId: expect.any(String),
          scenario: SCENARIO.pushback.id,
          driver: SCENARIO.suggestedDriver,
          mode: 'voice',
        },
      },
    ]);
    // Attributed to the same id the scorer and the saved record use.
    deliverAiTurn('That price feels steep to me.');
    let outcome: Awaited<ReturnType<typeof result.current.endSession>> | undefined;
    await act(async () => {
      outcome = await result.current.endSession();
    });
    expect(sessionOpens()).toHaveLength(1);
    expect(sessionOpens()[0].meta.sessionId).toBe(outcome?.sessionId);
  });

  it('a double Begin still logs a single session_open', async () => {
    const { result } = await startSession();
    await act(async () => {
      await result.current.start(SCENARIO);
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sessionOpens()).toHaveLength(1);
  });

  it('logs nothing when the session never starts (mic denied, token refused)', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'));
    await startSession();
    postAi.mockRejectedValueOnce(new Error('503 upstream'));
    await startSession();
    expect(connect).not.toHaveBeenCalled();
    expect(sessionOpens()).toHaveLength(0);
  });
});

describe('voiceSession — ephemeral token', () => {
  it('requests the token only AFTER the mic permission is granted', async () => {
    await startSession();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(postAi).toHaveBeenCalledTimes(1);
    // Permission first: the dialog must be the first thing the user sees
    // after tapping Begin, not delayed behind a network round-trip.
    expect(getUserMedia.mock.invocationCallOrder[0]).toBeLessThan(
      postAi.mock.invocationCallOrder[0],
    );
    expect(postAi.mock.invocationCallOrder[0]).toBeLessThan(connect.mock.invocationCallOrder[0]);
  });

  it('opens the Live socket with the token on the v1alpha surface and the server-chosen model', async () => {
    await startSession();
    expect(genaiCtor).toHaveBeenCalledTimes(1);
    expect(genaiCtor).toHaveBeenCalledWith({
      apiKey: TOKEN_RESPONSE.token,
      httpOptions: { apiVersion: 'v1alpha' },
    });
    expect(connect.mock.calls.at(-1)![0].model).toBe(TOKEN_RESPONSE.model);
  });

  it('sends no systemInstruction — the prompt is locked into the token server-side — but keeps the rest of the config', async () => {
    await startSession();
    const cfg = connectConfig();
    expect(cfg).not.toHaveProperty('systemInstruction');
    expect(cfg.responseModalities).toEqual(['AUDIO']);
    expect(cfg.tools[0].functionDeclarations.map((f: { name: string }) => f.name)).toEqual([
      'updateEmotion',
      'endSimulation',
    ]);
    expect(cfg.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
    expect(cfg.inputAudioTranscription).toEqual({});
    expect(cfg.outputAudioTranscription).toEqual({});
  });

  it('hands the server everything it needs to build the prompt', async () => {
    const overrides = { promptPrefix: 'Be brisk.', promptSuffix: null };
    await startSession({ locale: 'fr', openingLine: 'Ben là, c\'est cher.', overrides });
    const body = tokenRequest();
    expect(body.scenario).toBe(SCENARIO);
    expect(body.openingLine).toBe("Ben là, c'est cher.");
    expect(body.locale).toBe('fr');
    expect(body.promptOverrides).toEqual(overrides);
    expect(body.sessionId).toHaveLength(36);
  });

  it('says voice is switched off when the server refuses with code "disabled"', async () => {
    postAi.mockRejectedValueOnce(Object.assign(new Error('Voice mode is switched off'), { code: 'disabled', status: 403 }));
    const { result } = await startSession({ driver: 'Analyzer' });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(translate('en', 'chat.voice.error.disabled'));
    expect(connect).not.toHaveBeenCalled();
    // The token request carried the flag audience (device id + driver).
    const body = tokenRequest();
    expect(body.audience).toMatchObject({ driver: 'Analyzer' });
    expect(typeof body.audience.anonSessionId).toBe('string');
  });

  it('surfaces a token failure as the connection error and never opens a socket', async () => {
    postAi.mockRejectedValueOnce(new Error('503 upstream'));
    const { result } = await startSession();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(translate('en', 'chat.voice.error.connection'));
    expect(genaiCtor).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('localises the token-failure message', async () => {
    postAi.mockRejectedValueOnce(new Error('503 upstream'));
    const { result } = await startSession({ locale: 'fr' });
    expect(result.current.error).toBe(translate('fr', 'chat.voice.error.connection'));
  });
});

describe('voiceSession — locale', () => {
  it('defaults to the current English behaviour when no locale is passed', async () => {
    await startSession();
    const cfg = connectConfig();
    expect(cfg.speechConfig.languageCode).toBe('en-US');
    expect(cfg.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
    // The prompt is built server-side from the locale we send.
    expect(tokenRequest().locale).toBe('en');
  });

  it('locale "en" is identical to omitting it', async () => {
    await startSession();
    const implicit = connectConfig();
    const implicitToken = tokenRequest();
    await startSession({ locale: 'en' });
    const explicit = connectConfig();
    expect(explicit.speechConfig).toEqual(implicit.speechConfig);
    expect(tokenRequest().locale).toBe(implicitToken.locale);
  });

  it('locale "fr" speaks fr-CA and asks the server for a Québec French prompt — same voice', async () => {
    await startSession({ locale: 'fr' });
    const cfg = connectConfig();
    expect(cfg.speechConfig.languageCode).toBe('fr-CA');
    // The persona voice must NOT change with the language.
    expect(cfg.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Aoede');
    expect(tokenRequest().locale).toBe('fr');
  });

  it('scores the session in the locale it was played in', async () => {
    evaluateConversation.mockResolvedValue(null);
    const { result } = await startSession({ locale: 'fr' });
    deliverAiTurn('Ben, ça coûte pas mal cher pour de la bouffe à chien.');
    deliverUserTurn('Je comprends, parlons-en.');
    await act(async () => {
      await result.current.endSession();
    });
    expect(evaluateConversation.mock.calls[0][2].locale).toBe('fr');
  });

  it('uses a caller-supplied pre-localized opening line for the kickoff cue', async () => {
    const { result } = await startSession({
      locale: 'fr',
      openingLine: 'Ben là, c\'est pas mal cher pour un sac de bouffe.',
    });
    const cue = liveSession.sendRealtimeInput.mock.calls[0][0].text as string;
    expect(cue).toContain("Ben là, c'est pas mal cher pour un sac de bouffe.");
    expect(cue).not.toContain(SCENARIO.openingLine!);
    // The server locks the same line into the prompt.
    expect(tokenRequest().openingLine).toBe("Ben là, c'est pas mal cher pour un sac de bouffe.");

    // …and that same line is what gets pinned onto the opening AI turn when
    // the transcription drifts.
    deliverAiTurn('garbled partial');
    expect(result.current.messages[0].text).toContain("Ben là, c'est pas mal cher");
  });

  it('falls back to the scenario opening line when the caller supplies none', async () => {
    await startSession();
    const cue = liveSession.sendRealtimeInput.mock.calls[0][0].text as string;
    expect(cue).toContain(SCENARIO.openingLine!);
    expect(tokenRequest().openingLine).toBe(SCENARIO.openingLine);
  });
});

describe('voiceSession — 5-minute time limit (ask, never cut off)', () => {
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

  it('pauses at the hard cap and ASKS — no automatic end, socket left alone', async () => {
    const { result } = await startSession();
    const onNaturalEnd = vi.fn();
    act(() => {
      result.current.registerNaturalEndHandler(onNaturalEnd);
    });
    expect(result.current.capDeadline).toBe(Date.now() + VOICE_SESSION_CAPS.hardCapMs);

    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs);
    });
    expect(result.current.timeUp).toBe(true);
    expect(result.current.timeUpAutoEndAt).toBe(Date.now() + VOICE_SESSION_CAPS.decisionMs);
    expect(result.current.extensionsLeft).toBe(VOICE_SESSION_CAPS.maxExtensions);
    // The trainee decides — nothing ended, nothing scored, socket still open.
    expect(onNaturalEnd).not.toHaveBeenCalled();
    expect(liveSession.close).not.toHaveBeenCalled();
    expect(evaluateConversation).not.toHaveBeenCalled();
  });

  it('stops sending mic audio while the time\'s-up prompt is open, and resumes on "keep going"', async () => {
    const { result } = await startSession();
    deliverAiTurn('That price feels steep to me.'); // opening delivered → mic unlocked
    const processor = processorCreated.at(-1)!;
    const tick = () =>
      act(() => {
        processor.onaudioprocess!({ inputBuffer: { getChannelData: () => new Float32Array(4) } });
      });
    const audioSends = () =>
      liveSession.sendRealtimeInput.mock.calls.filter(([p]) => (p as { audio?: unknown }).audio).length;

    tick();
    await act(async () => {});
    expect(audioSends()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs);
    });
    expect(result.current.timeUp).toBe(true);
    tick();
    await act(async () => {});
    expect(audioSends()).toBe(1);

    act(() => {
      expect(result.current.extendSession()).toBe(true);
    });
    act(() => {
      vi.advanceTimersByTime(300); // post-resume grace
    });
    tick();
    await act(async () => {});
    expect(audioSends()).toBe(2);
  });

  it('"keep going" moves the deadline by one extension and counts it down', async () => {
    const { result } = await startSession();
    const onNaturalEnd = vi.fn();
    act(() => {
      result.current.registerNaturalEndHandler(onNaturalEnd);
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs);
    });
    act(() => {
      result.current.extendSession();
    });
    expect(result.current.timeUp).toBe(false);
    expect(result.current.capWarning).toBe(false);
    expect(result.current.extensionsLeft).toBe(VOICE_SESSION_CAPS.maxExtensions - 1);
    expect(result.current.capDeadline).toBe(Date.now() + VOICE_SESSION_CAPS.extensionMs);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'voice_time_up',
        meta: expect.objectContaining({ choice: 'extend', extensionsUsed: 1 }),
      }),
    );

    // The countdown warning comes back a minute before the NEW deadline…
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.extensionMs - VOICE_SESSION_CAPS.warnLeadMs);
    });
    expect(result.current.capWarning).toBe(true);
    // …and the prompt comes back at it. Still never an automatic end.
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.warnLeadMs);
    });
    expect(result.current.timeUp).toBe(true);
    expect(onNaturalEnd).not.toHaveBeenCalled();
  });

  it('allows a bounded number of extensions', async () => {
    const { result } = await startSession();
    for (let i = 0; i < VOICE_SESSION_CAPS.maxExtensions; i++) {
      act(() => {
        vi.advanceTimersByTime(i === 0 ? VOICE_SESSION_CAPS.hardCapMs : VOICE_SESSION_CAPS.extensionMs);
      });
      act(() => {
        expect(result.current.extendSession()).toBe(true);
      });
    }
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.extensionMs);
    });
    expect(result.current.timeUp).toBe(true);
    expect(result.current.extensionsLeft).toBe(0);
    act(() => {
      expect(result.current.extendSession()).toBe(false);
    });
    expect(result.current.timeUp).toBe(true);
  });

  it('extendSession is a no-op before the time is up', async () => {
    const { result } = await startSession();
    act(() => {
      expect(result.current.extendSession()).toBe(false);
    });
    expect(result.current.extensionsLeft).toBe(VOICE_SESSION_CAPS.maxExtensions);
  });

  it('an unanswered prompt scores the session (natural-end handler) — an abandoned tab never runs on', async () => {
    const { result } = await startSession();
    const onNaturalEnd = vi.fn();
    act(() => {
      result.current.registerNaturalEndHandler(onNaturalEnd);
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs);
    });
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.decisionMs - 1);
    });
    expect(onNaturalEnd).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onNaturalEnd).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'voice_time_up',
        meta: expect.objectContaining({ choice: 'auto_score' }),
      }),
    );
    // And the transcript is still there to score.
    deliverUserTurn('Could we try a small bag first?');
    deliverAiTurn('Fine, I will think about it.');
    let outcome: Awaited<ReturnType<typeof result.current.endSession>> | undefined;
    evaluateConversation.mockResolvedValue(null);
    await act(async () => {
      outcome = await result.current.endSession();
    });
    expect(outcome?.transcript.length).toBeGreaterThan(0);
    expect(evaluateConversation).toHaveBeenCalledTimes(1);
  });

  it('waits for the customer\'s in-flight line to finish before asking', async () => {
    const { result } = await startSession();
    deliverAiTurn('Opening.');
    // Queue ~3 s of customer audio right at the deadline.
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs - 10);
    });
    const ctx = audioContexts.find((c) => c.sampleRate === 24000)!;
    ctx.nextBufferDuration = 3;
    act(() => {
      callbacks.onmessage({
        serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm', data: btoa('ab') } }] } },
      });
    });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current.timeUp).toBe(false);
    // Playback finishes (the fake clock moves with the timers).
    ctx.currentTime = 3.1;
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(result.current.timeUp).toBe(true);
  });

  it('a natural end already under way wins over the cap', async () => {
    const { result } = await startSession();
    act(() => {
      callbacks.onmessage({
        toolCall: { functionCalls: [{ id: '1', name: 'endSimulation', args: {} }] },
      });
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs - 500);
    });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.timeUp).toBe(false);
  });

  it('endSession clears the prompt', async () => {
    evaluateConversation.mockResolvedValue(null);
    const { result } = await startSession();
    deliverAiTurn('Opening.');
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs);
    });
    expect(result.current.timeUp).toBe(true);
    await act(async () => {
      await result.current.endSession();
    });
    expect(result.current.timeUp).toBe(false);
    expect(result.current.capDeadline).toBeNull();
    // The auto-score timer died with the session.
    const onNaturalEnd = vi.fn();
    act(() => {
      result.current.registerNaturalEndHandler(onNaturalEnd);
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.decisionMs + 1000);
    });
    expect(onNaturalEnd).not.toHaveBeenCalled();
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
    expect(VOICE_SESSION_CAPS.warnLeadMs).toBe(60_000);
  });
});

describe('voiceSession — the trainee\'s words always reach the transcript', () => {
  it('keeps a transcription that arrives while the customer is already replying, before that reply', async () => {
    evaluateConversation.mockResolvedValue(null);
    const { result } = await startSession();
    deliverAiTurn('He is just big-boned.');
    // The trainee spoke; Gemini starts the reply audio first…
    act(() => {
      callbacks.onmessage({
        serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm', data: btoa('ab') } }] } },
      });
    });
    expect(result.current.status).toBe('aiSpeaking');
    // …and only then delivers the trainee's words (the old code dropped these).
    act(() => {
      callbacks.onmessage({ serverContent: { inputTranscription: { text: 'How often does he walk?' } } });
    });
    act(() => {
      callbacks.onmessage({
        serverContent: { outputTranscription: { text: 'About twice a day.' }, turnComplete: true },
      });
    });
    expect(result.current.messages.map((m) => [m.role, m.text])).toEqual([
      // The opening turn is pinned to the scripted line.
      ['ai', SCENARIO.openingLine],
      ['user', 'How often does he walk?'],
      ['ai', 'About twice a day.'],
    ]);
  });

  it('never drops a long answer (the old 200-character ceiling did)', async () => {
    const { result } = await startSession();
    deliverAiTurn('Why change?');
    const long = 'I completely understand. '.repeat(20).trim();
    act(() => {
      callbacks.onmessage({ serverContent: { inputTranscription: { text: long } } });
    });
    act(() => {
      callbacks.onmessage({
        serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm', data: btoa('ab') } }] } },
      });
    });
    expect(result.current.messages.at(-1)).toMatchObject({ role: 'user', text: long });
  });

  it('does not score a session in which the trainee was never heard', async () => {
    const { result } = await startSession();
    deliverAiTurn('Do we really need this?');
    deliverAiTurn('Hello? Are you there?');
    let outcome: Awaited<ReturnType<typeof result.current.endSession>> | undefined;
    await act(async () => {
      outcome = await result.current.endSession();
    });
    expect(evaluateConversation).not.toHaveBeenCalled();
    expect(outcome?.heardTrainee).toBe(false);
    expect(outcome?.report).toBeNull();
    expect(outcome?.transcript).toHaveLength(2);
  });

  it('exposes the session id it saves under', async () => {
    const { result } = await startSession();
    expect(result.current.sessionId).toBe(tokenRequest().sessionId);
  });
});

describe('voiceSession — time limit and the scorer', () => {
  it('tells the scorer when the time limit ended the conversation', async () => {
    evaluateConversation.mockResolvedValue(null);
    const { result } = await startSession();
    deliverAiTurn('Opening.');
    deliverUserTurn('I hear you.');
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs);
    });
    expect(result.current.timeUp).toBe(true);
    await act(async () => {
      await result.current.endSession();
    });
    expect(evaluateConversation.mock.calls[0][2].endedEarly).toBe('time_limit');
  });

  it('a session that kept going and ended naturally is not flagged', async () => {
    evaluateConversation.mockResolvedValue(null);
    const { result } = await startSession();
    deliverAiTurn('Opening.');
    deliverUserTurn('I hear you.');
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs);
    });
    act(() => {
      result.current.extendSession();
    });
    await act(async () => {
      await result.current.endSession();
    });
    expect(evaluateConversation.mock.calls[0][2]).not.toHaveProperty('endedEarly');
  });

  it('lets a trainee who is mid-sentence finish before pausing (up to the grace)', async () => {
    const { result } = await startSession();
    deliverAiTurn('Opening.');
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs - 100);
      callbacks.onmessage({ serverContent: { inputTranscription: { text: 'What I would suggest is' } } });
    });
    expect(result.current.status).toBe('thinking');
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.timeUp).toBe(false);
    // They finish; the customer replies; then the prompt.
    act(() => {
      callbacks.onmessage({ serverContent: { inputTranscription: { text: ' a slower switch.', finished: true } } });
      callbacks.onmessage({ serverContent: { outputTranscription: { text: 'Okay.' }, turnComplete: true } });
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.timeUp).toBe(true);
    expect(result.current.messages.some((m) => m.role === 'user' && m.text.includes('slower switch'))).toBe(true);
  });

  it('the sentence grace is bounded', async () => {
    const { result } = await startSession();
    deliverAiTurn('Opening.');
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.hardCapMs - 100);
      callbacks.onmessage({ serverContent: { inputTranscription: { text: 'And another thing' } } });
    });
    act(() => {
      vi.advanceTimersByTime(VOICE_SESSION_CAPS.finishSentenceMs + 1_000);
    });
    expect(result.current.timeUp).toBe(true);
  });
});
