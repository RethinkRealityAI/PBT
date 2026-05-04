import { useCallback, useRef, useState } from 'react';
import type { Scenario } from '../../data/scenarios';
import {
  evaluateConversation,
  generateRoleplayMessage,
} from '../../services/geminiService';
import type { ChatMessage, ScoreReport, SessionRecord } from '../../services/types';
import {
  readStorage,
  writeStorage,
  type StorageKeyDef,
} from '../../lib/storage';
import { uuid } from '../../lib/id';

const SESSIONS_KEY: StorageKeyDef<SessionRecord[]> = {
  key: 'sessions',
  fallback: [],
  validate: (v): v is SessionRecord[] => Array.isArray(v),
};
const MAX_SESSIONS = 50;

// Token the AI appends to signal end of simulation
const END_TOKEN = '[END_SIMULATION]';

export type ChatStatus = 'idle' | 'opening' | 'awaitingUser' | 'aiTyping' | 'scoring' | 'complete' | 'error';

export interface UseTextChat {
  messages: ChatMessage[];
  status: ChatStatus;
  scoreReport: ScoreReport | null;
  transientError: string | null;
  open: () => Promise<void>;
  send: (text: string) => Promise<void>;
  end: () => Promise<void>;
  reset: () => void;
  startedAt: number | null;
}

export function useTextChat(scenario: Scenario): UseTextChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  // Exposed so ChatScreen can call end() after detecting [END_SIMULATION]
  const endRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const open = useCallback(async () => {
    if (status !== 'idle') return;
    setStatus('opening');
    setTransientError(null);
    startedAtRef.current = Date.now();
    try {
      const first = await generateRoleplayMessage(scenario, []);
      setMessages([first]);
      setStatus('awaitingUser');
    } catch (err) {
      console.error('[useTextChat] open failed', err);
      setTransientError('Could not reach the AI — check your network and tap "Try again".');
      setStatus('error');
    }
  }, [scenario, status]);

  const send = useCallback(
    async (text: string) => {
      setTransientError(null);
      const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
      // Only real messages go into history (no _transientError messages)
      const realHistory = messagesRef.current.filter((m) => !m._transientError);
      const currentMessages = [...realHistory, userMsg];
      setMessages(currentMessages);
      setStatus('aiTyping');
      try {
        const next = await generateRoleplayMessage(scenario, currentMessages);

        // Detect end-of-simulation token
        const hasEndToken = next.text.includes(END_TOKEN);
        const cleanText = next.text.replace(END_TOKEN, '').trim();
        const cleanMsg: ChatMessage = { ...next, text: cleanText };

        setMessages((m) => [...m.filter((x) => !x._transientError), cleanMsg]);
        setStatus('awaitingUser');

        if (hasEndToken) {
          // Let the message render, then auto-score
          setTimeout(() => void endRef.current(), 400);
        }
      } catch (err) {
        console.error('[useTextChat] send failed', err);
        // Show error as transient UI message — NOT added to real history
        const errMsg: ChatMessage = {
          role: 'ai',
          text: 'Connection issue — your message was saved. Tap send to try again.',
          timestamp: Date.now(),
          _transientError: true,
        };
        setMessages((m) => [...m.filter((x) => !x._transientError), errMsg]);
        setTransientError('Tap send again to retry.');
        setStatus('awaitingUser');
      }
    },
    [scenario],
  );

  const end = useCallback(async () => {
    const msgs = messagesRef.current.filter((m) => !m._transientError);
    if (msgs.length === 0) return;
    setStatus('scoring');
    setTransientError(null);

    let report: ScoreReport | null = null;
    try {
      report = await evaluateConversation(scenario, msgs);
      setScoreReport(report);
    } catch (err) {
      console.error('[useTextChat] scoring failed', err);
    }
    setStatus('complete');

    const startedAt = startedAtRef.current ?? Date.now();
    const record: SessionRecord = {
      id: uuid(),
      scenarioSummary: `${scenario.pushback.title} · ${scenario.breed}`,
      pushbackId: scenario.pushback.id,
      driver: scenario.suggestedDriver,
      durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      mode: 'text',
      scoreReport: report ?? {
        empathyTone: 0, activeListening: 0, productKnowledge: 0,
        objectionHandling: 0, confidence: 0, closingEffectiveness: 0, pacing: 0,
        overall: 0, band: 'poor', acknowledgeScore: 0, clarifyScore: 0, takeActionScore: 0,
        critique: 'Scoring unavailable.', betterAlternative: '—',
        perDimensionNotes: { empathyTone: '', activeListening: '', productKnowledge: '', objectionHandling: '', confidence: '', closingEffectiveness: '', pacing: '' },
        keyMoments: [],
      },
      transcript: msgs,
      createdAt: new Date().toISOString(),
    };
    const existing = readStorage(SESSIONS_KEY);
    writeStorage(SESSIONS_KEY, [record, ...existing].slice(0, MAX_SESSIONS));
  }, [scenario]);

  // Keep endRef current so the setTimeout in send() calls the latest end()
  endRef.current = end;

  const reset = useCallback(() => {
    setMessages([]);
    setScoreReport(null);
    setStatus('idle');
    setTransientError(null);
    startedAtRef.current = null;
  }, []);

  return {
    messages,
    status,
    scoreReport,
    transientError,
    open,
    send,
    end,
    reset,
    startedAt: startedAtRef.current,
  };
}
