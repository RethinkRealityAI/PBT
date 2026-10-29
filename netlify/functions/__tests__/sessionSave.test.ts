// @vitest-environment node
/**
 * `session-save` — anonymous session recording + the sign-in claim.
 * Supabase is the chainable fake; no AI call is involved.
 */
import { RATE_LIMITS } from '../_shared/rateLimits';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  anonSessionsTable,
  jsonRequest,
  makeFakeSupabase,
  setFunctionEnv,
  type FakeSupabase,
} from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import save from '../session-save';
import { __resetRateLimits } from '../_shared/ai';
import { ANON_DAILY_CAP } from '../_shared/anonSessions';
import { SEED_SCENARIOS } from '../../../src/data/scenarios';
import { MODEL_LIVE, MODEL_TEXT } from '../../../src/shared/ai/models';

const SESSION = '0b1a3c9e-5d2f-4a6b-8c7d-9e0f1a2b3c4d';
const OTHER = '1c2b4d0f-6e3a-4b7c-9d8e-0f1a2b3c4d5e';
const DEVICE = '7f3e2d1c-0b9a-4876-8543-210fedcba987';
const scenario = SEED_SCENARIOS[0];
const transcript = [
  { role: 'ai', text: 'Is it really worth it?', timestamp: 1, emotion: 'red' },
  { role: 'user', text: 'Tell me what worries you most.', timestamp: 2 },
];

let sb: FakeSupabase;

function body(extra: Record<string, unknown> = {}) {
  return {
    sessionId: SESSION,
    anonSessionId: DEVICE,
    scenario,
    transcript,
    mode: 'text',
    completed: true,
    endedReason: 'completed',
    durationSeconds: 312.4,
    locale: 'fr',
    ...extra,
  };
}

function signIn(userId = 'user-1') {
  sb.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  sb.setHandler('profiles', () => ({ data: { disabled: false }, error: null }));
  return { authorization: 'Bearer good-token' };
}

beforeEach(() => {
  setFunctionEnv();
  __resetRateLimits();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('session-save · record', () => {
  it('writes an anonymous row owned by the device — conversation, language, no score', async () => {
    sb.setHandler('training_sessions', anonSessionsTable(SESSION));
    const res = await save(jsonRequest('session-save', body()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ persisted: true });

    const calls = sb.callsFor('training_sessions');
    // guarded update (no row yet) → the device's daily cap → insert-if-absent
    expect(calls.map((c) => c.ops[0].op)).toEqual(['update', 'select', 'upsert']);
    expect(calls[1].ops).toEqual([
      { op: 'select', args: ['id', { count: 'exact', head: true }] },
      { op: 'eq', args: ['anon_session_id', DEVICE] },
      { op: 'gte', args: ['created_at', expect.any(String)] },
    ]);
    const insert = calls[2].ops[0];
    expect(insert.args[1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
    const row = insert.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      id: SESSION,
      user_id: null,
      anon_session_id: DEVICE,
      origin: 'app',
      mode: 'text',
      model_id: MODEL_TEXT,
      completed: true,
      ended_reason: 'completed',
      duration_seconds: 312,
      turns: 2,
      locale: 'fr',
      pushback_id: scenario.pushback.id,
      driver: scenario.suggestedDriver,
    });
    expect(row).not.toHaveProperty('score_report');
    expect(row).not.toHaveProperty('score_overall');
    // The owner's mood survives (it drives the admin's "owner by the end").
    expect((row.transcript as Array<{ emotion?: string }>)[0].emotion).toBe('red');
  });

  it('records an abandoned voice session', async () => {
    sb.setHandler('training_sessions', anonSessionsTable(SESSION));
    await save(jsonRequest('session-save', body({ mode: 'voice', completed: false, endedReason: 'user_exit' })));
    const row = sb.callsFor('training_sessions')[2].ops[0].args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ mode: 'voice', model_id: MODEL_LIVE, completed: false, ended_reason: 'user_exit' });
  });

  it('writes nothing for a signed-in caller, an opted-out trainee or a preview', async () => {
    for (const [extra, skipped, headers] of [
      [{}, 'signed_in', signIn()],
      [{ allowTelemetry: false }, 'opted_out', {}],
      [{ preview: true }, 'preview', {}],
    ] as const) {
      if (skipped !== 'signed_in') sb.getUser.mockReset();
      const res = await save(jsonRequest('session-save', body(extra), { headers }));
      expect(await res.json()).toEqual({ persisted: false, skipped });
    }
    expect(sb.callsFor('training_sessions')).toHaveLength(0);
  });

  it('never touches a row owned by an account or by another device', async () => {
    sb.setHandler('training_sessions', anonSessionsTable(SESSION, { taken: true }));
    const res = await save(jsonRequest('session-save', body()));
    expect(await res.json()).toEqual({ persisted: false, skipped: 'not_owner' });
    // update (no match) → cap → insert (conflict) → update again (no match)
    expect(sb.callsFor('training_sessions').map((c) => c.ops[0].op)).toEqual(['update', 'select', 'upsert', 'update']);
  });

  it('updates its own device row in place, guarded in the statement (a claim racing it wins)', async () => {
    sb.setHandler('training_sessions', anonSessionsTable(SESSION, { own: true }));
    const res = await save(jsonRequest('session-save', body()));
    expect(await res.json()).toEqual({ persisted: true });
    const calls = sb.callsFor('training_sessions');
    expect(calls).toHaveLength(1);
    expect(calls[0].ops.slice(1, 4)).toEqual([
      { op: 'eq', args: ['id', SESSION] },
      { op: 'is', args: ['user_id', null] },
      { op: 'eq', args: ['anon_session_id', DEVICE] },
    ]);
    const fields = calls[0].ops[0].args[0] as Record<string, unknown>;
    expect(fields).not.toHaveProperty('user_id');
    expect(fields).not.toHaveProperty('anon_session_id');
  });

  it('stops creating rows once the device reached its daily cap', async () => {
    sb.setHandler('training_sessions', anonSessionsTable(SESSION, { recent: ANON_DAILY_CAP }));
    const res = await save(jsonRequest('session-save', body()));
    expect(await res.json()).toEqual({ persisted: false, skipped: 'limit' });
    expect(sb.callsFor('training_sessions').map((c) => c.ops[0].op)).toEqual(['update', 'select']);
  });

  it('rejects malformed input with 400', async () => {
    for (const extra of [
      { sessionId: 'local-1' },
      { anonSessionId: 'x' },
      { anonSessionId: 'has spaces and is fine?' },
      { scenario: { breed: 'Lab' } },
      { mode: 'chat' },
      { endedReason: 'gave_up' },
    ]) {
      const res = await save(jsonRequest('session-save', body(extra)));
      expect(res.status).toBe(400);
    }
    expect(sb.callsFor('training_sessions')).toHaveLength(0);
  });

  it('refuses a body over 128 KB', async () => {
    const long = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'user' : 'ai', text: 'x'.repeat(4000), timestamp: i }));
    const res = await save(jsonRequest('session-save', body({ transcript: long })));
    expect(res.status).toBe(413);
    expect(sb.callsFor('training_sessions')).toHaveLength(0);
  });

  it('reports a failed write without throwing', async () => {
    sb.setHandler('training_sessions', (call) =>
      call.ops[0].op === 'update' ? { data: null, error: { message: 'boom' } } : { data: null, error: null },
    );
    const res = await save(jsonRequest('session-save', body()));
    expect(await res.json()).toEqual({ persisted: false, skipped: 'failed' });
  });

  it('is rate-limited per IP, separately from claims', async () => {
    let last: Response | null = null;
    for (let i = 0; i < RATE_LIMITS.sessionSave + 1; i++) last = await save(jsonRequest('session-save', body()));
    expect(last?.status).toBe(429);
    const headers = signIn('user-1');
    const claimed = await save(
      jsonRequest('session-save', { claim: true, anonSessionId: DEVICE, sessionIds: [SESSION] }, { headers }),
    );
    expect(claimed.status).toBe(200);
  });
});

describe('session-save · checkpoint (mid-conversation save)', () => {
  it('records the conversation so far as in progress — no ending needed', async () => {
    sb.setHandler('training_sessions', anonSessionsTable(SESSION, { own: true }));
    const res = await save(
      jsonRequest('session-save', body({ checkpoint: true, completed: false, endedReason: undefined })),
    );
    expect(await res.json()).toEqual({ persisted: true });
    const fields = sb.callsFor('training_sessions')[0].ops[0].args[0] as Record<string, unknown>;
    expect(fields.completed).toBe(false);
    expect(fields.ended_reason).toBeNull();
    expect(fields.transcript).toHaveLength(2);
    expect(fields).not.toHaveProperty('score_report');
  });

  it('only ever updates a row that is still in progress — a late checkpoint cannot reopen a finished session', async () => {
    sb.setHandler('training_sessions', anonSessionsTable(SESSION, { own: true }));
    // Even a body claiming to be finished is stored as in progress.
    await save(jsonRequest('session-save', body({ checkpoint: true })));
    const ops = sb.callsFor('training_sessions')[0].ops;
    expect(ops).toContainEqual({ op: 'eq', args: ['completed', false] });
    expect(ops).toContainEqual({ op: 'is', args: ['ended_reason', null] });
    expect((ops[0].args[0] as Record<string, unknown>).completed).toBe(false);
  });

  it('a final save is not guarded that way', async () => {
    sb.setHandler('training_sessions', anonSessionsTable(SESSION, { own: true }));
    await save(jsonRequest('session-save', body()));
    const ops = sb.callsFor('training_sessions')[0].ops;
    expect(ops).not.toContainEqual({ op: 'eq', args: ['completed', false] });
  });

  it('has its own, larger rate bucket — a room on one IP checkpointing does not block final saves', async () => {
    sb.setHandler('training_sessions', anonSessionsTable(SESSION, { own: true }));
    for (let i = 0; i < 30; i++) {
      const res = await save(jsonRequest('session-save', body({ checkpoint: true })));
      expect(res.status).toBe(200);
    }
    expect((await save(jsonRequest('session-save', body()))).status).toBe(200);
  });
});

describe('session-save · claim', () => {
  it('requires a signed-in caller', async () => {
    const res = await save(jsonRequest('session-save', { claim: true, anonSessionId: DEVICE, sessionIds: [SESSION] }));
    expect(res.status).toBe(401);
  });

  it('hands over only this device’s anonymous rows among the given ids', async () => {
    const headers = signIn('user-1');
    sb.setHandler('training_sessions', () => ({
      data: [
        { id: SESSION, origin: 'app' },
        { id: OTHER, origin: 'reconstructed' },
      ],
      error: null,
    }));
    const res = await save(
      jsonRequest(
        'session-save',
        { claim: true, anonSessionId: DEVICE, sessionIds: [SESSION, OTHER, SESSION, 'not-a-uuid'] },
        { headers },
      ),
    );
    expect(await res.json()).toEqual({
      claimed: [
        { id: SESSION, complete: true },
        { id: OTHER, complete: false },
      ],
    });
    const ops = sb.callsFor('training_sessions')[0].ops;
    expect(ops[0]).toEqual({ op: 'update', args: [{ user_id: 'user-1', anon_session_id: null }] });
    expect(ops[1]).toEqual({ op: 'in', args: ['id', [SESSION, OTHER]] });
    expect(ops[2]).toEqual({ op: 'is', args: ['user_id', null] });
    expect(ops[3]).toEqual({ op: 'eq', args: ['anon_session_id', DEVICE] });
  });

  it('claims nothing without valid ids; a failed update is an error, not an empty list', async () => {
    const headers = signIn('user-1');
    const none = await save(jsonRequest('session-save', { claim: true, anonSessionId: DEVICE, sessionIds: ['x'] }, { headers }));
    expect(await none.json()).toEqual({ claimed: [] });
    expect(sb.callsFor('training_sessions')).toHaveLength(0);

    sb.setHandler('training_sessions', () => ({ data: null, error: { message: 'boom' } }));
    const failed = await save(
      jsonRequest('session-save', { claim: true, anonSessionId: DEVICE, sessionIds: [SESSION] }, { headers }),
    );
    // The app can't tell its rows apart without the claim, so it must know.
    expect(failed.status).toBe(500);
  });
});
