import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Session recovery — sessions that reached the database but never the scorer
 * (closed tab, dropped connection, trainee left) are scored by the hourly
 * job. Pins: only rows with a trainee turn, never a live conversation, the
 * same scorer told the session was interrupted, a guarded write that keeps a
 * score written meanwhile, and the internal-only background endpoint.
 */

const mocks = vi.hoisted(() => ({
  scoreTranscript: vi.fn(),
  runSessionRecovery: vi.fn(),
  getServiceClient: vi.fn(),
  getGeminiClient: vi.fn(() => ({})),
}));

vi.mock('../_shared/scoring', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_shared/scoring')>();
  return { ...actual, scoreTranscript: mocks.scoreTranscript };
});
vi.mock('../_shared/gemini', () => ({ getGeminiClient: mocks.getGeminiClient }));

import { makeFakeSupabase, setFunctionEnv, jsonRequest } from './fakeSupabase';
import {
  ENDED_GRACE_MS,
  IN_PROGRESS_GRACE_MS,
  MAX_AGE_MS,
  RECOVER_KEY_HEADER,
  RECOVER_KEY_LABEL,
  isRecoverable,
  runSessionRecovery,
  type RecoveryCandidate,
} from '../_shared/sessionRecovery';
import { internalKey, type NetlifyContextLike } from '../_shared/knowledgeTrigger';
import { SEED_SCENARIOS } from '../../../src/data/scenarios';

const NOW = Date.parse('2026-10-29T20:00:00Z');
const SCENARIO = SEED_SCENARIOS[0];

function row(over: Partial<RecoveryCandidate> & { ageMs?: number } = {}): RecoveryCandidate {
  const { ageMs = 3 * 60 * 60_000, ...rest } = over;
  return {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: null,
    created_at: new Date(NOW - ageMs).toISOString(),
    completed: false,
    ended_reason: 'user_exit',
    mode: 'text',
    locale: 'en',
    scenario: SCENARIO,
    transcript: [
      { role: 'ai', text: 'He is just big-boned.', timestamp: 1 },
      { role: 'user', text: 'I hear you — tell me about his walks.', timestamp: 2 },
    ],
    ...rest,
  };
}

const REPORT = { acknowledge: 70, clarify: 60, transform: 50, empathy: 70, rapport: 65, overall: 63, band: 'ok' };

describe('isRecoverable', () => {
  it('needs at least one trainee turn — silence is never scored', () => {
    expect(isRecoverable(row(), NOW)).toBe(true);
    expect(isRecoverable(row({ transcript: [{ role: 'ai', text: 'Hello?', timestamp: 1 }] }), NOW)).toBe(false);
    expect(isRecoverable(row({ transcript: [{ role: 'user', text: '   ', timestamp: 1 }] }), NOW)).toBe(false);
  });

  it('waits before scoring an ended session, so the trainee\'s own app goes first', () => {
    expect(isRecoverable(row({ ageMs: ENDED_GRACE_MS - 1 }), NOW)).toBe(false);
    expect(isRecoverable(row({ ageMs: ENDED_GRACE_MS + 1 }), NOW)).toBe(true);
  });

  it('never scores a conversation that may still be live', () => {
    const inProgress = { completed: false, ended_reason: null };
    expect(isRecoverable(row({ ...inProgress, ageMs: IN_PROGRESS_GRACE_MS - 1 }), NOW)).toBe(false);
    expect(isRecoverable(row({ ...inProgress, ageMs: IN_PROGRESS_GRACE_MS + 1 }), NOW)).toBe(true);
  });

  it('gives up on rows older than the retry window', () => {
    expect(isRecoverable(row({ ageMs: MAX_AGE_MS + 1 }), NOW)).toBe(false);
  });
});

describe('runSessionRecovery', () => {
  beforeEach(() => {
    mocks.scoreTranscript.mockReset();
    mocks.scoreTranscript.mockResolvedValue(REPORT);
  });

  function fakeWith(rows: RecoveryCandidate[], { written = true } = {}) {
    const sb = makeFakeSupabase({
      training_sessions: (call) => {
        if (call.ops.some((o) => o.op === 'update')) {
          const id = call.ops.find((o) => o.op === 'eq')?.args[1];
          return { data: written ? [{ id }] : [], error: null };
        }
        return { data: rows, error: null };
      },
    });
    return sb;
  }

  it('reads only unscored rows that contain a trainee turn', async () => {
    const sb = fakeWith([]);
    await runSessionRecovery({ sb: sb.client as never, ai: {} as never, now: NOW });
    const read = sb.callsFor('training_sessions')[0];
    expect(read.ops).toContainEqual({ op: 'is', args: ['score_overall', null] });
    expect(read.ops).toContainEqual({ op: 'contains', args: ['transcript', [{ role: 'user' }]] });
  });

  it('scores with the shared scorer, told the session was interrupted, and marks it recovered', async () => {
    const sb = fakeWith([row({ user_id: 'user-1', mode: 'voice' })]);
    const result = await runSessionRecovery({ sb: sb.client as never, ai: {} as never, now: NOW });
    expect(result).toEqual({ scanned: 1, scored: 1, skipped: 0, failed: 0 });

    const args = mocks.scoreTranscript.mock.calls[0][2];
    expect(args.endedEarly).toBe('interrupted');
    expect(args.userId).toBe('user-1');
    expect(args.preview).toBe(false);
    // A signed-in trainee's opt-out can't be read server-side — no usage row.
    expect(args.allowTelemetry).toBe(false);

    const write = sb.callsFor('training_sessions')[1];
    const update = write.ops.find((o) => o.op === 'update')!.args[0] as Record<string, any>;
    expect(update.score_overall).toBe(63);
    expect(update.completed).toBe(true);
    expect(update.score_report.recovered).toEqual({ at: new Date(NOW).toISOString(), endedReason: 'user_exit' });
    // Never overwrites a score written in the meantime.
    expect(write.ops).toContainEqual({ op: 'is', args: ['score_overall', null] });
  });

  it('records an in-progress row as "interrupted"', async () => {
    const sb = fakeWith([row({ completed: false, ended_reason: null })]);
    await runSessionRecovery({ sb: sb.client as never, ai: {} as never, now: NOW });
    const update = sb.callsFor('training_sessions')[1].ops.find((o) => o.op === 'update')!.args[0] as Record<string, any>;
    expect(update.score_report.recovered.endedReason).toBe('interrupted');
  });

  it('skips rows that are not ready and rows someone else scored first', async () => {
    const young = row({ ageMs: 60_000 });
    const sb = fakeWith([young, row()], { written: false });
    const result = await runSessionRecovery({ sb: sb.client as never, ai: {} as never, now: NOW });
    expect(mocks.scoreTranscript).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 2, scored: 0, skipped: 2, failed: 0 });
  });

  it('a scorer failure leaves the row for the next run and carries on', async () => {
    mocks.scoreTranscript.mockRejectedValueOnce(new Error('upstream'));
    const sb = fakeWith([row(), row({ id: '22222222-2222-4222-8222-222222222222' })]);
    const result = await runSessionRecovery({ sb: sb.client as never, ai: {} as never, now: NOW });
    expect(result).toEqual({ scanned: 2, scored: 1, skipped: 0, failed: 1 });
  });

  it('stops starting new scores at the deadline', async () => {
    const sb = fakeWith([row(), row()]);
    const result = await runSessionRecovery({ sb: sb.client as never, ai: {} as never, now: NOW, deadline: 1 });
    expect(mocks.scoreTranscript).not.toHaveBeenCalled();
    expect(result.scored).toBe(0);
  });
});

describe('sessions-recover-background (internal only)', () => {
  const PROD: NetlifyContextLike = { deploy: { context: 'production', published: true } };

  beforeEach(async () => {
    setFunctionEnv();
    vi.resetModules();
  });

  async function load() {
    vi.doMock('../_shared/sessionRecovery', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../_shared/sessionRecovery')>();
      return { ...actual, runSessionRecovery: mocks.runSessionRecovery };
    });
    vi.doMock('../_shared/admin', () => ({ getServiceClient: mocks.getServiceClient }));
    mocks.runSessionRecovery.mockReset();
    mocks.runSessionRecovery.mockResolvedValue({ scanned: 1, scored: 1, skipped: 0, failed: 0 });
    return (await import('../sessions-recover-background')).default;
  }

  it('refuses a request without the internal key', async () => {
    const handler = await load();
    const res = await handler(jsonRequest('sessions-recover-background', {}), PROD);
    expect(res.status).toBe(401);
    expect(mocks.runSessionRecovery).not.toHaveBeenCalled();
  });

  it('refuses any deploy but the published production one', async () => {
    const handler = await load();
    const headers = { [RECOVER_KEY_HEADER]: internalKey(RECOVER_KEY_LABEL)! };
    const res = await handler(
      jsonRequest('sessions-recover-background', {}, { headers }),
      { deploy: { context: 'deploy-preview' } },
    );
    expect(res.status).toBe(403);
    expect(mocks.runSessionRecovery).not.toHaveBeenCalled();
  });

  it('runs the recovery for the signed request on production', async () => {
    const handler = await load();
    const headers = { [RECOVER_KEY_HEADER]: internalKey(RECOVER_KEY_LABEL)! };
    const res = await handler(jsonRequest('sessions-recover-background', {}, { headers, ip: '198.51.100.9' }), PROD);
    expect(res.status).toBe(202);
    expect(mocks.runSessionRecovery).toHaveBeenCalledTimes(1);
  });
});
