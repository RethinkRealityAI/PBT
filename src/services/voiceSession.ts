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
  start: (scenario: Scenario) => Promise<void>;
  stop: () => void;
  endSession: () => Promise<VoiceSessionResult>;
  /** Fires once after the model calls endSimulation (after tool response is sent). */
  registerNaturalEndHandler: (handler: (() => void) | null) => void;
  error: string | null;
}

const SAMPLE_RATE_IN = 16000;
const SAMPLE_RATE_OUT = 24000;

function float32ToInt16(buffer: Float32Array): Int16Array {
  const out = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function int16ToFloat32(buffer: Int16Array): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    out[i] = buffer[i] / 0x7fff;
  }
  return out;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// The live session type from @google/genai isn't exported directly; use a generic ref
type LiveSession = {
  sendRealtimeInput?: (input: unknown) => void;
  sendToolResponse?: (resp: unknown) => void;
  close?: () => void;
};

function voiceStartErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const normalized = `${name} ${message}`.toLowerCase();

  if (normalized.includes('api key')) {
    return 'Gemini API key is not configured. Please add GEMINI_API_KEY to your environment.';
  }
  if (normalized.includes('notallowed') || normalized.includes('permission') || normalized.includes('security')) {
    return 'We need microphone access to run voice practice. Allow microphone access in your browser, then tap Try voice again.';
  }
  if (normalized.includes('notfound') || normalized.includes('devicesnotfound')) {
    return 'No microphone was found. Connect or enable a microphone, then tap Try voice again.';
  }
  if (normalized.includes('notreadable') || normalized.includes('trackstart')) {
    return 'Your microphone is busy or unavailable. Close other apps using it, then tap Try voice again.';
  }
  if (normalized.includes('media devices') || normalized.includes('microphone access is not available')) {
    return 'Microphone access is not available in this browser context. Use Chrome or Edge over HTTPS, then tap Try voice again.';
  }
  return 'Voice could not start. Check your microphone and network, then tap Try voice again.';
}

export function useVoiceSession(): UseVoiceSessionReturn {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [emotion, setEmotion] = useState<EmotionColor>('red');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);
  /** Playback (model TTS) — 24 kHz */
  const audioCtxRef = useRef<AudioContext | null>(null);
  /** Mic capture — typically 16 kHz; actual rate is read from context at runtime */
  const captureCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const isSocketOpenRef = useRef(false);
  const isClosingRef = useRef(false);
  /** Prevents duplicate WebSocket.close() calls that log browser console errors */
  const hasCalledCloseRef = useRef(false);
  const kickoffSentRef = useRef(false);
  const transcriptRef = useRef<ChatMessage[]>([]);
  const aiTextBufferRef = useRef('');
  const scenarioRef = useRef<Scenario | null>(null);
  const statusRef = useRef<VoiceStatus>('idle');
  const finalizePromiseRef = useRef<Promise<VoiceSessionResult> | null>(null);
  const naturalEndHandlerRef = useRef<(() => void) | null>(null);

  const setStatusSync = useCallback((s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const addAiMessage = useCallback(() => {
    const text = aiTextBufferRef.current.trim();
    if (!text) return;
    const msg: ChatMessage = { role: 'ai', text, timestamp: Date.now() };
    transcriptRef.current = [...transcriptRef.current, msg];
    setMessages([...transcriptRef.current]);
    aiTextBufferRef.current = '';
  }, []);

  const addUserMessage = useCallback((text: string) => {
    const msg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
    transcriptRef.current = [...transcriptRef.current, msg];
    setMessages([...transcriptRef.current]);
  }, []);

  const playAudioQueue = useCallback((ctx: AudioContext) => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
    isPlayingRef.current = true;
    setStatusSync('aiSpeaking');

    const playNext = () => {
      const buf = audioQueueRef.current.shift();
      if (!buf || ctx.state === 'closed') {
        isPlayingRef.current = false;
        if (statusRef.current === 'aiSpeaking') setStatusSync('listening');
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.connect(ctx.destination);
      source.onended = playNext;
      source.start();
    };

    playNext();
  }, [setStatusSync]);

  const cleanup = useCallback((closeSession = true) => {
    isClosingRef.current = true;
    isSocketOpenRef.current = false;
    workletRef.current?.disconnect();
    muteGainRef.current?.disconnect();
    micSourceRef.current?.disconnect();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (closeSession && !hasCalledCloseRef.current) {
      hasCalledCloseRef.current = true;
      try {
        sessionRef.current?.close?.();
      } catch {
        // Already closing/closed — swallow the exception silently.
      }
    }
    if (captureCtxRef.current?.state !== 'closed') {
      captureCtxRef.current?.close();
    }
    if (audioCtxRef.current?.state !== 'closed') {
      audioCtxRef.current?.close();
    }
    sessionRef.current = null;
    micStreamRef.current = null;
    micSourceRef.current = null;
    workletRef.current = null;
    muteGainRef.current = null;
    captureCtxRef.current = null;
    audioCtxRef.current = null;
  }, []);

  const registerNaturalEndHandler = useCallback((handler: (() => void) | null) => {
    naturalEndHandlerRef.current = handler;
  }, []);

  const start = useCallback(async (scenario: Scenario) => {
    // Guard: do not connect if a session is already open or connecting.
    if (sessionRef.current || statusRef.current === 'connecting') return;
    try {
      finalizePromiseRef.current = null;
      isClosingRef.current = false;
      isSocketOpenRef.current = false;
      kickoffSentRef.current = false;
      hasCalledCloseRef.current = false;
      setStatusSync('connecting');
      setError(null);
      setEmotion('red');
      setMessages([]);
      transcriptRef.current = [];
      aiTextBufferRef.current = '';
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      scenarioRef.current = scenario;

      // Check API key before attempting any connection.
      // Vite injects GEMINI_API_KEY via define at build time; VITE_GEMINI_API_KEY
      // works in local dev via import.meta.env when using VITE_ prefix.
      const apiKey =
        (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
        (process.env.GEMINI_API_KEY as string | undefined) ||
        '';
      if (!apiKey) {
        throw new Error('Gemini API key is not configured. Please add GEMINI_API_KEY to your environment.');
      }

      // 1) Microphone permission FIRST (user gesture from Begin simulation). Avoids the Live
      // session timing out while the permission prompt is open.
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'Microphone access is not available. Please use Chrome or Edge over HTTPS (or localhost).',
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: SAMPLE_RATE_IN },
        },
      });
      micStreamRef.current = stream;

      // 2) Playback context for model audio (24 kHz)
      const playbackCtx = new AudioContext({ sampleRate: SAMPLE_RATE_OUT });
      audioCtxRef.current = playbackCtx;
      if (playbackCtx.state === 'suspended') {
        try {
          await playbackCtx.resume();
        } catch {
          // Begin simulation should satisfy autoplay policy; resume failure is non-fatal.
        }
      }

      // 3) Dedicated capture context + AudioWorklet (replaces deprecated ScriptProcessorNode)
      const captureCtx = new AudioContext({ sampleRate: SAMPLE_RATE_IN });
      captureCtxRef.current = captureCtx;
      if (captureCtx.state === 'suspended') {
        try {
          await captureCtx.resume();
        } catch {
          // Same as playback — mic stream is already acquired.
        }
      }

      const captureRate = captureCtx.sampleRate;

      try {
        await captureCtx.audioWorklet.addModule('/audio/pcm-capture-processor.js');
      } catch {
        throw new Error(
          'Voice capture could not start. Try Chrome or Edge over HTTPS, then tap Begin simulation again.',
        );
      }

      const micSource = captureCtx.createMediaStreamSource(stream);
      micSourceRef.current = micSource;
      const workletNode = new AudioWorkletNode(captureCtx, 'pcm-capture-processor');
      workletRef.current = workletNode;

      workletNode.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
        if (
          statusRef.current === 'ended' ||
          statusRef.current === 'error' ||
          isClosingRef.current ||
          !isSocketOpenRef.current ||
          !sessionRef.current
        ) {
          return;
        }
        const f32 = new Float32Array(ev.data);
        const int16 = float32ToInt16(f32);
        const b64 = arrayBufferToBase64(int16.buffer);
        try {
          sessionRef.current.sendRealtimeInput?.({
            media: {
              data: b64,
              mimeType: `audio/pcm;rate=${captureRate}`,
            },
          });
        } catch {
          // Session closed between checks and send.
        }
      };

      const mute = captureCtx.createGain();
      mute.gain.value = 0;
      muteGainRef.current = mute;
      micSource.connect(workletNode);
      workletNode.connect(mute);
      mute.connect(captureCtx.destination);

      const ai = new GoogleGenAI({ apiKey });

      let onOpenFired = false;
      let connectedSession: LiveSession | null = null;
      const sc = scenario;
      const openingHint = sc.openingLine
        ? `Begin the simulation now. Deliver this exact opening line as the ${sc.persona} owner: "${sc.openingLine}"`
        : 'Please begin the simulation now by delivering your opening statement.';
      const sendOpening = () => {
        const activeSession = sessionRef.current ?? connectedSession;
        if (kickoffSentRef.current || !isSocketOpenRef.current || !activeSession) return;
        kickoffSentRef.current = true;
        try {
          activeSession.sendRealtimeInput?.({ text: openingHint });
        } catch {
          // Socket closed during startup; the onerror/onclose path will reset UI.
        }
      };

      const session = await (ai.live.connect as (opts: unknown) => Promise<LiveSession>)({
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
                        enum: ['red', 'yellow', 'green'],
                        description: 'red=defensive/resistant, yellow=listening/receptive, green=convinced/resolved',
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
                    properties: {
                      reason: { type: Type.STRING },
                    },
                    required: ['reason'],
                  },
                },
              ],
            },
          ],
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
        callbacks: {
          onopen: () => {
            onOpenFired = true;
            isSocketOpenRef.current = true;
            setStatusSync('listening');
            // Fire kickoff after a brief stabilisation delay so the model
            // is fully ready to generate audio before receiving input.
            window.setTimeout(sendOpening, 150);
          },
          onmessage: (msg: Record<string, unknown>) => {
            if (isClosingRef.current || !isSocketOpenRef.current) return;
            // Handle tool calls
            const toolCall = msg.toolCall as
              | { functionCalls: Array<{ id: string; name: string; args: Record<string, unknown> | string }> }
              | undefined;

            if (toolCall?.functionCalls?.length) {
              for (const fc of toolCall.functionCalls) {
                let args: Record<string, unknown> = {};
                try {
                  args =
                    typeof fc.args === 'string'
                      ? JSON.parse(fc.args)
                      : fc.args;
                } catch {
                  args = {};
                }
                if (fc.name === 'updateEmotion') {
                  setEmotion((args.emotion as EmotionColor) ?? 'red');
                } else if (fc.name === 'endSimulation') {
                  addAiMessage();
                }
                // Only send tool response if the session is still open (not yet closed/closing).
                if (sessionRef.current && isSocketOpenRef.current && !isClosingRef.current) {
                  try {
                    sessionRef.current.sendToolResponse?.({
                      functionResponses: [{ id: fc.id, response: { output: 'ok' } }],
                    });
                  } catch {
                    // Session already closed — ignore the stale send.
                  }
                }
                if (fc.name === 'endSimulation') {
                  queueMicrotask(() => naturalEndHandlerRef.current?.());
                }
              }
            }

            // Handle audio + text content
            const serverContent = msg.serverContent as
              | {
                  modelTurn?: {
                    parts: Array<{
                      text?: string;
                      inlineData?: { mimeType: string; data: string };
                    }>;
                  };
                  turnComplete?: boolean;
                  interrupted?: boolean;
                  inputTranscription?: { text: string };
                }
              | undefined;

            if (serverContent?.inputTranscription?.text) {
              addUserMessage(serverContent.inputTranscription.text);
              // User speech received — AI is now processing
              if (statusRef.current === 'listening') setStatusSync('thinking');
            }

            if (serverContent?.modelTurn?.parts) {
              for (const part of serverContent.modelTurn.parts) {
                if (part.text) aiTextBufferRef.current += part.text;
                if (part.inlineData?.data && playbackCtx.state !== 'closed') {
                  const pcm = base64ToArrayBuffer(part.inlineData.data);
                  const int16 = new Int16Array(pcm);
                  const float32 = int16ToFloat32(int16);
                  const audioBuf = playbackCtx.createBuffer(1, float32.length, SAMPLE_RATE_OUT);
                  audioBuf.getChannelData(0).set(float32);
                  audioQueueRef.current.push(audioBuf);
                  playAudioQueue(playbackCtx);
                }
              }
            }

            if (serverContent?.turnComplete) {
              addAiMessage();
              // If audio never started (text-only turn), go back to listening
              if (statusRef.current === 'thinking') setStatusSync('listening');
            }

            if (serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              setStatusSync('listening');
            }
          },
          onerror: (e: unknown) => {
            console.error('[voiceSession] error', e);
            cleanup(false);
            setError(voiceStartErrorMessage(e));
            setStatusSync('error');
          },
          onclose: () => {
            cleanup(false);
            if (statusRef.current !== 'ended' && statusRef.current !== 'error') setStatusSync('idle');
          },
        },
      });

      connectedSession = session;
      sessionRef.current = session;

      if (
        playbackCtx.state === 'closed' ||
        captureCtx.state === 'closed' ||
        isClosingRef.current ||
        (statusRef.current as VoiceStatus) === 'error'
      ) {
        throw new Error('Voice connection closed while starting.');
      }

      if (onOpenFired) window.setTimeout(sendOpening, 0);
    } catch (err) {
      console.error('[voiceSession] start failed', err);
      cleanup();
      setError(voiceStartErrorMessage(err));
      setStatusSync('error');
    }
  }, [addAiMessage, addUserMessage, playAudioQueue, setStatusSync]);

  const stop = useCallback(() => {
    finalizePromiseRef.current = null;
    cleanup();
    setError(null);
    setEmotion('red');
    setMessages([]);
    transcriptRef.current = [];
    aiTextBufferRef.current = '';
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    scenarioRef.current = null;
    setStatusSync('idle');
  }, [cleanup, setStatusSync]);

  const endSession = useCallback(async (): Promise<VoiceSessionResult> => {
    if (finalizePromiseRef.current) return finalizePromiseRef.current;

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
  }, [cleanup, setStatusSync]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    status,
    emotion,
    messages,
    start,
    stop,
    endSession,
    registerNaturalEndHandler,
    error,
  };
}
