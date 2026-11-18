// @vitest-environment node
/**
 * admin-objection-coaching — "Suggest hidden concerns and coaching" in the
 * objection editor. Pins: gating, required inputs, the category resolved on
 * the SERVER (its knowledge drives grounding, never the body), the species
 * scope, the normalised answer, the one retry, and that nothing is written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase } from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  generateContent: vi.fn(),
  createClient: vi.fn(),
  retrieveChunks: vi.fn(),
}));

vi.mock('@google/genai', () => {
  class MockGoogleGenAI {
    models = { generateContent: mocks.generateContent };
    constructor(_opts: unknown) {}
  }
  return {
    GoogleGenAI: MockGoogleGenAI,
    Type: { OBJECT: 'OBJECT', STRING: 'STRING', ARRAY: 'ARRAY' },
    ThinkingLevel: { LOW: 'LOW' },
  };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../_shared/retrieval', () => ({ retrieveChunks: mocks.retrieveChunks }));

import coachingFn from '../admin-objection-coaching';
import { __resetAiCaches, __resetRateLimits } from '../_shared/ai';
import { MODEL_TEXT } from '../../../src/shared/ai/models';

let sb: FakeSupabase;

function adminHeaders(profile: Record<string, unknown> = {}) {
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null, ...profile },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  return { authorization: 'Bearer admin' };
}

const CATEGORY_ROW = {
  id: 'category:urinary',
  name: 'Urinary health',
  name_fr: null,
  description: 'Prescription urinary diets for cats.',
  focus_area: 'urinary',
  knowledge_slugs: ['feline:urinary-guide'],
  sort_order: 1,
};

const BODY = {
  title: 'Urinary diet: “she hates the new food”',
  example: 'She walks away from the bowl.',
  species: ['cat'],
  categoryId: 'category:urinary',
};

const ANSWER = {
  rootConcerns: ['Afraid she will stop eating altogether', 'Feels guilty about the crystals'],
  acknowledgePatterns: ['It is hard to watch her refuse food.'],
  clarifyQuestions: ['What does she do when you put the bowl down?'],
  takeActionPatterns: ['Offer a gradual switch over a week.'],
  watchOuts: ['Insisting before asking what happens at mealtimes.'],
};

const request = (body: unknown, headers?: Record<string, string>) =>
  coachingFn(jsonRequest('admin-objection-coaching', body, { headers }));

beforeEach(() => {
  setFunctionEnv();
  __resetRateLimits();
  __resetAiCaches();
  sb = makeFakeSupabase();
  sb.setHandler('scenario_objection_categories', () => ({ data: [CATEGORY_ROW], error: null }));
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.generateContent.mockReset();
  mocks.retrieveChunks.mockReset();
  mocks.retrieveChunks.mockResolvedValue([
    { content: 'Mix old and new food over 7–10 days.', citation: 'RC feline urinary guide', docSlug: 'feline:urinary-guide' },
  ]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('admin-objection-coaching — gating', () => {
  it('401 without a token, 403 for a read-only role', async () => {
    expect((await request(BODY)).status).toBe(401);
    const headers = adminHeaders({ is_admin: false, admin_role: 'analyst' });
    const res = await request(BODY, headers);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain('scenarios.write');
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });

  it('400 without a name or the owner’s line', async () => {
    const headers = adminHeaders();
    const res = await request({ ...BODY, example: '  ' }, headers);
    expect(res.status).toBe(400);
    expect(mocks.generateContent).not.toHaveBeenCalled();
  });
});

describe('admin-objection-coaching — suggestions', () => {
  it('grounds on the category’s documents for that animal and returns cleaned lists', async () => {
    const headers = adminHeaders();
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(ANSWER) });
    const res = await request(BODY, headers);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.coaching.rootConcerns).toEqual(ANSWER.rootConcerns);
    expect(body.groundedOn).toBe(1);

    const [query, opts] = mocks.retrieveChunks.mock.calls[0];
    expect(query).toContain('she hates the new food');
    expect(opts.filters).toEqual({
      tool: 'roleplay',
      species: 'cat',
      docSlugs: ['feline:urinary-guide'],
      inheritedDocs: true,
      focus: 'urinary',
    });

    const call = mocks.generateContent.mock.calls[0][0];
    expect(call.model).toBe(MODEL_TEXT);
    expect(call.config.systemInstruction).toContain('category: Urinary health');
    expect(call.config.systemInstruction).toContain('animals: cats');
    expect(call.config.systemInstruction).toContain('Mix old and new food over 7–10 days.');
  });

  it('never takes the category from the body, and has no species scope for both animals', async () => {
    const headers = adminHeaders();
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(ANSWER) });
    await request(
      { ...BODY, species: ['dog', 'cat'], categoryId: 'category:unknown', category: { name: 'Injected' } },
      headers,
    );
    const [, opts] = mocks.retrieveChunks.mock.calls[0];
    expect(opts.filters).toEqual({ tool: 'roleplay' });
    const prompt = mocks.generateContent.mock.calls[0][0].config.systemInstruction as string;
    expect(prompt).toContain('category: none');
    expect(prompt).not.toContain('Injected');
  });

  it('still answers when retrieval fails (fail-open)', async () => {
    const headers = adminHeaders();
    mocks.retrieveChunks.mockRejectedValueOnce(new Error('rpc down'));
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(ANSWER) });
    const res = await request(BODY, headers);
    expect(res.status).toBe(200);
    expect((await res.json()).groundedOn).toBe(0);
  });

  it('retries once on an unusable answer, then 502s', async () => {
    const headers = adminHeaders();
    mocks.generateContent.mockResolvedValueOnce({ text: 'nope' });
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(ANSWER) });
    expect((await request(BODY, headers)).status).toBe(200);
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);

    mocks.generateContent.mockReset();
    mocks.generateContent.mockResolvedValue({ text: '{}' });
    const res = await request(BODY, headers);
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: 'upstream' });
  });

  it('writes nothing', async () => {
    const headers = adminHeaders();
    mocks.generateContent.mockResolvedValueOnce({ text: JSON.stringify(ANSWER) });
    await request(BODY, headers);
    const writes = sb.calls.flatMap((c) => c.ops).filter((o) => ['insert', 'upsert', 'update', 'delete'].includes(o.op));
    expect(writes).toEqual([]);
  });
});
