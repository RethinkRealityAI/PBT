// @vitest-environment node
/**
 * `session-save` — anonymous session recording + the sign-in claim.
 * Supabase is the chainable fake; no AI call is involved.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import save from '../session-save';
import { __resetRateLimits } from '../_shared/ai';
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
    const res = await save(jsonRequest('session-save', body()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ persisted: true });

    const calls = sb.callsFor('training_sessions');
    expect(calls).toHaveLength(2);
    expect(calls[0].ops.map((o) => o.op)).toEqual(['select', 'eq', 'maybeSingle']);
    const upsert = calls[1].ops[0];
    expect(upsert.op).toBe('upsert');
    expect(upsert.args[1]).toEqual({ onConflict: 'id' });
    const row = upsert.args[0] as Record<string, unknown>;
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
    await save(jsonRequest('session-save', body({ mode: 'voice', completed: false, endedReason: 'user_exit' })));
    const row = sb.callsFor('training_sessions')[1].ops[0].args[0] as Record<string, unknown>;
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
    for (const existing of [
      { user_id: 'user-9', anon_session_id: null },
      { user_id: null, anon_session_id: 'another-device-id' },
    ]) {
      sb = makeFakeSupabase({ training_sessions: () => ({ data: existing, error: null }) });
      mocks.createClient.mockImplementation(() => sb.client);
      const res = await save(jsonRequest('session-save', body()));
      expect(await res.json()).toEqual({ persisted: false, skipped: 'not_owner' });
      expect(sb.callsFor('training_sessions')).toHaveLength(1);
    }
  });

  it('updates its own device row again (e.g. after the score was written)', async () => {
    sb.setHandler('training_sessions', (call) =>
      call.ops[0].op === 'select'
        ? { data: { user_id: null, anon_session_id: DEVICE }, error: null }
        : { data: null, error: null },
    );
    const res = await save(jsonRequest('session-save', body()));
    expect(await res.json()).toEqual({ persisted: true });
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

  it('reports a failed write without throwing', async () => {
    sb.setHandler('training_sessions', (call) =>
      call.ops[0].op === 'upsert' ? { data: null, error: { message: 'boom' } } : { data: null, error: null },
    );
    const res = await save(jsonRequest('session-save', body()));
    expect(await res.json()).toEqual({ persisted: false, skipped: 'failed' });
  });

  it('is rate-limited per IP', async () => {
    let last: Response | null = null;
    for (let i = 0; i < 21; i++) last = await save(jsonRequest('session-save', body()));
    expect(last?.status).toBe(429);
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

  it('claims nothing without valid ids and survives a failed update', async () => {
    const headers = signIn('user-1');
    const none = await save(jsonRequest('session-save', { claim: true, anonSessionId: DEVICE, sessionIds: ['x'] }, { headers }));
    expect(await none.json()).toEqual({ claimed: [] });
    expect(sb.callsFor('training_sessions')).toHaveLength(0);

    sb.setHandler('training_sessions', () => ({ data: null, error: { message: 'boom' } }));
    const failed = await save(
      jsonRequest('session-save', { claim: true, anonSessionId: DEVICE, sessionIds: [SESSION] }, { headers }),
    );
    expect(await failed.json()).toEqual({ claimed: [] });
  });
});
