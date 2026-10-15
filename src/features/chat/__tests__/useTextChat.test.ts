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
  postAi,
  supabase,
  flags,
} = vi.hoisted(() => ({
  generateRoleplayMessage: vi.fn(),
  evaluateConversation: vi.fn(),
  persistRagDocument: vi.fn(),
  retrieveContext: vi.fn(),
  logEvent: vi.fn(),
  postAi: vi.fn(),
  /** Swapped per test: null = signed out / Supabase off (the default). */
  supabase: { client: null as unknown },
  /** The flags snapshot the hook reads (team objections + stored categories). */
  flags: { snapshot: null as unknown },
}));

vi.mock('../../../services/geminiService', () => ({
  generateRoleplayMessage,
  evaluateConversation,
  MODEL_TEXT: 'gemini-2.5-flash',
  MODEL_LIVE: 'gemini-2.0-flash-live-001',
}));
vi.mock('../../../app/providers/FlagProvider', () => ({
  useFlags: () => ({ snapshot: flags.snapshot }),
  useScenarioOverride: () => null,
  useSimulationConfig: () => null,
}));
vi.mock('../../auth/supabaseClient', () => ({ getSupabase: () => supabase.client }));
vi.mock('../../../services/aiTelemetry', () => ({ recordTurns: vi.fn() }));
vi.mock('../../../services/ragDocument', () => ({ persistRagDocument }));
// Only the network call is faked — `scenarioRetrievalCacheKey` and
// `scenarioRetrievalFilters` are pure, and the hook's retrieval scope is one
// of the things these tests pin.
vi.mock('../../../services/ragClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/ragClient')>()),
  retrieveContext,
}));
vi.mock('../../../lib/analytics', () => ({ logEvent }));
vi.mock('../../../services/aiApi', () => ({ postAi }));

import { useTextChat } from '../useTextChat';
import { LIBRARY_SCENARIOS, type Scenario } from '../../../data/scenarios';
import type { FlagSnapshot } from '../../../services/flagsClient';
import type { TeamObjection } from '../../../shared/scenarios/objections';
import type { ObjectionCategory } from '../../../shared/scenarios/objectionCategories';
import { readStorage, type StorageKeyDef } from '../../../lib/storage';
import { acceptTerms } from '../../../lib/terms';
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

/** A signed-in Supabase client whose `training_sessions` upsert we can inspect. */
function fakeSignedInSupabase() {
  const upsert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
  const from = vi.fn(() => ({ upsert }));
  return {
    client: {
      auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
      from,
    },
    from,
    upsert,
  };
}

beforeEach(() => {
  supabase.client = null;
  flags.snapshot = null;
  generateRoleplayMessage.mockReset();
  evaluateConversation.mockReset();
  persistRagDocument.mockReset();
  retrieveContext.mockReset();
  logEvent.mockReset();
  postAi.mockReset();
  postAi.mockResolvedValue({ persisted: true });
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

  it('re-scores a voice session as voice (the saved record\'s mode), a text one as text', async () => {
    const { result } = renderHook(() => useTextChat(SCENARIO_A));

    await act(async () => {
      await result.current.applyVoiceSessionComplete(null, [
        aiTurn('This kibble costs more than my own food.'),
        { role: 'user', text: 'I understand — let me explain.', timestamp: Date.now() },
      ]);
    });
    evaluateConversation.mockResolvedValueOnce(goodReport(58));
    await act(async () => {
      await result.current.rescore();
    });
    expect(evaluateConversation.mock.calls.at(-1)?.[2]).toMatchObject({ mode: 'voice' });

    act(() => {
      result.current.reset();
    });
    await runFailedSession(result);
    expect(evaluateConversation.mock.calls.at(-1)?.[2]).toMatchObject({ mode: 'text' });
    evaluateConversation.mockResolvedValueOnce(goodReport(61));
    await act(async () => {
      await result.current.rescore();
    });
    expect(evaluateConversation.mock.calls.at(-1)?.[2]).toMatchObject({ mode: 'text' });
  });
});

describe('useTextChat — knowledge scope', () => {
  it('retrieves as the roleplay tool, alongside the scenario targeting', async () => {
    const { result } = renderHook(() => useTextChat(SCENARIO_A));
    await act(async () => {
      await result.current.open();
    });
    expect(retrieveContext).toHaveBeenCalledTimes(1);
    const opts = retrieveContext.mock.calls[0][1];
    expect(opts.filters).toMatchObject({ tool: 'roleplay' });
  });

  // The provenance retrieval must ask for what the SERVER grounded the prompt
  // on: a scenario that chose no knowledge of its own reads its category's.
  const PROBIOTICS: TeamObjection = {
    id: 'team:probiotics',
    title: 'Probiotics',
    example: '"He eats fine."',
    titleFr: null,
    exampleFr: null,
    species: ['dog'],
    categoryId: 'category:gi',
    coaching: {},
    coachingFr: {},
    visible: true,
    sortOrder: null,
    updatedAt: null,
  };
  const GI: ObjectionCategory = {
    id: 'category:gi',
    name: 'GI',
    nameFr: null,
    description: '',
    focusArea: 'gi',
    knowledgeSlugs: ['study:gi-1', 'study:gi-2'],
    sortOrder: null,
    builtIn: false,
    updatedAt: null,
  };
  const snapshotWith = (categories: ObjectionCategory[]): FlagSnapshot => ({
    flags: {},
    scenarioOverrides: [],
    objections: [PROBIOTICS],
    objectionCategories: categories,
    fetchedAt: 0,
  });
  const openWith = async (scenario: Scenario) => {
    const { result } = renderHook(() => useTextChat(scenario));
    await act(async () => {
      await result.current.open();
    });
    return retrieveContext.mock.calls[0][1].filters;
  };
  const probioticsScenario: Scenario = {
    ...SCENARIO_A,
    pushback: { id: 'team:probiotics', title: 'Probiotics', example: '"He eats fine."' },
  };

  it("reads a team objection's category documents from the flags snapshot", async () => {
    flags.snapshot = snapshotWith([GI]);
    expect(await openWith(probioticsScenario)).toEqual({
      docSlugs: ['study:gi-1', 'study:gi-2'],
      inheritedDocs: true,
      species: 'dog',
      tool: 'roleplay',
    });
  });

  it("reads a built-in category's knowledge once an admin attached some", async () => {
    // SCENARIO_A is a weight-denial scenario → the built-in "weight" category.
    expect(SCENARIO_A.pushback.id).toBe('weight-denial');
    const weightEdit: ObjectionCategory = {
      ...GI,
      id: 'weight',
      name: 'Weight management',
      knowledgeSlugs: [],
      focusArea: 'weight',
      builtIn: true,
    };
    flags.snapshot = snapshotWith([weightEdit]);
    expect(await openWith(SCENARIO_A)).toEqual({ focus: 'weight', species: 'dog', tool: 'roleplay' });
  });

  it("keeps the scenario's own knowledge over its category's", async () => {
    flags.snapshot = snapshotWith([GI]);
    expect(await openWith({ ...probioticsScenario, knowledgeSlugs: ['own-doc'] })).toEqual({
      docSlugs: ['own-doc'],
      species: 'dog',
      tool: 'roleplay',
    });
  });

  it('retrieves un-targeted when the category has no knowledge (or no snapshot)', async () => {
    expect(await openWith(probioticsScenario)).toEqual({ species: 'dog', tool: 'roleplay' });
    retrieveContext.mockClear();
    flags.snapshot = snapshotWith([{ ...GI, knowledgeSlugs: [], focusArea: null }]);
    expect(await openWith(probioticsScenario)).toEqual({ species: 'dog', tool: 'roleplay' });
  });
});

describe('useTextChat — server-side AI contract', () => {
  it('sends neither the simulation config nor retrieved chunks to the AI calls', async () => {
    const { result } = renderHook(() => useTextChat(SCENARIO_A));
    await act(async () => {
      await result.current.open();
    });
    await act(async () => {
      await result.current.send('I hear you on the cost.');
    });
    evaluateConversation.mockResolvedValueOnce(goodReport(70));
    await act(async () => {
      await result.current.end();
    });

    for (const call of generateRoleplayMessage.mock.calls) {
      const options = call[3];
      expect(options).not.toHaveProperty('config');
      expect(options).not.toHaveProperty('retrieved');
      expect(options).toHaveProperty('promptOverrides');
      expect(options).toHaveProperty('sessionId');
    }
    const scorerOptions = evaluateConversation.mock.calls.at(-1)?.[2];
    expect(scorerOptions).not.toHaveProperty('config');
    expect(scorerOptions).not.toHaveProperty('retrieved');
    expect(scorerOptions.mode).toBe('text');
    // The client's own retrieval still feeds the RAG document.
    expect(persistRagDocument.mock.calls.at(-1)?.[0]).toHaveProperty('retrieved');
  });

  it('never writes score_report / score_overall to training_sessions — the server owns scores', async () => {
    const sb = fakeSignedInSupabase();
    supabase.client = sb.client;
    const { result } = renderHook(() => useTextChat(SCENARIO_A));

    await act(async () => {
      await result.current.open();
    });
    await act(async () => {
      await result.current.send('I hear you on the cost.');
    });
    evaluateConversation.mockResolvedValueOnce(goodReport(77));
    await act(async () => {
      await result.current.end();
    });

    await vi.waitFor(() => expect(sb.upsert).toHaveBeenCalled());
    expect(sb.from).toHaveBeenCalledWith('training_sessions');
    const row = sb.upsert.mock.calls[0][0];
    expect(row).not.toHaveProperty('score_report');
    expect(row).not.toHaveProperty('score_overall');
    expect(row).toMatchObject({
      id: result.current.sessionId,
      user_id: 'user-1',
      mode: 'text',
      completed: true,
      ended_reason: 'completed',
      turns: 3,
    });
    expect(Array.isArray(row.transcript)).toBe(true);

    // Same for a rescore and a voice session.
    evaluateConversation.mockResolvedValueOnce(goodReport(81));
    await act(async () => {
      await result.current.rescore();
    });
    await act(async () => {
      await result.current.applyVoiceSessionComplete(goodReport(66), [
        aiTurn('This kibble costs more than my own food.'),
      ]);
    });
    await vi.waitFor(() => expect(sb.upsert.mock.calls.length).toBeGreaterThanOrEqual(3));
    for (const call of sb.upsert.mock.calls) {
      expect(call[0]).not.toHaveProperty('score_report');
      expect(call[0]).not.toHaveProperty('score_overall');
    }
  });
});


describe('anonymous sessions are recorded by the server', () => {
  /** Supabase is configured but nobody is signed in. */
  function fakeSignedOutSupabase() {
    const from = vi.fn();
    const getUser = vi.fn(async () => ({ data: { user: null } }));
    return { client: { auth: { getUser }, from }, from, getUser };
  }

  // Recording is only allowed once the device accepted the Terms that say so.
  beforeEach(() => {
    acceptTerms();
  });

  it('sends a finished anonymous session to session-save, never writing the table itself', async () => {
    const sb = fakeSignedOutSupabase();
    supabase.client = sb.client;
    const { result } = renderHook(() => useTextChat(SCENARIO_A));
    await act(async () => {
      await result.current.open();
    });
    await act(async () => {
      await result.current.send('I hear you on the cost.');
    });
    evaluateConversation.mockResolvedValueOnce(goodReport(70));
    await act(async () => {
      await result.current.end();
    });

    await vi.waitFor(() => expect(postAi).toHaveBeenCalled());
    expect(sb.from).not.toHaveBeenCalledWith('training_sessions');
    const [endpoint, body] = postAi.mock.calls[0];
    expect(endpoint).toBe('/.netlify/functions/session-save');
    expect(body).toMatchObject({
      sessionId: result.current.sessionId,
      mode: 'text',
      completed: true,
      endedReason: 'completed',
      locale: 'en',
    });
    expect(typeof body.anonSessionId).toBe('string');
    expect(body.transcript).toHaveLength(3);
    // The score never rides along: only ai-evaluate writes it.
    expect(body).not.toHaveProperty('scoreReport');
    expect(body).not.toHaveProperty('score_report');
  });

  it('records an anonymous session that was left early as not completed', async () => {
    supabase.client = fakeSignedOutSupabase().client;
    const { result } = renderHook(() => useTextChat(SCENARIO_A));
    await act(async () => {
      await result.current.open();
    });
    await act(async () => {
      await result.current.abandon('user_exit');
    });
    await vi.waitFor(() => expect(postAi).toHaveBeenCalled());
    expect(postAi.mock.calls[0][1]).toMatchObject({ completed: false, endedReason: 'user_exit' });
  });

  it('sends nothing while this device has only accepted an older Terms version', async () => {
    localStorage.setItem('pbt:terms_version', '1');
    const sb = fakeSignedOutSupabase();
    supabase.client = sb.client;
    const { result } = renderHook(() => useTextChat(SCENARIO_A));
    await act(async () => {
      await result.current.open();
    });
    await act(async () => {
      await result.current.send('I hear you on the cost.');
    });
    evaluateConversation.mockResolvedValueOnce(goodReport(70));
    await act(async () => {
      await result.current.end();
    });

    // The save path ran (it asked who is signed in) and stopped at the gate.
    await vi.waitFor(() => expect(sb.getUser).toHaveBeenCalled());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(postAi).not.toHaveBeenCalled();
    expect(sb.from).not.toHaveBeenCalledWith('training_sessions');
  });
});
