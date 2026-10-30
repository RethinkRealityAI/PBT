import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import type { Scenario } from '../data/scenarios';
import type { ChatMessage, ScoreReport } from './types';
import type { PromptOverrides } from '../data/knowledge/promptBuilders';
import { evaluateConversation } from './geminiService';
import { postAi } from './aiApi';
import {
  AI_ENDPOINTS,
  AI_LIMITS,
  type VoiceTokenRequest,
  type VoiceTokenResponse,
} from '../shared/ai/contract';
import { uuid } from '../lib/id';
import { getOrCreateSessionId } from '../lib/storage';
import { logEvent } from '../lib/analytics';
import { DEFAULT_LOCALE, LOCALE_BCP47, type Locale } from '../i18n/locales';
import { translate } from '../i18n/translate';
import { VOICE_SESSION_CAPS } from '../shared/ai/voiceCaps';

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
  /**
   * False when the transcript holds no trainee speech at all (mic muted or
   * blocked, a noisy room, the trainee never spoke). Nothing was scored —
   * a 0/100 for silence would be a fake score — so the caller tells the
   * trainee we couldn't hear them instead of showing a scorecard.
   */
  heardTrainee: boolean;
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
  /**
   * Per-scenario AI prompt wraps from the scenario's `scenario_overrides` row
   * (`prompt_prefix` / `prompt_suffix`).
   *
   * Text mode has always passed these (`useTextChat` → `promptOverrides`);
   * voice did not, so an admin who tuned a scenario's customer instructions
   * saw them apply in chat and vanish the moment the trainee switched to
   * voice. The caller resolves them (it owns the FlagProvider lookup keyed by
   * `scenario._overrideId`) and hands them over here.
   */
  overrides?: PromptOverrides;
  /**
   * The trainee's ECHO driver. Sent with the token request so the server
   * resolves the *Voice mode in chat* switch with the same targeting rules
   * the app's flag snapshot used.
   */
  driver?: string | null;
}

export interface UseVoiceSessionReturn {
  status: VoiceStatus;
  emotion: EmotionColor;
  messages: ChatMessage[];
  /** Live, partial AI text for the in-flight turn (cleared when next AI turn begins). */
  liveAiText: string;
  /**
   * True from a minute before the current deadline (4:00 for the first one)
   * until the deadline is extended or the session stops/restarts — the UI
   * shows the countdown and announces that time is nearly up.
   */
  capWarning: boolean;
  /**
   * Epoch ms at which the current time's-up prompt is due (null when no
   * session is live). Drives the on-screen countdown.
   */
  capDeadline: number | null;
  /**
   * The time limit was reached: the mic is paused and the session is waiting
   * for the trainee to score it, keep going, or start over. Nothing is lost
   * and nothing has been scored yet.
   */
  timeUp: boolean;
  /** Epoch ms at which an unanswered time's-up prompt scores the session. */
  timeUpAutoEndAt: number | null;
  /** "Keep going" extensions still available for this session. */
  extensionsLeft: number;
  /**
   * Answer the time's-up prompt with "keep going": resumes the mic and moves
   * the deadline by `VOICE_SESSION_CAPS.extensionMs`. No-op unless `timeUp`
   * and an extension is left.
   */
  extendSession: () => boolean;
  /**
   * Record how the trainee answered the time's-up prompt when the answer is
   * acted on by the caller (score now / start over). "Keep going" and the
   * auto-score are recorded by the hook itself.
   */
  noteTimeUpChoice: (choice: 'score' | 'restart') => void;
  /** Id of the live (or last) session — the record id it is checkpointed and saved under. */
  sessionId: string | null;
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
 * Wall-clock caps on a live voice session — see `src/shared/ai/voiceCaps.ts`
 * for the limits and why the cap PROMPTS (score / keep going / start over)
 * instead of ending the session. Re-exported so existing imports keep working.
 */
export { VOICE_SESSION_CAPS };

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
  const [capDeadline, setCapDeadline] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [timeUpAutoEndAt, setTimeUpAutoEndAt] = useState<number | null>(null);
  const [extensionsLeft, setExtensionsLeft] = useState<number>(VOICE_SESSION_CAPS.maxExtensions);
  const [sessionIdState, setSessionIdState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  /** Waits for the customer's in-flight line to finish before the prompt shows. */
  const timeUpDrainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Scores the session if the time's-up prompt goes unanswered. */
  const timeUpDecisionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirrors `timeUp` for socket/timer callbacks. */
  const timeUpRef = useRef(false);
  /** "Keep going" extensions taken this session. */
  const extensionsUsedRef = useRef(0);
  /**
   * Mic audio is not sent while true — set the moment the time limit is
   * reached so the conversation doesn't carry on underneath the prompt.
   */
  const inputPausedRef = useRef(false);
  /**
   * The session reached its time limit and was not extended afterwards — the
   * scorer is told (`endedEarly: 'time_limit'`) so a cut-off close isn't read
   * as a failed one. Cleared by "keep going" and by start/stop.
   */
  const endedByTimeLimitRef = useRef(false);
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
    for (const ref of [capWarnTimerRef, capEndTimerRef, timeUpDrainTimerRef, timeUpDecisionTimerRef]) {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    }
    timeUpRef.current = false;
    inputPausedRef.current = false;
    setTimeUp(false);
    setTimeUpAutoEndAt(null);
    setCapDeadline(null);
  }, []);

  /** True while the conversation is live (not connecting, ended or failed). */
  const isLive = useCallback(
    () =>
      statusRef.current === 'listening' ||
      statusRef.current === 'thinking' ||
      statusRef.current === 'aiSpeaking',
    [],
  );

  /**
   * Show the time's-up prompt once the customer's in-flight line has played
   * out (so they aren't cut off mid-sentence), then start the decision
   * window: an unanswered prompt ends + scores the session through the same
   * natural-end path `endSimulation` uses — the work is kept, never dropped.
   */
  const openTimeUpPrompt = useCallback(
    (drainStartedAt: number) => {
      timeUpDrainTimerRef.current = null;
      if (pendingNaturalEndRef.current || !isLive()) return;
      const ctx = playbackCtxRef.current;
      const tailMs =
        ctx && ctx.state !== 'closed'
          ? Math.max(0, (nextPlayTimeRef.current - ctx.currentTime) * 1000)
          : 0;
      const waited = Date.now() - drainStartedAt;
      if (tailMs > 50 && waited < VOICE_SESSION_CAPS.maxDrainMs) {
        timeUpDrainTimerRef.current = setTimeout(
          () => openTimeUpPrompt(drainStartedAt),
          Math.min(Math.ceil(tailMs) + 250, VOICE_SESSION_CAPS.maxDrainMs - waited),
        );
        return;
      }
      timeUpRef.current = true;
      setTimeUp(true);
      setTimeUpAutoEndAt(Date.now() + VOICE_SESSION_CAPS.decisionMs);
      timeUpDecisionTimerRef.current = setTimeout(() => {
        timeUpDecisionTimerRef.current = null;
        if (!timeUpRef.current || pendingNaturalEndRef.current) return;
        pendingNaturalEndRef.current = true;
        logEvent({
          type: 'custom',
          screen: 'chat',
          target: 'voice_time_up',
          meta: {
            sessionId: sessionIdRef.current,
            choice: 'auto_score',
            extensionsUsed: extensionsUsedRef.current,
          },
        });
        naturalEndHandlerRef.current?.();
      }, VOICE_SESSION_CAPS.decisionMs);
    },
    [isLive],
  );

  /**
   * The deadline passed. If the trainee is mid-sentence ('thinking' = their
   * speech is being transcribed), give them up to `finishSentenceMs` to
   * finish before the mic pauses — cutting someone off mid-answer at the
   * moment that matters most was half the complaint. Then stop listening (so
   * the conversation doesn't carry on under the prompt), let the customer's
   * in-flight line play out, and ask. Deliberately NOT a socket kill and NOT
   * an automatic end — the trainee decides.
   */
  const pauseAtTimeUp = useCallback(
    (deadlineAt: number) => {
      capEndTimerRef.current = null;
      if (pendingNaturalEndRef.current || !isLive()) return;
      const speaking = statusRef.current === 'thinking' && userTextBufferRef.current.trim().length > 0;
      if (speaking && Date.now() - deadlineAt < VOICE_SESSION_CAPS.finishSentenceMs) {
        capEndTimerRef.current = setTimeout(() => pauseAtTimeUp(deadlineAt), 500);
        return;
      }
      inputPausedRef.current = true;
      endedByTimeLimitRef.current = true;
      openTimeUpPrompt(Date.now());
    },
    [isLive, openTimeUpPrompt],
  );

  /**
   * Arm the duration cap for the next `durationMs`. Called from `onopen` so
   * the clock starts when the socket (and therefore the billing) actually
   * starts, not at the Begin tap — and again by `extendSession`.
   */
  const startCapTimers = useCallback((durationMs: number) => {
    clearCapTimers();
    setCapWarning(false);
    setCapDeadline(Date.now() + durationMs);
    capWarnTimerRef.current = setTimeout(() => {
      capWarnTimerRef.current = null;
      setCapWarning(true);
    }, Math.max(0, durationMs - VOICE_SESSION_CAPS.warnLeadMs));
    capEndTimerRef.current = setTimeout(() => {
      capEndTimerRef.current = null;
      // Already wrapping up (endSimulation / green-primed close, or the user
      // hit End) — let that path finish rather than double-triggering.
      if (pendingNaturalEndRef.current || !isLive()) return;
      pauseAtTimeUp(Date.now());
    }, durationMs);
  }, [clearCapTimers, isLive, pauseAtTimeUp]);

  const logTimeUpChoice = useCallback(
    (choice: 'score' | 'restart' | 'extend' | 'auto_score') => {
      logEvent({
        type: 'custom',
        screen: 'chat',
        target: 'voice_time_up',
        meta: {
          sessionId: sessionIdRef.current,
          choice,
          extensionsUsed: extensionsUsedRef.current,
        },
      });
    },
    [],
  );

  const noteTimeUpChoice = useCallback(
    (choice: 'score' | 'restart') => {
      if (timeUpRef.current) logTimeUpChoice(choice);
    },
    [logTimeUpChoice],
  );

  const extendSession = useCallback((): boolean => {
    if (!timeUpRef.current || pendingNaturalEndRef.current || !isLive()) return false;
    if (extensionsUsedRef.current >= VOICE_SESSION_CAPS.maxExtensions) return false;
    extensionsUsedRef.current += 1;
    endedByTimeLimitRef.current = false;
    setExtensionsLeft(VOICE_SESSION_CAPS.maxExtensions - extensionsUsedRef.current);
    logTimeUpChoice('extend');
    // Re-arming clears the prompt + decision timer and un-pauses the mic.
    startCapTimers(VOICE_SESSION_CAPS.extensionMs);
    // Short grace so the tap / prompt sound isn't sent as the trainee's turn.
    micUnmuteAtRef.current = performance.now() + 250;
    return true;
  }, [isLive, logTimeUpChoice, startCapTimers]);

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

  /**
   * Commit the trainee's buffered speech as one turn (capped at the server's
   * per-turn limit — never dropped for being long, which the old 200-char
   * ceiling did to every substantive answer).
   */
  const commitUserBuffer = useCallback(() => {
    const pending = userTextBufferRef.current.trim();
    userTextBufferRef.current = '';
    if (pending) addUserMessage(pending.slice(0, AI_LIMITS.maxTurnChars));
  }, [addUserMessage]);

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
      commitUserBuffer();
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
  }, [commitUserBuffer, scheduleNaturalEndAfterPlayback, setStatusSync]);

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
        // Time limit reached — nothing is sent while the trainee decides.
        if (inputPausedRef.current) return;
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
      setError(translate(localeRef.current, 'chat.voice.error.micStart'));
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
      extensionsUsedRef.current = 0;
      setExtensionsLeft(VOICE_SESSION_CAPS.maxExtensions);
      // One id for this session: telemetry rows written by the scorer, the
      // local SessionRecord and the Supabase row all key off it.
      const sessionId = uuid();
      sessionIdRef.current = sessionId;
      setSessionIdState(sessionId);
      endedByTimeLimitRef.current = false;
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
        setError(translate(localeRef.current, 'chat.voice.error.micDenied'));
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

      // EPHEMERAL TOKEN. The long-lived Gemini key never reaches the browser:
      // `ai-voice-token` mints a single-use Live token with the model, the
      // system prompt (built server-side from the scenario, the admin
      // simulation config, RAG grounding and the per-scenario overrides) and
      // the tools LOCKED in, so nothing below can alter them. Requested after
      // the permission grant so the dialog isn't delayed by a network
      // round-trip — same slot the client-side RAG fetch used to occupy.
      let voiceToken: VoiceTokenResponse;
      try {
        const tokenRequest: VoiceTokenRequest = {
          scenario,
          openingLine: openingLineRef.current,
          locale: localeRef.current,
          sessionId: sessionIdRef.current,
          // Per-scenario prompt wraps — same source text mode uses. Honoured
          // by the server only in admin preview; otherwise loaded there.
          promptOverrides: options.overrides,
          // Same audience the flag snapshot was resolved for.
          audience: { anonSessionId: getOrCreateSessionId(), driver: options.driver ?? null },
        };
        voiceToken = await postAi<VoiceTokenResponse>(AI_ENDPOINTS.voiceToken, tokenRequest);
      } catch (tokenErr) {
        console.error('[voiceSession] voice token error', tokenErr);
        // An admin switched voice off after this screen loaded: say so plainly
        // instead of blaming the connection.
        // (`AiApiError.code` — read structurally so any error carrying it counts.)
        const disabled = (tokenErr as { code?: unknown } | null)?.code === 'disabled';
        setError(
          translate(localeRef.current, disabled ? 'chat.voice.error.disabled' : 'chat.voice.error.connection'),
        );
        setStatusSync('error');
        cleanup();
        return;
      }
      // stop() may also have run during the token round-trip.
      if ((statusRef.current as VoiceStatus) !== 'connecting') {
        stopRecording();
        return;
      }

      // Ephemeral tokens are only accepted on the v1alpha surface.
      const ai = new GoogleGenAI({
        apiKey: voiceToken.token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

      // The cue itself stays English (it is an instruction to the model, not
      // dialogue); the LINE it quotes is whatever the caller localized.
      const openingLine = openingLineRef.current;
      const openingHint = openingLine
        ? `Begin the simulation now. Deliver this exact opening line as the ${scenario.persona} owner: "${openingLine}"`
        : 'Please begin the simulation now by delivering your opening statement.';

      // No `systemInstruction` here — it is locked into the token server-side.
      // Everything else stays exactly as before so behaviour is identical if
      // the server leaves a field unlocked.
      const sessionPromise = (ai.live.connect as (opts: unknown) => Promise<unknown>)({
        model: voiceToken.model,
        config: {
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
            startCapTimers(VOICE_SESSION_CAPS.hardCapMs);
            // …and the session counts as started: mic granted, token minted,
            // socket open. Voice never calls useTextChat.open(), so this is
            // voice's one `session_open` (same meta shape as text's). Last in
            // the handler and synchronous/fire-and-forget — it adds no await
            // and cannot delay the capture wiring above. logEvent applies the
            // privacy opt-out and the admin preview gate.
            logEvent({
              type: 'custom',
              screen: 'chat',
              target: 'session_open',
              meta: {
                sessionId,
                scenario: scenario.pushback.id,
                driver: scenario.suggestedDriver,
                mode: 'voice',
              },
            });
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
            // Kept WHATEVER the AI is doing. The mic sends no audio while the
            // AI speaks (the capture gate in startRecording), so a
            // transcription that arrives during `aiSpeaking` is the late tail
            // of what the trainee said BEFORE the reply — Gemini routinely
            // delivers it after the reply's first audio. Dropping it (the old
            // behaviour, meant to filter echo the gate already prevents) lost
            // whole trainee turns: workshop voice sessions were saved with
            // the customer's lines only, and the scorer graded a conversation
            // it could not see. Pending text is committed BEFORE the AI line
            // it preceded (first reply audio, or at turnComplete at the latest).
            if (serverContent?.inputTranscription) {
              const { text, finished } = serverContent.inputTranscription;
              if (text) {
                userTextBufferRef.current += text;
                if (statusRef.current === 'listening') setStatusSync('thinking');
              }
              if (finished) commitUserBuffer();
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
              // Trainee words that arrived after the reply started belong
              // BEFORE it in the transcript.
              commitUserBuffer();
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
            setError(translate(localeRef.current, 'chat.voice.error.connection'));
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
              setError(translate(localeRef.current, 'chat.voice.error.lost'));
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
      setError(
        translate(localeRef.current, 'chat.voice.error.startFailed', {
          reason: msg || translate(localeRef.current, 'chat.voice.error.unknown'),
        }),
      );
      setStatusSync('error');
      cleanup();
    }
  }, [
    acquireMic,
    addAiMessage,
    cleanup,
    clearCapTimers,
    commitUserBuffer,
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
    extensionsUsedRef.current = 0;
    setExtensionsLeft(VOICE_SESSION_CAPS.maxExtensions);
    endedByTimeLimitRef.current = false;
    sessionIdRef.current = null;
    setSessionIdState(null);
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
    // Trainee words still buffered were said before any in-flight AI line.
    commitUserBuffer();
    if (aiTextBufferRef.current.trim()) {
      addAiMessage();
    }

    const transcriptSnapshot = [...transcriptRef.current];
    const scenario = scenarioRef.current;
    // Snapshot the id BEFORE cleanup so telemetry and the saved record agree
    // even if stop() lands while scoring is in flight.
    const sessionId = sessionIdRef.current;

    const endedByTimeLimit = endedByTimeLimitRef.current;
    const heardTrainee = transcriptSnapshot.some((m) => m.role === 'user' && m.text.trim().length > 0);

    finalizePromiseRef.current = (async (): Promise<VoiceSessionResult> => {
      cleanup();
      setStatusSync('ended');

      let report: ScoreReport | null = null;
      // No trainee speech → nothing to grade. Never ask the scorer: it would
      // invent a score for a conversation it cannot see.
      if (heardTrainee && scenario) {
        try {
          report = await evaluateConversation(scenario, transcriptSnapshot, {
            sessionId,
            locale: localeRef.current,
            mode: 'voice',
            ...(endedByTimeLimit ? { endedEarly: 'time_limit' as const } : {}),
          });
        } catch {
          report = null;
        }
      }

      return { report, transcript: transcriptSnapshot, sessionId, heardTrainee };
    })();

    try {
      return await finalizePromiseRef.current;
    } finally {
      finalizePromiseRef.current = null;
    }
  }, [addAiMessage, cleanup, commitUserBuffer, setStatusSync]);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    status,
    emotion,
    messages,
    liveAiText,
    capWarning,
    capDeadline,
    timeUp,
    timeUpAutoEndAt,
    extensionsLeft,
    extendSession,
    noteTimeUpChoice,
    sessionId: sessionIdState,
    start,
    stop,
    endSession,
    registerNaturalEndHandler,
    error,
  };
}
