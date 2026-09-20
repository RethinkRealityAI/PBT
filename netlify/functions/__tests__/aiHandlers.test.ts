// @vitest-environment node
/**
 * Handler tests for the server-side AI functions. `@google/genai` and
 * `@supabase/supabase-js` are mocked; retrieval is mocked so no embedding
 * call happens.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  jsonRequest,
  makeFakeSupabase,
  setFunctionEnv,
  type FakeSupabase,
} from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  authTokensCreate: vi.fn(),
  genaiCtorOptions: [] as unknown[],
  createClient: vi.fn(),
  retrieveChunks: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mocks.generateContent };
    authTokens = { create: mocks.authTokensCreate };
    constructor(opts: unknown) {
      mocks.genaiCtorOptions.push(opts);
    }
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      INTEGER: 'INTEGER',
      NUMBER: 'NUMBER',
      ARRAY: 'ARRAY',
      BOOLEAN: 'BOOLEAN',
    },
    Modality: { AUDIO: 'AUDIO', TEXT: 'TEXT' },
  };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../_shared/retrieval', () => ({ retrieveChunks: mocks.retrieveChunks }));

import roleplay from '../ai-roleplay';
import hint from '../ai-hint';
import evaluate from '../ai-evaluate';
import vision from '../ai-vision';
import voiceToken, { NEW_SESSION_WINDOW_MS, TOKEN_TTL_MS } from '../ai-voice-token';
import scenarioAi from '../admin-scenario-ai';
import { __resetAiCaches, __resetRateLimits } from '../_shared/ai';
import { SEED_SCENARIOS } from '../../../src/data/scenarios';
import { MODEL_LIVE, MODEL_TEXT } from '../../../src/shared/ai/models';
import { AI_LIMITS } from '../../../src/shared/ai/contract';

/** `VOICE_SESSION_CAPS.hardCapMs` in src/services/voiceSession.ts (5:00). */
const VOICE_HARD_CAP_MS = 5 * 60_000;

const UUID = '0b1a3c9e-5d2f-4a6b-8c7d-9e0f1a2b3c4d';
const scenario = SEED_SCENARIOS[0];

let sb: FakeSupabase;

function signIn(userId = 'user-1') {
  sb.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
  sb.setHandler('profiles', () => ({ data: { disabled: false }, error: null }));
  return { authorization: 'Bearer good-token' };
}

const validScore = {
  acknowledge: 80,
  clarify: 80,
  transform: 80,
  empathy: 80,
  rapport: 80,
  critique: 'Solid.',
  betterAlternative: 'Try…',
  perDimensionNotes: { acknowledge: 'a', clarify: 'c', transform: 't', empathy: 'e', rapport: 'r' },
  keyMoments: [],
  turnSentiment: [],
};

beforeEach(() => {
  setFunctionEnv();
  __resetRateLimits();
  __resetAiCaches();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.generateContent.mockReset();
  mocks.authTokensCreate.mockReset();
  mocks.genaiCtorOptions.length = 0;
  mocks.retrieveChunks.mockReset();
  mocks.retrieveChunks.mockResolvedValue([]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('ai-roleplay', () => {
  it('rejects non-POST with 405 and a bad scenario with 400', async () => {
    const get = await roleplay(jsonRequest('ai-roleplay', {}, { method: 'GET' }));
    expect(get.status).toBe(405);
    expect(await get.json()).toMatchObject({ code: 'bad_request' });

    const bad = await roleplay(jsonRequest('ai-roleplay', { scenario: { breed: 'Lab' }, history: [] }));
    expect(bad.status).toBe(400);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('opens the conversation for an anonymous caller and records telemetry', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ emotion: 'yellow', text: "Why's it so pricey?" }),
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 },
    });
    const res = await roleplay(
      jsonRequest('ai-roleplay', {
        scenario,
        history: [],
        sessionId: UUID,
        // Must be ignored: the server loads the config itself.
        config: { scoring: { dimensions: [{ key: 'acknowledge', weight: 100 }] } },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.message).toMatchObject({ role: 'ai', emotion: 'yellow', text: "Why's it so pricey?" });

    const arg = mocks.generateContent.mock.calls[0][0];
    expect(arg.model).toBe(MODEL_TEXT);
    expect(arg.contents[0].parts[0].text).toContain('Please begin');
    expect(arg.config.systemInstruction).toContain(scenario.breed);
    expect(arg.config.responseSchema.properties.text.description).toBe(
      'Your in-character reply to the trainee. 1–3 sentences.',
    );
    // Config came from the database, not the request.
    expect(sb.callsFor('simulation_config')).toHaveLength(1);

    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({
      session_id: UUID,
      user_id: null,
      call_type: 'roleplay',
      model_id: MODEL_TEXT,
      tokens_in: 100,
      tokens_out: 10,
      refusal: false,
      end_token_emitted: false,
      retries: 0,
    });
  });

  it('sends prior history, flags refusals + the END token, and localises the schema', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ emotion: 'green', text: "I can't do this. [END_SIMULATION]" }),
    });
    const res = await roleplay(
      jsonRequest('ai-roleplay', {
        scenario,
        locale: 'fr',
        history: [
          { role: 'ai', text: 'Hello?', timestamp: 1 },
          { role: 'user', text: 'Oops', timestamp: 2, _transientError: true },
          { role: 'user', text: 'Hi.', timestamp: 3 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const arg = mocks.generateContent.mock.calls[0][0];
    expect(arg.contents).toHaveLength(2);
    expect(arg.contents[0].role).toBe('model');
    expect(arg.contents[1].parts[0].text).toBe('Hi.');
    expect(arg.config.responseSchema.properties.text.description).toContain('québécois');
    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ refusal: true, end_token_emitted: true });
  });

  it('falls back to raw prose when the model ignores the schema', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: 'Just prose.' });
    const res = await roleplay(jsonRequest('ai-roleplay', { scenario, history: [] }));
    expect(await res.json()).toMatchObject({ message: { text: 'Just prose.', emotion: 'red' } });
  });

  it('honours preview prompt overrides and writes no telemetry in preview', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ emotion: 'red', text: 'ok' }) });
    const res = await roleplay(
      jsonRequest('ai-roleplay', {
        scenario,
        history: [],
        preview: true,
        promptOverrides: { promptPrefix: 'SPEAK LIKE A PIRATE' },
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.generateContent.mock.calls[0][0].config.systemInstruction).toContain('SPEAK LIKE A PIRATE');
    expect(sb.callsFor('ai_call_telemetry')).toHaveLength(0);
  });

  it('ignores request prompt overrides outside preview and loads them from the DB by _overrideId', async () => {
    sb.setHandler('scenario_overrides', () => ({
      data: { prompt_prefix: 'FROM DB', prompt_suffix: null },
      error: null,
    }));
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ emotion: 'red', text: 'ok' }) });
    await roleplay(
      jsonRequest('ai-roleplay', {
        scenario: { ...scenario, _overrideId: 'seed:0' },
        history: [],
        promptOverrides: { promptPrefix: 'FROM CLIENT' },
      }),
    );
    const sys = mocks.generateContent.mock.calls[0][0].config.systemInstruction as string;
    expect(sys).toContain('FROM DB');
    expect(sys).not.toContain('FROM CLIENT');
  });

  it('skips telemetry when the trainee opted out', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ emotion: 'red', text: 'ok' }) });
    await roleplay(jsonRequest('ai-roleplay', { scenario, history: [], allowTelemetry: false }));
    expect(sb.callsFor('ai_call_telemetry')).toHaveLength(0);
  });

  it('returns 401 for an invalid bearer token instead of treating it as anonymous', async () => {
    sb.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } });
    const res = await roleplay(
      jsonRequest('ai-roleplay', { scenario, history: [] }, { headers: { authorization: 'Bearer stale' } }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'unauthorized' });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('attributes telemetry to a signed-in caller', async () => {
    const headers = signIn('user-42');
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ emotion: 'red', text: 'ok' }) });
    await roleplay(jsonRequest('ai-roleplay', { scenario, history: [] }, { headers }));
    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert.user_id).toBe('user-42');
  });

  it('retries once and then answers 502 upstream with an error telemetry row', async () => {
    mocks.generateContent.mockRejectedValue(new Error('boom'));
    const res = await roleplay(jsonRequest('ai-roleplay', { scenario, history: [] }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'upstream' });
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert.error).toBe('boom');
  }, 10_000);

  it('rate-limits per IP with 429', async () => {
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify({ emotion: 'red', text: 'ok' }) });
    let last: Response | null = null;
    for (let i = 0; i < 41; i++) {
      last = await roleplay(jsonRequest('ai-roleplay', { scenario, history: [] }, { ip: '198.51.100.9' }));
    }
    expect(last!.status).toBe(429);
    expect(await last!.json()).toMatchObject({ code: 'rate_limited' });
    expect(mocks.generateContent).toHaveBeenCalledTimes(40);
  });
});

describe('ai-hint', () => {
  it('returns a trimmed hint and records hint telemetry', async () => {
    const long = 'x'.repeat(400);
    mocks.generateContent.mockResolvedValueOnce({ text: long });
    const res = await hint(
      jsonRequest('ai-hint', {
        scenario,
        history: [
          { role: 'ai', text: 'Too expensive.', timestamp: 1 },
          { role: 'user', text: 'I hear you.', timestamp: 2 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    // Same trim as the browser's generateCoachHint: slice(0, 317) + '…'.
    expect(body.hint).toBe(`${'x'.repeat(317)}…`);
    expect(body.hint.length).toBeLessThanOrEqual(320);
    const arg = mocks.generateContent.mock.calls[0][0];
    expect(arg.contents).toContain('CUSTOMER: Too expensive.');
    expect(arg.contents).toContain('STAFF: I hear you.');
    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert.call_type).toBe('hint');
  });

  it('answers 502 upstream when the coach fails after retry', async () => {
    mocks.generateContent.mockRejectedValue(new Error('nope'));
    const res = await hint(jsonRequest('ai-hint', { scenario, history: [] }));
    expect(res.status).toBe(502);
  }, 10_000);
});

describe('ai-evaluate', () => {
  const transcript = [
    { role: 'ai', text: 'Not fat.', timestamp: 1, emotion: 'red' },
    { role: 'user', text: 'I hear you.', timestamp: 2 },
  ];

  it('rejects an invalid mode', async () => {
    const res = await evaluate(jsonRequest('ai-evaluate', { scenario, transcript, mode: 'chat' }));
    expect(res.status).toBe(400);
  });

  it('scores for an anonymous caller without touching training_sessions', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(validScore) });
    const res = await evaluate(jsonRequest('ai-evaluate', { scenario, transcript, mode: 'text', sessionId: UUID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(false);
    expect(body.report.overall).toBe(80);
    expect(body.report.band).toBe('ok');
    expect(body.report.scoreUnavailable).toBeUndefined();
    expect(sb.callsFor('training_sessions')).toHaveLength(0);
    const arg = mocks.generateContent.mock.calls[0][0];
    expect(arg.contents).toContain('1. CUSTOMER: Not fat.');
    expect(arg.contents).toContain('2. STAFF: I hear you.');
    expect(arg.config.responseSchema.properties.critique).toEqual({ type: 'STRING' });
    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ call_type: 'evaluate', session_id: UUID });
  });

  it('adds French field descriptions for locale fr', async () => {
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(validScore) });
    await evaluate(jsonRequest('ai-evaluate', { scenario, transcript, mode: 'text', locale: 'fr' }));
    const schema = mocks.generateContent.mock.calls[0][0].config.responseSchema;
    expect(schema.properties.critique.description).toContain('français canadien');
    expect(schema.properties.keyMoments.items.properties.type).toEqual({ type: 'STRING' });
  });

  it('clamps dimensions and uses the server-loaded weights for overall', async () => {
    sb.setHandler('simulation_config', () => ({
      data: {
        config: {
          scoring: {
            dimensions: [
              { key: 'acknowledge', weight: 1 },
              { key: 'clarify', weight: 0 },
              { key: 'transform', weight: 0 },
              { key: 'empathy', weight: 0 },
              { key: 'rapport', weight: 0 },
            ],
          },
        },
      },
      error: null,
    }));
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ ...validScore, acknowledge: 150, clarify: 'x', transform: -4 }),
    });
    const res = await evaluate(jsonRequest('ai-evaluate', { scenario, transcript, mode: 'text' }));
    const body = await res.json();
    expect(body.report.acknowledge).toBe(100);
    expect(body.report.clarify).toBe(0);
    expect(body.report.transform).toBe(0);
    expect(body.report.overall).toBe(100);
  });

  it('persists the score into the signed-in caller\'s own row', async () => {
    const headers = signIn('user-1');
    sb.setHandler('training_sessions', (call) =>
      call.ops[0].op === 'select' ? { data: null, error: null } : { data: null, error: null },
    );
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(validScore) });
    const res = await evaluate(
      jsonRequest('ai-evaluate', { scenario, transcript, mode: 'voice', sessionId: UUID }, { headers }),
    );
    const body = await res.json();
    expect(body.persisted).toBe(true);

    const calls = sb.callsFor('training_sessions');
    expect(calls).toHaveLength(2);
    expect(calls[0].ops.map((o) => o.op)).toEqual(['select', 'eq', 'maybeSingle']);
    expect(calls[0].ops[1].args).toEqual(['id', UUID]);
    const upsert = calls[1].ops[0];
    expect(upsert.op).toBe('upsert');
    expect(upsert.args[1]).toEqual({ onConflict: 'id' });
    const row = upsert.args[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      id: UUID,
      user_id: 'user-1',
      score_overall: 80,
      mode: 'voice',
      model_id: MODEL_LIVE,
      turns: 2,
      completed: true,
      ended_reason: 'completed',
      pushback_id: scenario.pushback.id,
      driver: scenario.suggestedDriver,
    });
    expect(typeof row.scenario_summary).toBe('string');
    expect((row.score_report as { overall: number }).overall).toBe(80);
    expect(row).not.toHaveProperty('duration_seconds');
  });

  it('uses MODEL_TEXT for text mode', async () => {
    const headers = signIn('user-1');
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(validScore) });
    await evaluate(jsonRequest('ai-evaluate', { scenario, transcript, mode: 'text', sessionId: UUID }, { headers }));
    const row = sb.callsFor('training_sessions')[1].ops[0].args[0] as Record<string, unknown>;
    expect(row.model_id).toBe(MODEL_TEXT);
  });

  it('refuses to write into another user\'s session', async () => {
    const headers = signIn('user-1');
    sb.setHandler('training_sessions', () => ({ data: { user_id: 'someone-else' }, error: null }));
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(validScore) });
    const res = await evaluate(
      jsonRequest('ai-evaluate', { scenario, transcript, mode: 'text', sessionId: UUID }, { headers }),
    );
    const body = await res.json();
    expect(body.persisted).toBe(false);
    expect(body.report.overall).toBe(80);
    const calls = sb.callsFor('training_sessions');
    expect(calls).toHaveLength(1);
    expect(calls[0].ops[0].op).toBe('select');
  });

  it('does not write for preview or a non-UUID session id', async () => {
    const headers = signIn('user-1');
    mocks.generateContent.mockResolvedValue({ text: JSON.stringify(validScore) });
    await evaluate(
      jsonRequest('ai-evaluate', { scenario, transcript, mode: 'text', sessionId: UUID, preview: true }, { headers }),
    );
    await evaluate(
      jsonRequest('ai-evaluate', { scenario, transcript, mode: 'text', sessionId: 'local-1' }, { headers }),
    );
    expect(sb.callsFor('training_sessions')).toHaveLength(0);
    // Preview also writes no telemetry; the second call does.
    expect(sb.callsFor('ai_call_telemetry')).toHaveLength(1);
  });

  it('reports persisted:false when the upsert fails, without failing the score', async () => {
    const headers = signIn('user-1');
    sb.setHandler('training_sessions', (call) =>
      call.ops[0].op === 'upsert'
        ? { data: null, error: { code: '42501', message: 'score_report is server-authoritative' } }
        : { data: null, error: null },
    );
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(validScore) });
    const res = await evaluate(
      jsonRequest('ai-evaluate', { scenario, transcript, mode: 'text', sessionId: UUID }, { headers }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.persisted).toBe(false);
    expect(body.report.overall).toBe(80);
  });

  it('returns HTTP 200 with scoreUnavailable when the scorer fails after retry', async () => {
    const headers = signIn('user-1');
    mocks.generateContent.mockRejectedValue(new Error('down'));
    const res = await evaluate(
      jsonRequest('ai-evaluate', { scenario, transcript, mode: 'text', sessionId: UUID }, { headers }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.persisted).toBe(false);
    expect(body.report).toMatchObject({
      scoreUnavailable: true,
      overall: 0,
      band: 'poor',
      critique: 'We could not score this session right now. Please try again, or check your network.',
      betterAlternative: '—',
      keyMoments: [],
      turnSentiment: [],
    });
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    expect(sb.callsFor('training_sessions')).toHaveLength(0);
    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert.error).toBe('down');
  }, 10_000);
});

describe('ai-vision', () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

  it('rejects unsupported mime types, oversized and non-base64 payloads', async () => {
    const bad = await vision(jsonRequest('ai-vision', { imageBase64: png, mimeType: 'image/gif' }));
    expect(bad.status).toBe(400);

    const huge = await vision(
      jsonRequest('ai-vision', {
        imageBase64: 'A'.repeat(AI_LIMITS.maxImageBase64Chars + 4),
        mimeType: 'image/jpeg',
      }),
    );
    expect(huge.status).toBe(413);
    expect(await huge.json()).toMatchObject({ code: 'payload_too_large' });

    const dataUrl = await vision(
      jsonRequest('ai-vision', { imageBase64: `data:image/png;base64,${png}`, mimeType: 'image/png' }),
    );
    expect(dataUrl.status).toBe(400);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('analyses a photo and normalises the result', async () => {
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ isDog: true, breed: ' Lab ', breedConfidence: 1.7, bcs: 12, lifeStage: 'adult' }),
    });
    const res = await vision(jsonRequest('ai-vision', { imageBase64: png, mimeType: 'image/PNG' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toMatchObject({
      isDog: true,
      breed: 'Lab',
      breedConfidence: 1,
      bcs: 9,
      lifeStage: 'adult',
      ageEstimate: 'Not determinable from photo',
      dermatitis: { severity: 'none', indicators: [], note: '' },
    });
    const arg = mocks.generateContent.mock.calls[0][0];
    expect(arg.model).toBe(MODEL_TEXT);
    expect(arg.contents[0].parts[0].inlineData).toEqual({ mimeType: 'image/png', data: png });
    expect(arg.config.systemInstruction).toContain('BODY CONDITION SCORE');
    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ call_type: 'vision', session_id: null });
  });

  it('answers 502 upstream on failure (single attempt, as before)', async () => {
    mocks.generateContent.mockRejectedValueOnce(new Error('vision down'));
    const res = await vision(jsonRequest('ai-vision', { imageBase64: png, mimeType: 'image/jpeg' }));
    expect(res.status).toBe(502);
    expect(mocks.generateContent).toHaveBeenCalledTimes(1);
  });
});

describe('ai-voice-token', () => {
  it('mints a single-use token with the model, prompt, tools and audio config locked', async () => {
    mocks.authTokensCreate.mockResolvedValueOnce({ name: 'auth_tokens/abc123' });
    const before = Date.now();
    const res = await voiceToken(
      jsonRequest('ai-voice-token', { scenario, locale: 'fr', sessionId: UUID, openingLine: 'Bonjour!' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe('auth_tokens/abc123');
    expect(body.model).toBe(MODEL_LIVE);
    expect(Date.parse(body.expiresAt) - before).toBeGreaterThanOrEqual(TOKEN_TTL_MS - 50);
    expect(Date.parse(body.newSessionExpiresAt) - before).toBeGreaterThanOrEqual(NEW_SESSION_WINDOW_MS - 50);
    // The token must outlive the 5-minute voice cap.
    expect(TOKEN_TTL_MS).toBeGreaterThan(VOICE_HARD_CAP_MS);

    // v1alpha client, never the plain one.
    expect(mocks.genaiCtorOptions[0]).toMatchObject({
      apiKey: 'test-gemini-key',
      httpOptions: { apiVersion: 'v1alpha' },
    });

    const cfg = mocks.authTokensCreate.mock.calls[0][0].config;
    expect(cfg.uses).toBe(1);
    expect(cfg.expireTime).toBe(body.expiresAt);
    expect(cfg.newSessionExpireTime).toBe(body.newSessionExpiresAt);
    // Omitted on purpose → lock ALL LiveConnectConfig fields (SDK "Case 2").
    expect(cfg).not.toHaveProperty('lockAdditionalFields');
    const live = cfg.liveConnectConstraints;
    expect(live.model).toBe(MODEL_LIVE);
    expect(live.config.systemInstruction).toContain('# VOICE-MODE BEHAVIOUR');
    expect(live.config.systemInstruction).toContain(scenario.breed);
    expect(live.config.tools[0].functionDeclarations.map((f: { name: string }) => f.name)).toEqual([
      'updateEmotion',
      'endSimulation',
    ]);
    expect(live.config.responseModalities).toEqual(['AUDIO']);
    expect(live.config.speechConfig).toEqual({
      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
      languageCode: 'fr-CA',
    });
    expect(live.config.inputAudioTranscription).toEqual({});
    expect(live.config.outputAudioTranscription).toEqual({});
    // The opening line is a client message after connect, not prompt text.
    expect(live.config.systemInstruction).not.toContain('Bonjour!');

    const insert = sb.firstOp('ai_call_telemetry', 'insert')?.args[0] as Record<string, unknown>;
    expect(insert).toMatchObject({ call_type: 'voice', model_id: MODEL_LIVE, session_id: UUID, tokens_in: 0 });
  });

  it('applies preview overrides to the voice prompt', async () => {
    mocks.authTokensCreate.mockResolvedValueOnce({ name: 'auth_tokens/x' });
    await voiceToken(
      jsonRequest('ai-voice-token', {
        scenario,
        preview: true,
        promptOverrides: { promptSuffix: 'ALWAYS MENTION THE WEATHER' },
      }),
    );
    const live = mocks.authTokensCreate.mock.calls[0][0].config.liveConnectConstraints;
    expect(live.config.systemInstruction).toContain('ALWAYS MENTION THE WEATHER');
    expect(sb.callsFor('ai_call_telemetry')).toHaveLength(0);
  });

  it('answers 502 upstream when the mint fails or returns no name', async () => {
    mocks.authTokensCreate.mockResolvedValueOnce({});
    const noName = await voiceToken(jsonRequest('ai-voice-token', { scenario }));
    expect(noName.status).toBe(502);
    mocks.authTokensCreate.mockRejectedValueOnce(new Error('quota'));
    const failed = await voiceToken(jsonRequest('ai-voice-token', { scenario }, { ip: '198.51.100.2' }));
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ code: 'upstream' });
  });
});

describe('admin-scenario-ai', () => {
  const draft = { breed: 'Lab', pushback_id: 'cost', life_stage: 'Adult (3-7)', bogus: 'dropped' };

  it('returns 401 without a bearer token, with an AiErrorResponse body', async () => {
    const res = await scenarioAi(jsonRequest('admin-scenario-ai', { field: 'breed', draft }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'unauthorized' });
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin', async () => {
    sb.getUser.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
    sb.setHandler('profiles', () => ({ data: { is_admin: false, disabled: false }, error: null }));
    const res = await scenarioAi(
      jsonRequest('admin-scenario-ai', { field: 'breed', draft }, { headers: { authorization: 'Bearer t' } }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'unauthorized' });
  });

  function adminHeaders() {
    sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
    sb.setHandler('profiles', () => ({
      data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
      error: null,
    }));
    sb.setHandler('admin_roles', () => ({ data: [], error: null }));
    return { authorization: 'Bearer admin' };
  }

  it('rejects an unknown wizard field', async () => {
    const res = await scenarioAi(
      jsonRequest('admin-scenario-ai', { field: 'evil', draft }, { headers: adminHeaders() }),
    );
    expect(res.status).toBe(400);
  });

  it('suggests 3 options, grounded via in-process retrieval, whitelisting draft keys', async () => {
    mocks.retrieveChunks.mockResolvedValueOnce([
      { content: 'Owners   cite   cost first.', citation: 'Smith 2024', tags: null, similarity: 0.9 },
    ]);
    mocks.generateContent.mockResolvedValueOnce({
      text: JSON.stringify({ suggestions: ['a', 'b', 'c', 'd'] }),
    });
    const res = await scenarioAi(
      jsonRequest('admin-scenario-ai', { field: 'pushback_notes', draft }, { headers: adminHeaders() }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: ['a', 'b', 'c'] });
    expect(mocks.retrieveChunks).toHaveBeenCalledWith(
      'cost Lab Adult (3-7) owner pushback',
      expect.objectContaining({ k: 3 }),
    );
    const sys = mocks.generateContent.mock.calls[0][0].config.systemInstruction as string;
    expect(sys).toContain('Field to suggest: pushback_notes');
    expect(sys).toContain('- breed: Lab');
    expect(sys).not.toContain('bogus');
    expect(sys).toContain(
      'Research grounding (reflect these findings in your suggestions):\n- Owners cite cost first. [Smith 2024]',
    );
  });

  it('fails open when grounding errors', async () => {
    mocks.retrieveChunks.mockRejectedValueOnce(new Error('embed down'));
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify({ suggestions: ['x'] }) });
    const res = await scenarioAi(
      jsonRequest('admin-scenario-ai', { field: 'breed', draft: {} }, { headers: adminHeaders() }),
    );
    expect(res.status).toBe(200);
    const sys = mocks.generateContent.mock.calls[0][0].config.systemInstruction as string;
    expect(sys).not.toContain('Research grounding');
    expect(sys).toContain('(no fields filled in yet)');
  });
});
