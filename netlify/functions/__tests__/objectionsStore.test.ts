// @vitest-environment node
/**
 * `_shared/objectionsStore` — the one place the server reads team objections
 * and recognises "migration 20261012000000_scenario_objections.sql has not
 * been applied". A real fault must never be mistaken for that state.
 */
import { describe, expect, it } from 'vitest';
import { makeFakeSupabase } from './fakeSupabase';
import {
  isMissingCategoriesTable,
  isMissingCopiedFromColumn,
  isMissingObjectionsMigration,
  isMissingObjectionsTable,
  readCategories,
  readTeamObjections,
  toCategories,
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
    category_id: 'category:feline-health',
    coaching: { rootConcerns: [' x ', 'x', ''] },
    visible: true,
    sort_order: null,
  };

  it('reads live rows only, drops what cannot be an objection, and sorts', async () => {
    const sb = makeFakeSupabase({
      scenario_objections: () => ({
        data: [
          good,
          { ...good, id: 'team:a-topic', title: 'A topic' },
          { ...good, id: 'cost' },
          { ...good, species: [] },
          // An objection must be filed under a category (shape-checked here;
          // existence is admin-objections' job).
          { ...good, id: 'team:c-topic', category_id: null },
          { ...good, id: 'team:d-topic', category_id: 'Probiotics' },
        ],
        error: null,
      }),
    });
    const read = await readTeamObjections(sb.client as unknown as SupabaseClient);
    expect(read.error).toBeNull();
    expect(read.missing).toBe(false);
    expect(read.objections.map((o) => o.id)).toEqual(['team:a-topic', 'team:b-topic']);
    expect(read.objections[1]).toMatchObject({ categoryId: 'category:feline-health', coaching: { rootConcerns: ['x'] } });
    expect(read.objections[1]).not.toHaveProperty('focusArea');
    expect(String(sb.firstOp('scenario_objections', 'select')?.args[0])).toContain('category_id');
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

describe('isMissingCategoriesTable', () => {
  const missing = {
    code: 'PGRST205',
    message: "Could not find the table 'public.scenario_objection_categories' in the schema cache",
  };

  it('recognises a missing scenario_objection_categories — and only that table', () => {
    expect(isMissingCategoriesTable(missing)).toBe(true);
    expect(
      isMissingCategoriesTable({ code: '42P01', message: 'relation "public.scenario_objection_categories" does not exist' }),
    ).toBe(true);
    // The two table names never match each other's test.
    expect(isMissingCategoriesTable({ ...missing, message: "Could not find the table 'public.scenario_objections'" })).toBe(
      false,
    );
    expect(isMissingObjectionsTable(missing)).toBe(false);
    expect(isMissingCategoriesTable({ code: '57014', message: 'scenario_objection_categories timeout' })).toBe(false);
    expect(isMissingCategoriesTable(null)).toBe(false);
  });

  it('isMissingObjectionsMigration is either table', () => {
    expect(isMissingObjectionsMigration(missing)).toBe(true);
    expect(
      isMissingObjectionsMigration({ code: 'PGRST205', message: "Could not find the table 'public.scenario_objections'" }),
    ).toBe(true);
    expect(isMissingObjectionsMigration({ code: 'PGRST205', message: "Could not find the table 'public.flags'" })).toBe(
      false,
    );
  });
});

describe('readCategories', () => {
  const row = {
    id: 'category:probiotics',
    name: ' Probiotics ',
    name_fr: null,
    description: 'Gut health.',
    focus_area: 'not-a-topic',
    knowledge_slugs: ['a', 'a', ' b '],
    sort_order: null,
    updated_at: '2026-10-12T10:00:00+00:00',
  };

  it('reads live rows only, drops what cannot be a category, and sorts', async () => {
    const sb = makeFakeSupabase({
      scenario_objection_categories: () => ({
        data: [
          row,
          { ...row, id: 'weight', name: 'Weight & obesity', sort_order: 20 },
          { ...row, id: 'team:probiotics' },
          { ...row, id: 'category:nameless', name: '  ' },
        ],
        error: null,
      }),
    });
    const read = await readCategories(sb.client as unknown as SupabaseClient);
    expect(read).toMatchObject({ error: null, missing: false });
    expect(read.categories.map((c) => c.id)).toEqual(['weight', 'category:probiotics']);
    expect(read.categories[1]).toMatchObject({
      name: 'Probiotics',
      focusArea: null,
      knowledgeSlugs: ['a', 'b'],
      builtIn: false,
    });
    expect(read.categories[0].builtIn).toBe(true);
    expect(sb.firstOp('scenario_objection_categories', 'is')?.args).toEqual(['deleted_at', null]);
    expect(String(sb.firstOp('scenario_objection_categories', 'select')?.args[0])).not.toMatch(/created_by|updated_by/);
  });

  it('reports a missing table as missing, anything else as an error — and never throws', async () => {
    const missing = makeFakeSupabase({
      scenario_objection_categories: () => ({
        data: null,
        error: { code: 'PGRST205', message: "Could not find the table 'public.scenario_objection_categories'" },
      }),
    });
    expect(await readCategories(missing.client as unknown as SupabaseClient)).toMatchObject({
      categories: [],
      missing: true,
    });
    const broken = makeFakeSupabase({
      scenario_objection_categories: () => {
        throw new Error('socket hang up');
      },
    });
    expect(await readCategories(broken.client as unknown as SupabaseClient)).toEqual({
      categories: [],
      missing: false,
      error: { message: 'socket hang up' },
    });
  });

  it('toCategories tolerates a non-array', () => {
    expect(toCategories(null)).toEqual([]);
    expect(toCategories({})).toEqual([]);
  });
});
