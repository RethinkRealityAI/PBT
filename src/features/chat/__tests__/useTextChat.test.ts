import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ChatMessage, ScoreReport } from '../../../services/types';

/**
 * useTextChat is mounted once for the whole app (ChatProvider) against
 * whatever scenario ScenarioProvider currently holds. These tests pin the
 * invariant that a *saved* session stays bound to the scenario it was
 * actually recorded under, even after the user selects a different one.
 */

const {
  generateRoleplayMessage,
  evaluateConversation,
  persistRagDocument,
  retrieveContext,
  logEvent,
} = vi.hoisted(() => ({
  generateRoleplayMessage: vi.fn(),
  evaluateConversation: vi.fn(),
  persistRagDocument: vi.fn(),
  retrieveContext: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock('../../../services/geminiService', () => ({
  generateRoleplayMessage,
  evaluateConversation,
  MODEL_TEXT: 'gemini-2.5-flash',
  MODEL_LIVE: 'gemini-2.0-flash-live-001',
}));
vi.mock('../../../app/providers/FlagProvider', () => ({
  useScenarioOverride: () => null,
  useSimulationConfig: () => null,
}));
vi.mock('../../auth/supabaseClient', () => ({ getSupabase: () => null }));
vi.mock('../../../services/aiTelemetry', () => ({ recordTurns: vi.fn() }));
vi.mock('../../../services/ragDocument', () => ({ persistRagDocument }));
vi.mock('../../../services/ragClient', () => ({ retrieveContext }));
vi.mock('../../../lib/analytics', () => ({ logEvent }));

import { useTextChat } from '../useTextChat';
import { LIBRARY_SCENARIOS } from '../../../data/scenarios';
import { readStorage, type StorageKeyDef } from '../../../lib/storage';
import type { SessionRecord } from '../../../services/types';

const SESSIONS_KEY: StorageKeyDef<SessionRecord[]> = {
  key: 'sessions',
  fallback: [],
  validate: (v): v is SessionRecord[] => Array.isArray(v),
};

const SCENARIO_A = LIBRARY_SCENARIOS[0];
const SCENARIO_B = LIBRARY_SCENARIOS[1];

const aiTurn = (text: string): ChatMessage => ({
  role: 'ai',
  text,
  timestamp: Date.now(),
});

const goodReport = (overall: number): ScoreReport => ({
  acknowledge: overall,
  clarify: overall,
  transform: overall,
  empathy: overall,
  rapport: overall,
  overall,
  band: 'ok',
  critique: 'Solid.',
  betterAlternative: 'Try naming the cost concern first.',
  perDimensionNotes: {
    acknowledge: '',
    clarify: '',
    transform: '',
    empathy: '',
    rapport: '',
  },
  keyMoments: [],
  turnSentiment: [],
});

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  generateRoleplayMessage.mockReset();
  evaluateConversation.mockReset();
  persistRagDocument.mockReset();
  retrieveContext.mockReset();
  logEvent.mockReset();
  retrieveContext.mockResolvedValue([]);
  generateRoleplayMessage.mockResolvedValue(aiTurn('That price still feels steep.'));
});

/** Run a full text session that ends with the scorer failing. */
async function runFailedSession(
  result: { current: ReturnType<typeof useTextChat> },
) {
  await act(async () => {
    await result.current.open();
  });
  await act(async () => {
    await result.current.send('I hear you on the cost.');
  });
  evaluateConversation.mockRejectedValueOnce(new Error('scorer down'));
  await act(async () => {
    await result.current.end();
  });
}

describe('useTextChat.rescore', () => {
  it('re-scores the saved transcript against the scenario it was recorded under, not the newly selected one', async () => {
    const { result, rerender } = renderHook(({ s }) => useTextChat(s), {
      initialProps: { s: SCENARIO_A },
    });

    await runFailedSession(result);
    expect(result.current.scoreReport?.scoreUnavailable).toBe(true);

    // User leaves the scorecard, picks a different scenario elsewhere in the
    // app (Home "Start scenario", Create → Start, admin preview runner …).
    // None of those call reset(), so the failed session is still loaded.
    rerender({ s: SCENARIO_B });

    evaluateConversation.mockResolvedValueOnce(goodReport(72));
    let ok = false;
    await act(async () => {
      ok = await result.current.rescore();
    });

    expect(ok).toBe(true);
    expect(evaluateConversation).toHaveBeenLastCalledWith(
      SCENARIO_A,
      expect.any(Array),
      expect.any(Object),
    );
    // …and the RAG mirror of the record keeps the original scenario too.
    const ragArgs = persistRagDocument.mock.calls.at(-1)?.[0];
    expect(ragArgs.scenario).toBe(SCENARIO_A);
  });

  it('rescores against the current scenario when it never changed', async () => {
    const { result } = renderHook(() => useTextChat(SCENARIO_A));

    await runFailedSession(result);

    evaluateConversation.mockResolvedValueOnce(goodReport(64));
    let ok = false;
    await act(async () => {
      ok = await result.current.rescore();
    });

    expect(ok).toBe(true);
    expect(evaluateConversation).toHaveBeenLastCalledWith(
      SCENARIO_A,
      expect.any(Array),
      expect.any(Object),
    );
    // The saved history record is patched in place with the real score.
    const saved = readStorage(SESSIONS_KEY);
    expect(saved).toHaveLength(1);
    expect(saved[0].scoreReport.overall).toBe(64);
    expect(saved[0].scoreReport.scoreUnavailable).toBeUndefined();
  });

  it('no-ops after reset() — there is no saved record to re-score', async () => {
    const { result } = renderHook(() => useTextChat(SCENARIO_A));

    await runFailedSession(result);
    act(() => {
      result.current.reset();
    });

    const callsBefore = evaluateConversation.mock.calls.length;
    let ok = true;
    await act(async () => {
      ok = await result.current.rescore();
    });

    expect(ok).toBe(false);
    expect(evaluateConversation.mock.calls.length).toBe(callsBefore);
  });

  it('saves a voice session under the id the voice scorer already used', async () => {
    const { result } = renderHook(() => useTextChat(SCENARIO_A));

    // A text session ran first on this shared hook, leaving a stale record id.
    await act(async () => {
      await result.current.open();
    });
    const staleId = result.current.sessionId;
    expect(staleId).toBeTruthy();

    // Voice allocated its own id at start() and scored under it — that id wins.
    const voiceId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    await act(async () => {
      await result.current.applyVoiceSessionComplete(
        goodReport(70),
        [aiTurn('This kibble costs more than my own food.')],
        voiceId,
      );
    });

    expect(result.current.sessionId).toBe(voiceId);
    const saved = readStorage(SESSIONS_KEY);
    expect(saved[0].id).toBe(voiceId);
    expect(persistRagDocument.mock.calls.at(-1)?.[0].sessionId).toBe(voiceId);
  });

  it('falls back to the existing record id when no voice session id is passed', async () => {
    const { result } = renderHook(() => useTextChat(SCENARIO_A));

    await act(async () => {
      await result.current.applyVoiceSessionComplete(goodReport(61), [
        aiTurn('This kibble costs more than my own food.'),
      ]);
    });

    const id = result.current.sessionId;
    expect(id).toBeTruthy();
    expect(readStorage(SESSIONS_KEY)[0].id).toBe(id);
  });

  it('binds a voice session to the scenario it was recorded under', async () => {
    const { result, rerender } = renderHook(({ s }) => useTextChat(s), {
      initialProps: { s: SCENARIO_A },
    });

    await act(async () => {
      await result.current.applyVoiceSessionComplete(null, [
        aiTurn('This kibble costs more than my own food.'),
        { role: 'user', text: 'I understand — let me explain.', timestamp: Date.now() },
      ]);
    });
    expect(result.current.scoreReport?.scoreUnavailable).toBe(true);

    rerender({ s: SCENARIO_B });

    evaluateConversation.mockResolvedValueOnce(goodReport(58));
    await act(async () => {
      await result.current.rescore();
    });

    expect(evaluateConversation).toHaveBeenLastCalledWith(
      SCENARIO_A,
      expect.any(Array),
      expect.any(Object),
    );
  });
});
