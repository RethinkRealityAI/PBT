import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Boot recovery: a session this device checkpointed but never finished (tab
 * closed, reload, dropped connection) is scored at the next launch, lands in
 * the trainee's history marked recovered, is saved as finished, and Home is
 * told. Pins when it runs (never under a live session in another tab), that
 * silence is never scored, and that a scoring failure keeps the checkpoint.
 */

const { evaluateConversation } = vi.hoisted(() => ({ evaluateConversation: vi.fn() }));
vi.mock('../../../services/geminiService', () => ({ evaluateConversation }));

import {
  OTHER_TAB_STALE_MS,
  RECOVERED_NOTICE_KEY,
  __resetSessionCheckpoint,
  clearPendingSession,
  currentTabId,
  isOrphaned,
  readPendingSession,
  recoverPendingSession,
  writePendingSession,
  type PendingSession,
} from '../sessionCheckpoint';
import { readStorage, writeStorage } from '../../../lib/storage';
import { SESSIONS_KEY } from '../../../lib/sessionsKey';
import { LIBRARY_SCENARIOS } from '../../../data/scenarios';
import type { ChatMessage, ScoreReport, SessionRecord } from '../../../services/types';

const SCENARIO = LIBRARY_SCENARIOS[0];
const ID = '44444444-4444-4444-8444-444444444444';
const TALKED: ChatMessage[] = [
  { role: 'ai', text: 'He is just big-boned.', timestamp: 1_000 },
  { role: 'user', text: 'Tell me about his walks.', timestamp: 2_000 },
];

const report = (overall: number, extra: Partial<ScoreReport> = {}): ScoreReport =>
  ({
    acknowledge: overall,
    clarify: overall,
    transform: overall,
    empathy: overall,
    rapport: overall,
    overall,
    band: 'ok',
    critique: '',
    betterAlternative: '',
    perDimensionNotes: { acknowledge: '', clarify: '', transform: '', empathy: '', rapport: '' },
    keyMoments: [],
    turnSentiment: [],
    ...extra,
  }) as ScoreReport;

function checkpoint(transcript: ChatMessage[] = TALKED, mode: 'text' | 'voice' = 'text') {
  writePendingSession({ id: ID, mode, scenario: SCENARIO, transcript, startedAt: 1_000, locale: 'en' });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  __resetSessionCheckpoint();
  evaluateConversation.mockReset();
});

describe('isOrphaned', () => {
  const p = (over: Partial<PendingSession>): PendingSession => ({
    id: ID,
    mode: 'text',
    scenario: SCENARIO,
    transcript: TALKED,
    startedAt: 0,
    updatedAt: 1_000,
    locale: 'en',
    tabId: 'tab-a',
    ...over,
  });

  it('a checkpoint from this same tab (a reload) is orphaned at once', () => {
    expect(isOrphaned(p({ tabId: 'tab-a' }), 1_001, 'tab-a')).toBe(true);
  });

  it('another tab\'s checkpoint is left alone until it has gone quiet', () => {
    expect(isOrphaned(p({ tabId: 'tab-b' }), 1_000 + OTHER_TAB_STALE_MS - 1, 'tab-a')).toBe(false);
    expect(isOrphaned(p({ tabId: 'tab-b' }), 1_000 + OTHER_TAB_STALE_MS + 1, 'tab-a')).toBe(true);
  });
});

describe('recoverPendingSession', () => {
  it('scores an interrupted session, tells the scorer, adds it to history and announces it', async () => {
    checkpoint();
    evaluateConversation.mockResolvedValue(report(64));
    const persist = vi.fn(async () => {});
    const record = await recoverPendingSession(persist);

    expect(evaluateConversation).toHaveBeenCalledWith(SCENARIO, TALKED, {
      sessionId: ID,
      locale: 'en',
      mode: 'text',
      endedEarly: 'interrupted',
    });
    expect(record).toMatchObject({ id: ID, recovered: true, mode: 'text' });
    const history = readStorage(SESSIONS_KEY) as SessionRecord[];
    expect(history[0]).toMatchObject({ id: ID, recovered: true });
    expect(history[0].scoreReport.overall).toBe(64);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: ID, completed: true, endedReason: 'completed' }),
    );
    expect(readStorage(RECOVERED_NOTICE_KEY)).toEqual({ sessionId: ID, overall: 64 });
    expect(readPendingSession()).toBeNull();
  });

  it('never scores silence — a session with no trainee turn is saved as abandoned', async () => {
    checkpoint([{ role: 'ai', text: 'Hello?', timestamp: 1 }]);
    const persist = vi.fn(async () => {});
    const record = await recoverPendingSession(persist);
    expect(record).toBeNull();
    expect(evaluateConversation).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ completed: false, endedReason: 'abandoned' }));
    expect(readPendingSession()).toBeNull();
  });

  it('keeps the checkpoint for the next launch when scoring is unavailable', async () => {
    checkpoint();
    evaluateConversation.mockResolvedValue(report(0, { scoreUnavailable: true }));
    const persist = vi.fn(async () => {});
    expect(await recoverPendingSession(persist)).toBeNull();
    expect(persist).not.toHaveBeenCalled();
    expect(readPendingSession()?.id).toBe(ID);
    expect(readStorage(SESSIONS_KEY)).toEqual([]);
  });

  it('does not touch a live session in another tab', async () => {
    checkpoint();
    const persist = vi.fn(async () => {});
    const record = await recoverPendingSession(persist, { tabId: 'some-other-tab', now: Date.now() });
    expect(record).toBeNull();
    expect(evaluateConversation).not.toHaveBeenCalled();
    expect(readPendingSession()?.id).toBe(ID);
  });

  it('only tidies up when the session already reached history', async () => {
    checkpoint();
    writeStorage(SESSIONS_KEY, [{ id: ID } as SessionRecord]);
    const persist = vi.fn(async () => {});
    expect(await recoverPendingSession(persist)).toBeNull();
    expect(evaluateConversation).not.toHaveBeenCalled();
    expect(readPendingSession()).toBeNull();
  });

  it('recovers a voice session too', async () => {
    checkpoint(TALKED, 'voice');
    evaluateConversation.mockResolvedValue(report(51));
    const record = await recoverPendingSession(vi.fn(async () => {}));
    expect(record?.mode).toBe('voice');
    expect(evaluateConversation.mock.calls[0][2].mode).toBe('voice');
  });
});

describe('clearPendingSession', () => {
  it('only clears the checkpoint of the session it names', () => {
    checkpoint();
    clearPendingSession('someone-else');
    expect(readPendingSession()?.id).toBe(ID);
    clearPendingSession(ID);
    expect(readPendingSession()).toBeNull();
  });

  it('stamps the writing tab', () => {
    checkpoint();
    expect(readPendingSession()?.tabId).toBe(currentTabId());
  });
});
