import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import type { Scenario } from '../data/scenarios';
import type { ChatMessage, ScoreReport } from './types';
import { buildVoiceSystemPrompt } from '../data/knowledge/promptBuilders';
import { evaluateConversation, MODEL_LIVE } from './geminiService';

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
}

export interface UseVoiceSessionReturn {
  status: VoiceStatus;
  emotion: EmotionColor;
  messages: ChatMessage[];
  /** Live, partial AI text for the in-flight turn (cleared when next AI turn begins). */
  liveAiText: string;
  start: (scenario: Scenario) => Promise<void>;
  stop: () => void;
  endSession: () => Promise<VoiceSessionResult>;
  /** Fires once after the model calls endSimulation. */
  registerNaturalEndHandler: (handler: (() => void) | null) => void;
  error: string | null;
}

const SAMPLE_RATE_OUT = 24000;
const SAMPLE_RATE_IN = 16000;

// Strip any control-token / function-call narration that leaks into the AI's
// transcribed audio. Keeps both the on-screen `liveAiText` and the saved
// transcript clean — important for future RAG training where stray
// "endSimulation" / "[END_SIMULATION]" text would poison samples.
function sanitizeAiText(raw: string): string {
  return raw
    // Drop entire sentences that mention calling the tool / function names.
    .replace(/[^.?!]*\b(?:calling|invoke|invoking|i(?:'|')ll\s+call)\b[^.?!]*(?:end[_\s-]*simulation|update[_\s-]*emotion)[^.?!]*[.?!]?/gi, '')
    .replace(/[^.?!]*\b(?:end[_\s-]*simulation|update[_\s-]*emotion)\b[^.?!]*[.?!]?/gi, '')
    // Strip stray bracket tokens / function-call literals.
    .replace(/\[\s*end[_\s-]*simulation\s*\]/gi, '')
    .replace(/\[\s*update[_\s-]*emotion\s*\]/gi, '')
    .replace(/update[_\s-]*emotion\s*\([^)]*\)/gi, '')
    .replace(/end[_\s-]*simulation\s*\([^)]*\)/gi, '')
    // Tidy whitespace, dangling punctuation, double dots.
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\.{2,}/g, '.')
    .trim();
}

export function useVoiceSession(): UseVoiceSessionReturn {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [emotion, setEmotion] = useState<EmotionColor>('red');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveAiText, setLiveAiText] = useState('');
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
  const aiTextBufferRef = useRef('');
  const userTextBufferRef = useRef('');
  const scenarioRef = useRef<Scenario | null>(null);
  const statusRef = useRef<VoiceStatus>('idle');
  const finalizePromiseRef = useRef<Promise<VoiceSessionResult> | null>(null);
  const naturalEndHandlerRef = useRef<(() => void) | null>(null);
  // Gates mic audio until the AI delivers its first complete turn (prevents double opening)
  const openingDeliveredRef = useRef(false);
  // Timestamp until which mic audio should be suppressed (post-AI-speech grace period).
  // Prevents echo of AI audio leaking through speakers from being sent back as "user speech".
  const micUnmuteAtRef = useRef(0);

  const setStatusSync = useCallback((s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const addAiMessage = useCallback(() => {
    const text = sanitizeAiText(aiTextBufferRef.current);
    if (!text) return;
    const msg: ChatMessage = { role: 'ai', text, timestamp: Date.now() };
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

    if (statusRef.current !== 'aiSpeaking') {
      setStatusSync('aiSpeaking');
      // Discard user-transcription buffer (likely echo of our own audio leaking back).
      userTextBufferRef.current = '';
      // Reset the AI text buffer so the NEW turn's text doesn't append to the previous
      // turn's text. Critically, we do NOT clear `liveAiText` here — if transcription
      // arrives in one chunk at turnComplete (preview-model behavior), keeping the old
      // line visible during audio playback is much better UX than going blank. The new
      // chunks will REPLACE liveAiText the instant they arrive.
      aiTextBufferRef.current = '';
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

    source.onended = () => {
      if (ctx.state !== 'closed' && ctx.currentTime >= nextPlayTimeRef.current - 0.1) {
        if (statusRef.current === 'aiSpeaking') setStatusSync('listening');
        // 250ms grace before mic re-opens — lets AI audio tail decay so it doesn't
        // get captured and sent back as a phantom user turn.
        micUnmuteAtRef.current = performance.now() + 250;
      }
    };
  }, [setStatusSync]);

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

  // Mic setup happens INSIDE onopen — the critical fix from the reference.
  // Starting mic before the WebSocket opens causes a race that closes the socket.
  const startRecording = useCallback(async (sessionPromise: Promise<unknown>) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE_IN,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

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
      console.error('[voiceSession] mic error', err);
      setError('Microphone access denied or unavailable. Please allow microphone access and try again.');
      setStatusSync('error');
    }
  }, [setError, setStatusSync]);

  const cleanup = useCallback(() => {
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
  }, [stopRecording]);

  const registerNaturalEndHandler = useCallback((handler: (() => void) | null) => {
    naturalEndHandlerRef.current = handler;
  }, []);

  const start = useCallback(async (scenario: Scenario) => {
    if (statusRef.current === 'connecting') return;
    try {
      finalizePromiseRef.current = null;
      openingDeliveredRef.current = false;
      micUnmuteAtRef.current = 0;
      setStatusSync('connecting');
      setError(null);
      setEmotion('red');
      setMessages([]);
      setLiveAiText('');
      transcriptRef.current = [];
      aiTextBufferRef.current = '';
      userTextBufferRef.current = '';
      nextPlayTimeRef.current = 0;
      scenarioRef.current = scenario;

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

      const ai = new GoogleGenAI({ apiKey });

      const openingHint = scenario.openingLine
        ? `Begin the simulation now. Deliver this exact opening line as the ${scenario.persona} owner: "${scenario.openingLine}"`
        : 'Please begin the simulation now by delivering your opening statement.';

      const sessionPromise = (ai.live.connect as (opts: unknown) => Promise<unknown>)({
        model: MODEL_LIVE,
        config: {
          systemInstruction: buildVoiceSystemPrompt(scenario),
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
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
            languageCode: 'en-US',
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatusSync('listening');
            // Mic is wired AFTER the WebSocket opens — prevents the socket from
            // closing while waiting for getUserMedia permissions.
            void startRecording(sessionPromise);
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
                  setEmotion(((args.emotion as string)?.toLowerCase().trim() as EmotionColor) ?? 'red');
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
                  // Defer natural-end until any in-flight closing line finishes playing.
                  // The model is instructed to speak the closing line in the same turn
                  // as the function call; tearing down immediately would cut it off.
                  const ctx = playbackCtxRef.current;
                  const playbackTail = ctx
                    ? Math.max(0, nextPlayTimeRef.current - ctx.currentTime)
                    : 0;
                  const delayMs = Math.min(8000, Math.ceil(playbackTail * 1000) + 400);
                  setTimeout(() => naturalEndHandlerRef.current?.(), delayMs);
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
            // Ignore inputTranscription while AI is speaking — that's almost always echo
            // of our own audio leaking through the mic, not real user speech.
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

            // AI speech transcription — outputTranscription path (when enabled).
            // Buffer for the saved transcript only. We deliberately do NOT push partial
            // chunks to liveAiText: chunks often arrive late and partial (e.g. only the
            // tail "...so expensive?" instead of "Why is the food so expensive?"), which
            // would replace the pre-seeded opening with a truncated fragment. liveAiText
            // is updated authoritatively at turnComplete (full final text) and from the
            // pre-seed at session start.
            if (serverContent?.outputTranscription?.text) {
              aiTextBufferRef.current += serverContent.outputTranscription.text;
            }

            // AI text fallback — modelTurn.parts[].text (matches working reference)
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
              if (statusRef.current === 'aiSpeaking') setStatusSync('listening');
              // Don't apply mic grace on user-initiated barge-in — they're actively
              // speaking, we want their input flowing immediately.
              micUnmuteAtRef.current = 0;
            }

            // Turn complete — commit accumulated AI text; unlock mic after first turn.
            // Pin liveAiText to the FINAL sanitized text (single authoritative update for
            // the turn — no mid-turn replacements from partial chunks).
            if (serverContent?.turnComplete) {
              const finalText = sanitizeAiText(aiTextBufferRef.current);
              addAiMessage();
              if (finalText) setLiveAiText(finalText);
              openingDeliveredRef.current = true;
              if (statusRef.current === 'thinking') setStatusSync('listening');
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
            if (statusRef.current !== 'ended' && statusRef.current !== 'error') {
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

      // Pre-seed liveAiText with the scripted opening line so it appears on screen
      // as soon as audio starts playing — preview Live models often delay
      // outputTranscription until turnComplete, which would otherwise leave the
      // first turn blank. Real transcription chunks (or the final pin at
      // turnComplete) will replace this seed when they arrive.
      if (scenario.openingLine) {
        setLiveAiText(scenario.openingLine);
      }

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
  }, [addAiMessage, addUserMessage, cleanup, playAudioChunk, setStatusSync, startRecording]);

  const stop = useCallback(() => {
    finalizePromiseRef.current = null;
    cleanup();
    setError(null);
    setEmotion('red');
    setMessages([]);
    setLiveAiText('');
    transcriptRef.current = [];
    aiTextBufferRef.current = '';
    userTextBufferRef.current = '';
    scenarioRef.current = null;
    setStatusSync('idle');
  }, [cleanup, setStatusSync]);

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

    finalizePromiseRef.current = (async (): Promise<VoiceSessionResult> => {
      cleanup();
      setStatusSync('ended');

      let report: ScoreReport | null = null;
      if (transcriptSnapshot.length && scenario) {
        try {
          report = await evaluateConversation(scenario, transcriptSnapshot);
        } catch {
          report = null;
        }
      }

      return { report, transcript: transcriptSnapshot };
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

  return { status, emotion, messages, liveAiText, start, stop, endSession, registerNaturalEndHandler, error };
}
