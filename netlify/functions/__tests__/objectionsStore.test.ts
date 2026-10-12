// @vitest-environment node
/**
 * `_shared/objectionsStore` — the one place the server reads team objections
 * and recognises "migration 20261012000000_scenario_objections.sql has not
 * been applied". A real fault must never be mistaken for that state.
 */
import { describe, expect, it } from 'vitest';
import { makeFakeSupabase } from './fakeSupabase';
import {
  isMissingCopiedFromColumn,
  isMissingObjectionsTable,
  readTeamObjections,
  toTeamObjections,
} from '../_shared/objectionsStore';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('isMissingObjectionsTable', () => {
  it('recognises PostgREST and Postgres "no such table" errors that name scenario_objections', () => {
    expect(
      isMissingObjectionsTable({
        code: 'PGRST205',
        message: "Could not find the table 'public.scenario_objections' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingObjectionsTable({ code: '42P01', message: 'relation "public.scenario_objections" does not exist' }),
    ).toBe(true);
  });

  it('ignores every other error — including a different missing table', () => {
    expect(isMissingObjectionsTable(null)).toBe(false);
    expect(isMissingObjectionsTable({ code: 'PGRST205', message: "Could not find the table 'public.flags'" })).toBe(
      false,
    );
    expect(isMissingObjectionsTable({ code: '57014', message: 'scenario_objections timeout' })).toBe(false);
    expect(isMissingObjectionsTable({ message: 'scenario_objections' })).toBe(false);
  });
});

describe('isMissingCopiedFromColumn', () => {
  it('recognises a missing copied_from column on a write or a select', () => {
    expect(
      isMissingCopiedFromColumn({
        code: 'PGRST204',
        message: "Could not find the 'copied_from' column of 'scenario_overrides' in the schema cache",
      }),
    ).toBe(true);
    expect(
      isMissingCopiedFromColumn({ code: '42703', message: 'column scenario_overrides.copied_from does not exist' }),
    ).toBe(true);
  });

  it('does not swallow another missing column', () => {
    expect(
      isMissingCopiedFromColumn({
        code: 'PGRST204',
        message: "Could not find the 'species' column of 'scenario_overrides' in the schema cache",
      }),
    ).toBe(false);
    expect(isMissingCopiedFromColumn({ code: '23514', message: 'copied_from check' })).toBe(false);
  });
});

describe('readTeamObjections', () => {
  const good = {
    id: 'team:b-topic',
    title: 'B topic',
    example: '',
    species: ['cat'],
    focus_area: 'not-a-topic',
    coaching: { rootConcerns: [' x ', 'x', ''] },
    visible: true,
    sort_order: null,
  };

  it('reads live rows only, drops what cannot be an objection, and sorts', async () => {
    const sb = makeFakeSupabase({
      scenario_objections: () => ({
        data: [good, { ...good, id: 'team:a-topic', title: 'A topic' }, { ...good, id: 'cost' }, { ...good, species: [] }],
        error: null,
      }),
    });
    const read = await readTeamObjections(sb.client as unknown as SupabaseClient);
    expect(read.error).toBeNull();
    expect(read.missing).toBe(false);
    expect(read.objections.map((o) => o.id)).toEqual(['team:a-topic', 'team:b-topic']);
    expect(read.objections[1]).toMatchObject({ focusArea: null, coaching: { rootConcerns: ['x'] } });
    expect(sb.firstOp('scenario_objections', 'is')?.args).toEqual(['deleted_at', null]);
    expect(String(sb.firstOp('scenario_objections', 'select')?.args[0])).not.toMatch(/created_by|updated_by/);
  });

  it('reports a missing table as missing, anything else as an error — and never throws', async () => {
    const missing = makeFakeSupabase({
      scenario_objections: () => ({
        data: null,
        error: { code: 'PGRST205', message: "Could not find the table 'public.scenario_objections'" },
      }),
    });
    expect(await readTeamObjections(missing.client as unknown as SupabaseClient)).toMatchObject({
      objections: [],
      missing: true,
    });
    const broken = makeFakeSupabase({
      scenario_objections: () => {
        throw new Error('socket hang up');
      },
    });
    expect(await readTeamObjections(broken.client as unknown as SupabaseClient)).toEqual({
      objections: [],
      missing: false,
      error: { message: 'socket hang up' },
    });
  });

  it('toTeamObjections tolerates a non-array', () => {
    expect(toTeamObjections(null)).toEqual([]);
    expect(toTeamObjections({})).toEqual([]);
  });
});
