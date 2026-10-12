// @vitest-environment node
/**
 * `admin-objections` — team-authored objections. Pins: permission gating,
 * the list (+ usage, + soft-deleted on request), id allocation, validation,
 * the live cap, optimistic concurrency, the "in use" delete refusal, restore,
 * the audit trail, and the degrade path while the migration is pending.
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
  MIGRATION_NEEDED_MESSAGE,
  OBJECTIONS_TABLE_MISSING,
  titleClash,
  toAdminObjection,
} from '../admin-objections';
import { OBJECTION_LIMITS } from '../../../src/shared/scenarios/objections';

type Bag = Record<string, unknown>;

let sb: FakeSupabase;

const T0 = '2026-10-12T09:00:00.000000+00:00';
const T1 = '2026-10-12T10:00:00.000000+00:00';

/** PostgREST's answer while 20261012000000_scenario_objections.sql is pending. */
const PGRST205 = {
  code: 'PGRST205',
  message: "Could not find the table 'public.scenario_objections' in the schema cache",
};

function objectionRow(over: Bag = {}): Bag {
  return {
    id: 'team:probiotics',
    title: "Probiotics: 'my dog doesn't need them'",
    example: '"He has a healthy gut already."',
    title_fr: null,
    example_fr: null,
    species: ['dog', 'cat'],
    focus_area: 'gi',
    coaching: { rootConcerns: ['Thinks supplements are a cash grab'] },
    visible: true,
    sort_order: null,
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
  focusArea: 'urinary',
  coaching: { rootConcerns: ['Worried she will stop eating'], watchOuts: ['Leading with price'] },
};

let objections: Bag[];
let overrides: Bag[];

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
  sb.setHandler('scenario_objections', table(objections));
  sb.setHandler('scenario_overrides', table(overrides));
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
      focusArea: 'gi',
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
  });

  it('?deleted=1 also returns soft-deleted objections, so the editor can offer Restore', async () => {
    objections.push(objectionRow({ id: 'team:gone', title: 'Gone topic', deleted_at: T1 }));
    const { objections: list } = (await (await get('?deleted=1')).json()) as { objections: Bag[] };
    expect(list.find((o) => o.id === 'team:gone')).toMatchObject({ deletedAt: T1 });
  });

  it('answers 200 with no objections and a notice while the migration is pending', async () => {
    sb.setHandler('scenario_objections', table([], { failWith: PGRST205 }));
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ objections: [], _notice: OBJECTIONS_TABLE_MISSING });
  });

  it('any other database error is a 500', async () => {
    sb.setHandler('scenario_objections', table([], { failWith: { code: '57014', message: 'timeout' } }));
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
      focusArea: 'urinary',
      visible: true,
      usage: { scenarios: 0, live: 0 },
    });
    const [ins] = writes('scenario_objections');
    expect(ins.op).toBe('insert');
    expect(ins.payload).toMatchObject({
      id: 'team:feline-urinary-diet-doubts',
      species: ['cat'],
      focus_area: 'urinary',
      coaching: { rootConcerns: ['Worried she will stop eating'], watchOuts: ['Leading with price'] },
      created_by: 'admin-1',
      updated_by: 'admin-1',
    });
    // Server-owned columns are never taken from the request.
    expect(ins.payload).not.toHaveProperty('deleted_at');
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
      [{ ...NEW, focusArea: 'astrology' }, 'Unknown knowledge topic "astrology".'],
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
    focusArea: 'gi',
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
    expect(upd.payload).toMatchObject({ title: 'Probiotics: "a waste of money"', visible: false, updated_by: 'admin-1' });
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
    for (const body of [
      { op: 'upsert', objection: NEW },
      { op: 'delete', id: 'team:probiotics' },
      { op: 'restore', id: 'team:probiotics' },
    ]) {
      const res = await post(body);
      expect(res.status, body.op).toBe(503);
      expect(await res.json()).toEqual({ error: MIGRATION_NEEDED_MESSAGE });
    }
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
