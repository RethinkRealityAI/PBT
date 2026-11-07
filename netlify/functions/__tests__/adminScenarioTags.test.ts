// @vitest-environment node
/**
 * `admin-scenario-tags` — the team's tag library: permissions, limits,
 * duplicate names (409), soft delete + assignment clean-up, set-tags
 * (replace, drop unknown ids, cap per scenario), and the degrade path before
 * the migration runs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase, type SbCall } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler, { MIGRATION_NEEDED_MESSAGE, isMissingTagsTable } from '../admin-scenario-tags';
import { TAG_LIMITS } from '../../../src/shared/scenarios/tags';

type Bag = Record<string, unknown>;
let sb: FakeSupabase;

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** In-memory tables, enough of PostgREST's semantics for these ops. */
let tags: Bag[];
let assignments: Bag[];

function argsOf(call: SbCall, op: string): unknown[][] {
  return call.ops.filter((o) => o.op === op).map((o) => o.args);
}

function matches(row: Bag, call: SbCall): boolean {
  for (const [col, val] of argsOf(call, 'eq')) if (row[col as string] !== val) return false;
  for (const [col, val] of argsOf(call, 'is')) if ((row[col as string] ?? null) !== val) return false;
  for (const [col, vals] of argsOf(call, 'in')) if (!(vals as unknown[]).includes(row[col as string])) return false;
  return true;
}

function installTables() {
  sb.setHandler('scenario_tags', (call) => {
    const insert = argsOf(call, 'insert')[0];
    if (insert) {
      const row = { id: id(100 + tags.length), deleted_at: null, updated_at: 'T1', ...(insert[0] as Bag) };
      tags.push(row);
      return { data: row, error: null };
    }
    const update = argsOf(call, 'update')[0];
    if (update) {
      const hit = tags.find((r) => matches(r, call));
      if (!hit) return { data: null, error: null };
      Object.assign(hit, update[0] as Bag, { updated_at: 'T2' });
      return { data: hit, error: null };
    }
    const rows = tags.filter((r) => matches(r, call));
    const range = argsOf(call, 'range')[0] as [number, number] | undefined;
    return { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null };
  });
  sb.setHandler('scenario_tag_assignments', (call) => {
    if (call.ops.some((o) => o.op === 'delete')) {
      assignments = assignments.filter((r) => !matches(r, call));
      return { data: null, error: null };
    }
    const up = argsOf(call, 'upsert')[0];
    if (up) {
      for (const row of up[0] as Bag[]) {
        if (!assignments.some((a) => a.scenario_id === row.scenario_id && a.tag_id === row.tag_id)) assignments.push(row);
      }
      return { data: null, error: null };
    }
    const rows = assignments.filter((r) => matches(r, call));
    const range = argsOf(call, 'range')[0] as [number, number] | undefined;
    return { data: range ? rows.slice(range[0], range[1] + 1) : rows, error: null };
  });
  sb.setHandler('scenario_overrides', (call) => ({
    data: argsOf(call, 'eq')[0]?.[1] === 'admin:live' ? { scenario_id: 'admin:live' } : null,
    error: null,
  }));
}

function signIn(permissions: string[]) {
  sb.setHandler('admin_roles', () => ({ data: [{ key: 'tester', permissions }], error: null }));
  sb.setHandler('profiles', () => ({
    data: { is_admin: false, disabled: false, admin_role: 'tester', permission_overrides: null },
    error: null,
  }));
}

const post = (body: unknown) => handler(jsonRequest('admin-scenario-tags', body, { headers: { authorization: 'Bearer admin' } }));
const get = () =>
  handler(jsonRequest('admin-scenario-tags', null, { method: 'GET', headers: { authorization: 'Bearer admin' } }));

function audits(): Bag[] {
  return sb.callsFor('admin_audit_log').flatMap((c) => argsOf(c, 'insert').map((a) => a[0] as Bag));
}

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('admin_audit_log', () => ({ data: null, error: null }));
  signIn(['scenarios.read', 'scenarios.write']);
  tags = [
    { id: id(1), name: 'Q1 rollout', color: 'teal', updated_at: 'T1', deleted_at: null },
    { id: id(2), name: 'Needs review', color: 'amber', updated_at: 'T1', deleted_at: null },
    { id: id(3), name: 'Old', color: 'slate', updated_at: 'T1', deleted_at: '2026-01-01T00:00:00Z' },
  ];
  assignments = [
    { scenario_id: 'seed:1', tag_id: id(1) },
    { scenario_id: 'admin:live', tag_id: id(1) },
    { scenario_id: 'admin:live', tag_id: id(3) },
  ];
  installTables();
});

describe('GET', () => {
  it('lists live tags A→Z with usage, and only their assignments', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { tags: Bag[]; assignments: Bag[] };
    expect(json.tags.map((t) => [t.name, t.usage])).toEqual([
      ['Needs review', 0],
      ['Q1 rollout', 2],
    ]);
    expect(json.assignments).toEqual([
      { scenarioId: 'seed:1', tagId: id(1) },
      { scenarioId: 'admin:live', tagId: id(1) },
    ]);
  });

  it('needs scenarios.read', async () => {
    signIn(['analytics.read']);
    expect((await get()).status).toBe(403);
  });

  it('answers empty with a notice before the migration runs', async () => {
    sb.setHandler('scenario_tags', () => ({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.scenario_tags' in the schema cache" },
    }));
    const json = (await (await get()).json()) as Bag;
    expect(json).toEqual({ tags: [], assignments: [], _notice: 'tags_table_missing' });
  });
});

describe('POST', () => {
  it('needs scenarios.write for every op', async () => {
    signIn(['scenarios.read']);
    expect((await post({ op: 'upsert-tag', tag: { name: 'X', color: 'teal' } })).status).toBe(403);
    expect((await post({ op: 'set-tags', scenarioId: 'seed:1', tagIds: [] })).status).toBe(403);
  });

  it('creates a tag (normalised name), audited', async () => {
    const res = await post({ op: 'upsert-tag', tag: { name: '  Cat   launch ', color: 'purple' } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { tag: Bag };
    expect(json.tag).toMatchObject({ name: 'Cat launch', color: 'purple', usage: 0 });
    expect(audits()[0]).toMatchObject({ entity_type: 'scenario_tag', action: 'create' });
  });

  it('refuses a duplicate name case-insensitively (409), a bad colour (400) and the 101st tag (409)', async () => {
    const dup = await post({ op: 'upsert-tag', tag: { name: 'q1 ROLLOUT', color: 'blue' } });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as Bag).code).toBe('duplicate');
    expect((await post({ op: 'upsert-tag', tag: { name: 'X', color: '#ff0000' } })).status).toBe(400);
    // A deleted tag's name is free again.
    expect((await post({ op: 'upsert-tag', tag: { name: 'old', color: 'blue' } })).status).toBe(200);

    tags = Array.from({ length: TAG_LIMITS.maxTags }, (_, i) => ({ id: id(500 + i), name: `t${i}`, color: 'blue', deleted_at: null }));
    const limit = await post({ op: 'upsert-tag', tag: { name: 'One more', color: 'blue' } });
    expect(limit.status).toBe(409);
    expect(((await limit.json()) as Bag).code).toBe('limit');
  });

  it('renames / recolours, with a stale check and a 404 for a deleted tag', async () => {
    const ok = await post({ op: 'upsert-tag', tag: { id: id(2), name: 'Review', color: 'red' }, baseUpdatedAt: 'T1' });
    expect(ok.status).toBe(200);
    expect(tags[1]).toMatchObject({ name: 'Review', color: 'red' });
    const stale = await post({ op: 'upsert-tag', tag: { id: id(2), name: 'Again', color: 'red' }, baseUpdatedAt: 'T1' });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as Bag).code).toBe('stale');
    expect((await post({ op: 'upsert-tag', tag: { id: id(3), name: 'Back', color: 'red' } })).status).toBe(404);
  });

  it('soft-deletes a tag and removes it from every scenario', async () => {
    const res = await post({ op: 'delete-tag', id: id(1) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed: 2 });
    expect(tags[0].deleted_at).toEqual(expect.any(String));
    expect(assignments.some((a) => a.tag_id === id(1))).toBe(false);
    expect(audits()[0]).toMatchObject({ entity_type: 'scenario_tag', action: 'delete', note: 'Removed from 2 scenarios' });
    expect((await post({ op: 'delete-tag', id: id(1) })).status).toBe(404);
  });

  it('set-tags replaces a scenario’s tags and lists ids it dropped', async () => {
    const res = await post({ op: 'set-tags', scenarioId: 'admin:live', tagIds: [id(2), id(3), 'nope'] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scenarioId: 'admin:live', tagIds: [id(2)], _dropped: [id(3), 'nope'] });
    expect(assignments.filter((a) => a.scenario_id === 'admin:live').map((a) => a.tag_id)).toEqual([id(2)]);
    expect(audits()).toHaveLength(1);
    // Never writes scenario_overrides (no override row, no updated_at bump).
    for (const call of sb.callsFor('scenario_overrides')) {
      expect(call.ops.some((o) => ['insert', 'update', 'upsert', 'delete'].includes(o.op))).toBe(false);
    }
  });

  it('set-tags: library scenarios need no row; trainee scenarios, missing Studio ones and > 8 tags are refused', async () => {
    expect((await post({ op: 'set-tags', scenarioId: 'seed:3', tagIds: [id(1)] })).status).toBe(200);
    expect(assignments).toContainEqual(expect.objectContaining({ scenario_id: 'seed:3', tag_id: id(1) }));
    expect((await post({ op: 'set-tags', scenarioId: 'user:abc', tagIds: [] })).status).toBe(400);
    expect((await post({ op: 'set-tags', scenarioId: 'admin:gone', tagIds: [] })).status).toBe(404);
    const tooMany = Array.from({ length: TAG_LIMITS.perScenario + 1 }, (_, i) => id(900 + i));
    expect((await post({ op: 'set-tags', scenarioId: 'seed:1', tagIds: tooMany })).status).toBe(400);
    expect((await post({ op: 'set-tags', scenarioId: 'seed:1', tagIds: 'x' })).status).toBe(400);
  });

  it('bounds the body and rejects unknown ops', async () => {
    expect((await post({ op: 'nuke' })).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
    expect((await post({ op: 'upsert-tag', tag: { name: 'x', color: 'teal' }, pad: 'x'.repeat(20_000) })).status).toBe(413);
  });

  it('is a 503 with a plain message before the migration runs', async () => {
    sb.setHandler('scenario_tags', () => ({
      data: null,
      error: { code: '42P01', message: 'relation "public.scenario_tags" does not exist' },
    }));
    const res = await post({ op: 'upsert-tag', tag: { name: 'X', color: 'teal' } });
    expect(res.status).toBe(503);
    expect(((await res.json()) as Bag).error).toBe(MIGRATION_NEEDED_MESSAGE);
  });
});

describe('isMissingTagsTable', () => {
  it('names the tag tables only', () => {
    expect(isMissingTagsTable({ code: 'PGRST205', message: "Could not find the table 'public.scenario_tag_assignments'" })).toBe(true);
    expect(isMissingTagsTable({ code: 'PGRST205', message: "Could not find the table 'public.flags'" })).toBe(false);
    expect(isMissingTagsTable({ code: '23505', message: 'scenario_tags' })).toBe(false);
  });
});

describe('tags stay admin-only', () => {
  it('no other function or app code reads the tag tables (no snapshot, no AI prompt)', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(__dirname, '..', '..', '..');
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (name === 'node_modules' || name === '__tests__') continue;
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && /from\(\s*['"]scenario_tag/.test(readFileSync(full, 'utf8'))) hits.push(full.slice(root.length + 1));
      }
    };
    walk(join(root, 'netlify'));
    walk(join(root, 'src'));
    expect(hits).toEqual(['netlify/functions/admin-scenario-tags.ts']);
  });
});
