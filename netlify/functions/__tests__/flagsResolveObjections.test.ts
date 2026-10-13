// @vitest-environment node
/**
 * flags-resolve end to end: the public snapshot carries the team's
 * objections in the public `TeamObjection` shape (retired ones included,
 * deleted ones never, authorship never) and the stored objection categories
 * (`objectionCategories`, public `ObjectionCategory` shape), and a project
 * that has not run 20261012000000_scenario_objections.sql still boots — with
 * none.
 *
 * Separate from flagsResolveOverrides.test.ts because this file mocks
 * `@supabase/supabase-js`, and the snapshot cache is module state: each test
 * re-imports the function so it starts cold.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase, setFunctionEnv, type FakeSupabase, type SbCall } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

let sb: FakeSupabase;

const ROW = {
  id: 'team:probiotics',
  title: 'Probiotics',
  example: '"He does not need them."',
  title_fr: 'Probiotiques',
  example_fr: null,
  species: ['dog', 'cat'],
  category_id: 'category:probiotics',
  coaching: {
    rootConcerns: ['Thinks it is a cash grab'],
    watchOuts: ['Pitching before asking'],
    acknowledgePatterns: ['That is a fair question to ask.'],
  },
  visible: false,
  sort_order: 3,
  updated_at: '2026-10-12T10:00:00+00:00',
  created_by: 'admin-uuid',
  updated_by: 'admin-uuid',
};

const CATEGORY_ROW = {
  id: 'category:probiotics',
  name: 'Probiotics',
  name_fr: 'Probiotiques',
  description: 'Gut-health supplements.',
  focus_area: 'gi',
  knowledge_slugs: ['study:probiotics-1'],
  sort_order: 40,
  updated_at: '2026-10-12T10:00:00+00:00',
  created_by: 'admin-uuid',
  updated_by: 'admin-uuid',
};

async function resolve(): Promise<Record<string, unknown>> {
  vi.resetModules();
  const { default: handler } = await import('../flags-resolve');
  const res = await handler(
    new Request('http://localhost/.netlify/functions/flags-resolve', { method: 'POST', body: '{}' }),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  sb.setHandler('flags', () => ({ data: [], error: null }));
  sb.setHandler('flag_rules', () => ({ data: [], error: null }));
  sb.setHandler('scenario_overrides', () => ({ data: [], error: null }));
  sb.setHandler('simulation_config', () => ({ data: null, error: null }));
});

describe('flags-resolve — objections in the public snapshot', () => {
  it('publishes non-deleted objections, retired included, in the public shape only', async () => {
    sb.setHandler('scenario_objections', () => ({
      data: [ROW, { ...ROW, id: 'not-a-team-id' }],
      error: null,
    }));
    const body = await resolve();
    expect(body.objections).toEqual([
      {
        id: 'team:probiotics',
        title: 'Probiotics',
        example: '"He does not need them."',
        titleFr: 'Probiotiques',
        exampleFr: null,
        species: ['dog', 'cat'],
        categoryId: 'category:probiotics',
        // Only the trainee hint lists are public; what the AI owner hides
        // until asked (rootConcerns) and the watch-outs stay server-side.
        coaching: { acknowledgePatterns: ['That is a fair question to ask.'] },
        coachingFr: {},
        visible: false,
        sortOrder: 3,
        updatedAt: '2026-10-12T10:00:00+00:00',
      },
    ]);
    // Only live rows are asked for; authorship is never selected.
    const call = sb.callsFor('scenario_objections')[0] as SbCall;
    expect(call.ops.find((o) => o.op === 'is')?.args).toEqual(['deleted_at', null]);
    expect(String(call.ops.find((o) => o.op === 'select')?.args[0])).not.toMatch(/created_by|updated_by/);
    expect(JSON.stringify(body)).not.toContain('admin-uuid');
    expect(JSON.stringify(body)).not.toContain('cash grab');
    expect(JSON.stringify(body)).not.toContain('Pitching before asking');
  });

  it('publishes the French hint lists (stored as coaching.fr) as coachingFr — hints only', async () => {
    sb.setHandler('scenario_objections', () => ({
      data: [
        {
          ...ROW,
          coaching: {
            ...ROW.coaching,
            fr: {
              acknowledgePatterns: ['C’est une bonne question.'],
              takeActionPatterns: ['Proposer un essai de 4 semaines.'],
              // Never public, even if a row carries it under `fr`.
              rootConcerns: ['Croit que c’est une arnaque'],
              watchOuts: ['Vendre avant de demander'],
            },
          },
        },
      ],
      error: null,
    }));
    const body = await resolve();
    const [entry] = body.objections as Array<Record<string, unknown>>;
    expect(entry.coaching).toEqual({ acknowledgePatterns: ['That is a fair question to ask.'] });
    expect(entry.coachingFr).toEqual({
      acknowledgePatterns: ['C’est une bonne question.'],
      takeActionPatterns: ['Proposer un essai de 4 semaines.'],
    });
    const json = JSON.stringify(body);
    expect(json).not.toContain('arnaque');
    expect(json).not.toContain('Vendre avant');
    expect(json).not.toContain('"fr"');
  });

  it('publicObjection keeps only the three hint lists in both languages', async () => {
    vi.resetModules();
    const { publicObjection } = await import('../flags-resolve');
    const out = publicObjection({
      id: 'team:probiotics',
      title: 'Probiotics',
      example: '',
      titleFr: null,
      exampleFr: null,
      species: ['dog'],
      categoryId: 'weight',
      coaching: { rootConcerns: ['secret'], clarifyQuestions: ['Q?'], watchOuts: ['w'] },
      // A hand-built objection could carry more than the type allows.
      coachingFr: { clarifyQuestions: ['Q ?'], rootConcerns: ['secret fr'] } as never,
      visible: true,
      sortOrder: null,
      updatedAt: null,
    });
    expect(out.coaching).toEqual({ clarifyQuestions: ['Q?'] });
    expect(out.coachingFr).toEqual({ clarifyQuestions: ['Q ?'] });
  });

  it('does not cache a snapshot built on a failed cold objections read', async () => {
    vi.resetModules();
    const mod = await import('../flags-resolve');
    let fail = true;
    sb.setHandler('scenario_objections', () =>
      fail
        ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
        : { data: [ROW], error: null },
    );
    const call = () =>
      mod.default(new Request('http://localhost/.netlify/functions/flags-resolve', { method: 'POST', body: '{}' }));
    const first = await call();
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(((await first.json()) as { objections: unknown[] }).objections).toEqual([]);
    // The very next request reads again instead of serving the empty list.
    fail = false;
    const second = await call();
    expect(second.headers.get('cache-control')).toBe('public, max-age=30');
    expect(((await second.json()) as { objections: unknown[] }).objections).toHaveLength(1);
  });

  it('boots with no objections while the migration is pending', async () => {
    sb.setHandler('scenario_objections', () => ({
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.scenario_objections' in the schema cache",
      },
    }));
    sb.setHandler('scenario_objection_categories', () => ({
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.scenario_objection_categories' in the schema cache",
      },
    }));
    const body = await resolve();
    expect(body.objections).toEqual([]);
    expect(body.objectionCategories).toEqual([]);
    expect(body.flags).toEqual({});
  });
});

describe('flags-resolve — objection categories in the public snapshot', () => {
  it('publishes the stored, non-deleted categories in the public shape only', async () => {
    sb.setHandler('scenario_objection_categories', () => ({
      data: [
        CATEGORY_ROW,
        // An admin's edit of a built-in category rides along (clients merge it).
        { ...CATEGORY_ROW, id: 'weight', name: 'Weight & obesity', name_fr: null, knowledge_slugs: [], sort_order: 20 },
        { ...CATEGORY_ROW, id: 'not a category id' },
      ],
      error: null,
    }));
    const body = await resolve();
    expect(body.objectionCategories).toEqual([
      {
        id: 'weight',
        name: 'Weight & obesity',
        nameFr: null,
        description: 'Gut-health supplements.',
        focusArea: 'gi',
        knowledgeSlugs: [],
        sortOrder: 20,
        builtIn: true,
        updatedAt: '2026-10-12T10:00:00+00:00',
      },
      {
        id: 'category:probiotics',
        name: 'Probiotics',
        nameFr: 'Probiotiques',
        description: 'Gut-health supplements.',
        focusArea: 'gi',
        knowledgeSlugs: ['study:probiotics-1'],
        sortOrder: 40,
        builtIn: false,
        updatedAt: '2026-10-12T10:00:00+00:00',
      },
    ]);
    const call = sb.callsFor('scenario_objection_categories')[0] as SbCall;
    expect(call.ops.find((o) => o.op === 'is')?.args).toEqual(['deleted_at', null]);
    expect(String(call.ops.find((o) => o.op === 'select')?.args[0])).not.toMatch(/created_by|updated_by/);
    expect(JSON.stringify(body)).not.toContain('admin-uuid');
  });

  it('does not cache a snapshot built on a failed cold categories read (objections fine)', async () => {
    vi.resetModules();
    const mod = await import('../flags-resolve');
    let fail = true;
    sb.setHandler('scenario_objections', () => ({ data: [ROW], error: null }));
    sb.setHandler('scenario_objection_categories', () =>
      fail
        ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
        : { data: [CATEGORY_ROW], error: null },
    );
    const call = () =>
      mod.default(new Request('http://localhost/.netlify/functions/flags-resolve', { method: 'POST', body: '{}' }));
    const first = await call();
    expect(first.headers.get('cache-control')).toBe('no-store');
    const firstBody = (await first.json()) as { objections: unknown[]; objectionCategories: unknown[] };
    expect(firstBody.objectionCategories).toEqual([]);
    expect(firstBody.objections).toHaveLength(1);
    // The very next request reads again instead of serving the empty list.
    fail = false;
    const second = await call();
    expect(second.headers.get('cache-control')).toBe('public, max-age=30');
    expect(((await second.json()) as { objectionCategories: unknown[] }).objectionCategories).toHaveLength(1);
  });
});
