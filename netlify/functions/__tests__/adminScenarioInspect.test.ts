// @vitest-environment node
/**
 * admin-scenario-inspect — "what exactly will the AI customer be told, and
 * what will it read?". Pins: permission gating (`scenarios.read`), the
 * missing-fields path, that the returned prompt IS `buildCustomerSystemPrompt`
 * over the server-loaded config, that retrieval mirrors `retrieveForScenario`,
 * and the rag-disabled / include switches.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  jsonRequest,
  makeFakeSupabase,
  setFunctionEnv,
  type FakeSupabase,
} from './fakeSupabase';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  retrieveChunks: vi.fn(),
  retrieveChunksDetailed: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../_shared/retrieval', () => ({
  retrieveChunks: mocks.retrieveChunks,
  retrieveChunksDetailed: mocks.retrieveChunksDetailed,
}));

import inspect, {
  SNIPPET_MAX_CHARS,
  inspectDraft,
  inspectRetrievalFilters,
  knowledgeModeOf,
  noteOrNull,
  toPassage,
} from '../admin-scenario-inspect';
import { __resetAiCaches, __resetRateLimits, retrieveForScenario } from '../_shared/ai';
import { buildCustomerSystemPrompt } from '../../../src/data/knowledge/promptBuilders';
import type { SimulationConfig } from '../../../src/data/knowledge/simulationConfig';
import { scenarioRetrievalQuery } from '../../../src/shared/ai/retrievalQuery';
import { pickAgentDraft } from '../../../src/shared/ai/scenarioAgent';
import { draftToScenario } from '../../../src/shared/scenarios/draftToScenario';
import type { SupabaseClient } from '@supabase/supabase-js';

let sb: FakeSupabase;

function adminHeaders(profile: Record<string, unknown> = {}) {
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: {
      is_admin: true,
      disabled: false,
      admin_role: null,
      permission_overrides: null,
      ...profile,
    },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  return { authorization: 'Bearer admin' };
}

function withConfig(config: SimulationConfig) {
  sb.setHandler('simulation_config', () => ({ data: { config }, error: null }));
}

const request = (body: unknown, headers?: Record<string, string>) =>
  inspect(jsonRequest('admin-scenario-inspect', body, { headers }));

/** A complete dog draft — the Studio's unsaved working copy. */
const DRAFT = {
  scenario_id: 'admin:3f6c2a1e-8b7d-4c5e-9a10-2b3c4d5e6f70',
  species: 'dog',
  breed: 'Labrador Retriever',
  life_stage: 'Adult (3-7)',
  weight_kg: 41.5,
  pushback_id: 'weight-denial',
  pushback_notes: "He's not fat — he's just a big dog.",
  context_override: 'Buddy is six and weighs 41.5 kg — body condition 8/9.',
  suggested_driver: 'Activator',
  persona_override: 'Skeptical',
  difficulty_override: 3,
  opening_line_override: "Look, Buddy's not overweight.",
  knowledge_slugs: ['study:davies-2024'],
  prompt_prefix: '  Interrupt early if the staff member leads with a product.  ',
  prompt_suffix: 'Only agree once a recheck date is offered.',
};

const LONG_PASSAGE = `Owners respond to a written plan   and a recheck date.\n\n${'Evidence. '.repeat(120)}`;

function detailed(over: Record<string, unknown> = {}) {
  return {
    results: [
      {
        content: LONG_PASSAGE,
        citation: 'Davies et al., 2024',
        tags: { tools: ['roleplay'] },
        similarity: 0.8712,
        docSlug: 'study:davies-2024',
        docTitle: 'Owner preferences in weight conversations',
      },
      { content: 'Body condition 4–5 is ideal.', citation: null, tags: null, similarity: 0.71 },
    ],
    appliedFilter: { tools: ['roleplay'], species: ['dog'] },
    focusRelaxed: false,
    latencyMs: 12,
    ...over,
  };
}

beforeEach(() => {
  setFunctionEnv();
  __resetRateLimits();
  __resetAiCaches();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  mocks.retrieveChunks.mockReset();
  mocks.retrieveChunks.mockResolvedValue([]);
  mocks.retrieveChunksDetailed.mockReset();
  mocks.retrieveChunksDetailed.mockResolvedValue(detailed());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ── Gating ───────────────────────────────────────────────────────────────

describe('admin-scenario-inspect — gating', () => {
  it('returns 401 without a bearer token', async () => {
    const res = await request({ draft: DRAFT });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'unauthorized' });
    expect(mocks.retrieveChunksDetailed).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in non-admin, and for a role without scenarios.read', async () => {
    let res = await request({ draft: DRAFT }, adminHeaders({ is_admin: false }));
    expect(res.status).toBe(403);
    res = await request(
      { draft: DRAFT },
      adminHeaders({ is_admin: false, admin_role: 'analyst', permission_overrides: { revoke: ['scenarios.read'] } }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'unauthorized' });
    expect(body.error).toContain('scenarios.read');
  });

  it('lets a read-only role inspect (scenarios.read is enough)', async () => {
    const res = await request({ draft: DRAFT }, adminHeaders({ is_admin: false, admin_role: 'analyst' }));
    expect(res.status).toBe(200);
  });

  it('rejects a bad body with 400', async () => {
    const headers = adminHeaders();
    for (const body of [{}, { draft: 'Labrador' }, { draft: [DRAFT] }, '{not json']) {
      const res = await request(body, headers);
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: 'bad_request' });
    }
  });

  it('rate-limits at 30 calls a minute per IP', async () => {
    const headers = adminHeaders();
    for (let i = 0; i < 30; i++) expect((await request({ draft: {} }, headers)).status).toBe(200);
    expect((await request({ draft: {} }, headers)).status).toBe(429);
  });
});

// ── Missing fields ───────────────────────────────────────────────────────

describe('admin-scenario-inspect — an incomplete draft', () => {
  it('lists what is missing and builds nothing', async () => {
    const headers = adminHeaders();
    withConfig({ customerPromptSuffix: '  Keep replies short.  ', rag: { k: 6 } });
    const res = await request(
      { draft: { species: 'cat', breed: 'Persian', prompt_prefix: '  Be anxious.  ', focus_area: 'urinary' } },
      headers,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      missing: ['Life stage', 'Pushback', 'ECHO driver'],
      prompt: null,
      adminNotes: {
        scenarioPrefix: 'Be anxious.',
        scenarioSuffix: null,
        globalPrefix: null,
        globalSuffix: 'Keep replies short.',
      },
      knowledge: {
        enabled: true,
        k: 6,
        mode: 'focus',
        appliedFilter: {},
        focusRelaxed: false,
        passages: [],
      },
    });
    expect(mocks.retrieveChunksDetailed).not.toHaveBeenCalled();
  });

  it('an empty draft is missing every core field', async () => {
    const res = await request({ draft: {} }, adminHeaders());
    const body = await res.json();
    expect(body.missing).toEqual(['Breed', 'Life stage', 'Pushback', 'ECHO driver']);
    expect(body.knowledge.mode).toBe('library');
  });
});

// ── Happy path ───────────────────────────────────────────────────────────

describe('admin-scenario-inspect — a complete draft', () => {
  const config: SimulationConfig = {
    customerPromptPrefix: 'GLOBAL PREFIX NOTE',
    customerPromptSuffix: 'GLOBAL SUFFIX NOTE',
    rag: { k: 5 },
  };

  it('returns the exact customer prompt, the passages, and the applied scope', async () => {
    const headers = adminHeaders();
    withConfig(config);
    const res = await request({ draft: DRAFT }, headers);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();

    // The prompt is byte-for-byte what `ai-roleplay` builds for the Test
    // drive: the scenario from the raw draft, the draft's notes as the
    // preview overrides, the server-loaded config and the passages.
    const scenario = draftToScenario(DRAFT)!;
    const expected = buildCustomerSystemPrompt({
      scenario,
      overrides: { promptPrefix: DRAFT.prompt_prefix, promptSuffix: DRAFT.prompt_suffix },
      config,
      retrieved: detailed().results,
      locale: 'en',
      mode: 'text',
    });
    expect(body.prompt).toBe(expected);
    expect(body.prompt).toContain('# ADMIN NOTES');
    expect(body.prompt).toContain('GLOBAL PREFIX NOTE');
    expect(body.prompt).toContain('Interrupt early if the staff member leads with a product.');
    expect(body.prompt).toContain('# ADMIN ADDENDUM');
    expect(body.prompt).toContain('Only agree once a recheck date is offered.');
    expect(body.prompt).toContain('GLOBAL SUFFIX NOTE');
    expect(body.prompt).toContain('Labrador Retriever');
    expect(body.prompt).toContain('Owners respond to a written plan');

    expect(body.missing).toEqual([]);
    expect(body.adminNotes).toEqual({
      scenarioPrefix: 'Interrupt early if the staff member leads with a product.',
      scenarioSuffix: 'Only agree once a recheck date is offered.',
      globalPrefix: 'GLOBAL PREFIX NOTE',
      globalSuffix: 'GLOBAL SUFFIX NOTE',
    });
    expect(body.knowledge).toMatchObject({
      enabled: true,
      k: 5,
      mode: 'documents',
      appliedFilter: { tools: ['roleplay'], species: ['dog'] },
      focusRelaxed: false,
    });
    expect(body.knowledge.passages).toHaveLength(2);
    const [first, second] = body.knowledge.passages;
    expect(first).toMatchObject({
      slug: 'study:davies-2024',
      title: 'Owner preferences in weight conversations',
      citation: 'Davies et al., 2024',
      similarity: 0.8712,
    });
    expect(first.snippet.startsWith('Owners respond to a written plan and a recheck date. Evidence.')).toBe(true);
    expect(first.snippet).toHaveLength(SNIPPET_MAX_CHARS);
    expect(first.snippet.endsWith('…')).toBe(true);
    expect(second).toEqual({
      slug: null,
      title: null,
      citation: null,
      snippet: 'Body condition 4–5 is ideal.',
      similarity: 0.71,
    });

    // The roleplay retrieval: same query + k as retrieveForScenario, inside
    // the roleplay tool and the draft's species scope.
    expect(mocks.retrieveChunksDetailed).toHaveBeenCalledTimes(1);
    const [query, opts] = mocks.retrieveChunksDetailed.mock.calls[0];
    expect(query).toBe(scenarioRetrievalQuery(scenario));
    expect(opts).toMatchObject({
      k: 5,
      filters: { docSlugs: ['study:davies-2024'], species: 'dog', tool: 'roleplay' },
    });
    // Config came from the database; nothing was written.
    expect(sb.callsFor('simulation_config')).toHaveLength(1);
    const writes = sb.calls.flatMap((c) =>
      c.ops.filter((o) => ['insert', 'upsert', 'update', 'delete'].includes(o.op)),
    );
    expect(writes).toEqual([]);
  });

  it("keeps the admin's prose verbatim, so the prompt stays exact", async () => {
    const headers = adminHeaders();
    const raw = {
      ...DRAFT,
      context_override: `Buddy  is\tsix.  ${'Long history. '.repeat(150)}`,
      prompt_prefix: 'Two  spaces\there.',
    };
    const body = await (await request({ draft: raw }, headers)).json();
    const expected = buildCustomerSystemPrompt({
      scenario: draftToScenario(raw)!,
      overrides: { promptPrefix: raw.prompt_prefix, promptSuffix: raw.prompt_suffix },
      retrieved: detailed().results,
      locale: 'en',
      mode: 'text',
    });
    expect(body.prompt).toBe(expected);
    expect(body.prompt).toContain('Buddy  is\tsix.');
    expect(body.prompt).toContain('Two  spaces\there.');
    expect(body.adminNotes.scenarioPrefix).toBe('Two  spaces\there.');
  });

  it('never accepts a simulation config from the request', async () => {
    const headers = adminHeaders();
    withConfig({});
    const res = await request(
      { draft: DRAFT, config: { customerPromptPrefix: 'INJECTED', rag: { enabled: false } } },
      headers,
    );
    const body = await res.json();
    expect(body.prompt).not.toContain('INJECTED');
    expect(body.knowledge.enabled).toBe(true);
    expect(body.adminNotes.globalPrefix).toBeNull();
  });

  it('reports a relaxed focus and the focus mode', async () => {
    const headers = adminHeaders();
    mocks.retrieveChunksDetailed.mockResolvedValueOnce(
      detailed({ focusRelaxed: true, appliedFilter: { tools: ['roleplay'] } }),
    );
    const { knowledge_slugs: _drop, species: _legacy, ...rest } = DRAFT;
    const res = await request({ draft: { ...rest, focus_area: 'weight' } }, headers);
    const body = await res.json();
    expect(body.knowledge).toMatchObject({ mode: 'focus', focusRelaxed: true, appliedFilter: { tools: ['roleplay'] } });
    expect(mocks.retrieveChunksDetailed.mock.calls[0][1].filters).toEqual({ focus: 'weight', tool: 'roleplay' });
  });

  it('with research switched off: no retrieval, no passages, a prompt without a reference block', async () => {
    const headers = adminHeaders();
    withConfig({ rag: { enabled: false, k: 3 } });
    const res = await request({ draft: DRAFT }, headers);
    const body = await res.json();
    expect(mocks.retrieveChunksDetailed).not.toHaveBeenCalled();
    expect(body.knowledge).toEqual({
      enabled: false,
      k: 3,
      mode: 'documents',
      appliedFilter: {},
      focusRelaxed: false,
      passages: [],
    });
    expect(body.prompt).toContain('# PUSHBACK');
    expect(body.prompt).not.toContain('REFERENCE — WHAT RESEARCH SAYS');
  });

  it('include.prompt=false skips the prompt; include.knowledge=false skips the passages', async () => {
    const headers = adminHeaders();
    let body = await (await request({ draft: DRAFT, include: { prompt: false } }, headers)).json();
    expect(body.prompt).toBeNull();
    expect(body.knowledge.passages).toHaveLength(2);

    body = await (await request({ draft: DRAFT, include: { knowledge: false } }, headers)).json();
    expect(body.prompt).toContain('Owners respond to a written plan'); // still exact
    expect(body.knowledge.passages).toEqual([]);
    expect(body.knowledge.appliedFilter).toEqual({});

    mocks.retrieveChunksDetailed.mockClear();
    body = await (
      await request({ draft: DRAFT, include: { prompt: false, knowledge: false } }, headers)
    ).json();
    expect(mocks.retrieveChunksDetailed).not.toHaveBeenCalled();
    expect(body.prompt).toBeNull();
  });

  it('answers 500 in the AiErrorResponse shape on an unexpected failure', async () => {
    const headers = adminHeaders();
    mocks.retrieveChunksDetailed.mockRejectedValueOnce(new Error('boom'));
    const res = await request({ draft: DRAFT }, headers);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'server' });
  });
});

// ── Parity with the live roleplay retrieval ──────────────────────────────

describe('inspectRetrievalFilters', () => {
  const scenarioOf = (over: Record<string, unknown>) =>
    draftToScenario(pickAgentDraft({ ...DRAFT, knowledge_slugs: null, ...over }))!;

  it('matches retrieveForScenario for a legacy scenario (no species)', async () => {
    for (const over of [{}, { focus_area: 'weight' }, { knowledge_slugs: ['a:1', 'b:2'] }]) {
      const scenario = scenarioOf({ species: null, ...over });
      mocks.retrieveChunks.mockClear();
      await retrieveForScenario(sb.client as unknown as SupabaseClient, scenario, undefined, 'roleplay');
      const [liveQuery, liveOpts] = mocks.retrieveChunks.mock.calls[0];
      expect(scenarioRetrievalQuery(scenario)).toBe(liveQuery);
      expect(inspectRetrievalFilters(scenario)).toEqual(liveOpts.filters);
      expect(liveOpts.k).toBe(4);
    }
  });

  it('scopes by species when the scenario declares one', () => {
    expect(inspectRetrievalFilters(scenarioOf({ species: 'cat' }))).toEqual({ species: 'cat', tool: 'roleplay' });
    expect(inspectRetrievalFilters(scenarioOf({ species: 'dog' }))).toEqual({ species: 'dog', tool: 'roleplay' });
    expect(inspectRetrievalFilters(scenarioOf({ species: 'dog', life_stage: 'Puppy (<1)' }))).toEqual({
      species: 'puppy',
      tool: 'roleplay',
    });
    // A kitten stays in the cat scope.
    expect(inspectRetrievalFilters(scenarioOf({ species: 'cat', life_stage: 'Puppy (<1)' }))).toEqual({
      species: 'cat',
      tool: 'roleplay',
    });
    expect(
      inspectRetrievalFilters(scenarioOf({ species: 'cat', knowledge_slugs: ['x:1'], focus_area: 'urinary' })),
    ).toEqual({ docSlugs: ['x:1'], species: 'cat', tool: 'roleplay' });
  });
});

// ── Pure helpers ─────────────────────────────────────────────────────────

describe('helpers', () => {
  it('inspectDraft validates like pickAgentDraft but keeps valid prose as typed', () => {
    const d = inspectDraft({
      breed: 'Golden  Retriever',
      context_override: 'c'.repeat(3000),
      pushback_id: 'nope',
      suggested_driver: 'Rebel',
      opening_line_override: '   ',
      pushback_notes: 42,
      prompt_prefix: `  ${'p'.repeat(2000)}`,
      prompt_suffix: 7,
      is_admin: true,
    });
    expect(d.breed).toBe('Golden  Retriever');
    expect(d.context_override).toHaveLength(3000);
    expect(d.prompt_prefix).toHaveLength(1500);
    expect(d.prompt_prefix?.startsWith('  p')).toBe(true);
    for (const key of ['pushback_id', 'suggested_driver', 'opening_line_override', 'pushback_notes', 'prompt_suffix', 'is_admin']) {
      expect(d).not.toHaveProperty(key);
    }
  });

  it('noteOrNull trims, caps at 1500, and turns blank into null', () => {
    expect(noteOrNull('  hi  ')).toBe('hi');
    expect(noteOrNull('   ')).toBeNull();
    expect(noteOrNull(undefined)).toBeNull();
    expect(noteOrNull(12)).toBeNull();
    expect(noteOrNull('n'.repeat(2000))).toHaveLength(1500);
  });

  it('knowledgeModeOf: documents > focus > library', () => {
    expect(knowledgeModeOf({ knowledge_slugs: ['a'], focus_area: 'gi' })).toBe('documents');
    expect(knowledgeModeOf({ knowledge_slugs: [], focus_area: 'gi' })).toBe('focus');
    expect(knowledgeModeOf({})).toBe('library');
  });

  it('toPassage tolerates missing provenance and a non-finite similarity', () => {
    expect(
      toPassage({ content: ' a\n\nb ', citation: '', tags: null, similarity: Number.NaN }),
    ).toEqual({ slug: null, title: null, citation: null, snippet: 'a b', similarity: null });
  });
});
