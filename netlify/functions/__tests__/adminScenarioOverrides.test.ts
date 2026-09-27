// @vitest-environment node
/**
 * `admin-scenario-overrides` — species (dog / cat) on the write path.
 *
 * `scenario_overrides.species` is a DEFERRED column (migration
 * 20260925000000_scenario_species.sql is hand-run). Until it exists, a save
 * that carries `species` must still succeed: the function retries the same
 * write without the column and answers with the saved row plus
 * `_notice: 'species_column_missing'`. Every other database error behaves
 * exactly as before (500).
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
  SPECIES_COLUMN_MISSING,
  isMissingSpeciesColumn,
  pickWritable,
  validateOverride,
  type OverrideUpsert,
} from '../admin-scenario-overrides';

type Bag = Record<string, unknown>;

let sb: FakeSupabase;

/** PostgREST's answer to a write naming a column the schema cache lacks. */
const PGRST204 = {
  code: 'PGRST204',
  message: "Could not find the 'species' column of 'scenario_overrides' in the schema cache",
};

const ROW: Bag = {
  scenario_id: 'admin:cat-1',
  visible: false,
  breed: 'Maine Coon',
  life_stage: 'Puppy (<1)',
  pushback_id: 'cost',
  suggested_driver: 'Harmonizer',
};

/**
 * Every payload WRITTEN to scenario_overrides, in order. A new id is an
 * `upsert`; an existing row is an `update` guarded by `deleted_at is null`
 * — both carry the same column set.
 */
function upserts(): Bag[] {
  const out: Bag[] = [];
  for (const call of sb.callsFor('scenario_overrides')) {
    for (const op of call.ops) {
      if (op.op === 'upsert' || op.op === 'update') out.push(op.args[0] as Bag);
    }
  }
  return out;
}

/** The `.is('deleted_at', null)` guard is what makes the update tombstone-safe. */
function updateGuards(): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const call of sb.callsFor('scenario_overrides')) {
    if (!call.ops.some((o) => o.op === 'update')) continue;
    for (const op of call.ops) if (op.op === 'is') out.push([op.args[0] as string, op.args[1]]);
  }
  return out;
}

function auditRows(): Bag[] {
  const out: Bag[] = [];
  for (const call of sb.callsFor('admin_audit_log')) {
    for (const op of call.ops) if (op.op === 'insert') out.push(op.args[0] as Bag);
  }
  return out;
}

/**
 * scenario_overrides fake: reads return `existing`; each upsert is answered
 * by `onUpsert(payload)` (default: echo the payload back as the stored row).
 */
function overridesTable(
  existing: Bag | null,
  onUpsert: (payload: Bag) => SbResult = (payload) => ({ data: payload, error: null }),
) {
  sb.setHandler('scenario_overrides', (call: SbCall) => {
    const up = call.ops.find((o) => o.op === 'upsert' || o.op === 'update');
    if (up) return onUpsert(up.args[0] as Bag);
    return { data: existing, error: null };
  });
}

/** A database that predates the species migration. */
function withoutSpeciesColumn(payload: Bag): SbResult {
  if ('species' in payload) return { data: null, error: PGRST204 };
  return { data: payload, error: null };
}

const save = (body: Bag, op?: string) =>
  handler(
    jsonRequest(`admin-scenario-overrides${op ? `?op=${op}` : ''}`, body, {
      headers: { authorization: 'Bearer admin' },
    }),
  );

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  sb.setHandler('admin_audit_log', () => ({ data: null, error: null }));
});

describe('validateOverride — species', () => {
  const base: OverrideUpsert = { scenario_id: 'seed:0' };

  it('accepts dog, cat, null and an absent species', () => {
    expect(validateOverride({ ...base, species: 'dog' })).toBeNull();
    expect(validateOverride({ ...base, species: 'cat' })).toBeNull();
    expect(validateOverride({ ...base, species: null })).toBeNull();
    expect(validateOverride(base)).toBeNull();
  });

  it('rejects anything else with a plain message', () => {
    for (const species of ['hamster', 'Cat', 'DOG', '', 'dog ', 42, ['cat']]) {
      expect(
        validateOverride({ ...base, species: species as unknown as string }),
        String(species),
      ).toBe('species must be dog or cat');
    }
  });

  it('is a writable column', () => {
    expect(pickWritable({ scenario_id: 'seed:0', species: 'cat' })).toEqual({
      scenario_id: 'seed:0',
      species: 'cat',
    });
    expect(pickWritable({ scenario_id: 'seed:0' })).not.toHaveProperty('species');
  });
});

describe('isMissingSpeciesColumn', () => {
  it('recognises PostgREST and Postgres "no such column" errors about species', () => {
    expect(isMissingSpeciesColumn(PGRST204)).toBe(true);
    expect(
      isMissingSpeciesColumn({
        code: '42703',
        message: 'column "species" of relation "scenario_overrides" does not exist',
      }),
    ).toBe(true);
  });

  it('ignores every other error — including a different missing column', () => {
    expect(isMissingSpeciesColumn(null)).toBe(false);
    expect(
      isMissingSpeciesColumn({
        code: 'PGRST204',
        message: "Could not find the 'focus_area' column of 'scenario_overrides' in the schema cache",
      }),
    ).toBe(false);
    expect(isMissingSpeciesColumn({ code: '23514', message: 'violates check constraint species' })).toBe(false);
    expect(isMissingSpeciesColumn({ message: 'species' })).toBe(false);
  });
});

describe('POST upsert — species', () => {
  it('rejects an unknown species with 400 before touching the table', async () => {
    overridesTable(null);
    const res = await save({ ...ROW, species: 'hamster' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'species must be dog or cat' });
    expect(upserts()).toHaveLength(0);
  });

  it('writes species when the column exists and answers with the row, no notice', async () => {
    overridesTable(null);
    const res = await save({ ...ROW, species: 'cat' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Bag;
    expect(json.species).toBe('cat');
    expect(json).not.toHaveProperty('_notice');
    const writes = upserts();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ ...ROW, species: 'cat', updated_by: 'admin-1', created_by: 'admin-1' });
    expect(auditRows()).toHaveLength(1);
    expect(auditRows()[0]).toMatchObject({ action: 'create', entity_id: 'admin:cat-1' });
  });

  it('retries the SAME write without species when the column is missing, and says so', async () => {
    overridesTable(null, withoutSpeciesColumn);
    const res = await save({ ...ROW, species: 'cat', prompt_prefix: 'Be patient.' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Bag;
    expect(json._notice).toBe(SPECIES_COLUMN_MISSING);
    expect(json._notice).toBe('species_column_missing');
    expect(json).toMatchObject({ ...ROW, prompt_prefix: 'Be patient.' });
    expect(json).not.toHaveProperty('species');

    const [first, retry] = upserts();
    expect(upserts()).toHaveLength(2);
    expect(first.species).toBe('cat');
    // Same payload minus species — nothing else dropped or changed.
    const { species: _s, ...rest } = first;
    expect(retry).toEqual(rest);

    // Audited as today — the row that was actually stored.
    const audit = auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: 'create', entity_id: 'admin:cat-1' });
    expect(audit[0].after).not.toHaveProperty('species');
  });

  it('a dropped species: null saves silently (null already means dog)', async () => {
    overridesTable(null, withoutSpeciesColumn);
    const res = await save({ ...ROW, species: null });
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty('_notice');
    expect(upserts()).toHaveLength(2);
  });

  it('a save without species never retries and never carries a notice', async () => {
    overridesTable({ ...ROW, created_by: 'admin-0' }, withoutSpeciesColumn);
    const res = await save(ROW);
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty('_notice');
    expect(upserts()).toHaveLength(1);
    expect(auditRows()[0]).toMatchObject({ action: 'update' });
  });

  it('any other database error is unchanged: 500, no retry', async () => {
    overridesTable(null, () => ({ data: null, error: { code: '23514', message: 'check violated' } }));
    const res = await save({ ...ROW, species: 'cat' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'check violated' });
    expect(upserts()).toHaveLength(1);
    expect(auditRows()).toHaveLength(0);
  });

  it('a missing column that is not species is not swallowed', async () => {
    overridesTable(null, () => ({
      data: null,
      error: {
        code: 'PGRST204',
        message: "Could not find the 'focus_area' column of 'scenario_overrides' in the schema cache",
      },
    }));
    const res = await save({ ...ROW, species: 'cat', focus_area: 'gi' });
    expect(res.status).toBe(500);
    expect(upserts()).toHaveLength(1);
  });

  it('a retry that fails too is a 500', async () => {
    overridesTable(null, (payload) =>
      'species' in payload
        ? { data: null, error: PGRST204 }
        : { data: null, error: { message: 'connection reset' } },
    );
    const res = await save({ ...ROW, species: 'cat' });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'connection reset' });
    expect(auditRows()).toHaveLength(0);
  });
});

describe('POST op=duplicate — species', () => {
  it('copies a stored species onto the hidden duplicate', async () => {
    overridesTable({ ...ROW, species: 'cat', updated_at: 'x', updated_by: 'y' });
    const res = await save({ scenario_id: 'admin:cat-1' }, 'duplicate');
    expect(res.status).toBe(200);
    const [copy] = upserts();
    expect(copy.species).toBe('cat');
    expect(copy.visible).toBe(false);
    expect(copy.scenario_id).not.toBe('admin:cat-1');
    expect(await res.json()).not.toHaveProperty('_notice');
  });

  it('falls back without species (and says so) when the column is missing', async () => {
    overridesTable({ ...ROW, species: 'cat' }, withoutSpeciesColumn);
    const res = await save({ scenario_id: 'admin:cat-1' }, 'duplicate');
    expect(res.status).toBe(200);
    const json = (await res.json()) as Bag;
    expect(json._notice).toBe('species_column_missing');
    expect(upserts()).toHaveLength(2);
    expect(upserts()[1]).not.toHaveProperty('species');
    expect(auditRows()[0]).toMatchObject({ action: 'create' });
  });

  it('refuses to clone a stored species the validator no longer accepts', async () => {
    overridesTable({ ...ROW, species: 'hamster' });
    const res = await save({ scenario_id: 'admin:cat-1' }, 'duplicate');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Cannot duplicate: species must be dog or cat' });
  });
});

describe('POST upsert — deleted scenarios', () => {
  it('refuses to save over a soft-deleted admin scenario (409) instead of saving into a tombstone', async () => {
    overridesTable({ ...ROW, deleted_at: '2026-09-24T10:00:00Z', created_by: 'someone' });
    const res = await save({ ...ROW, visible: true });
    expect(res.status).toBe(409);
    expect(((await res.json()) as Bag).error).toMatch(/deleted/i);
    expect(upserts()).toHaveLength(0);
  });
});

describe('POST upsert — two admins, one scenario (baseUpdatedAt)', () => {
  const stored = { ...ROW, updated_at: '2026-09-27T10:00:00.000Z' };

  it('saves when the editor saw the row that is still there', async () => {
    overridesTable(stored);
    const res = await save({ ...ROW, baseUpdatedAt: stored.updated_at });
    expect(res.status).toBe(200);
    expect(upserts()).toHaveLength(1);
    // An existing row is UPDATED behind the tombstone guard, never upserted.
    expect(updateGuards()).toEqual([['deleted_at', null]]);
  });

  it('refuses (409 stale) when someone else saved since, and returns the row that won', async () => {
    overridesTable(stored);
    const res = await save({ ...ROW, breed: 'Ragdoll', baseUpdatedAt: '2026-09-27T09:00:00.000Z' });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code?: string; current?: Bag };
    expect(body.code).toBe('stale');
    expect(body.current?.updated_at).toBe(stored.updated_at);
    expect(upserts()).toHaveLength(0);
  });

  it('a null base means "there was no row" — a row created meanwhile is stale too', async () => {
    overridesTable(stored);
    const res = await save({ ...ROW, baseUpdatedAt: null });
    expect(res.status).toBe(409);
    expect(upserts()).toHaveLength(0);
  });

  it('a save without the token keeps working (older clients)', async () => {
    overridesTable(stored);
    expect((await save(ROW)).status).toBe(200);
  });

  it('a soft-delete landing between the read and the write is a 409, not a silent save into a tombstone', async () => {
    // The read still sees a live row; the guarded update then matches nothing.
    overridesTable(stored, () => ({ data: null, error: null }));
    const res = await save({ ...ROW, baseUpdatedAt: stored.updated_at });
    expect(res.status).toBe(409);
    expect(auditRows()).toHaveLength(0);
  });
});

describe('POST upsert — bounds the server used to trust the client on', () => {
  it('a custom pushback needs its notes — the notes ARE the pushback', async () => {
    overridesTable(null);
    const res = await save({ ...ROW, pushback_id: 'custom', pushback_notes: '   ' });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/custom pushback/);
    expect((await save({ ...ROW, pushback_id: 'custom', pushback_notes: 'Wants raw food' })).status).toBe(200);
  });

  it('caps every prose column (backstory, opening line, notes, title) instead of letting an unplayable scenario save', async () => {
    overridesTable(null);
    expect((await save({ ...ROW, context_override: 'x'.repeat(4001) })).status).toBe(400);
    expect((await save({ ...ROW, opening_line_override: 'x'.repeat(1001) })).status).toBe(400);
    expect((await save({ ...ROW, pushback_notes: 'x'.repeat(2001) })).status).toBe(400);
    expect((await save({ ...ROW, title_override: 'x'.repeat(121) })).status).toBe(400);
    expect((await save({ ...ROW, info_modal_title: 'x'.repeat(121) })).status).toBe(400);
    expect((await save({ ...ROW, context_override: 'x'.repeat(4000) })).status).toBe(200);
  });

  it('a non-string in a text column is a 400, not a database 500', async () => {
    overridesTable(null);
    const res = await save({ ...ROW, prompt_prefix: 12 as unknown as string });
    expect(res.status).toBe(400);
    expect(upserts()).toHaveLength(0);
  });

  it('sort_order must be a whole number the int column can hold', async () => {
    overridesTable(null);
    expect((await save({ ...ROW, sort_order: 1e21 })).status).toBe(400);
    expect((await save({ ...ROW, sort_order: 1.5 })).status).toBe(400);
    expect((await save({ ...ROW, sort_order: -3 })).status).toBe(200);
  });

  it('a delete without a scenario_id is a 400, not a TypeError', async () => {
    overridesTable(null);
    const res = await save({} as Bag, 'delete');
    expect(res.status).toBe(400);
  });

  it('an oversized body is refused before it is parsed', async () => {
    overridesTable(null);
    const res = await save({ ...ROW, context_override: 'x'.repeat(70 * 1024) });
    expect(res.status).toBe(413);
  });
});

describe('GET op=capabilities', () => {
  const capabilities = () =>
    handler(
      new Request('http://localhost/.netlify/functions/admin-scenario-overrides?op=capabilities', {
        headers: { authorization: 'Bearer admin' },
      }),
    );

  it('reports species: true when the column exists', async () => {
    sb.setHandler('scenario_overrides', () => ({ data: [], error: null }));
    const res = await capabilities();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ species: true });
  });

  it('reports species: false while the deferred migration is pending', async () => {
    sb.setHandler('scenario_overrides', () => ({
      data: null,
      error: { code: '42703', message: 'column scenario_overrides.species does not exist' },
    }));
    expect(await (await capabilities()).json()).toEqual({ species: false });
  });

  it('any other failure is a 500, not a false "unsupported"', async () => {
    sb.setHandler('scenario_overrides', () => ({ data: null, error: { code: '57014', message: 'timeout' } }));
    expect((await capabilities()).status).toBe(500);
  });
});
