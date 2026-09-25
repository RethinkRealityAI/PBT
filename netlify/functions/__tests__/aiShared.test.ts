// @vitest-environment node
/**
 * Unit tests for the shared AI-function plumbing (`_shared/ai.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  retrieveChunks: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../_shared/retrieval', () => ({ retrieveChunks: mocks.retrieveChunks }));

import {
  __resetAiCaches,
  __resetRateLimits,
  aiError,
  clientIp,
  isUuid,
  loadPromptOverrides,
  loadSimulationConfig,
  ok,
  parseJsonBody,
  rateLimit,
  readCaller,
  recordCallServer,
  retrieveForScenario,
  sanitizeScenario,
  sanitizeTurns,
} from '../_shared/ai';
import { SEED_SCENARIOS } from '../../../src/data/scenarios';
import { AI_LIMITS } from '../../../src/shared/ai/contract';
import type { SupabaseClient } from '@supabase/supabase-js';

const UUID = '0b1a3c9e-5d2f-4a6b-8c7d-9e0f1a2b3c4d';

function req(init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Request('http://localhost/.netlify/functions/ai-roleplay', {
    method: init.method ?? 'POST',
    headers: init.headers ?? {},
    body: init.method === 'GET' ? undefined : init.body,
  });
}

let sb: FakeSupabase;

beforeEach(() => {
  setFunctionEnv();
  __resetRateLimits();
  __resetAiCaches();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.retrieveChunks.mockReset();
  mocks.retrieveChunks.mockResolvedValue([]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('responses', () => {
  it('ok() is JSON with cache-control: no-store', async () => {
    const res = ok({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('aiError() carries the code and status', async () => {
    const res = aiError(413, 'payload_too_large', 'too big', { 'retry-after': '3' });
    expect(res.status).toBe(413);
    expect(res.headers.get('retry-after')).toBe('3');
    expect(await res.json()).toEqual({ error: 'too big', code: 'payload_too_large' });
  });
});

describe('rateLimit', () => {
  it('allows `limit` hits per window then returns 429 with retry-after', async () => {
    const r = () => req({ headers: { 'x-nf-client-connection-ip': '10.0.0.1' } });
    expect(rateLimit(r(), 'b', { limit: 2, windowMs: 60_000 })).toBeNull();
    expect(rateLimit(r(), 'b', { limit: 2, windowMs: 60_000 })).toBeNull();
    const third = rateLimit(r(), 'b', { limit: 2, windowMs: 60_000 });
    expect(third).not.toBeNull();
    expect(third!.status).toBe(429);
    expect(Number(third!.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(await third!.json()).toMatchObject({ code: 'rate_limited' });
  });

  it('keys by IP and by bucket independently', () => {
    const a = () => req({ headers: { 'x-nf-client-connection-ip': '10.0.0.1' } });
    const b = () => req({ headers: { 'x-forwarded-for': '10.0.0.2, 10.0.0.9' } });
    expect(rateLimit(a(), 'x', { limit: 1, windowMs: 60_000 })).toBeNull();
    expect(rateLimit(a(), 'x', { limit: 1, windowMs: 60_000 })).not.toBeNull();
    // Different IP: fresh budget.
    expect(rateLimit(b(), 'x', { limit: 1, windowMs: 60_000 })).toBeNull();
    // Same IP, different bucket: fresh budget.
    expect(rateLimit(a(), 'y', { limit: 1, windowMs: 60_000 })).toBeNull();
  });

  it('slides: old hits fall out of the window', () => {
    vi.useFakeTimers();
    try {
      const r = () => req({ headers: { 'x-nf-client-connection-ip': '10.0.0.3' } });
      expect(rateLimit(r(), 's', { limit: 1, windowMs: 1000 })).toBeNull();
      expect(rateLimit(r(), 's', { limit: 1, windowMs: 1000 })).not.toBeNull();
      vi.advanceTimersByTime(1001);
      expect(rateLimit(r(), 's', { limit: 1, windowMs: 1000 })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clientIp prefers the Netlify header, then the first x-forwarded-for hop', () => {
    expect(
      clientIp(req({ headers: { 'x-nf-client-connection-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' } })),
    ).toBe('1.1.1.1');
    expect(clientIp(req({ headers: { 'x-forwarded-for': ' 2.2.2.2 , 3.3.3.3' } }))).toBe('2.2.2.2');
    expect(clientIp(req())).toBe('unknown');
  });
});

describe('parseJsonBody', () => {
  it('rejects non-POST with 405', async () => {
    const res = await parseJsonBody(req({ method: 'GET' }), 1024);
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(405);
    expect(await (res as Response).json()).toMatchObject({ code: 'bad_request' });
  });

  it('rejects invalid JSON and non-object JSON with 400', async () => {
    const bad = await parseJsonBody(req({ body: '{nope' }), 1024);
    expect((bad as Response).status).toBe(400);
    const arr = await parseJsonBody(req({ body: '[1,2]' }), 1024);
    expect((arr as Response).status).toBe(400);
  });

  it('rejects an oversized declared body before reading it', async () => {
    const res = await parseJsonBody(
      req({ body: '{}', headers: { 'content-length': '999999' } }),
      1024,
    );
    expect((res as Response).status).toBe(413);
    expect(await (res as Response).json()).toMatchObject({ code: 'payload_too_large' });
  });

  it('rejects an oversized actual body', async () => {
    const res = await parseJsonBody(req({ body: JSON.stringify({ x: 'a'.repeat(2048) }) }), 1024);
    expect((res as Response).status).toBe(413);
  });

  it('returns the parsed object when valid', async () => {
    const res = await parseJsonBody<{ x: number }>(req({ body: '{"x":1}' }), 1024);
    expect(res).toEqual({ body: { x: 1 } });
  });
});

describe('sanitizeTurns', () => {
  it('drops transient errors + malformed turns, clamps text, keeps emotion', () => {
    const turns = sanitizeTurns(
      [
        { role: 'ai', text: 'hi', timestamp: 1, emotion: 'yellow' },
        { role: 'ai', text: 'oops', timestamp: 2, _transientError: true },
        { role: 'user', text: 'x'.repeat(50), timestamp: 3, emotion: 'purple' },
        { role: 'system', text: 'nope', timestamp: 4 },
        'garbage',
        { role: 'user', text: 42 },
      ],
      64,
      10,
    );
    expect(turns).toEqual([
      { role: 'ai', text: 'hi', timestamp: 1, emotion: 'yellow' },
      { role: 'user', text: 'x'.repeat(10), timestamp: 3 },
    ]);
  });

  it('keeps only the most recent maxTurns', () => {
    const input = Array.from({ length: 5 }, (_, i) => ({ role: 'user', text: `t${i}`, timestamp: i }));
    const turns = sanitizeTurns(input, 2, 100);
    expect(turns.map((t) => t.text)).toEqual(['t3', 't4']);
  });

  it('returns [] for a non-array', () => {
    expect(sanitizeTurns('nope')).toEqual([]);
    expect(sanitizeTurns(undefined)).toEqual([]);
  });

  it('defaults to the contract limits', () => {
    const input = Array.from({ length: AI_LIMITS.maxTurns + 5 }, (_, i) => ({
      role: 'user',
      text: 'y'.repeat(AI_LIMITS.maxTurnChars + 5),
      timestamp: i,
    }));
    const turns = sanitizeTurns(input);
    expect(turns).toHaveLength(AI_LIMITS.maxTurns);
    expect(turns[0].text).toHaveLength(AI_LIMITS.maxTurnChars);
  });
});

describe('sanitizeScenario', () => {
  it('accepts a library scenario unchanged', () => {
    expect(sanitizeScenario(SEED_SCENARIOS[0])).toEqual(SEED_SCENARIOS[0]);
  });

  it('rejects missing required fields and an unknown driver', () => {
    const base = SEED_SCENARIOS[0];
    expect(sanitizeScenario(null)).toBeNull();
    expect(sanitizeScenario({ ...base, breed: '' })).toBeNull();
    expect(sanitizeScenario({ ...base, pushback: { id: 'cost' } })).toBeNull();
    expect(sanitizeScenario({ ...base, suggestedDriver: 'Rebel' })).toBeNull();
    expect(sanitizeScenario({ ...base, difficulty: 'hard' })).toBeNull();
    expect(sanitizeScenario({ ...base, context: 5 })).toBeNull();
    expect(sanitizeScenario({ ...base, knowledgeSlugs: 'a' })).toBeNull();
  });

  it('clamps difficulty and strips null optionals', () => {
    const out = sanitizeScenario({
      ...SEED_SCENARIOS[0],
      difficulty: 9,
      context: null,
      knowledgeSlugs: null,
      _overrideId: 'seed:0',
    });
    expect(out?.difficulty).toBe(4);
    expect(out).not.toHaveProperty('context');
    expect(out).not.toHaveProperty('knowledgeSlugs');
    expect(out?._overrideId).toBe('seed:0');
  });

  it('keeps a known species and drops anything else (the scenario then runs as a dog)', () => {
    const base = SEED_SCENARIOS[0];
    expect(sanitizeScenario({ ...base, species: 'cat' })?.species).toBe('cat');
    expect(sanitizeScenario({ ...base, species: 'dog' })?.species).toBe('dog');
    for (const junk of ['hamster', 'Cat', '', 42, null, { cat: true }, ['cat']]) {
      const out = sanitizeScenario({ ...base, species: junk });
      // A bad species never fails the request — it is simply not carried.
      expect(out, String(junk)).not.toBeNull();
      expect(out, String(junk)).not.toHaveProperty('species');
    }
    // An absent species stays absent (legacy scenarios are unchanged).
    expect(sanitizeScenario(base)).not.toHaveProperty('species');
  });
});

describe('isUuid', () => {
  it('accepts v4 uuids and rejects everything else', () => {
    expect(isUuid(UUID)).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe('readCaller', () => {
  it('is anonymous without an Authorization header', async () => {
    const caller = await readCaller(req());
    expect(caller).not.toBeInstanceOf(Response);
    expect((caller as { userId: string | null }).userId).toBeNull();
    expect(sb.getUser).not.toHaveBeenCalled();
  });

  it('rejects an invalid bearer token with 401 rather than downgrading to anonymous', async () => {
    sb.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const res = await readCaller(req({ headers: { authorization: 'Bearer nope' } }));
    expect(res).toBeInstanceOf(Response);
    expect((res as Response).status).toBe(401);
    expect(await (res as Response).json()).toMatchObject({ code: 'unauthorized' });
  });

  it('rejects a malformed Authorization header', async () => {
    const res = await readCaller(req({ headers: { authorization: 'Basic abc' } }));
    expect((res as Response).status).toBe(401);
  });

  it('resolves the user id for a valid token and rejects disabled accounts', async () => {
    sb.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    sb.setHandler('profiles', () => ({ data: { disabled: false }, error: null }));
    const caller = await readCaller(req({ headers: { authorization: 'Bearer good' } }));
    expect((caller as { userId: string }).userId).toBe('user-1');
    expect(sb.getUser).toHaveBeenCalledWith('good');

    sb.setHandler('profiles', () => ({ data: { disabled: true }, error: null }));
    const res = await readCaller(req({ headers: { authorization: 'Bearer good' } }));
    expect((res as Response).status).toBe(403);
  });

  it('returns 500 server when the service client is unconfigured', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await readCaller(req());
    expect((res as Response).status).toBe(500);
    expect(await (res as Response).json()).toMatchObject({ code: 'server' });
  });
});

describe('loadSimulationConfig', () => {
  it('reads simulation_config.global once and caches for 60 s', async () => {
    const handler = vi.fn(() => ({ data: { config: { rag: { enabled: false } } }, error: null }));
    sb.setHandler('simulation_config', handler);
    const client = sb.client as unknown as SupabaseClient;
    const a = await loadSimulationConfig(client);
    const b = await loadSimulationConfig(client);
    expect(a).toEqual({ rag: { enabled: false } });
    expect(b).toBe(a);
    expect(handler).toHaveBeenCalledTimes(1);
    const call = sb.callsFor('simulation_config')[0];
    expect(call.ops.map((o) => o.op)).toEqual(['select', 'eq', 'maybeSingle']);
    expect(call.ops[1].args).toEqual(['id', 'global']);
  });

  it('expires after the TTL', async () => {
    vi.useFakeTimers();
    try {
      const handler = vi.fn(() => ({ data: { config: {} }, error: null }));
      sb.setHandler('simulation_config', handler);
      const client = sb.client as unknown as SupabaseClient;
      await loadSimulationConfig(client);
      vi.advanceTimersByTime(61_000);
      await loadSimulationConfig(client);
      expect(handler).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns undefined when there is no row or the value is not an object', async () => {
    sb.setHandler('simulation_config', () => ({ data: null, error: null }));
    expect(await loadSimulationConfig(sb.client as unknown as SupabaseClient)).toBeUndefined();
    __resetAiCaches();
    sb.setHandler('simulation_config', () => ({ data: { config: 'junk' }, error: null }));
    expect(await loadSimulationConfig(sb.client as unknown as SupabaseClient)).toBeUndefined();
  });

  it('never throws on a query error', async () => {
    sb.setHandler('simulation_config', () => ({ data: null, error: { message: 'relation missing' } }));
    await expect(loadSimulationConfig(sb.client as unknown as SupabaseClient)).resolves.toBeUndefined();
  });
});

describe('loadPromptOverrides', () => {
  const client = () => sb.client as unknown as SupabaseClient;

  it('honours request overrides only in preview, clamped to the contract limit', async () => {
    const long = 'p'.repeat(AI_LIMITS.maxOverrideChars + 100);
    const preview = await loadPromptOverrides(client(), SEED_SCENARIOS[0], {
      preview: true,
      promptOverrides: { promptPrefix: long, promptSuffix: 7 },
    });
    expect(preview?.promptPrefix).toHaveLength(AI_LIMITS.maxOverrideChars);
    expect(preview?.promptSuffix).toBeNull();
    expect(sb.callsFor('scenario_overrides')).toHaveLength(0);

    const notPreview = await loadPromptOverrides(client(), SEED_SCENARIOS[0], {
      preview: false,
      promptOverrides: { promptPrefix: 'ignored' },
    });
    expect(notPreview).toBeUndefined();
  });

  it('loads from scenario_overrides by _overrideId, cached per id', async () => {
    const handler = vi.fn(() => ({
      data: { prompt_prefix: 'be terse', prompt_suffix: null },
      error: null,
    }));
    sb.setHandler('scenario_overrides', handler);
    const scenario = { ...SEED_SCENARIOS[0], _overrideId: 'seed:0' };
    const a = await loadPromptOverrides(client(), scenario, {});
    const b = await loadPromptOverrides(client(), scenario, {});
    expect(a).toEqual({ promptPrefix: 'be terse', promptSuffix: null });
    expect(b).toEqual(a);
    expect(handler).toHaveBeenCalledTimes(1);
    const ops = sb.callsFor('scenario_overrides')[0].ops;
    expect(ops.find((o) => o.op === 'eq')?.args).toEqual(['scenario_id', 'seed:0']);
    expect(ops.find((o) => o.op === 'is')?.args).toEqual(['deleted_at', null]);
  });

  it('is undefined without an _overrideId', async () => {
    expect(await loadPromptOverrides(client(), SEED_SCENARIOS[0], {})).toBeUndefined();
    expect(sb.callsFor('scenario_overrides')).toHaveLength(0);
  });
});

describe('retrieveForScenario', () => {
  const client = () => sb.client as unknown as SupabaseClient;

  it('asks for the scenario query + filters with the configured k, scoped to the tool', async () => {
    mocks.retrieveChunks.mockResolvedValue([{ content: 'c', citation: null, tags: null, similarity: 1 }]);
    const scenario = { ...SEED_SCENARIOS[0], focusArea: 'weight' };
    const out = await retrieveForScenario(client(), scenario, { rag: { k: 6 } }, 'roleplay');
    expect(out).toHaveLength(1);
    expect(mocks.retrieveChunks).toHaveBeenCalledWith(
      `${scenario.pushback.title} ${scenario.suggestedDriver} owner ${scenario.breed} ${scenario.age}`,
      expect.objectContaining({ k: 6, filters: { focus: 'weight', tool: 'roleplay' } }),
    );
  });

  it('scopes an unlinked scenario to the tool alone', async () => {
    mocks.retrieveChunks.mockResolvedValue([]);
    await retrieveForScenario(client(), SEED_SCENARIOS[0], undefined, 'scoring');
    expect(mocks.retrieveChunks.mock.calls[0][1]).toMatchObject({
      filters: { tool: 'scoring' },
    });
  });

  it('carries a declared species as the HARD scope and names a cat in the query', async () => {
    mocks.retrieveChunks.mockResolvedValue([]);
    const cat = { ...SEED_SCENARIOS[0], species: 'cat' as const, breed: 'Maine Coon', focusArea: 'weight' };
    await retrieveForScenario(client(), cat, undefined, 'roleplay');
    const [query, opts] = mocks.retrieveChunks.mock.calls[0];
    expect(query).toBe(
      `${cat.pushback.title} ${cat.suggestedDriver} owner cat Maine Coon ${cat.age}`,
    );
    expect(opts.filters).toEqual({ focus: 'weight', species: 'cat', tool: 'roleplay' });
  });

  it('skips retrieval when rag is disabled and fails open on error', async () => {
    expect(
      await retrieveForScenario(client(), SEED_SCENARIOS[0], { rag: { enabled: false } }, 'roleplay'),
    ).toEqual([]);
    expect(mocks.retrieveChunks).not.toHaveBeenCalled();
    mocks.retrieveChunks.mockRejectedValue(new Error('down'));
    expect(await retrieveForScenario(client(), SEED_SCENARIOS[0], undefined, 'roleplay')).toEqual([]);
  });
});

describe('recordCallServer', () => {
  const client = () => sb.client as unknown as SupabaseClient;
  const rec = {
    userId: 'user-1',
    sessionId: UUID,
    callType: 'roleplay' as const,
    modelId: 'm',
    latencyMs: 12,
    tokensIn: 10,
    tokensOut: 5,
    costUsd: 0.001,
    refusal: true,
    endTokenEmitted: false,
    retries: 1,
  };

  it('writes the same columns as the browser version', async () => {
    const handler = vi.fn(() => ({ data: null, error: null }));
    sb.setHandler('ai_call_telemetry', handler);
    await recordCallServer(client(), rec, {});
    const insert = sb.firstOp('ai_call_telemetry', 'insert');
    expect(insert?.args[0]).toEqual({
      session_id: UUID,
      user_id: 'user-1',
      call_type: 'roleplay',
      model_id: 'm',
      latency_ms: 12,
      tokens_in: 10,
      tokens_out: 5,
      cost_usd: 0.001,
      refusal: true,
      off_topic: false,
      end_token_emitted: false,
      retries: 1,
      error: null,
    });
  });

  it('is skipped when telemetry is disallowed or in preview', async () => {
    await recordCallServer(client(), rec, { allowTelemetry: false });
    await recordCallServer(client(), rec, { preview: true });
    expect(sb.callsFor('ai_call_telemetry')).toHaveLength(0);
  });

  it('nulls a non-UUID session id', async () => {
    await recordCallServer(client(), { ...rec, sessionId: 'local-123' }, {});
    expect((sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as { session_id: unknown }).session_id).toBeNull();
  });

  it('retries once with session_id null on a foreign-key violation', async () => {
    let n = 0;
    sb.setHandler('ai_call_telemetry', () => {
      n += 1;
      return n === 1
        ? { data: null, error: { code: '23503', message: 'violates foreign key constraint' } }
        : { data: null, error: null };
    });
    await recordCallServer(client(), rec, {});
    const inserts = sb.callsFor('ai_call_telemetry');
    expect(inserts).toHaveLength(2);
    expect((inserts[1].ops[0].args[0] as { session_id: unknown }).session_id).toBeNull();
  });

  it('never throws', async () => {
    sb.setHandler('ai_call_telemetry', () => {
      throw new Error('kaboom');
    });
    await expect(recordCallServer(client(), rec, {})).resolves.toBeUndefined();
  });
});
