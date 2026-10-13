// @vitest-environment node
/**
 * `admin-objections` — team-authored objections and their categories. Pins:
 * permission gating, the list (+ usage, + soft-deleted on request, + the
 * merged categories with their usage), id allocation, validation, the
 * category-must-exist rule, the live caps, optimistic concurrency, the "in
 * use" delete refusals, restore, built-in category edits, the document check
 * (`_dropped`), the audit trail, and the degrade path while the migration is
 * pending.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  jsonRequest,
  makeFakeSupabase,
  setFunctionEnv,
  type FakeSupabase,
  type SbCall,
  type SbResult,
} from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler, {
  BUILT_IN_CATEGORY_DELETE_MESSAGE,
  CATEGORY_GONE_MESSAGE,
  MIGRATION_NEEDED_MESSAGE,
  OBJECTIONS_TABLE_MISSING,
  adminCategories,
  categoryNameClash,
  categoryUsage,
  titleClash,
  toAdminCategory,
  toAdminObjection,
} from '../admin-objections';
import { OBJECTION_LIMITS } from '../../../src/shared/scenarios/objections';
import { BUILT_IN_CATEGORIES, CATEGORY_LIMITS } from '../../../src/shared/scenarios/objectionCategories';

type Bag = Record<string, unknown>;

let sb: FakeSupabase;

const T0 = '2026-10-12T09:00:00.000000+00:00';
const T1 = '2026-10-12T10:00:00.000000+00:00';

/** PostgREST's answer while 20261012000000_scenario_objections.sql is pending. */
const PGRST205 = {
  code: 'PGRST205',
  message: "Could not find the table 'public.scenario_objections' in the schema cache",
};
const PGRST205_CATEGORIES = {
  code: 'PGRST205',
  message: "Could not find the table 'public.scenario_objection_categories' in the schema cache",
};

function objectionRow(over: Bag = {}): Bag {
  return {
    id: 'team:probiotics',
    title: "Probiotics: 'my dog doesn't need them'",
    example: '"He has a healthy gut already."',
    title_fr: null,
    example_fr: null,
    species: ['dog', 'cat'],
    category_id: 'category:probiotics',
    coaching: { rootConcerns: ['Thinks supplements are a cash grab'] },
    visible: true,
    sort_order: null,
    created_at: T0,
    updated_at: T0,
    deleted_at: null,
    ...over,
  };
}

function categoryRow(over: Bag = {}): Bag {
  return {
    id: 'category:probiotics',
    name: 'Probiotics',
    name_fr: null,
    description: 'Gut-health supplements.',
    focus_area: 'gi',
    knowledge_slugs: [],
    sort_order: null,
    created_by: 'admin-0',
    updated_by: 'admin-0',
    created_at: T0,
    updated_at: T0,
    deleted_at: null,
    ...over,
  };
}

/**
 * A tiny in-memory table: applies eq / is / in filters, insert, update and
 * (maybe)single over `rows`, so the handler talks to something that behaves
 * like PostgREST rather than to canned answers.
 */
function table(rows: Bag[], opts: { failWith?: SbResult['error']; updatedAt?: string } = {}) {
  return (call: SbCall): SbResult => {
    if (opts.failWith) return { data: null, error: opts.failWith };
    const filters = call.ops.filter((o) => o.op === 'eq' || o.op === 'is' || o.op === 'in');
    const match = (r: Bag) =>
      filters.every((f) => {
        const [col, val] = f.args as [string, unknown];
        if (f.op === 'eq') return r[col] === val;
        if (f.op === 'is') return (r[col] ?? null) === val;
        return (val as unknown[]).includes(r[col]);
      });
    const single = call.ops.some((o) => o.op === 'maybeSingle' || o.op === 'single');
    const insert = call.ops.find((o) => o.op === 'insert');
    if (insert) {
      const row = { created_at: T1, updated_at: T1, deleted_at: null, ...(insert.args[0] as Bag) };
      rows.push(row);
      const copy = structuredClone(row);
      return { data: single ? copy : [copy], error: null };
    }
    const update = call.ops.find((o) => o.op === 'update');
    const hit = rows.filter(match);
    if (update) {
      for (const r of hit) Object.assign(r, update.args[0] as Bag, { updated_at: opts.updatedAt ?? T1 });
    }
    // A read is a COPY, as over the wire — never a live reference to the row.
    const copies = hit.map((r) => structuredClone(r));
    return { data: single ? (copies[0] ?? null) : copies, error: null };
  };
}

function writes(name: string): Array<{ op: string; payload: Bag; call: SbCall }> {
  const out: Array<{ op: string; payload: Bag; call: SbCall }> = [];
  for (const call of sb.callsFor(name)) {
    for (const op of call.ops) {
      if (op.op === 'insert' || op.op === 'update' || op.op === 'upsert' || op.op === 'delete') {
        out.push({ op: op.op, payload: op.args[0] as Bag, call });
      }
    }
  }
  return out;
}

function auditRows(): Bag[] {
  return writes('admin_audit_log').map((w) => w.payload);
}

function signedIn(profile: Bag = {}) {
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null, ...profile },
    error: null,
  }));
}

const auth = { authorization: 'Bearer admin' };
const get = (query = '') =>
  handler(
    new Request(`http://localhost/.netlify/functions/admin-objections${query}`, { headers: auth }),
  );
const post = (body: unknown) => handler(jsonRequest('admin-objections', body, { headers: auth }));

const NEW = {
  title: 'Feline urinary diet doubts',
  example: '"She hates the new food."',
  species: ['cat'],
  categoryId: 'prescription-diets',
  coaching: { rootConcerns: ['Worried she will stop eating'], watchOuts: ['Leading with price'] },
};

let objections: Bag[];
let overrides: Bag[];
let categories: Bag[];
let documents: Bag[];

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  signedIn();
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  sb.setHandler('admin_audit_log', () => ({ data: null, error: null }));
  objections = [objectionRow()];
  overrides = [];
  categories = [categoryRow()];
  documents = [
    { slug: 'study:probiotics-1', deleted_at: null },
    { slug: 'study:probiotics-2', deleted_at: null },
    { slug: 'study:deleted', deleted_at: T0 },
  ];
  sb.setHandler('scenario_objections', table(objections));
  sb.setHandler('scenario_overrides', table(overrides));
  sb.setHandler('scenario_objection_categories', table(categories));
  sb.setHandler('knowledge_documents', table(documents));
});

// ── Gating ───────────────────────────────────────────────────────────────

describe('admin-objections — gating', () => {
  it('401 without a token, 403 for a non-admin', async () => {
    const res = await handler(new Request('http://localhost/.netlify/functions/admin-objections'));
    expect(res.status).toBe(401);
    signedIn({ is_admin: false });
    expect((await get()).status).toBe(403);
  });

  it('a read-only role may list but not write (scenarios.write)', async () => {
    signedIn({ is_admin: false, admin_role: 'analyst' });
    expect((await get()).status).toBe(200);
    const res = await post({ op: 'upsert', objection: NEW });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Missing permission: scenarios.write' });
    expect(writes('scenario_objections')).toHaveLength(0);
  });

  it('rejects other methods, bad JSON, an oversized body and an unknown op', async () => {
    const put = await handler(
      new Request('http://localhost/.netlify/functions/admin-objections', { method: 'PUT', headers: auth }),
    );
    expect(put.status).toBe(405);
    expect((await post('{nope')).status).toBe(400);
    expect((await post({ op: 'upsert', objection: { ...NEW, example: 'x'.repeat(40 * 1024) } })).status).toBe(413);
    expect((await post({ op: 'explode' })).status).toBe(400);
    expect((await post({ objection: NEW })).status).toBe(400);
  });
});

// ── GET ──────────────────────────────────────────────────────────────────

describe('admin-objections — GET', () => {
  it('lists live objections, sorted, with how many scenarios use them', async () => {
    objections.push(
      objectionRow({ id: 'team:alpha', title: 'Alpha topic', sort_order: 1 }),
      objectionRow({ id: 'team:retired', title: 'Retired topic', visible: false }),
      objectionRow({ id: 'team:gone', title: 'Gone topic', deleted_at: T1 }),
    );
    overrides.push(
      { scenario_id: 'admin:a', pushback_id: 'team:probiotics', visible: true, deleted_at: null },
      { scenario_id: 'admin:b', pushback_id: 'team:probiotics', visible: false, deleted_at: null },
      { scenario_id: 'admin:c', pushback_id: 'team:probiotics', visible: true, deleted_at: T1 },
      { scenario_id: 'seed:1', pushback_id: 'cost', visible: true, deleted_at: null },
    );
    // Two trainees built their own scenario on it (counted, never blocking).
    sb.setHandler(
      'user_scenarios',
      table([
        { id: 'u1', pushback_id: 'team:probiotics' },
        { id: 'u2', pushback_id: 'team:probiotics' },
        { id: 'u3', pushback_id: 'cost' },
      ]),
    );
    const res = await get();
    expect(res.status).toBe(200);
    const { objections: list } = (await res.json()) as { objections: Bag[] };
    // sort_order first, then by name; soft-deleted left out; retired kept.
    expect(list.map((o) => o.id)).toEqual(['team:alpha', 'team:probiotics', 'team:retired']);
    const probiotics = list.find((o) => o.id === 'team:probiotics')!;
    expect(probiotics).toMatchObject({
      title: "Probiotics: 'my dog doesn't need them'",
      species: ['dog', 'cat'],
      categoryId: 'category:probiotics',
      coaching: { rootConcerns: ['Thinks supplements are a cash grab'] },
      visible: true,
      createdAt: T0,
      updatedAt: T0,
      deletedAt: null,
      usage: { scenarios: 2, live: 1, trainee: 2 },
    });
    expect(list.find((o) => o.id === 'team:retired')).toMatchObject({ visible: false, usage: { scenarios: 0, live: 0 } });
    // Authorship never leaves the server.
    expect(probiotics).not.toHaveProperty('created_by');
    expect(probiotics).not.toHaveProperty('focusArea');
  });

  it('?deleted=1 also returns soft-deleted objections, so the editor can offer Restore', async () => {
    objections.push(objectionRow({ id: 'team:gone', title: 'Gone topic', deleted_at: T1 }));
    const { objections: list } = (await (await get('?deleted=1')).json()) as { objections: Bag[] };
    expect(list.find((o) => o.id === 'team:gone')).toMatchObject({ deletedAt: T1 });
  });

  it('answers 200 with no objections, the built-in categories and a notice while the migration is pending', async () => {
    const builtIns = BUILT_IN_CATEGORIES.map((c) => ({
      ...c,
      createdAt: null,
      deletedAt: null,
      customised: false,
      usage: { objections: 0, scenarios: 0 },
    }));
    sb.setHandler('scenario_objections', table([], { failWith: PGRST205 }));
    let res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ objections: [], categories: builtIns, _notice: OBJECTIONS_TABLE_MISSING });
    // Either table missing is the same state (one migration).
    sb.setHandler('scenario_objections', table(objections));
    sb.setHandler('scenario_objection_categories', table([], { failWith: PGRST205_CATEGORIES }));
    res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ objections: [], categories: builtIns, _notice: OBJECTIONS_TABLE_MISSING });
  });

  it('any other database error is a 500', async () => {
    sb.setHandler('scenario_objections', table([], { failWith: { code: '57014', message: 'timeout' } }));
    expect((await get()).status).toBe(500);
    sb.setHandler('scenario_objections', table(objections));
    sb.setHandler('scenario_objection_categories', table([], { failWith: { code: '57014', message: 'timeout' } }));
    expect((await get()).status).toBe(500);
  });
});

// ── POST upsert: create ──────────────────────────────────────────────────

describe('admin-objections — create', () => {
  it('allocates a team: id from the title, stamps the author, audits, and answers with the objection', async () => {
    const res = await post({ op: 'upsert', objection: NEW });
    expect(res.status).toBe(200);
    const { objection } = (await res.json()) as { objection: Bag };
    expect(objection).toMatchObject({
      id: 'team:feline-urinary-diet-doubts',
      title: 'Feline urinary diet doubts',
      species: ['cat'],
      categoryId: 'prescription-diets',
      visible: true,
      usage: { scenarios: 0, live: 0 },
    });
    const [ins] = writes('scenario_objections');
    expect(ins.op).toBe('insert');
    expect(ins.payload).toMatchObject({
      id: 'team:feline-urinary-diet-doubts',
      species: ['cat'],
      category_id: 'prescription-diets',
      coaching: { rootConcerns: ['Worried she will stop eating'], watchOuts: ['Leading with price'] },
      created_by: 'admin-1',
      updated_by: 'admin-1',
    });
    // Server-owned columns are never taken from the request.
    expect(ins.payload).not.toHaveProperty('deleted_at');
    expect(ins.payload).not.toHaveProperty('focus_area');
    expect(auditRows()).toEqual([
      expect.objectContaining({ entity_type: 'scenario_objection', entity_id: 'team:feline-urinary-diet-doubts', action: 'create' }),
    ]);
  });

  it('never reuses an id — not even a deleted one (Restore must still work)', async () => {
    objections.push(objectionRow({ id: 'team:feline-urinary-diet-doubts', title: 'Old', deleted_at: T0 }));
    const { objection } = (await (await post({ op: 'upsert', objection: NEW })).json()) as { objection: Bag };
    expect(objection.id).toBe('team:feline-urinary-diet-doubts-2');
  });

  it('ignores server-owned fields smuggled into the objection', async () => {
    await post({
      op: 'upsert',
      objection: { ...NEW, created_by: 'someone', deleted_at: T0, updated_at: T0, usage: { scenarios: 9 } },
    });
    const [ins] = writes('scenario_objections');
    expect(ins.payload.created_by).toBe('admin-1');
    expect(ins.payload).not.toHaveProperty('deleted_at');
    expect(ins.payload).not.toHaveProperty('updated_at');
    expect(ins.payload).not.toHaveProperty('usage');
  });

  it('explains what is wrong (400) and writes nothing', async () => {
    for (const [objection, message] of [
      [{ ...NEW, title: '  ' }, 'Give the objection a short name.'],
      [{ ...NEW, example: '' }, 'Add the line an owner would typically say.'],
      [{ ...NEW, species: [] }, 'Choose which animals this objection applies to (dog, cat or both).'],
      [{ ...NEW, species: ['hamster'] }, 'Choose which animals this objection applies to (dog, cat or both).'],
      [{ ...NEW, categoryId: undefined }, 'Choose the category this objection belongs to, e.g. Probiotics.'],
      [{ ...NEW, categoryId: 'Probiotics' }, 'Choose the category this objection belongs to, e.g. Probiotics.'],
    ] as const) {
      const res = await post({ op: 'upsert', objection });
      expect(res.status).toBe(400);
      expect(((await res.json()) as Bag).error).toBe(message);
    }
    expect((await post({ op: 'upsert', objection: 'Probiotics' })).status).toBe(400);
    expect(writes('scenario_objections')).toHaveLength(0);
  });

  it('refuses a name a built-in or another live objection already has', async () => {
    let res = await post({ op: 'upsert', objection: { ...NEW, title: 'cost / PRICE pushback' } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Bag).error).toContain('"Cost / price pushback" already exists');
    res = await post({ op: 'upsert', objection: { ...NEW, title: "probiotics:  'my dog doesn't need them'" } });
    expect(res.status).toBe(400);
    expect(writes('scenario_objections')).toHaveLength(0);
    // A deleted objection's name is free again.
    objections[0].deleted_at = T1;
    res = await post({ op: 'upsert', objection: { ...NEW, title: "Probiotics: 'my dog doesn't need them'" } });
    expect(res.status).toBe(200);
  });

  it('files it only under a category that exists: a built-in, or a live team category', async () => {
    categories.push(categoryRow({ id: 'category:old', name: 'Old', deleted_at: T0 }));
    for (const categoryId of ['category:nothing-here', 'category:old']) {
      const res = await post({ op: 'upsert', objection: { ...NEW, categoryId } });
      expect(res.status, categoryId).toBe(400);
      expect(((await res.json()) as Bag).error).toBe(CATEGORY_GONE_MESSAGE);
    }
    expect(writes('scenario_objections')).toHaveLength(0);
    // A live team category, and every built-in, are fine (built-ins need no row).
    expect((await post({ op: 'upsert', objection: { ...NEW, categoryId: 'category:probiotics' } })).status).toBe(200);
    expect(
      (await post({ op: 'upsert', objection: { ...NEW, title: 'Another', categoryId: 'weight' } })).status,
    ).toBe(200);
  });

  it('a missing categories table is the migration message, another read error a 500 — never "pick another"', async () => {
    sb.setHandler('scenario_objection_categories', table([], { failWith: PGRST205_CATEGORIES }));
    let res = await post({ op: 'upsert', objection: { ...NEW, categoryId: 'category:probiotics' } });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: MIGRATION_NEEDED_MESSAGE });
    sb.setHandler('scenario_objection_categories', table([], { failWith: { code: '57014', message: 'timeout' } }));
    res = await post({ op: 'upsert', objection: { ...NEW, categoryId: 'category:probiotics' } });
    expect(res.status).toBe(500);
    expect(writes('scenario_objections')).toHaveLength(0);
  });

  it(`stops at ${OBJECTION_LIMITS.maxTeamObjections} live objections (409 limit)`, async () => {
    for (let i = objections.length; i < OBJECTION_LIMITS.maxTeamObjections; i++) {
      objections.push(objectionRow({ id: `team:topic-${i}`, title: `Topic ${i}` }));
    }
    const res = await post({ op: 'upsert', objection: NEW });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).code).toBe('limit');
    // Deleted ones don't count.
    objections[5].deleted_at = T1;
    expect((await post({ op: 'upsert', objection: NEW })).status).toBe(200);
  });

  it('creates with a supplied team: id, and refuses a malformed or over-long one', async () => {
    const res = await post({ op: 'upsert', objection: { ...NEW, id: 'team:cat-urinary' } });
    expect(res.status).toBe(200);
    expect(writes('scenario_objections')[0].payload.id).toBe('team:cat-urinary');

    for (const id of ['cost', 'team:Bad Id', 'admin:x', `team:${'a'.repeat(56)}`, 42]) {
      const bad = await post({ op: 'upsert', objection: { ...NEW, id } });
      expect(bad.status, String(id)).toBe(400);
    }
  });

  it('a duplicate-key race is a 409, a CHECK violation a 400', async () => {
    sb.setHandler('scenario_objections', (call) =>
      call.ops.some((o) => o.op === 'insert')
        ? { data: null, error: { code: '23505', message: 'duplicate key' } }
        : table(objections)(call),
    );
    expect((await post({ op: 'upsert', objection: NEW })).status).toBe(409);
    sb.setHandler('scenario_objections', (call) =>
      call.ops.some((o) => o.op === 'insert')
        ? { data: null, error: { code: '23514', message: 'violates check' } }
        : table(objections)(call),
    );
    expect((await post({ op: 'upsert', objection: NEW })).status).toBe(400);
    expect(auditRows()).toHaveLength(0);
  });
});

// ── POST upsert: update ──────────────────────────────────────────────────

describe('admin-objections — update', () => {
  const edit = (over: Bag = {}) => ({
    id: 'team:probiotics',
    title: 'Probiotics: "a waste of money"',
    example: '"Probiotics are a fad."',
    species: ['dog'],
    categoryId: 'category:probiotics',
    visible: false,
    coaching: { rootConcerns: ['Sceptical of supplements'] },
    ...over,
  });

  it('updates the live row behind the tombstone and timestamp guards, and audits before/after', async () => {
    overrides.push({ scenario_id: 'admin:a', pushback_id: 'team:probiotics', visible: true, deleted_at: null });
    const res = await post({ op: 'upsert', objection: edit(), baseUpdatedAt: T0 });
    expect(res.status).toBe(200);
    const { objection } = (await res.json()) as { objection: Bag };
    expect(objection).toMatchObject({
      id: 'team:probiotics',
      title: 'Probiotics: "a waste of money"',
      visible: false,
      species: ['dog'],
      updatedAt: T1,
      usage: { scenarios: 1, live: 1 },
    });
    const [upd] = writes('scenario_objections');
    expect(upd.op).toBe('update');
    expect(upd.payload).toMatchObject({
      title: 'Probiotics: "a waste of money"',
      visible: false,
      category_id: 'category:probiotics',
      updated_by: 'admin-1',
    });
    expect(upd.payload).not.toHaveProperty('created_by');
    expect(upd.payload).not.toHaveProperty('id');
    const guards = upd.call.ops.filter((o) => o.op === 'eq' || o.op === 'is').map((o) => o.args);
    expect(guards).toEqual([
      ['id', 'team:probiotics'],
      ['deleted_at', null],
      ['updated_at', T0],
    ]);
    const [audit] = auditRows();
    expect(audit).toMatchObject({ entity_type: 'scenario_objection', action: 'update', entity_id: 'team:probiotics' });
    expect((audit.before as Bag).title).toBe("Probiotics: 'my dog doesn't need them'");
  });

  it('may keep its own name', async () => {
    const res = await post({ op: 'upsert', objection: edit({ title: "Probiotics: 'my dog doesn't need them'" }) });
    expect(res.status).toBe(200);
  });

  it('refuses a stale edit (409 stale) and returns the version that won', async () => {
    const res = await post({ op: 'upsert', objection: edit(), baseUpdatedAt: '2026-10-01T00:00:00+00:00' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; current: Bag };
    expect(body.code).toBe('stale');
    expect(body.current).toMatchObject({ id: 'team:probiotics', updatedAt: T0 });
    expect(writes('scenario_objections')).toHaveLength(0);
  });

  it('an edit that lands between the read and the write is caught by the guard', async () => {
    sb.setHandler('scenario_objections', (call) =>
      call.ops.some((o) => o.op === 'update') ? { data: null, error: null } : table(objections)(call),
    );
    const res = await post({ op: 'upsert', objection: edit(), baseUpdatedAt: T0 });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).code).toBe('stale');
    expect(auditRows()).toHaveLength(0);
  });

  it('a save without the token still works (no concurrency check requested)', async () => {
    const res = await post({ op: 'upsert', objection: edit() });
    expect(res.status).toBe(200);
    const [upd] = writes('scenario_objections');
    expect(upd.call.ops.filter((o) => o.op === 'eq').map((o) => o.args[0])).toEqual(['id']);
  });

  it('refuses to edit a soft-deleted objection (409 deleted)', async () => {
    objections[0].deleted_at = T1;
    const res = await post({ op: 'upsert', objection: edit() });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).code).toBe('deleted');
    expect(writes('scenario_objections')).toHaveLength(0);
  });
});

// ── French hint lists (stored as coaching.fr) ────────────────────────────

describe('admin-objections — French hint lists', () => {
  const FR = {
    acknowledgePatterns: ['C’est une bonne question.'],
    clarifyQuestions: ['Qu’avez-vous remarqué?'],
  };

  it('a create stores coachingFr inside coaching as `fr` and answers with coachingFr', async () => {
    const res = await post({ op: 'upsert', objection: { ...NEW, coachingFr: FR } });
    expect(res.status).toBe(200);
    const { objection } = (await res.json()) as { objection: Bag };
    expect(objection.coachingFr).toEqual(FR);
    expect(objection.coaching).toEqual(NEW.coaching);
    const [ins] = writes('scenario_objections');
    expect(ins.payload.coaching).toEqual({ ...NEW.coaching, fr: FR });
    expect(ins.payload).not.toHaveProperty('coachingFr');
    expect(ins.payload).not.toHaveProperty('coaching_fr');
  });

  it('GET returns the stored French lists as coachingFr', async () => {
    objections[0].coaching = { rootConcerns: ['Cash grab'], fr: FR };
    const { objections: list } = (await (await get()).json()) as { objections: Bag[] };
    expect(list[0].coachingFr).toEqual(FR);
    expect(list[0].coaching).toEqual({ rootConcerns: ['Cash grab'] });
  });

  it('an update that does not mention French keeps the stored lists (an editor from before French hints)', async () => {
    objections[0].coaching = { rootConcerns: ['Cash grab'], fr: FR };
    const res = await post({
      op: 'upsert',
      objection: { id: 'team:probiotics', title: 'Probiotics', example: '"Fad."', species: ['dog'], categoryId: 'category:probiotics', coaching: { rootConcerns: ['Sceptical'] } },
    });
    expect(res.status).toBe(200);
    const [upd] = writes('scenario_objections');
    expect(upd.payload.coaching).toEqual({ rootConcerns: ['Sceptical'], fr: FR });
    expect(((await res.json()) as { objection: Bag }).objection.coachingFr).toEqual(FR);
  });

  it('an explicit empty coachingFr clears them (and `fr` is omitted)', async () => {
    objections[0].coaching = { rootConcerns: ['Cash grab'], fr: FR };
    const res = await post({
      op: 'upsert',
      objection: {
        id: 'team:probiotics',
        title: 'Probiotics',
        example: '"Fad."',
        species: ['dog'],
        categoryId: 'category:probiotics',
        coaching: { rootConcerns: ['Sceptical'] },
        coachingFr: {},
      },
    });
    expect(res.status).toBe(200);
    const [upd] = writes('scenario_objections');
    expect(upd.payload.coaching).toEqual({ rootConcerns: ['Sceptical'] });
  });

  it('refuses a malformed coachingFr (400) and writes nothing', async () => {
    const res = await post({ op: 'upsert', objection: { ...NEW, coachingFr: ['nope'] } });
    expect(res.status).toBe(400);
    expect(writes('scenario_objections')).toHaveLength(0);
  });
});

// ── POST delete / restore ────────────────────────────────────────────────

describe('admin-objections — delete', () => {
  it('refuses while a scenario uses it, naming the scenarios', async () => {
    overrides.push(
      { scenario_id: 'admin:a', pushback_id: 'team:probiotics', card_title_override: 'Gut feelings', deleted_at: null },
      { scenario_id: 'seed:2', pushback_id: 'team:probiotics', card_title_override: null, deleted_at: null },
      { scenario_id: 'admin:z', pushback_id: 'team:probiotics', card_title_override: 'Deleted one', deleted_at: T0 },
    );
    const res = await post({ op: 'delete', id: 'team:probiotics' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as Bag;
    expect(body.code).toBe('in_use');
    expect(body.scenarios).toEqual([
      { scenario_id: 'admin:a', title: 'Gut feelings' },
      { scenario_id: 'seed:2', title: 'seed:2' },
    ]);
    expect(body.error).toMatch(/retire/);
    expect(writes('scenario_objections')).toHaveLength(0);
  });

  it('soft-deletes an unused objection and audits it', async () => {
    const res = await post({ op: 'delete', id: 'team:probiotics' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; objection: Bag };
    expect(body.ok).toBe(true);
    expect(typeof body.objection.deletedAt).toBe('string');
    const [del] = writes('scenario_objections');
    expect(del.op).toBe('update');
    expect(Object.keys(del.payload).sort()).toEqual(['deleted_at', 'updated_by']);
    expect(auditRows()[0]).toMatchObject({ action: 'delete', entity_id: 'team:probiotics' });
  });

  it('is idempotent on an already-deleted objection; 404 for an unknown one; 400 for a bad id', async () => {
    objections[0].deleted_at = T1;
    expect((await post({ op: 'delete', id: 'team:probiotics' })).status).toBe(200);
    expect(writes('scenario_objections')).toHaveLength(0);
    expect((await post({ op: 'delete', id: 'team:nothing-here' })).status).toBe(404);
    expect((await post({ op: 'delete', id: 'cost' })).status).toBe(400);
  });
});

describe('admin-objections — restore', () => {
  it('clears deleted_at and audits it as an update', async () => {
    objections[0].deleted_at = T1;
    const res = await post({ op: 'restore', id: 'team:probiotics' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { objection: Bag }).objection).toMatchObject({ deletedAt: null });
    const [upd] = writes('scenario_objections');
    expect(upd.payload).toEqual({ deleted_at: null, updated_by: 'admin-1' });
    expect(auditRows()[0]).toMatchObject({ action: 'update', note: 'Restored from Recently deleted' });
  });

  it('refuses to restore onto a name another live objection has taken meanwhile', async () => {
    objections[0].deleted_at = T1;
    objections.push(objectionRow({ id: 'team:probiotics-2', title: "PROBIOTICS: 'my dog doesn't need them'" }));
    const res = await post({ op: 'restore', id: 'team:probiotics' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).error).toMatch(/already exists/);
    expect(writes('scenario_objections')).toHaveLength(0);
  });

  it('refuses to restore into a category deleted meanwhile — restore the category first', async () => {
    objections[0].deleted_at = T1;
    categories[0].deleted_at = T1; // category:probiotics, the one it is filed under
    const res = await post({ op: 'restore', id: 'team:probiotics' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as Bag;
    expect(body.code).toBe('category_deleted');
    expect(body.error).toMatch(/Restore the category/);
    expect(writes('scenario_objections')).toHaveLength(0);
  });

  it('respects the live cap, and is a no-op for a live objection', async () => {
    expect((await post({ op: 'restore', id: 'team:probiotics' })).status).toBe(200);
    expect(writes('scenario_objections')).toHaveLength(0);

    objections[0].deleted_at = T1;
    for (let i = 0; i < OBJECTION_LIMITS.maxTeamObjections; i++) {
      objections.push(objectionRow({ id: `team:topic-${i}`, title: `Topic ${i}` }));
    }
    const res = await post({ op: 'restore', id: 'team:probiotics' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).code).toBe('limit');
  });
});

// ── Migration pending ────────────────────────────────────────────────────

describe('admin-objections — before the migration', () => {
  it('every write answers 503 with a plain "run the migration" message', async () => {
    sb.setHandler('scenario_objections', table([], { failWith: PGRST205 }));
    expect(MIGRATION_NEEDED_MESSAGE).toBe(
      'Objections need a database update first (migration 20261012000000_scenario_objections.sql).',
    );
    sb.setHandler('scenario_objection_categories', table([], { failWith: PGRST205_CATEGORIES }));
    for (const body of [
      { op: 'upsert', objection: NEW },
      { op: 'delete', id: 'team:probiotics' },
      { op: 'restore', id: 'team:probiotics' },
      { op: 'upsert-category', category: { name: 'Probiotics' } },
      { op: 'upsert-category', category: { id: 'weight', name: 'Weight' } },
      { op: 'delete-category', id: 'category:probiotics' },
      { op: 'restore-category', id: 'category:probiotics' },
    ]) {
      const res = await post(body);
      expect(res.status, body.op).toBe(503);
      expect(await res.json()).toEqual({ error: MIGRATION_NEEDED_MESSAGE });
    }
  });
});

// ── Categories: GET ──────────────────────────────────────────────────────

describe('admin-objections — categories in the list', () => {
  beforeEach(() => {
    categories.push(
      // An admin's edit of the built-in "weight" category.
      categoryRow({
        id: 'weight',
        name: 'Weight & obesity',
        description: 'Overweight pets.',
        focus_area: 'weight',
        knowledge_slugs: ['study:probiotics-1'],
        sort_order: 20,
      }),
      categoryRow({ id: 'category:old', name: 'Old subject', deleted_at: T1 }),
    );
    objections.push(
      objectionRow({ id: 'team:retired', title: 'Retired', visible: false }),
      objectionRow({ id: 'team:gone', title: 'Gone', deleted_at: T1 }),
    );
    overrides.push(
      { scenario_id: 'admin:a', pushback_id: 'team:probiotics', visible: true, deleted_at: null },
      { scenario_id: 'admin:b', pushback_id: 'team:retired', visible: true, deleted_at: null },
      { scenario_id: 'seed:1', pushback_id: 'weight-denial', visible: true, deleted_at: null },
      { scenario_id: 'seed:9', pushback_id: 'weight-denial', visible: true, deleted_at: T0 },
      { scenario_id: 'seed:2', pushback_id: 'cost', visible: true, deleted_at: null },
      { scenario_id: 'seed:3', pushback_id: 'raw-food', visible: false, deleted_at: null },
      { scenario_id: 'admin:c', pushback_id: 'custom', visible: true, deleted_at: null },
    );
  });

  it('merges the built-ins (with their stored edits) and the team categories, with usage', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const { categories: list } = (await res.json()) as { categories: Bag[] };
    expect(list.map((c) => c.id)).toEqual(['everyday-nutrition', 'weight', 'prescription-diets', 'category:probiotics']);
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    expect(byId['everyday-nutrition']).toMatchObject({
      builtIn: true,
      customised: false,
      knowledgeSlugs: [],
      createdAt: null,
      updatedAt: null,
      // cost + raw-food (published or not); `custom` belongs to no category.
      usage: { objections: 0, scenarios: 2 },
    });
    expect(byId.weight).toMatchObject({
      name: 'Weight & obesity',
      focusArea: 'weight',
      knowledgeSlugs: ['study:probiotics-1'],
      builtIn: true,
      customised: true,
      updatedAt: T0,
      createdAt: T0,
      usage: { objections: 0, scenarios: 1 },
    });
    expect(byId['category:probiotics']).toMatchObject({
      name: 'Probiotics',
      builtIn: false,
      customised: false,
      deletedAt: null,
      // Retired objections count (they still play); deleted ones don't.
      usage: { objections: 2, scenarios: 2 },
    });
    expect(byId['prescription-diets'].usage).toEqual({ objections: 0, scenarios: 0 });
    // Authorship never leaves the server; the deleted team category is not listed.
    expect(JSON.stringify(list)).not.toContain('admin-0');
    expect(byId['category:old']).toBeUndefined();
  });

  it('?deleted=1 also returns soft-deleted team categories', async () => {
    const { categories: list } = (await (await get('?deleted=1')).json()) as { categories: Bag[] };
    expect(list.find((c) => c.id === 'category:old')).toMatchObject({ deletedAt: T1, builtIn: false });
    // The deleted objection still never counts toward a category.
    expect(list.find((c) => c.id === 'category:probiotics')?.usage).toEqual({ objections: 2, scenarios: 2 });
  });
});

// ── Categories: upsert ───────────────────────────────────────────────────

describe('admin-objections — upsert-category', () => {
  const NEW_CATEGORY = {
    name: 'Feline urinary health',
    description: 'Cats on urinary diets.',
    focusArea: 'urinary',
    knowledgeSlugs: ['study:probiotics-1'],
  };

  it('creates a team category: id from the name, author stamped, audited, documents checked', async () => {
    const res = await post({ op: 'upsert-category', category: NEW_CATEGORY });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { category: Bag; _dropped: string[] };
    expect(body._dropped).toEqual([]);
    expect(body.category).toMatchObject({
      id: 'category:feline-urinary-health',
      name: 'Feline urinary health',
      focusArea: 'urinary',
      knowledgeSlugs: ['study:probiotics-1'],
      builtIn: false,
      customised: false,
      createdAt: T1,
      usage: { objections: 0, scenarios: 0 },
    });
    const [ins] = writes('scenario_objection_categories');
    expect(ins.op).toBe('insert');
    expect(ins.payload).toEqual({
      id: 'category:feline-urinary-health',
      name: 'Feline urinary health',
      name_fr: null,
      description: 'Cats on urinary diets.',
      focus_area: 'urinary',
      knowledge_slugs: ['study:probiotics-1'],
      sort_order: null,
      created_by: 'admin-1',
      updated_by: 'admin-1',
    });
    expect(auditRows()).toEqual([
      expect.objectContaining({
        entity_type: 'scenario_objection_category',
        entity_id: 'category:feline-urinary-health',
        action: 'create',
      }),
    ]);
    // Documents are checked against LIVE knowledge_documents rows.
    const docs = sb.callsFor('knowledge_documents')[0];
    expect(docs.ops.find((o) => o.op === 'is')?.args).toEqual(['deleted_at', null]);
  });

  it('drops documents that are not live and names them in _dropped (the save still succeeds)', async () => {
    const res = await post({
      op: 'upsert-category',
      category: { ...NEW_CATEGORY, knowledgeSlugs: ['study:probiotics-2', 'study:deleted', 'study:never-was'] },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { category: Bag; _dropped: string[] };
    expect(body._dropped).toEqual(['study:deleted', 'study:never-was']);
    expect(body.category.knowledgeSlugs).toEqual(['study:probiotics-2']);
    expect(writes('scenario_objection_categories')[0].payload.knowledge_slugs).toEqual(['study:probiotics-2']);
  });

  it('a failed document check is a 500 — never a silent strip of the category’s knowledge', async () => {
    sb.setHandler('knowledge_documents', table([], { failWith: { code: '57014', message: 'timeout' } }));
    expect((await post({ op: 'upsert-category', category: NEW_CATEGORY })).status).toBe(500);
    expect(writes('scenario_objection_categories')).toHaveLength(0);
  });

  it('never reuses an id — not even a deleted one — and ignores server-owned fields', async () => {
    categories.push(categoryRow({ id: 'category:feline-urinary-health', name: 'Old', deleted_at: T0 }));
    const res = await post({
      op: 'upsert-category',
      category: { ...NEW_CATEGORY, created_by: 'someone', deleted_at: T0, usage: { objections: 9 }, builtIn: true },
    });
    const { category } = (await res.json()) as { category: Bag };
    expect(category.id).toBe('category:feline-urinary-health-2');
    const [ins] = writes('scenario_objection_categories');
    expect(ins.payload.created_by).toBe('admin-1');
    expect(ins.payload).not.toHaveProperty('deleted_at');
    expect(ins.payload).not.toHaveProperty('usage');
    expect(ins.payload).not.toHaveProperty('built_in');
  });

  it('explains what is wrong (400) and writes nothing', async () => {
    for (const [category, message] of [
      [{ ...NEW_CATEGORY, name: '  ' }, 'Give the category a name, e.g. Probiotics.'],
      [{ ...NEW_CATEGORY, focusArea: 'astrology' }, 'Unknown knowledge topic "astrology".'],
      [{ ...NEW_CATEGORY, id: 'Category:Bad' }, 'id must be a built-in category or look like category:<lowercase-words>'],
      [{ ...NEW_CATEGORY, id: 'team:probiotics' }, 'id must be a built-in category or look like category:<lowercase-words>'],
    ] as const) {
      const res = await post({ op: 'upsert-category', category });
      expect(res.status).toBe(400);
      expect(((await res.json()) as Bag).error).toBe(message);
    }
    expect((await post({ op: 'upsert-category', category: 'Probiotics' })).status).toBe(400);
    expect(writes('scenario_objection_categories')).toHaveLength(0);
  });

  it('names are unique across the MERGED list (built-ins included), case- and space-insensitively', async () => {
    let res = await post({ op: 'upsert-category', category: { name: 'weight   MANAGEMENT' } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Bag).error).toContain('"Weight management" already exists');
    res = await post({ op: 'upsert-category', category: { name: 'PROBIOTICS' } });
    expect(res.status).toBe(400);
    expect(writes('scenario_objection_categories')).toHaveLength(0);
    // A category may keep its own name; a deleted one's name is free again.
    expect(
      (await post({ op: 'upsert-category', category: { id: 'category:probiotics', name: 'probiotics' } })).status,
    ).toBe(200);
    categories[0].deleted_at = T1;
    expect((await post({ op: 'upsert-category', category: { name: 'Probiotics' } })).status).toBe(200);
  });

  it(`stops at ${CATEGORY_LIMITS.maxTeamCategories} live team categories (409 limit) — built-in edits never count`, async () => {
    for (let i = categories.length; i < CATEGORY_LIMITS.maxTeamCategories; i++) {
      categories.push(categoryRow({ id: `category:topic-${i}`, name: `Topic ${i}` }));
    }
    categories.push(categoryRow({ id: 'weight', name: 'Weight management' }));
    const res = await post({ op: 'upsert-category', category: NEW_CATEGORY });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).code).toBe('limit');
    // Editing a built-in is never blocked by the cap.
    expect((await post({ op: 'upsert-category', category: { id: 'prescription-diets', name: 'Rx diets' } })).status).toBe(
      200,
    );
    // Deleted ones don't count.
    categories[3].deleted_at = T1;
    expect((await post({ op: 'upsert-category', category: NEW_CATEGORY })).status).toBe(200);
  });

  it('a duplicate-key race is a 409, a CHECK violation a 400', async () => {
    sb.setHandler('scenario_objection_categories', (call) =>
      call.ops.some((o) => o.op === 'insert')
        ? { data: null, error: { code: '23505', message: 'duplicate key' } }
        : table(categories)(call),
    );
    expect((await post({ op: 'upsert-category', category: NEW_CATEGORY })).status).toBe(409);
    sb.setHandler('scenario_objection_categories', (call) =>
      call.ops.some((o) => o.op === 'insert')
        ? { data: null, error: { code: '23514', message: 'violates check' } }
        : table(categories)(call),
    );
    expect((await post({ op: 'upsert-category', category: NEW_CATEGORY })).status).toBe(400);
    expect(auditRows()).toHaveLength(0);
  });
});

describe('admin-objections — editing a built-in category', () => {
  const RENAME = { id: 'weight', name: 'Weight & obesity', knowledgeSlugs: ['study:probiotics-1'], sortOrder: 20 };

  it('the first edit stores a row under the built-in id; the answer is the customised built-in', async () => {
    const res = await post({ op: 'upsert-category', category: RENAME, baseUpdatedAt: null });
    expect(res.status).toBe(200);
    const { category } = (await res.json()) as { category: Bag };
    expect(category).toMatchObject({
      id: 'weight',
      name: 'Weight & obesity',
      knowledgeSlugs: ['study:probiotics-1'],
      builtIn: true,
      customised: true,
      updatedAt: T1,
    });
    const [ins] = writes('scenario_objection_categories');
    expect(ins.op).toBe('insert');
    expect(ins.payload).toMatchObject({ id: 'weight', name: 'Weight & obesity', created_by: 'admin-1' });
    expect(auditRows()[0]).toMatchObject({ entity_type: 'scenario_objection_category', entity_id: 'weight', action: 'create' });
  });

  it('a later edit updates that row behind the timestamp guard', async () => {
    categories.push(categoryRow({ id: 'weight', name: 'Weight & obesity', updated_at: T0 }));
    const res = await post({
      op: 'upsert-category',
      category: { ...RENAME, name: 'Weight', knowledgeSlugs: [] },
      baseUpdatedAt: T0,
    });
    expect(res.status).toBe(200);
    const [upd] = writes('scenario_objection_categories');
    expect(upd.op).toBe('update');
    expect(upd.payload).toMatchObject({ name: 'Weight', knowledge_slugs: [], updated_by: 'admin-1' });
    expect(upd.payload).not.toHaveProperty('id');
    expect(upd.call.ops.filter((o) => o.op === 'eq' || o.op === 'is').map((o) => o.args)).toEqual([
      ['id', 'weight'],
      ['deleted_at', null],
      ['updated_at', T0],
    ]);
    // No document query for an empty list.
    expect(sb.callsFor('knowledge_documents')).toHaveLength(0);
  });

  it('baseUpdatedAt null = "I saw no row": a row someone else created meanwhile is a 409 stale', async () => {
    categories.push(categoryRow({ id: 'weight', name: 'Weight (theirs)', updated_at: T0 }));
    const res = await post({ op: 'upsert-category', category: RENAME, baseUpdatedAt: null });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; current: Bag };
    expect(body.code).toBe('stale');
    expect(body.current).toMatchObject({ id: 'weight', name: 'Weight (theirs)', customised: true });
    expect(writes('scenario_objection_categories')).toHaveLength(0);
  });

  it('two admins editing a never-edited built-in at once: the second insert is a 409 stale', async () => {
    sb.setHandler('scenario_objection_categories', (call) =>
      call.ops.some((o) => o.op === 'insert')
        ? { data: null, error: { code: '23505', message: 'duplicate key' } }
        : table(categories)(call),
    );
    const res = await post({ op: 'upsert-category', category: RENAME, baseUpdatedAt: null });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string; current: Bag };
    expect(body.code).toBe('stale');
    // Nothing stored yet in this fake, so "current" is the shipped built-in.
    expect(body.current).toMatchObject({ id: 'weight', name: 'Weight management', customised: false });
  });

  it('a built-in can never be deleted or restored', async () => {
    for (const op of ['delete-category', 'restore-category']) {
      const res = await post({ op, id: 'weight' });
      expect(res.status, op).toBe(400);
      if (op === 'delete-category') expect(((await res.json()) as Bag).error).toBe(BUILT_IN_CATEGORY_DELETE_MESSAGE);
    }
    expect(writes('scenario_objection_categories')).toHaveLength(0);
  });
});

describe('admin-objections — updating a team category', () => {
  const edit = (over: Bag = {}) => ({
    id: 'category:probiotics',
    name: 'Probiotics & gut health',
    description: 'Gut health.',
    focusArea: 'gi',
    knowledgeSlugs: ['study:probiotics-1'],
    ...over,
  });

  it('updates the live row behind the tombstone and timestamp guards, and audits before/after', async () => {
    objections.push(objectionRow({ id: 'team:other', title: 'Other', category_id: 'everyday-nutrition' }));
    overrides.push({ scenario_id: 'admin:a', pushback_id: 'team:probiotics', visible: true, deleted_at: null });
    const res = await post({ op: 'upsert-category', category: edit(), baseUpdatedAt: T0 });
    expect(res.status).toBe(200);
    const { category } = (await res.json()) as { category: Bag };
    expect(category).toMatchObject({ name: 'Probiotics & gut health', updatedAt: T1, usage: { objections: 1, scenarios: 1 } });
    const [upd] = writes('scenario_objection_categories');
    expect(upd.call.ops.filter((o) => o.op === 'eq' || o.op === 'is').map((o) => o.args)).toEqual([
      ['id', 'category:probiotics'],
      ['deleted_at', null],
      ['updated_at', T0],
    ]);
    const [audit] = auditRows();
    expect(audit).toMatchObject({ entity_type: 'scenario_objection_category', action: 'update' });
    expect((audit.before as Bag).name).toBe('Probiotics');
  });

  it('refuses a stale edit (409 stale), an edit landing between read and write, and a deleted category', async () => {
    let res = await post({ op: 'upsert-category', category: edit(), baseUpdatedAt: '2026-10-01T00:00:00+00:00' });
    expect(res.status).toBe(409);
    const stale = (await res.json()) as { code: string; current: Bag };
    expect(stale.code).toBe('stale');
    expect(stale.current).toMatchObject({ id: 'category:probiotics', name: 'Probiotics', updatedAt: T0 });

    sb.setHandler('scenario_objection_categories', (call) =>
      call.ops.some((o) => o.op === 'update') ? { data: null, error: null } : table(categories)(call),
    );
    res = await post({ op: 'upsert-category', category: edit(), baseUpdatedAt: T0 });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).code).toBe('stale');

    sb.setHandler('scenario_objection_categories', table(categories));
    categories[0].deleted_at = T1;
    res = await post({ op: 'upsert-category', category: edit() });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).code).toBe('deleted');
    expect(auditRows()).toHaveLength(0);
  });
});

// ── Categories: delete / restore ─────────────────────────────────────────

describe('admin-objections — delete-category', () => {
  it('refuses while any non-deleted objection (retired included) is filed under it, naming them', async () => {
    objections[0].visible = false;
    objections.push(objectionRow({ id: 'team:gone', title: 'Gone', deleted_at: T0 }));
    const res = await post({ op: 'delete-category', id: 'category:probiotics' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as Bag;
    expect(body.code).toBe('in_use');
    expect(body.objections).toEqual([{ id: 'team:probiotics', title: "Probiotics: 'my dog doesn't need them'" }]);
    expect(writes('scenario_objection_categories')).toHaveLength(0);
  });

  it('soft-deletes an unused category and audits it', async () => {
    objections[0].category_id = 'everyday-nutrition';
    const res = await post({ op: 'delete-category', id: 'category:probiotics' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; category: Bag };
    expect(body.ok).toBe(true);
    expect(typeof body.category.deletedAt).toBe('string');
    const [del] = writes('scenario_objection_categories');
    expect(Object.keys(del.payload).sort()).toEqual(['deleted_at', 'updated_by']);
    expect(auditRows()[0]).toMatchObject({
      entity_type: 'scenario_objection_category',
      action: 'delete',
      entity_id: 'category:probiotics',
    });
  });

  it('is idempotent on a deleted category; 404 for an unknown one; 400 for a bad id', async () => {
    categories[0].deleted_at = T1;
    expect((await post({ op: 'delete-category', id: 'category:probiotics' })).status).toBe(200);
    expect(writes('scenario_objection_categories')).toHaveLength(0);
    expect((await post({ op: 'delete-category', id: 'category:nothing-here' })).status).toBe(404);
    expect((await post({ op: 'delete-category', id: 'team:probiotics' })).status).toBe(400);
    expect((await post({ op: 'delete-category' })).status).toBe(400);
  });
});

describe('admin-objections — restore-category', () => {
  it('clears deleted_at and audits it as an update', async () => {
    categories[0].deleted_at = T1;
    const res = await post({ op: 'restore-category', id: 'category:probiotics' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { category: Bag }).category).toMatchObject({ deletedAt: null });
    const [upd] = writes('scenario_objection_categories');
    expect(upd.payload).toEqual({ deleted_at: null, updated_by: 'admin-1' });
    expect(auditRows()[0]).toMatchObject({
      entity_type: 'scenario_objection_category',
      action: 'update',
      note: 'Restored from Recently deleted',
    });
  });

  it('refuses to restore onto a name taken meanwhile — a built-in rename counts too', async () => {
    categories[0].deleted_at = T1;
    categories.push(categoryRow({ id: 'weight', name: 'PROBIOTICS' }));
    const res = await post({ op: 'restore-category', id: 'category:probiotics' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).error).toMatch(/already exists/);
    expect(writes('scenario_objection_categories')).toHaveLength(0);
  });

  it('respects the live cap, and is a no-op for a live category; 404 for an unknown one', async () => {
    expect((await post({ op: 'restore-category', id: 'category:probiotics' })).status).toBe(200);
    expect(writes('scenario_objection_categories')).toHaveLength(0);
    expect((await post({ op: 'restore-category', id: 'category:nothing-here' })).status).toBe(404);

    categories[0].deleted_at = T1;
    for (let i = 0; i < CATEGORY_LIMITS.maxTeamCategories; i++) {
      categories.push(categoryRow({ id: `category:topic-${i}`, name: `Topic ${i}` }));
    }
    const res = await post({ op: 'restore-category', id: 'category:probiotics' });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).code).toBe('limit');
  });
});

// ── Pure helpers ─────────────────────────────────────────────────────────

describe('helpers', () => {
  it('toAdminObjection drops what is not an objection and adds the lifecycle fields', () => {
    expect(toAdminObjection({ id: 'cost', title: 'x', species: ['dog'] })).toBeNull();
    expect(toAdminObjection(objectionRow({ deleted_at: T1 }), { scenarios: 2, live: 0, trainee: 1 })).toMatchObject({
      createdAt: T0,
      deletedAt: T1,
      usage: { scenarios: 2, live: 0, trainee: 1 },
    });
  });

  it('categoryUsage counts live team objections and every scenario on an objection in the category', () => {
    const team = [
      { id: 'team:a', categoryId: 'weight' },
      { id: 'team:b', categoryId: 'category:gi' },
    ];
    const counts = new Map([
      ['team:a', 2],
      ['weight-denial', 3],
      ['team:b', 1],
      ['cost', 4],
    ]);
    expect(categoryUsage('weight', team, counts)).toEqual({ objections: 1, scenarios: 5 });
    expect(categoryUsage('category:gi', team, counts)).toEqual({ objections: 1, scenarios: 1 });
    expect(categoryUsage('everyday-nutrition', team, counts)).toEqual({ objections: 0, scenarios: 4 });
  });

  it('toAdminCategory marks a built-in row as customised; adminCategories ignores a deleted built-in row', () => {
    expect(toAdminCategory(categoryRow({ id: 'weight', name: 'Weight' }))).toMatchObject({
      builtIn: true,
      customised: true,
    });
    expect(toAdminCategory(categoryRow())).toMatchObject({ builtIn: false, customised: false, createdAt: T0 });
    expect(toAdminCategory({ id: 'nope', name: 'x' })).toBeNull();
    const list = adminCategories(
      [categoryRow({ id: 'weight', name: 'Renamed', deleted_at: T0 })] as never,
      [],
      new Map(),
      true,
    );
    expect(list.find((c) => c.id === 'weight')).toMatchObject({ name: 'Weight management', customised: false });
  });

  it('categoryNameClash compares names case- and space-insensitively, ignoring itself', () => {
    const merged = [
      { id: 'weight', name: 'Weight management' },
      { id: 'category:gi', name: 'GI  health' },
    ];
    expect(categoryNameClash('weight MANAGEMENT', 'category:new', merged)).toBe('Weight management');
    expect(categoryNameClash('gi health', 'category:gi', merged)).toBeNull();
    expect(categoryNameClash('Probiotics', 'category:new', merged)).toBeNull();
  });

  it('titleClash compares names case- and space-insensitively, ignoring itself and deleted rows', () => {
    const rows = [
      { id: 'team:a', title: 'Raw  Feeding', deleted_at: null },
      { id: 'team:b', title: 'Gone', deleted_at: T0 },
    ];
    expect(titleClash('raw feeding', 'team:new', rows)).toBe('Raw  Feeding');
    expect(titleClash('raw feeding', 'team:a', rows)).toBeNull();
    expect(titleClash('gone', 'team:new', rows)).toBeNull();
    expect(titleClash('OTHER PUSHBACK', 'team:new', rows)).toBe('Other pushback');
  });
});
