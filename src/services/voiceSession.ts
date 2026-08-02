import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import type { Scenario } from '../data/scenarios';
import type { ChatMessage, ScoreReport } from './types';
import { buildVoiceSystemPrompt } from '../data/knowledge/promptBuilders';
import { evaluateConversation, MODEL_LIVE } from './geminiService';
import { useSimulationConfig } from '../app/providers/FlagProvider';
import { retrieveContext } from './ragClient';
import { resolveRag } from '../data/knowledge/simulationConfig';
import type { RetrievedChunk } from './ragShared';
import { uuid } from '../lib/id';
import { DEFAULT_LOCALE, LOCALE_BCP47, type Locale } from '../i18n/locales';

export type EmotionColor = 'red' | 'yellow' | 'green';
export type VoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'aiSpeaking'
  | 'ended'
  | 'error';

export interface VoiceSessionResult {
  report: ScoreReport | null;
  transcript: ChatMessage[];
  /**
   * The id allocated at `start()` and used as the telemetry `sessionId` for
   * the scorer call. Consumers persist the session under this SAME id
   * (`useTextChat.applyVoiceSessionComplete`) so AI-call rows, the local
   * SessionRecord and the Supabase `training_sessions` row all line up.
   * Null when the session never started.
   */
  sessionId: string | null;
}

export interface VoiceStartOptions {
  /**
   * App locale. Drives the customer's spoken language (prompt) and the live
   * speech config's `languageCode`. Defaults to English.
   */
  locale?: Locale;
  /**
   * Pre-localized opening pushback line for the kickoff cue.
   *
   * The caller owns scenario localization — this hook deliberately does NOT
   * import the scenario l10n helpers, so the two concerns stay separable.
   * Falls back to `scenario.openingLine` when omitted.
   */
  openingLine?: string | null;
}

export interface UseVoiceSessionReturn {
  status: VoiceStatus;
  emotion: EmotionColor;
  messages: ChatMessage[];
  /** Live, partial AI text for the in-flight turn (cleared when next AI turn begins). */
  liveAiText: string;
  /**
   * True once the session passes the warning threshold (4:00) and until it
   * stops/restarts — the UI announces that the hard cap is approaching.
   */
  capWarning: boolean;
  start: (scenario: Scenario, options?: VoiceStartOptions) => Promise<void>;
  stop: () => void;
  endSession: () => Promise<VoiceSessionResult>;
  /** Fires once after the model calls endSimulation. */
  registerNaturalEndHandler: (handler: (() => void) | null) => void;
  error: string | null;
}

const SAMPLE_RATE_OUT = 24000;
const SAMPLE_RATE_IN = 16000;

/**
 * Wall-clock caps on a live voice session, measured from socket open.
 *
 * Live audio bills per second on both legs, so an abandoned tab (phone in a
 * pocket, forgotten desktop) is a runaway-cost hazard — nothing in the
 * conversation loop ever ends a session the user walked away from. At
 * `warnMs` the UI announces the wrap-up; at `hardCapMs` we trigger the SAME
 * graceful end path the model's `endSimulation` tool uses, so queued TTS
 * finishes and the session is scored rather than dropped.
 *
 * Exported so the thresholds are unit-testable without a socket/audio harness.
 */
export const VOICE_SESSION_CAPS = {
  /** 4:00 — "about a minute left" warning. */
  warnMs: 4 * 60_000,
  /** 5:00 — graceful end. */
  hardCapMs: 5 * 60_000,
} as const;

// Strip any control-token / function-call narration that leaks into the AI's
// transcribed audio. Keeps both the on-screen `liveAiText` and the saved
// transcript clean — important for future RAG training where stray
// "endSimulation" / "[END_SIMULATION]" text would poison samples.
export function sanitizeAiText(raw: string): string {
  const cleaned = raw
    // Drop entire sentences that mention calling the tool / function names.
    // English narration…
    .replace(/[^.?!]*\b(?:calling|invoke|invoking|i(?:'|')ll\s+call)\b[^.?!]*(?:end[_\s-]*simulation|update[_\s-]*emotion)[^.?!]*[.?!]?/gi, '')
    // …and the French equivalents. A francophone model narrates the tool as
    // "j'appelle endSimulation" / "en appelant updateEmotion" — the English
    // verb list above never matches, so the narration used to survive into
    // the saved transcript (and from there into the RAG corpus).
    .replace(/[^.?!]*\b(?:j(?:'|’)appelle|je\s+vais\s+appeler|en\s+appelant|appel\s+(?:de|à)|j(?:'|’)invoque)\b[^.?!]*(?:end[_\s-]*simulation|update[_\s-]*emotion)[^.?!]*[.?!]?/gi, '')
    .replace(/[^.?!]*\b(?:end[_\s-]*simulation|update[_\s-]*emotion)\b[^.?!]*[.?!]?/gi, '')
    // French narration of the END token itself, spoken as words rather than
    // emitted. The token is never translated (see END_SIMULATION_TOKEN), so
    // any French phrasing of it is by definition narration, not signal.
    .replace(/[^.?!]*\b(?:fin\s+(?:de\s+)?(?:la\s+)?simulation|terminer\s+la\s+simulation|arrêter\s+la\s+simulation)\b[^.?!]*[.?!]?/gi, '')
    // Strip stray bracket tokens / function-call literals.
    .replace(/\[\s*end[_\s-]*simulation\s*\]/gi, '')
    .replace(/\[\s*fin[_\s-]*(?:de[_\s-]*)?simulation\s*\]/gi, '')
    .replace(/\[\s*update[_\s-]*emotion\s*\]/gi, '')
    .replace(/update[_\s-]*emotion\s*\([^)]*\)/gi, '')
    .replace(/end[_\s-]*simulation\s*\([^)]*\)/gi, '')
    // Tidy whitespace, dangling punctuation, double dots.
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .trim();
  // Capitalize the first letter so partial STT that starts mid-phrase still reads cleanly.
  return cleaned.length > 0
    ? cleaned[0].toUpperCase() + cleaned.slice(1)
    : cleaned;
}

export function useVoiceSession(): UseVoiceSessionReturn {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [emotion, setEmotion] = useState<EmotionColor>('red');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveAiText, setLiveAiText] = useState('');
  const [capWarning, setCapWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Global admin simulation config — held in a ref so the prompt build + the
  // post-session scoring (both inside callbacks) read the latest value.
  const simulationConfig = useSimulationConfig();
  const configRef = useRef(simulationConfig);
  configRef.current = simulationConfig;
  // Knowledge retrieved for this voice session (RAG) — set in start().
  const retrievedRef = useRef<RetrievedChunk[]>([]);

  // Session stored as a Promise (reference pattern) — all sends via .then()
  const sessionPromiseRef = useRef<Promise<unknown> | null>(null);
  // Playback AudioContext (24 kHz) — separate from recording context
  const playbackCtxRef = useRef<AudioContext | null>(null);
  // Recording AudioContext (16 kHz) + ScriptProcessor — created inside onopen
  const recordingCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  // Time-based audio scheduling (reference approach — avoids queue race)
  const nextPlayTimeRef = useRef(0);

  const transcriptRef = useRef<ChatMessage[]>([]);
  // Mirrors the emotion state for use inside socket callbacks — AI turns are
  // stamped with the customer's resolution state at commit time so the
  // scorecard's resolution arc works for voice sessions, not just text.
  const emotionRef = useRef<EmotionColor>('red');
  // Single source of truth for the AI's current turn text — accumulated from
  // outputAudioTranscription chunks. modelTurn.parts.text fallback also feeds in
  // for the rare case it appears, but with AUDIO-only modality it usually does not.
  const aiTextBufferRef = useRef('');
  const userTextBufferRef = useRef('');
  const scenarioRef = useRef<Scenario | null>(null);
  /** Locale for this session — read inside socket callbacks + the scorer. */
  const localeRef = useRef<Locale>(DEFAULT_LOCALE);
  /**
   * The opening line actually used for this session: the caller's
   * pre-localized line when supplied, else the scenario's own. Pinned onto
   * the first AI turn when transcription mismatches it, so the transcript
   * shows the line the customer was told to say — in the right language.
   */
  const openingLineRef = useRef<string | null>(null);
  /**
   * Session id allocated at start(), BEFORE the socket opens. Threaded into
   * the scorer call (`evaluateConversation`'s telemetry `sessionId`) and
   * returned from endSession() so the saved record reuses it — previously the
   * record id was minted later in `applyVoiceSessionComplete`, leaving every
   * voice scorer telemetry row unattributed.
   */
  const sessionIdRef = useRef<string | null>(null);
  const statusRef = useRef<VoiceStatus>('idle');
  const finalizePromiseRef = useRef<Promise<VoiceSessionResult> | null>(null);
  const naturalEndHandlerRef = useRef<(() => void) | null>(null);
  /** After endSimulation, wait until queued TTS finishes — reschedule as audio chunks arrive. */
  const pendingNaturalEndRef = useRef(false);
  /**
   * Client-side end fallback. The model is supposed to call `endSimulation`
   * after shifting to GREEN and delivering its closing line, but it skips
   * the tool call often enough to leave the conversation looping. Instead
   * of relying solely on the tool call, we prime this ref the moment
   * emotion shifts to green (the model's "convinced" signal) and trigger
   * the natural-end on the very next `turnComplete` — which is when the
   * closing line audio has fully arrived. That way "convinced + final
   * statement" reliably ends the session, even if the model forgets the
   * tool call.
   */
  const endPrimedRef = useRef(false);
  const naturalEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Watchdog for the aiSpeaking → listening transition. The primary signal
   * is the last buffer source's `onended`, but that callback can be missed
   * (suspended AudioContext, tab backgrounded, timing skew) — and a stuck
   * 'aiSpeaking' permanently mutes the mic, which reads to the user as
   * "it stopped hearing me". Rescheduled on every chunk; fires ~350ms after
   * the scheduled end of the playback queue as a belt-and-braces fallback.
   */
  const playbackEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Duration-cap timers (see VOICE_SESSION_CAPS) — armed on socket open. */
  const capWarnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Gates mic audio until the AI delivers its first complete turn (prevents double opening)
  const openingDeliveredRef = useRef(false);
  // Timestamp until which mic audio should be suppressed (post-AI-speech grace period).
  // Prevents echo of AI audio leaking through speakers from being sent back as "user speech".
  const micUnmuteAtRef = useRef(0);

  const setStatusSync = useCallback((s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const scheduleNaturalEndAfterPlayback = useCallback(() => {
    if (naturalEndTimerRef.current) {
      clearTimeout(naturalEndTimerRef.current);
      naturalEndTimerRef.current = null;
    }
    const ctx = playbackCtxRef.current;
    const playbackTail =
      ctx && ctx.state !== 'closed'
        ? Math.max(0, nextPlayTimeRef.current - ctx.currentTime)
        : 0;
    const delayMs = Math.min(16000, Math.ceil(playbackTail * 1000) + 1000);
    naturalEndTimerRef.current = setTimeout(() => {
      naturalEndTimerRef.current = null;
      pendingNaturalEndRef.current = false;
      naturalEndHandlerRef.current?.();
    }, delayMs);
  }, []);

  const clearCapTimers = useCallback(() => {
    if (capWarnTimerRef.current) {
      clearTimeout(capWarnTimerRef.current);
      capWarnTimerRef.current = null;
    }
    if (capEndTimerRef.current) {
      clearTimeout(capEndTimerRef.current);
      capEndTimerRef.current = null;
    }
  }, []);

  /**
   * Arm the duration cap. Called from `onopen` so the clock starts when the
   * socket (and therefore the billing) actually starts, not at the Begin tap.
   */
  const startCapTimers = useCallback(() => {
    clearCapTimers();
    setCapWarning(false);
    capWarnTimerRef.current = setTimeout(() => {
      capWarnTimerRef.current = null;
      setCapWarning(true);
    }, VOICE_SESSION_CAPS.warnMs);
    capEndTimerRef.current = setTimeout(() => {
      capEndTimerRef.current = null;
      // Already wrapping up (endSimulation / green-primed close, or the user
      // hit End) — let that path finish rather than double-triggering.
      if (pendingNaturalEndRef.current) return;
      const live =
        statusRef.current === 'listening' ||
        statusRef.current === 'thinking' ||
        statusRef.current === 'aiSpeaking';
      if (!live) return;
      // Same graceful exit as the model's endSimulation tool: let queued TTS
      // drain, then fire the registered natural-end handler (ChatScreen →
      // finalizeVoice → scoring). Deliberately NOT a socket kill — a hard
      // close mid-sentence would lose the closing line and the scorecard.
      pendingNaturalEndRef.current = true;
      scheduleNaturalEndAfterPlayback();
    }, VOICE_SESSION_CAPS.hardCapMs);
  }, [clearCapTimers, scheduleNaturalEndAfterPlayback]);

  const addAiMessage = useCallback(() => {
    const text = sanitizeAiText(aiTextBufferRef.current);
    if (!text) return;
    const msg: ChatMessage = {
      role: 'ai',
      text,
      timestamp: Date.now(),
      emotion: emotionRef.current,
    };
    transcriptRef.current = [...transcriptRef.current, msg];
    setMessages([...transcriptRef.current]);
    aiTextBufferRef.current = '';
    // Don't clear liveAiText here — we want it to persist as the "current AI line"
    // until the NEXT AI turn begins. It's cleared at the start of the next turn instead.
  }, []);

  const addUserMessage = useCallback((text: string) => {
    const msg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    transcriptRef.current = [...transcriptRef.current, msg];
    setMessages([...transcriptRef.current]);
  }, []);

  // Time-based playback scheduler from reference — gapless, no queue race
  const playAudioChunk = useCallback((base64Audio: string) => {
    const ctx = playbackCtxRef.current;
    if (!ctx || ctx.state === 'closed') return;
    // Autoplay policy can re-suspend the context after creation (notably
    // iOS Safari). A suspended context freezes currentTime, silently piles
    // up scheduled sources, and never fires onended — resume defensively.
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => { /* non-fatal */ });
    }

    if (statusRef.current !== 'aiSpeaking') {
      setStatusSync('aiSpeaking');
      // The user finished a turn; AI is now responding. If there's still
      // accumulated user transcription that never received a `finished:true`
      // flag, commit it now — silently dropping it would lose the user's
      // message from the transcript and put the AI in the position of
      // appearing to respond to nothing.
      //
      // Earlier code wiped the buffer on the assumption that any pending
      // STT was AI-echo leaking through the mic. That's possible but rare,
      // and the cost is high: a real user turn deleted from the canonical
      // record. We trust the model's VAD and accept occasional echo over
      // dropped turns. The 200-character ceiling guards against runaway
      // accumulation if STT mis-triggers without a finished flag.
      const pending = userTextBufferRef.current.trim();
      if (pending && pending.length <= 200) {
        addUserMessage(pending);
      }
      userTextBufferRef.current = '';
      // Do NOT clear aiTextBufferRef here. outputAudioTranscription chunks often arrive
      // in the same message before this audio chunk, or in earlier messages before the
      // first PCM arrives — clearing on first play would drop the leading words every turn.
      // The buffer is reset in addAiMessage() after turnComplete and on session stop/start.
      // Clear the displayed line — transcript stays blank while AI is speaking;
      // it's filled (full, sanitized) at turnComplete.
      setLiveAiText('');
    }

    const binary = atob(base64Audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;

    const audioBuf = ctx.createBuffer(1, float32.length, SAMPLE_RATE_OUT);
    audioBuf.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuf;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    if (nextPlayTimeRef.current < now) nextPlayTimeRef.current = now;
    source.start(nextPlayTimeRef.current);
    nextPlayTimeRef.current += audioBuf.duration;

    if (pendingNaturalEndRef.current) {
      queueMicrotask(() => scheduleNaturalEndAfterPlayback());
    }

    const finishSpeaking = () => {
      // Only arm the grace period when we're actually leaving an AI-speaking
      // state. If we're already out of it, the exit was a barge-in (the
      // `interrupted` handler drops to 'listening' and deliberately zeroes
      // micUnmuteAtRef so the user's live speech flows immediately) or a
      // teardown — re-arming here would mute 250ms of audio the user is
      // mid-way through speaking.
      if (statusRef.current !== 'aiSpeaking') return;
      setStatusSync('listening');
      // 250ms grace before mic re-opens — lets AI audio tail decay so it doesn't
      // get captured and sent back as a phantom user turn.
      micUnmuteAtRef.current = performance.now() + 250;
    };

    source.onended = () => {
      if (ctx.state !== 'closed' && ctx.currentTime >= nextPlayTimeRef.current - 0.1) {
        finishSpeaking();
      }
    };

    // Watchdog: rescheduled on every chunk, so it only fires after the LAST
    // chunk's scheduled end. If onended was missed the state machine still
    // exits aiSpeaking and the mic un-mutes — a stuck aiSpeaking otherwise
    // silently discards everything the user says for the rest of the session.
    if (playbackEndTimerRef.current) clearTimeout(playbackEndTimerRef.current);
    const msUntilQueueEnd = Math.max(
      0,
      Math.ceil((nextPlayTimeRef.current - ctx.currentTime) * 1000),
    );
    playbackEndTimerRef.current = setTimeout(() => {
      playbackEndTimerRef.current = null;
      finishSpeaking();
    }, msUntilQueueEnd + 350);
  }, [scheduleNaturalEndAfterPlayback, setStatusSync]);

  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (recordingCtxRef.current?.state !== 'closed') {
      recordingCtxRef.current?.close();
    }
    recordingCtxRef.current = null;
  }, []);

  /**
   * Phase 1 of mic setup — permission + stream acquisition. Called at the
   * very start of start(), inside the user's Begin tap, BEFORE the WebSocket
   * connects or any audio plays. This is the fix for the permission race:
   * previously getUserMedia ran inside onopen, so the socket connected, the
   * kickoff was sent, and the AI began SPEAKING while the browser's
   * permission dialog was still on screen — the user missed the opening
   * line and (on deny/slow grant) the capture side never came up cleanly.
   * Nothing else happens until this resolves. Throws on denial.
   */
  const acquireMic = useCallback(async (): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: SAMPLE_RATE_IN,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    mediaStreamRef.current = stream;
    return stream;
  }, []);

  /**
   * Phase 2 — wire the (already-granted) stream into a capture pipeline.
   * Runs inside onopen: attaching the processor before the socket is open
   * would race sends against a null session.
   */
  const startRecording = useCallback((sessionPromise: Promise<unknown>) => {
    try {
      const stream = mediaStreamRef.current;
      if (!stream || stream.getTracks().every((t) => t.readyState === 'ended')) {
        // stop() ran while the socket was connecting — nothing to wire.
        return;
      }

      const recordingCtx = new AudioContext({ sampleRate: SAMPLE_RATE_IN });
      recordingCtxRef.current = recordingCtx;

      const source = recordingCtx.createMediaStreamSource(stream);
      // ScriptProcessorNode — deprecated but universally supported without worker file setup
      const processor = recordingCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const buf = new Uint8Array(pcm16.buffer);
        let binary = '';
        for (let i = 0; i < buf.byteLength; i++) binary += String.fromCharCode(buf[i]);
        const base64Data = btoa(binary);

        // Send via Promise — no race with sessionRef being null
        // Don't send mic audio until AI delivers its opening — prevents double opener
        if (!openingDeliveredRef.current) return;
        // CRITICAL: don't send mic audio while AI is speaking — browser echo cancellation
        // doesn't apply to WebAudio playback, so AI audio leaks through speakers into the
        // mic. Sending it back to Gemini causes self-conversation, mid-sentence interrupts,
        // and false "user spoke" turn boundaries. Also honor a 250ms grace period after
        // AI playback ends so the trailing tail doesn't bleed through.
        if (statusRef.current === 'aiSpeaking') return;
        if (performance.now() < micUnmuteAtRef.current) return;
        (sessionPromise as Promise<{ sendRealtimeInput: (p: unknown) => void }>).then((session) => {
          try {
            session.sendRealtimeInput({
              audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' },
            });
          } catch { /* Socket closed */ }
        });
      };

      source.connect(processor);
      processor.connect(recordingCtx.destination);
    } catch (err) {
      console.error('[voiceSession] mic wiring error', err);
      setError('Microphone could not be started. Please check your microphone and try again.');
      setStatusSync('error');
    }
  }, [setError, setStatusSync]);

  const cleanup = useCallback(() => {
    if (naturalEndTimerRef.current) {
      clearTimeout(naturalEndTimerRef.current);
      naturalEndTimerRef.current = null;
    }
    if (playbackEndTimerRef.current) {
      clearTimeout(playbackEndTimerRef.current);
      playbackEndTimerRef.current = null;
    }
    clearCapTimers();
    pendingNaturalEndRef.current = false;
    endPrimedRef.current = false;
    stopRecording();
    if (playbackCtxRef.current?.state !== 'closed') {
      try { playbackCtxRef.current?.close(); } catch { /* already closed */ }
    }
    playbackCtxRef.current = null;
    if (sessionPromiseRef.current) {
      (sessionPromiseRef.current as Promise<{ close?: () => void }>).then((session) => {
        try { session.close?.(); } catch { /* already closed */ }
      });
      sessionPromiseRef.current = null;
    }
    nextPlayTimeRef.current = 0;
  }, [clearCapTimers, stopRecording]);

  const registerNaturalEndHandler = useCallback((handler: (() => void) | null) => {
    naturalEndHandlerRef.current = handler;
  }, []);

  const start = useCallback(async (scenario: Scenario, options: VoiceStartOptions = {}) => {
    // Re-entrancy guard BEFORE any await. The previous guard sat after an
    // async RAG fetch, so a double-tap on Begin (or a fast mode toggle)
    // could pass the check twice and open two live sockets. statusRef is
    // set synchronously here, so the second caller bails immediately.
    if (
      statusRef.current === 'connecting' ||
      statusRef.current === 'listening' ||
      statusRef.current === 'thinking' ||
      statusRef.current === 'aiSpeaking'
    ) {
      return;
    }
    setStatusSync('connecting');
    try {
      finalizePromiseRef.current = null;
      openingDeliveredRef.current = false;
      pendingNaturalEndRef.current = false;
      endPrimedRef.current = false;
      if (naturalEndTimerRef.current) {
        clearTimeout(naturalEndTimerRef.current);
        naturalEndTimerRef.current = null;
      }
      clearCapTimers();
      setCapWarning(false);
      // One id for this session: telemetry rows written by the scorer, the
      // local SessionRecord and the Supabase row all key off it.
      sessionIdRef.current = uuid();
      micUnmuteAtRef.current = 0;
      setError(null);
      emotionRef.current = 'red';
      setEmotion('red');
      setMessages([]);
      setLiveAiText('');
      transcriptRef.current = [];
      aiTextBufferRef.current = '';
      userTextBufferRef.current = '';
      nextPlayTimeRef.current = 0;
      scenarioRef.current = scenario;
      localeRef.current = options.locale ?? DEFAULT_LOCALE;
      openingLineRef.current = options.openingLine ?? scenario.openingLine ?? null;

      const apiKey =
        (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
        (process.env.GEMINI_API_KEY as string | undefined) ||
        '';
      if (!apiKey) throw new Error('Gemini API key is not configured. Add GEMINI_API_KEY to your environment.');

      // Playback context (24 kHz) — created before connecting so user-gesture
      // satisfies autoplay policy, separate from the 16 kHz capture context.
      const playbackCtx = new AudioContext({ sampleRate: SAMPLE_RATE_OUT });
      playbackCtxRef.current = playbackCtx;
      if (playbackCtx.state === 'suspended') {
        try { await playbackCtx.resume(); } catch { /* non-fatal */ }
      }

      // MIC PERMISSION FIRST. Nothing connects and nothing plays until the
      // user has granted the microphone — the permission dialog is the very
      // first thing they see after tapping Begin. A denial lands in the
      // catch below and the session never starts half-broken.
      try {
        await acquireMic();
      } catch (micErr) {
        console.error('[voiceSession] mic permission error', micErr);
        setError('Microphone access denied or unavailable. Please allow microphone access and try again.');
        setStatusSync('error');
        cleanup();
        return;
      }
      // stop() may have run while the permission dialog was up (user backed
      // out of the screen) — don't connect a socket nobody is listening to.
      // (Cast: TS narrows from the top guard and can't see the ref mutate
      // across the awaits above.)
      if ((statusRef.current as VoiceStatus) !== 'connecting') {
        stopRecording();
        return;
      }

      // RAG: fail-open retrieval before the prompt is built (mirrors text
      // mode). After the permission grant so the dialog isn't delayed by a
      // network round-trip.
      try {
        const ragCfg = resolveRag(configRef.current ?? undefined);
        retrievedRef.current = ragCfg.enabled
          ? await retrieveContext(
              `${scenario.pushback.title} ${scenario.suggestedDriver} owner ${scenario.breed} ${scenario.age}`,
              { k: ragCfg.k, cacheKey: scenario._overrideId ?? scenario.pushback.id + scenario.breed },
            )
          : [];
      } catch {
        retrievedRef.current = [];
      }

      const ai = new GoogleGenAI({ apiKey });

      // The cue itself stays English (it is an instruction to the model, not
      // dialogue); the LINE it quotes is whatever the caller localized.
      const openingLine = openingLineRef.current;
      const openingHint = openingLine
        ? `Begin the simulation now. Deliver this exact opening line as the ${scenario.persona} owner: "${openingLine}"`
        : 'Please begin the simulation now by delivering your opening statement.';

      const sessionPromise = (ai.live.connect as (opts: unknown) => Promise<unknown>)({
        model: MODEL_LIVE,
        config: {
          systemInstruction: buildVoiceSystemPrompt({
            scenario,
            config: configRef.current ?? undefined,
            retrieved: retrievedRef.current,
            locale: localeRef.current,
          }),
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'updateEmotion',
                  description: 'Update the resolution level orb. Call whenever your receptiveness shifts.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      emotion: {
                        type: Type.STRING,
                        description: "Current resolution state. Use 'red' for defensive/resistant, 'yellow' for listening/receptive, or 'green' for convinced/resolved.",
                      },
                    },
                    required: ['emotion'],
                  },
                },
                {
                  name: 'endSimulation',
                  description: 'End the simulation when it reaches a natural conclusion.',
                  parameters: {
                    type: Type.OBJECT,
                    properties: { reason: { type: Type.STRING } },
                    required: ['reason'],
                  },
                },
              ],
            },
          ],
          // Gemini Live preview models accept exactly ONE response modality.
          // AUDIO + outputAudioTranscription is the only configuration that works.
          // Requesting [AUDIO, TEXT] together closes the socket immediately.
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            // Same prebuilt voice across locales — it is the customer's
            // persona, not their accent, and swapping it per language would
            // make the same scenario feel like a different person.
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
            // BCP-47 for the app locale: en-US, or fr-CA for French.
            // NOTE: if fr-CA turns out to be unsupported or mis-accented by
            // the live model at runtime, fr-FR is the fallback to try — but
            // that is a deliberate config change, NOT runtime detection.
            // Silently probing locales here would make session startup
            // non-deterministic and hide the regression.
            languageCode: LOCALE_BCP47[localeRef.current],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatusSync('listening');
            // Permission was granted BEFORE connect; here we only wire the
            // already-live stream into the capture pipeline. Wiring after
            // onopen keeps processor sends from racing a null session.
            startRecording(sessionPromise);
            // Billing starts here — so does the duration cap.
            startCapTimers();
          },
          onmessage: (msg: Record<string, unknown>) => {
            // Tool calls
            const toolCall = msg.toolCall as
              | { functionCalls: Array<{ id: string; name: string; args: Record<string, unknown> | string }> }
              | undefined;

            if (toolCall?.functionCalls?.length) {
              for (const fc of toolCall.functionCalls) {
                let args: Record<string, unknown> = {};
                try {
                  args = typeof fc.args === 'string' ? JSON.parse(fc.args) : fc.args;
                } catch { args = {}; }

                if (fc.name === 'updateEmotion') {
                  const next = ((args.emotion as string)?.toLowerCase().trim() as EmotionColor) ?? 'red';
                  emotionRef.current = next;
                  setEmotion(next);
                  // Convinced → next AI turn IS the closing line; prime the
                  // end so we trigger the natural-end after this same turn's
                  // turnComplete fires. Require at least 4 prior AI turns
                  // (~ a 4-exchange conversation) so a polite trainee
                  // greeting can't shift the model green prematurely and
                  // cut the session off in the first minute. The voice
                  // prompt's own "never end before turn 10" rule is for
                  // the model; this fallback just catches its failures.
                  if (
                    next === 'green' &&
                    transcriptRef.current.filter((m) => m.role === 'ai').length >= 4
                  ) {
                    endPrimedRef.current = true;
                  }
                }
                // Note: don't commit accumulated AI text here for endSimulation —
                // the same message may carry the closing line in serverContent.modelTurn
                // (processed below). The natural turnComplete path commits the full text;
                // committing early would orphan any closing-line chunks in this message.

                (sessionPromise as Promise<{ sendToolResponse: (p: unknown) => void }>).then((session) => {
                  try {
                    session.sendToolResponse({
                      functionResponses: [{ id: fc.id, name: fc.name, response: { output: 'ok' } }],
                    });
                  } catch { /* socket closed */ }
                });

                if (fc.name === 'endSimulation') {
                  // Wait until closing TTS in the queue finishes. Tool calls run before
                  // serverContent in the same message, so we must NOT read playbackTail yet —
                  // schedule after this tick (queueMicrotask) and reschedule whenever new audio
                  // chunks extend the queue (pendingNaturalEndRef + playAudioChunk).
                  pendingNaturalEndRef.current = true;
                  queueMicrotask(() => scheduleNaturalEndAfterPlayback());
                }
              }
            }

            const serverContent = msg.serverContent as
              | {
                  modelTurn?: { parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> };
                  turnComplete?: boolean;
                  interrupted?: boolean;
                  inputTranscription?: { text?: string; finished?: boolean };
                  outputTranscription?: { text?: string };
                }
              | undefined;

            // User speech transcription — buffered, committed on sentence end.
            //
            // Drop inputTranscription while the AI is speaking: those events
            // are almost always echo from the AI's own audio bleeding back
            // through the mic. Capturing them as user turns confused the
            // model (perceived barge-in), polluted the transcript with the
            // AI's own words attributed to "user", and produced visible
            // stalls. Real user barge-in is signalled by the model via
            // `interrupted: true`, after which we transition out of
            // aiSpeaking and resume buffering normally. A user turn that
            // ended just before AI started is still captured by the
            // pending-buffer commit at the top of playAudioChunk.
            if (serverContent?.inputTranscription && statusRef.current !== 'aiSpeaking') {
              const { text, finished } = serverContent.inputTranscription;
              if (text) {
                userTextBufferRef.current += text;
                if (statusRef.current === 'listening') setStatusSync('thinking');
              }
              if (finished && userTextBufferRef.current.trim()) {
                addUserMessage(userTextBufferRef.current.trim());
                userTextBufferRef.current = '';
              }
            }

            // AI transcription — single source. Accumulated, displayed at turnComplete.
            if (serverContent?.outputTranscription?.text) {
              aiTextBufferRef.current += serverContent.outputTranscription.text;
            }
            // If the model ever emits inline text (rare with AUDIO modality), append it.
            const parts = serverContent?.modelTurn?.parts ?? [];
            const inlineText = parts.map((p) => p.text).filter(Boolean).join('');
            if (inlineText) {
              aiTextBufferRef.current += inlineText;
            }

            // Audio playback
            const base64Audio = (parts[0] as { inlineData?: { data: string } } | undefined)?.inlineData?.data;
            if (base64Audio) playAudioChunk(base64Audio);

            // Barge-in — reset playback pointer
            if (serverContent?.interrupted) {
              nextPlayTimeRef.current = playbackCtxRef.current?.currentTime ?? 0;
              // Disarm the playback-end watchdog. It was scheduled for the end
              // of the (now abandoned) audio queue; letting it fire would call
              // finishSpeaking() and re-arm the 250ms mic grace in the middle
              // of the user's barge-in, swallowing the start of what they say.
              if (playbackEndTimerRef.current) {
                clearTimeout(playbackEndTimerRef.current);
                playbackEndTimerRef.current = null;
              }
              if (statusRef.current === 'aiSpeaking') setStatusSync('listening');
              // Don't apply mic grace on user-initiated barge-in — they're actively
              // speaking, we want their input flowing immediately.
              micUnmuteAtRef.current = 0;
              // Drop partial STT from the aborted turn so it can't merge into the next reply.
              aiTextBufferRef.current = '';
            }

            // Turn complete — commit accumulated AI text; unlock mic after first turn.
            //
            // Special-case the OPENING turn: if transcription still mismatches the scripted
            // opening, pin scenario.openingLine verbatim. (Leading words were also lost client-side
            // when the first audio chunk cleared the STT buffer — fixed by not resetting the buffer
            // in playAudioChunk.)
            if (serverContent?.turnComplete) {
              const isOpeningTurn =
                !openingDeliveredRef.current &&
                !!openingLineRef.current &&
                transcriptRef.current.filter((m) => m.role === 'ai').length === 0;
              if (isOpeningTurn && openingLineRef.current) {
                aiTextBufferRef.current = openingLineRef.current;
              }
              const finalText = sanitizeAiText(aiTextBufferRef.current);
              addAiMessage();
              if (finalText) setLiveAiText(finalText);
              openingDeliveredRef.current = true;
              if (statusRef.current === 'thinking') setStatusSync('listening');

              // Convinced + closing line just landed — trigger the natural
              // end ourselves so the session finalizes regardless of
              // whether the model called endSimulation. Skip if the turn
              // was interrupted (user barge-in) — the AI didn't actually
              // finish its closing, so let the conversation continue.
              if (
                endPrimedRef.current &&
                !pendingNaturalEndRef.current &&
                !serverContent?.interrupted
              ) {
                endPrimedRef.current = false;
                pendingNaturalEndRef.current = true;
                queueMicrotask(() => scheduleNaturalEndAfterPlayback());
              }
            }
          },
          onerror: (e: unknown) => {
            const errAny = e as { message?: string; reason?: string; code?: number };
            console.error('[voiceSession] error', {
              message: errAny?.message,
              reason: errAny?.reason,
              code: errAny?.code,
              raw: e,
            });
            setError('Voice connection error. Check your microphone and network, then try again.');
            setStatusSync('error');
            cleanup();
          },
          onclose: (e: unknown) => {
            const evt = e as { code?: number; reason?: string };
            console.warn('[voiceSession] socket closed', { code: evt?.code, reason: evt?.reason });
            // A close during an ACTIVE conversation is a failure the user
            // must see — silently flipping to 'idle' left the orb frozen
            // with no explanation of why the customer stopped responding.
            const active =
              statusRef.current === 'listening' ||
              statusRef.current === 'thinking' ||
              statusRef.current === 'aiSpeaking' ||
              statusRef.current === 'connecting';
            if (active) {
              setError('Voice connection lost. Check your network and tap Begin simulation to restart.');
              setStatusSync('error');
              cleanup();
            } else if (statusRef.current !== 'ended' && statusRef.current !== 'error') {
              setStatusSync('idle');
            }
          },
        },
      });

      sessionPromiseRef.current = sessionPromise;

      // Kickoff sent after session resolves — tells the model to open with its
      // pushback line so the user doesn't have to speak first.
      (sessionPromise as Promise<{ sendRealtimeInput: (p: unknown) => void }>).then((session) => {
        try {
          session.sendRealtimeInput({ text: openingHint });
        } catch { /* session closed during startup */ }
      });

      // Note: we deliberately do NOT pre-seed liveAiText with scenario.openingLine.
      // The transcript should be blank while the AI is speaking (including the opening
      // turn) and only appear when the turn completes. This matches the behavior for
      // every subsequent turn — uniform, no special cases.

    } catch (err) {
      const errAny = err as { message?: string; name?: string; stack?: string };
      console.error('[voiceSession] start failed', {
        name: errAny?.name,
        message: errAny?.message,
        stack: errAny?.stack,
        raw: err,
      });
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.toLowerCase().includes('api key') ? msg : `Voice could not start: ${msg || 'unknown error'}`);
      setStatusSync('error');
      cleanup();
    }
  }, [
    acquireMic,
    addAiMessage,
    addUserMessage,
    cleanup,
    clearCapTimers,
    playAudioChunk,
    scheduleNaturalEndAfterPlayback,
    setStatusSync,
    startCapTimers,
    startRecording,
    stopRecording,
  ]);

  const stop = useCallback(() => {
    finalizePromiseRef.current = null;
    cleanup();
    clearCapTimers();
    setCapWarning(false);
    sessionIdRef.current = null;
    setError(null);
    emotionRef.current = 'red';
    setEmotion('red');
    setMessages([]);
    setLiveAiText('');
    transcriptRef.current = [];
    aiTextBufferRef.current = '';
    userTextBufferRef.current = '';
    scenarioRef.current = null;
    openingLineRef.current = null;
    setStatusSync('idle');
  }, [cleanup, clearCapTimers, setStatusSync]);

  const endSession = useCallback(async (): Promise<VoiceSessionResult> => {
    if (finalizePromiseRef.current) return finalizePromiseRef.current;

    // Flush any in-flight AI text that hasn't been committed yet (e.g. user hit END
    // before a turnComplete fired). Otherwise the last AI line is lost from the transcript.
    if (aiTextBufferRef.current.trim()) {
      addAiMessage();
    }
    if (userTextBufferRef.current.trim()) {
      addUserMessage(userTextBufferRef.current.trim());
      userTextBufferRef.current = '';
    }

    const transcriptSnapshot = [...transcriptRef.current];
    const scenario = scenarioRef.current;
    // Snapshot the id BEFORE cleanup so telemetry and the saved record agree
    // even if stop() lands while scoring is in flight.
    const sessionId = sessionIdRef.current;

    finalizePromiseRef.current = (async (): Promise<VoiceSessionResult> => {
      cleanup();
      setStatusSync('ended');

      let report: ScoreReport | null = null;
      if (transcriptSnapshot.length && scenario) {
        try {
          report = await evaluateConversation(scenario, transcriptSnapshot, {
            sessionId,
            config: configRef.current ?? undefined,
            locale: localeRef.current,
          });
        } catch {
          report = null;
        }
      }

      return { report, transcript: transcriptSnapshot, sessionId };
    })();

    try {
      return await finalizePromiseRef.current;
    } finally {
      finalizePromiseRef.current = null;
    }
  }, [addAiMessage, addUserMessage, cleanup, setStatusSync]);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    status,
    emotion,
    messages,
    liveAiText,
    capWarning,
    start,
    stop,
    endSession,
    registerNaturalEndHandler,
    error,
  };
}
