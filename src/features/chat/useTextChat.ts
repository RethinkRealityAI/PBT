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
  turnSentiment: [],
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

// Token the AI appends to signal end of simulation.
//
// We accept any bracketed variant (case + spacing tolerant) so the model can
// emit `[END_SIMULATION]`, `[end simulation]`, `[End_Simulation]`, etc. We
// require the brackets specifically to avoid false positives when a customer
// says something like "could we end this simulation?" mid-conversation.
const END_TOKEN_RX = /\[\s*end[\s_-]*simulation\s*\]/i;
// How long to leave the AI's closing line on screen before we kick off
// scoring + show the ending overlay. Long enough to read, short enough not
// to feel laggy.
const END_READ_DELAY_MS = 1500;
/**
 * Hard cap on customer (AI) turns. If the model hasn't emitted an end-token
 * by this many turns, we force-end the session anyway. Without this cap a
 * model that stays neutral or never recognises the close can leave the user
 * stuck in a loop of "thanks" → "you're welcome" → "thanks" with no exit.
 *
 * The customer-side prompt is also instructed to emit the token by turn 10–12
 * for genuine closes; this cap is the safety net for when it doesn't.
 */
const MAX_CUSTOMER_TURNS = 16;

export type ChatStatus =
  | 'idle'
  | 'opening'
  | 'awaitingUser'
  | 'aiTyping'
  /** AI delivered its closing line; input is locked, scoring queued. */
  | 'ending'
  | 'scoring'
  | 'complete'
  | 'error';

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
 *
 * The full transcript array is persisted as-is — every ChatMessage with
 * role 'user' (the staff trainee) AND role 'ai' (the customer roleplay)
 * is included. Both sides are required for the RAG corpus and the admin
 * transcript viewer. A sanity log fires below if the transcript ever ends
 * up single-role so a future regression can't silently drop a side.
 */
async function persistToSupabase(args: PersistArgs): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  // Sanity check — flag silently-broken transcripts before they reach DB.
  if (args.transcript.length >= 2) {
    const roles = new Set(args.transcript.map((m) => m.role));
    if (roles.size < 2) {
      console.warn(
        `[persistToSupabase] transcript for ${args.recordId} has only ${[...roles].join(',')} ` +
          `turns (${args.transcript.length} total). Expected both 'user' and 'ai'.`,
      );
    }
  }
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

  /**
   * Canonical, append-only transcript.
   *
   * The `messages` React state mirrors this ref for rendering, but the ref
   * is the source of truth for persistence. We update it SYNCHRONOUSLY
   * inside `appendTurn()` so a user turn is captured the moment send() is
   * called — there is no async window where state can drift, no lost
   * commits if React re-mounts mid-await, and no possibility for the
   * functional setMessages to operate on a stale closure.
   *
   * Earlier code derived persistence from `messages` via setMessages
   * callbacks during async send(). Under concurrent rendering / StrictMode
   * dev double-mount that pattern occasionally dropped user turns from
   * the persisted transcript, even though the AI was clearly responding
   * to them. The single-ref invariant rules out the entire failure mode.
   */
  const transcriptRef = useRef<ChatMessage[]>([]);
  // Exposed so ChatScreen can call end() after detecting [END_SIMULATION]
  const endRef = useRef<() => Promise<void>>(() => Promise.resolve());

  /** Append a turn to the canonical transcript and re-render the UI. */
  const appendTurn = useCallback((msg: ChatMessage) => {
    // Drop any prior transient-error placeholder from both ref + state.
    transcriptRef.current = [
      ...transcriptRef.current.filter((m) => !m._transientError),
      msg,
    ];
    setMessages([...transcriptRef.current]);
  }, []);

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
      appendTurn(first);
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
      // Append the user turn synchronously to the canonical transcript.
      // After this line, the user's message is locked in regardless of
      // what happens during the await — including aborts, re-mounts, or
      // a failed AI response.
      const userMsg: ChatMessage = { role: 'user', text, timestamp: Date.now() };
      appendTurn(userMsg);
      setStatus('aiTyping');
      try {
        // Send the canonical history (which now includes the new user
        // turn) to the model. Filter out any transient-error sentinel.
        const historyForModel = transcriptRef.current.filter((m) => !m._transientError);
        const next = await generateRoleplayMessage(
          scenario,
          historyForModel,
          undefined,
          { sessionId: recordIdRef.current, promptOverrides },
        );

        // Detect end-of-simulation token. Strip every match (defensive —
        // model occasionally emits more than one).
        const hasEndToken = END_TOKEN_RX.test(next.text);
        const cleanText = next.text.replace(new RegExp(END_TOKEN_RX, 'gi'), '').trim();
        const cleanMsg: ChatMessage = { ...next, text: cleanText };
        appendTurn(cleanMsg);

        // Hard turn cap as a safety net — if the model hasn't ended by
        // MAX_CUSTOMER_TURNS we force the close. Counted AFTER appending
        // so the cap matches the visible AI turn count.
        const customerTurns = transcriptRef.current.filter(
          (m) => m.role === 'ai' && !m._transientError,
        ).length;
        const shouldEnd = hasEndToken || customerTurns >= MAX_CUSTOMER_TURNS;

        if (shouldEnd) {
          // Lock input immediately so a fast user can't slip a message in
          // during the read-pause and pollute the transcript. Then queue
          // scoring after a brief read delay; the ending overlay covers
          // the rest of the transition.
          setStatus('ending');
          setTimeout(() => void endRef.current(), END_READ_DELAY_MS);
        } else {
          setStatus('awaitingUser');
        }
      } catch (err) {
        console.error('[useTextChat] send failed', err);
        // Show error as transient UI message — NOT added to canonical
        // transcript (appendTurn auto-strips the prior transient on next
        // append). The user message is already committed, so retrying
        // works without duplicating it.
        const errMsg: ChatMessage = {
          role: 'ai',
          text: 'Connection issue — your message was saved. Tap send to try again.',
          timestamp: Date.now(),
          _transientError: true,
        };
        // Show the error sentinel in UI without adding it to the
        // append-only transcript ref. We keep ref clean of transient
        // errors so persistence ignores them automatically.
        setMessages((current) => [
          ...current.filter((x) => !x._transientError),
          errMsg,
        ]);
        setTransientError('Tap send again to retry.');
        setStatus('awaitingUser');
      }
    },
    [scenario, appendTurn, promptOverrides],
  );

  const end = useCallback(async () => {
    const msgs = transcriptRef.current.filter((m) => !m._transientError);
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
      const msgs = transcriptRef.current.filter((m) => !m._transientError);
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
    transcriptRef.current = [];
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
      // Voice path bypasses appendTurn (the voice session has its own
      // append-only ref). Sync the chat hook's ref to match so end()/
      // abandon() see the same transcript.
      transcriptRef.current = [...msgs];
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
