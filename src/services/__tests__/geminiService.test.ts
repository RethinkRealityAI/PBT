import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SEED_SCENARIOS } from '../../data/scenarios';
import { AI_ENDPOINTS } from '../../shared/ai/contract';
import { MODEL_LIVE as SHARED_LIVE, MODEL_TEXT as SHARED_TEXT } from '../../shared/ai/models';
import { isScoreUnavailable, type ChatMessage, type ScoreReport } from '../types';

/**
 * geminiService is now a thin client over the `ai-*` Netlify Functions, so
 * these tests mock the transport (`postAi`) and pin the wire contract: which
 * endpoint each call hits, what the body carries (and — just as important —
 * what it must NOT carry), and how transport failures surface.
 */
const { postAi } = vi.hoisted(() => ({ postAi: vi.fn() }));

vi.mock('../aiApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../aiApi')>();
  return { ...actual, postAi };
});

import { AiApiError } from '../aiApi';
import {
  evaluateConversation,
  generateCoachHint,
  generateRoleplayMessage,
  MODEL_LIVE,
  MODEL_TEXT,
} from '../geminiService';

const SCENARIO = SEED_SCENARIOS[0];

const HISTORY: ChatMessage[] = [
  { role: 'ai', text: 'Why is it so expensive?', timestamp: 1 },
  { role: 'user', text: 'I hear you on the cost.', timestamp: 2 },
  { role: 'ai', text: 'Could not reach the customer.', timestamp: 3, _transientError: true },
];

const REPORT: ScoreReport = {
  acknowledge: 92,
  clarify: 80,
  transform: 78,
  empathy: 88,
  rapport: 70,
  overall: 83,
  band: 'good',
  critique: 'Solid handling.',
  betterAlternative: 'You could have...',
  perDimensionNotes: {
    acknowledge: 'Warm.',
    clarify: 'Could ask more.',
    transform: 'Bit defensive.',
    empathy: 'Genuinely kind.',
    rapport: 'A little fast.',
  },
  keyMoments: [{ ts: '0:30', type: 'win', label: 'Acknowledge', quote: '...' }],
  turnSentiment: [],
};

/** `[endpoint, body, opts]` of the most recent transport call. */
function lastCall(): [string, Record<string, unknown>, Record<string, unknown> | undefined] {
  return postAi.mock.calls.at(-1) as [string, Record<string, unknown>, Record<string, unknown> | undefined];
}

beforeEach(() => {
  postAi.mockReset();
});

describe('model ids', () => {
  it('re-exports the shared model ids so existing importers keep working', () => {
    expect(MODEL_TEXT).toBe(SHARED_TEXT);
    expect(MODEL_LIVE).toBe(SHARED_LIVE);
  });
});

describe('generateRoleplayMessage', () => {
  it('posts the scenario + history to the roleplay function and returns its message', async () => {
    const message: ChatMessage = { role: 'ai', text: 'Sure, but…', emotion: 'yellow', timestamp: 9 };
    postAi.mockResolvedValueOnce({ message });

    const result = await generateRoleplayMessage(SCENARIO, HISTORY, 'How can I help?', {
      sessionId: 'sess-1',
      locale: 'fr',
      promptOverrides: { promptPrefix: 'Be brisk.', promptSuffix: null },
    });

    expect(result).toBe(message);
    expect(postAi).toHaveBeenCalledOnce();
    const [endpoint, body] = lastCall();
    expect(endpoint).toBe(AI_ENDPOINTS.roleplay);
    expect(body.scenario).toBe(SCENARIO);
    expect(body.userMessage).toBe('How can I help?');
    expect(body.sessionId).toBe('sess-1');
    expect(body.locale).toBe('fr');
    expect(body.promptOverrides).toEqual({ promptPrefix: 'Be brisk.', promptSuffix: null });
  });

  it('strips transient-error placeholders from the history it sends', async () => {
    postAi.mockResolvedValueOnce({ message: { role: 'ai', text: 'ok', timestamp: 1 } });
    await generateRoleplayMessage(SCENARIO, HISTORY);
    const [, body] = lastCall();
    expect(body.history).toHaveLength(2);
    expect((body.history as ChatMessage[]).some((m) => m._transientError)).toBe(false);
  });

  it('sends an empty history for the opening turn and a null session id by default', async () => {
    postAi.mockResolvedValueOnce({ message: { role: 'ai', text: 'Why so expensive?', timestamp: 1 } });
    const result = await generateRoleplayMessage(SCENARIO, []);
    expect(result.text).toContain('expensive');
    const [, body] = lastCall();
    expect(body.history).toEqual([]);
    expect(body.sessionId).toBeNull();
    expect(body.userMessage).toBeUndefined();
  });

  it('never sends the simulation config or retrieved chunks — the server is authoritative', async () => {
    postAi.mockResolvedValueOnce({ message: { role: 'ai', text: 'ok', timestamp: 1 } });
    await generateRoleplayMessage(SCENARIO, [], undefined, { sessionId: 's' });
    const [, body] = lastCall();
    expect(body).not.toHaveProperty('config');
    expect(body).not.toHaveProperty('retrieved');
  });

  it('propagates transport failures (callers surface the UI fallback)', async () => {
    postAi.mockRejectedValueOnce(new AiApiError('upstream boom', 502, 'upstream'));
    await expect(generateRoleplayMessage(SCENARIO, [])).rejects.toThrow('upstream boom');
  });

  it('rejects an empty message rather than handing the UI a blank bubble', async () => {
    postAi.mockResolvedValueOnce({ message: { role: 'ai', text: '   ', timestamp: 1 } });
    await expect(generateRoleplayMessage(SCENARIO, [])).rejects.toThrow('Empty response');
  });
});

describe('generateCoachHint', () => {
  it('posts the filtered transcript to the hint function and returns the nudge', async () => {
    postAi.mockResolvedValueOnce({
      hint: 'Name her worry before you explain — try reflecting the cost concern back first.',
    });
    const hint = await generateCoachHint(SCENARIO, HISTORY, { sessionId: 's-2', locale: 'fr' });
    expect(hint).toContain('cost concern');
    const [endpoint, body] = lastCall();
    expect(endpoint).toBe(AI_ENDPOINTS.hint);
    expect(body.scenario).toBe(SCENARIO);
    expect(body.history).toHaveLength(2);
    expect(body.sessionId).toBe('s-2');
    expect(body.locale).toBe('fr');
    expect(body).not.toHaveProperty('config');
  });

  it('hard-caps runaway hint length', async () => {
    postAi.mockResolvedValueOnce({ hint: 'x'.repeat(500) });
    const hint = await generateCoachHint(SCENARIO, []);
    expect(hint.length).toBeLessThanOrEqual(320);
  });

  it('propagates failures so the UI can show a soft error', async () => {
    postAi.mockRejectedValueOnce(new AiApiError('offline', 0, 'server'));
    await expect(generateCoachHint(SCENARIO, [])).rejects.toThrow('offline');
  });

  it('treats an empty hint as a failure', async () => {
    postAi.mockResolvedValueOnce({ hint: '' });
    await expect(generateCoachHint(SCENARIO, [])).rejects.toThrow('Empty coach response');
  });
});

describe('evaluateConversation', () => {
  const TRANSCRIPT: ChatMessage[] = [
    { role: 'ai', text: 'Why is it expensive?', timestamp: 1 },
    { role: 'user', text: 'Let me explain.', timestamp: 2 },
  ];

  it('posts the transcript to the evaluate function and returns the server report as-is', async () => {
    postAi.mockResolvedValueOnce({ report: REPORT, persisted: true });
    const result = await evaluateConversation(SCENARIO, TRANSCRIPT, {
      sessionId: 'sess-9',
      locale: 'fr',
    });
    expect(result).toBe(REPORT);
    const [endpoint, body] = lastCall();
    expect(endpoint).toBe(AI_ENDPOINTS.evaluate);
    expect(body.scenario).toBe(SCENARIO);
    expect(body.transcript).toBe(TRANSCRIPT);
    expect(body.sessionId).toBe('sess-9');
    expect(body.locale).toBe('fr');
  });

  it('defaults mode to text and passes voice through', async () => {
    postAi.mockResolvedValue({ report: REPORT, persisted: false });
    await evaluateConversation(SCENARIO, TRANSCRIPT);
    expect(lastCall()[1].mode).toBe('text');
    await evaluateConversation(SCENARIO, TRANSCRIPT, { mode: 'voice' });
    expect(lastCall()[1].mode).toBe('voice');
  });

  it('never sends the simulation config — weights are resolved server-side', async () => {
    postAi.mockResolvedValueOnce({ report: REPORT, persisted: false });
    await evaluateConversation(SCENARIO, TRANSCRIPT);
    const [, body] = lastCall();
    expect(body).not.toHaveProperty('config');
    expect(body).not.toHaveProperty('retrieved');
  });

  it('never throws: a transport failure becomes the honest scoreUnavailable report', async () => {
    postAi.mockRejectedValueOnce(new AiApiError('gateway timeout', 504, 'upstream'));
    const result = await evaluateConversation(SCENARIO, TRANSCRIPT);
    expect(result.scoreUnavailable).toBe(true);
    expect(result.overall).toBe(0);
    expect(result.band).toBe('poor');
    expect(result.critique).toBe(
      'We could not score this session right now. Please try again, or check your network.',
    );
    expect(result.betterAlternative).toBe('—');
    expect(result.keyMoments).toEqual([]);
    expect(result.turnSentiment).toEqual([]);
    // The placeholder is what StatsScreen's retry + History's "—" key off.
    expect(isScoreUnavailable(result)).toBe(true);
  });

  it('treats a malformed 200 (no report) as unavailable too', async () => {
    postAi.mockResolvedValueOnce({});
    const result = await evaluateConversation(SCENARIO, TRANSCRIPT);
    expect(isScoreUnavailable(result)).toBe(true);
  });

  it('hands back a fresh fallback object each time (consumers persist + mutate reports)', async () => {
    postAi.mockRejectedValue(new AiApiError('down', 0, 'server'));
    const a = await evaluateConversation(SCENARIO, TRANSCRIPT);
    const b = await evaluateConversation(SCENARIO, TRANSCRIPT);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
