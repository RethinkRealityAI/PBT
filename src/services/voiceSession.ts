import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import type { Scenario } from '../data/scenarios';
import type { ChatMessage, ScoreReport } from './types';
import { buildVoiceSystemPrompt } from '../data/knowledge/promptBuilders';
import { evaluateConversation, MODEL_LIVE } from './geminiService';

export type EmotionColor = 'red' | 'yellow' | 'green';
export type VoiceStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'aiSpeaking'
  | 'ended'
  | 'error';

export interface UseVoiceSessionReturn {
  status: VoiceStatus;
  emotion: EmotionColor;
  messages: ChatMessage[];
  start: (scenario: Scenario) => Promise<void>;
  endSession: () => Promise<ScoreReport | null>;
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

export function useVoiceSession(): UseVoiceSessionReturn {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [emotion, setEmotion] = useState<EmotionColor>('red');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<LiveSession | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const transcriptRef = useRef<ChatMessage[]>([]);
  const aiTextBufferRef = useRef('');
  const scenarioRef = useRef<Scenario | null>(null);
  const statusRef = useRef<VoiceStatus>('idle');

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

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    sessionRef.current?.close?.();
    if (audioCtxRef.current?.state !== 'closed') {
      audioCtxRef.current?.close();
    }
    sessionRef.current = null;
    micStreamRef.current = null;
    processorRef.current = null;
    audioCtxRef.current = null;
  }, []);

  const start = useCallback(async (scenario: Scenario) => {
    try {
      setStatusSync('connecting');
      setError(null);
      setEmotion('red');
      setMessages([]);
      transcriptRef.current = [];
      aiTextBufferRef.current = '';
      audioQueueRef.current = [];
      isPlayingRef.current = false;
      scenarioRef.current = scenario;

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE_IN });
      audioCtxRef.current = ctx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

      const session = await (ai.live.connect as (opts: unknown) => Promise<LiveSession>)({
        model: MODEL_LIVE,
        config: {
          systemInstruction: buildVoiceSystemPrompt(scenario),
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'updateEmotion',
                  description: 'Update the receptiveness orb color.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      emotion: {
                        type: 'STRING',
                        enum: ['red', 'yellow', 'green'],
                        description: 'red=tense, yellow=neutral, green=open',
                      },
                    },
                    required: ['emotion'],
                  },
                },
                {
                  name: 'endSimulation',
                  description: 'End the simulation when it reaches a natural conclusion.',
                  parameters: {
                    type: 'OBJECT',
                    properties: {
                      reason: { type: 'STRING' },
                    },
                    required: ['reason'],
                  },
                },
              ],
            },
          ],
          responseModalities: ['AUDIO', 'TEXT'],
        },
        callbacks: {
          onopen: () => {
            setStatusSync('listening');
          },
          onmessage: (msg: Record<string, unknown>) => {
            // Handle tool calls
            const toolCall = msg.toolCall as
              | { functionCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> }
              | undefined;

            if (toolCall?.functionCalls?.length) {
              for (const fc of toolCall.functionCalls) {
                if (fc.name === 'updateEmotion') {
                  setEmotion((fc.args.emotion as EmotionColor) ?? 'red');
                } else if (fc.name === 'endSimulation') {
                  addAiMessage();
                  setStatusSync('ended');
                }
                sessionRef.current?.sendToolResponse?.({
                  functionResponses: [{ id: fc.id, response: { result: 'ok' } }],
                });
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
            }

            if (serverContent?.modelTurn?.parts) {
              for (const part of serverContent.modelTurn.parts) {
                if (part.text) aiTextBufferRef.current += part.text;
                if (part.inlineData?.data && ctx.state !== 'closed') {
                  const pcm = base64ToArrayBuffer(part.inlineData.data);
                  const int16 = new Int16Array(pcm);
                  const float32 = int16ToFloat32(int16);
                  const audioBuf = ctx.createBuffer(1, float32.length, SAMPLE_RATE_OUT);
                  audioBuf.getChannelData(0).set(float32);
                  audioQueueRef.current.push(audioBuf);
                  playAudioQueue(ctx);
                }
              }
            }

            if (serverContent?.turnComplete) {
              addAiMessage();
            }

            if (serverContent?.interrupted) {
              audioQueueRef.current = [];
              isPlayingRef.current = false;
              setStatusSync('listening');
            }
          },
          onerror: (e: unknown) => {
            console.error('[voiceSession] error', e);
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg.includes('API key') ? 'Invalid API key.' : 'Voice connection error — check network.');
            setStatusSync('error');
          },
          onclose: () => {
            if (statusRef.current !== 'ended') setStatusSync('idle');
          },
        },
      });

      sessionRef.current = session;

      // Wire mic → session via ScriptProcessorNode (widely supported)
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (statusRef.current === 'ended' || !sessionRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        const int16 = float32ToInt16(input);
        const b64 = arrayBufferToBase64(int16.buffer);
        sessionRef.current.sendRealtimeInput?.({
          media: { data: b64, mimeType: `audio/pcm;rate=${SAMPLE_RATE_IN}` },
        });
      };

      source.connect(processor);
      // Connect to destination so AudioContext doesn't suspend (silent output)
      processor.connect(ctx.destination);
    } catch (err) {
      console.error('[voiceSession] start failed', err);
      const msg = err instanceof Error ? err.message : 'Failed to start voice session';
      const friendly = msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')
        ? 'Microphone access denied — allow mic in your browser settings and try again.'
        : msg;
      setError(friendly);
      setStatusSync('error');
    }
  }, [addAiMessage, addUserMessage, playAudioQueue, setStatusSync]);

  const endSession = useCallback(async (): Promise<ScoreReport | null> => {
    cleanup();
    setStatusSync('ended');

    const transcript = transcriptRef.current;
    const scenario = scenarioRef.current;
    if (!transcript.length || !scenario) return null;

    try {
      return await evaluateConversation(scenario, transcript);
    } catch {
      return null;
    }
  }, [cleanup, setStatusSync]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { status, emotion, messages, start, endSession, error };
}
