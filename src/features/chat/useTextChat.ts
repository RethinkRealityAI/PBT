import { useCallback, useMemo, useRef, useState } from 'react';
import type { Scenario } from '../../data/scenarios';
import {
  evaluateConversation,
  generateRoleplayMessage,
  MODEL_TEXT,
} from '../../services/geminiService';
import type { ChatMessage, ScoreReport, SessionRecord } from '../../services/types';
import { useScenarioOverride } from '../../app/providers/FlagProvider';
import { seedScenarioId } from '../../data/scenarioOverrides';
import { LIBRARY_SCENARIOS } from '../../data/scenarios';
import type { PromptOverrides } from '../../data/knowledge/promptBuilders';
import {
  readStorage,
  writeStorage,
  type StorageKeyDef,
} from '../../lib/storage';
import { uuid } from '../../lib/id';
import { getSupabase } from '../auth/supabaseClient';
import { recordTurns } from '../../services/aiTelemetry';
import { persistRagDocument } from '../../services/ragDocument';
import { logEvent } from '../../lib/analytics';

const SESSIONS_KEY: StorageKeyDef<SessionRecord[]> = {
  key: 'sessions',
  fallback: [],
  validate: (v): v is SessionRecord[] => Array.isArray(v),
};
const MAX_SESSIONS = 50;

const SCORE_UNAVAILABLE: ScoreReport = {
  empathyTone: 0,
  activeListening: 0,
  productKnowledge: 0,
  objectionHandling: 0,
  confidence: 0,
  closingEffectiveness: 0,
  pacing: 0,
  overall: 0,
  band: 'poor',
  acknowledgeScore: 0,
  clarifyScore: 0,
  takeActionScore: 0,
  critique: 'Scoring unavailable.',
  betterAlternative: '—',
  perDimensionNotes: {
    empathyTone: '',
    activeListening: '',
    productKnowledge: '',
    objectionHandling: '',
    confidence: '',
    closingEffectiveness: '',
    pacing: '',
  },
  keyMoments: [],
};

function scenarioSummaryLine(scenario: Scenario): string {
  const note = scenario.pushbackNotes?.trim();
  const pb = scenario.pushback.title;
  if (note) {
    const short = note.length > 52 ? `${note.slice(0, 52)}…` : note;
    return `${pb} (${short}) · ${scenario.breed}`;
  }
  return `${pb} · ${scenario.breed}`;
}

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
  /**
   * Mark the session as abandoned (no scoring). Called when the user
   * navigates away from the chat without completing.
   */
  abandon: (reason?: 'user_exit' | 'timeout' | 'error') => Promise<void>;
  /**
   * Soft reset: keep the AI's opening line so the trainee can retry the
   * same opener, but discard their messages and the in-flight session id.
   * The previous attempt is still abandoned for admin telemetry.
   */
  restart: () => Promise<void>;
  /** Voice pipeline: persist transcript + scorecard into shared chat state + history. */
  applyVoiceSessionComplete: (
    report: ScoreReport | null,
    transcript: ChatMessage[],
  ) => Promise<void>;
  reset: () => void;
  startedAt: number | null;
}

interface PersistArgs {
  scenario: Scenario;
  recordId: string;
  transcript: ChatMessage[];
  durationSeconds: number;
  mode: 'text' | 'voice';
  scoreReport: ScoreReport | null;
  completed: boolean;
  endedReason: 'completed' | 'abandoned' | 'timeout' | 'error' | 'user_exit';
}

/**
 * Mirror a session to Supabase training_sessions when the user is signed in.
 * Best-effort: failures don't surface to the user (local copy is canonical).
 */
async function persistToSupabase(args: PersistArgs): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return;
    await sb.from('training_sessions').upsert({
      id: args.recordId,
      user_id: user.id,
      scenario: args.scenario as unknown as Record<string, unknown>,
      transcript: args.transcript as unknown as Record<string, unknown>[],
      score_report: args.scoreReport as unknown as Record<string, unknown> | null,
      score_overall: args.scoreReport?.overall ?? null,
      duration_seconds: args.durationSeconds,
      mode: args.mode,
      completed: args.completed,
      ended_reason: args.endedReason,
      pushback_id: args.scenario.pushback.id,
      driver: args.scenario.suggestedDriver,
      scenario_summary: scenarioSummaryLine(args.scenario),
      model_id: MODEL_TEXT,
      turns: args.transcript.length,
    });

    if (args.transcript.length > 0) {
      await recordTurns(
        args.transcript.map((m, idx) => ({
          sessionId: args.recordId,
          turnIdx: idx,
          role: m.role === 'user' ? 'user' : 'ai',
          textLen: m.text.length,
        })),
      );
    }
  } catch (err) {
    console.warn('[useTextChat] persistToSupabase failed', err);
  }
}

export function useTextChat(scenario: Scenario): UseTextChat {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null);
  const [transientError, setTransientError] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  // Look up admin AI overrides (prompt prefix/suffix) for this scenario id.
  // Only available when the scenario was selected from a flag-aware surface
  // that stamped `_overrideId`; falls back to no override otherwise.
  const overrideRow = useScenarioOverride(scenario._overrideId ?? '');
  const promptOverrides = useMemo<PromptOverrides>(
    () => ({
      promptPrefix: overrideRow?.prompt_prefix ?? null,
      promptSuffix: overrideRow?.prompt_suffix ?? null,
    }),
    [overrideRow?.prompt_prefix, overrideRow?.prompt_suffix],
  );
  // Allocated at open() so AI telemetry rows can attribute to the session
  // even before it's saved to history.
  const recordIdRef = useRef<string | null>(null);
  const persistedRef = useRef<boolean>(false);
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  // Exposed so ChatScreen can call end() after detecting [END_SIMULATION]
  const endRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const open = useCallback(async () => {
    if (status !== 'idle') return;
    setStatus('opening');
    setTransientError(null);
    startedAtRef.current = Date.now();
    recordIdRef.current = uuid();
    persistedRef.current = false;
    logEvent({
      type: 'custom',
      screen: 'chat',
      target: 'session_open',
      meta: {
        sessionId: recordIdRef.current,
        scenario: scenario.pushback.id,
        driver: scenario.suggestedDriver,
        mode: 'text',
      },
    });

    const apiKey =
      (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
      (process.env.GEMINI_API_KEY as string | undefined) ||
      '';
    if (!apiKey) {
      setTransientError('Gemini API key is not configured. Please add GEMINI_API_KEY to your environment.');
      setStatus('error');
      return;
    }

    try {
      const first = await generateRoleplayMessage(scenario, [], undefined, {
        sessionId: recordIdRef.current,
        promptOverrides,
      });
      setMessages([first]);
      setStatus('awaitingUser');
    } catch (err) {
      console.error('[useTextChat] open failed', err);
      const msg = err instanceof Error ? err.message : '';
      const friendly = msg.toLowerCase().includes('api key')
        ? 'Gemini API key is not configured. Please add GEMINI_API_KEY to your environment.'
        : 'Could not reach the AI — check your network and tap "Try again".';
      setTransientError(friendly);
      setStatus('error');
    }
  }, [scenario, status, promptOverrides]);

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
        const next = await generateRoleplayMessage(
          scenario,
          currentMessages,
          undefined,
          { sessionId: recordIdRef.current, promptOverrides },
        );

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
    [scenario, promptOverrides],
  );

  const end = useCallback(async () => {
    const msgs = messagesRef.current.filter((m) => !m._transientError);
    if (msgs.length === 0) return;
    setStatus('scoring');
    setTransientError(null);

    let report: ScoreReport | null = null;
    try {
      report = await evaluateConversation(scenario, msgs, {
        sessionId: recordIdRef.current,
      });
    } catch (err) {
      console.error('[useTextChat] scoring failed', err);
    }
    const effective = report ?? SCORE_UNAVAILABLE;
    setScoreReport(effective);
    setStatus('complete');

    const startedAt = startedAtRef.current ?? Date.now();
    const recordId = recordIdRef.current ?? uuid();
    const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
    const record: SessionRecord = {
      id: recordId,
      scenarioSummary: scenarioSummaryLine(scenario),
      pushbackId: scenario.pushback.id,
      driver: scenario.suggestedDriver,
      durationSeconds,
      mode: 'text',
      scoreReport: effective,
      transcript: msgs,
      createdAt: new Date().toISOString(),
    };
    const existing = readStorage(SESSIONS_KEY);
    writeStorage(SESSIONS_KEY, [record, ...existing].slice(0, MAX_SESSIONS));
    persistedRef.current = true;
    void persistToSupabase({
      scenario,
      recordId,
      transcript: msgs,
      durationSeconds,
      mode: 'text',
      scoreReport: effective,
      completed: true,
      endedReason: 'completed',
    });
    void persistRagDocument({
      sessionId: recordId,
      scenario,
      transcript: msgs,
      scoreReport: effective,
      durationSeconds,
      mode: 'text',
      modelId: MODEL_TEXT,
      completed: true,
    });
  }, [scenario]);

  const abandon = useCallback(
    async (reason: 'user_exit' | 'timeout' | 'error' = 'user_exit') => {
      // Already finalised? Don't double-write.
      if (persistedRef.current) return;
      const msgs = messagesRef.current.filter((m) => !m._transientError);
      if (msgs.length === 0 && !recordIdRef.current) return;
      const recordId = recordIdRef.current ?? uuid();
      const startedAt = startedAtRef.current ?? Date.now();
      const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
      persistedRef.current = true;
      logEvent({
        type: 'custom',
        screen: 'chat',
        target: 'session_abandon',
        meta: { sessionId: recordId, reason, turns: msgs.length },
      });
      void persistToSupabase({
        scenario,
        recordId,
        transcript: msgs,
        durationSeconds,
        mode: 'text',
        scoreReport: null,
        completed: false,
        endedReason: reason,
      });
    },
    [scenario],
  );

  // Keep endRef current so the setTimeout in send() calls the latest end()
  endRef.current = end;

  const restart = useCallback(async () => {
    // First mark the in-flight attempt as abandoned so admin telemetry sees
    // a row for the false start. abandon() is idempotent.
    if (!persistedRef.current && (recordIdRef.current || messagesRef.current.length > 0)) {
      await abandon('user_exit');
    }
    // Keep only the AI's first message so the trainee retries the same
    // opener — drop everything after it.
    const opener = messagesRef.current.find((m) => m.role === 'ai' && !m._transientError) ?? null;
    setMessages(opener ? [opener] : []);
    setScoreReport(null);
    setStatus(opener ? 'awaitingUser' : 'idle');
    setTransientError(null);
    startedAtRef.current = Date.now();
    recordIdRef.current = uuid();
    persistedRef.current = false;
    logEvent({
      type: 'custom',
      screen: 'chat',
      target: 'session_restart',
      meta: { sessionId: recordIdRef.current, kept_opener: opener != null },
    });
  }, [abandon]);

  const reset = useCallback(() => {
    setMessages([]);
    setScoreReport(null);
    setStatus('idle');
    setTransientError(null);
    startedAtRef.current = null;
    recordIdRef.current = null;
    persistedRef.current = false;
  }, []);

  const applyVoiceSessionComplete = useCallback(
    async (report: ScoreReport | null, transcript: ChatMessage[]) => {
      const msgs = transcript.filter((m) => !m._transientError);
      setTransientError(null);
      setMessages(msgs);

      const effective = report ?? SCORE_UNAVAILABLE;
      setScoreReport(effective);
      setStatus('complete');

      const t0 = msgs[0]?.timestamp ?? Date.now() - 60_000;
      const durationSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
      const recordId = recordIdRef.current ?? uuid();

      const record: SessionRecord = {
        id: recordId,
        scenarioSummary: scenarioSummaryLine(scenario),
        pushbackId: scenario.pushback.id,
        driver: scenario.suggestedDriver,
        durationSeconds,
        mode: 'voice',
        scoreReport: effective,
        transcript: msgs,
        createdAt: new Date().toISOString(),
      };
      const existing = readStorage(SESSIONS_KEY);
      writeStorage(SESSIONS_KEY, [record, ...existing].slice(0, MAX_SESSIONS));
      persistedRef.current = true;
      void persistToSupabase({
        scenario,
        recordId,
        transcript: msgs,
        durationSeconds,
        mode: 'voice',
        scoreReport: effective,
        completed: true,
        endedReason: 'completed',
      });
      void persistRagDocument({
        sessionId: recordId,
        scenario,
        transcript: msgs,
        scoreReport: effective,
        durationSeconds,
        mode: 'voice',
        modelId: MODEL_TEXT,
        completed: true,
      });
    },
    [scenario],
  );

  return {
    messages,
    status,
    scoreReport,
    transientError,
    open,
    send,
    end,
    abandon,
    restart,
    applyVoiceSessionComplete,
    reset,
    startedAt: startedAtRef.current,
  };
}
