import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadPublicObjections,
  publicOverrideRows,
  publicSimulationConfig,
  resetObjectionsProbe,
  resetSpeciesProbe,
  selectOverrideRows,
} from '../flags-resolve';
import type { TeamObjectionsRead } from '../_shared/objectionsStore';
import type { TeamObjection } from '../../../src/shared/scenarios/objections';

/**
 * flags-resolve is PUBLIC (`cache-control: public`). The trainee app renders
 * scenario cards and plays them; the admin's AI notes and the unpublished
 * drafts are not part of that, so they must never be in the response.
 */
describe('flags-resolve — what the public snapshot may carry', () => {
  const live = {
    scenario_id: 'admin:live',
    visible: true,
    sort_order: 2,
    breed: 'Lab',
    prompt_prefix: 'Only yield once a recheck date is offered.',
    prompt_suffix: 'Never mention the discount.',
    title_override: 'Buddy',
  };
  const hidden = {
    scenario_id: 'admin:draft',
    visible: false,
    sort_order: null,
    breed: 'Maine Coon',
    pushback_notes: 'Unpublished draft the team has not reviewed',
    prompt_prefix: 'answer key',
  };

  it('strips the AI notes from every live row and keeps the rest', () => {
    const [row] = publicOverrideRows([live as never]) as unknown as Array<Record<string, unknown>>;
    expect(row.prompt_prefix).toBeNull();
    expect(row.prompt_suffix).toBeNull();
    expect(row.breed).toBe('Lab');
    expect(row.title_override).toBe('Buddy');
    expect(row.visible).toBe(true);
  });

  it('strips copied_from (admin-only provenance) from every row', () => {
    const [row] = publicOverrideRows([
      { ...live, copied_from: 'user:0b1a3c9e-5d2f-4a6b-8c7d-9e0f1a2b3c4d' } as never,
    ]) as unknown as Array<Record<string, unknown>>;
    expect(row).not.toHaveProperty('copied_from');
    expect(row.breed).toBe('Lab');
  });

  it('reduces a hidden row to "this scenario is hidden" — no draft content leaves the server', () => {
    const [row] = publicOverrideRows([hidden as never]) as unknown as Array<Record<string, unknown>>;
    expect(row).toEqual({ scenario_id: 'admin:draft', visible: false, sort_order: null });
  });

  it('drops the global prompt tuning from the published simulation config, nothing else', () => {
    const cfg = {
      customerPromptPrefix: 'global answer key',
      customerPromptSuffix: 'x',
      scoring: { promptPrefix: 'scorer secret', promptSuffix: 'y', dimensions: [{ key: 'acknowledge', weight: 2 }] },
      rag: { enabled: true, k: 4 },
      drivers: { Activator: { style: 'fast' } },
    };
    expect(publicSimulationConfig(cfg)).toEqual({
      scoring: { dimensions: [{ key: 'acknowledge', weight: 2 }] },
      rag: { enabled: true, k: 4 },
      drivers: { Activator: { style: 'fast' } },
    });
    expect(publicSimulationConfig(null)).toBeNull();
    expect(publicSimulationConfig({ rag: { k: 2 } })).toEqual({ rag: { k: 2 } });
  });
});

/**
 * The trainee snapshot must survive a deploy that lands before a hand-run
 * migration: species (deferred) is tried first, then focus/knowledge, then
 * the base columns — and a missing `species` column must never cost the
 * focus_area / knowledge_slugs columns.
 */
describe('flags-resolve selectOverrideRows', () => {
  beforeEach(() => {
    resetSpeciesProbe();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('selects species with the full column list when the column exists', async () => {
    const select = vi.fn(async (columns: string) => ({ data: [{ columns }], error: null }));
    const rows = (await selectOverrideRows(select)) as Array<{ columns: string }>;
    expect(select).toHaveBeenCalledTimes(1);
    expect(rows[0].columns).toContain('species');
    expect(rows[0].columns).toContain('knowledge_slugs');
  });

  it('drops only species when that column is missing', async () => {
    const select = vi.fn(async (columns: string) =>
      columns.includes('species')
        ? { data: null, error: { code: '42703', message: 'column species does not exist' } }
        : { data: [{ columns }], error: null },
    );
    const rows = (await selectOverrideRows(select, 1_000_000)) as Array<{ columns: string }>;
    expect(select).toHaveBeenCalledTimes(2);
    expect(rows[0].columns).not.toContain('species');
    expect(rows[0].columns).toContain('focus_area');
  });

  it('remembers a missing species column, then re-probes later', async () => {
    const select = vi.fn(async (columns: string) =>
      columns.includes('species')
        ? { data: null, error: { code: '42703', message: 'column scenario_overrides.species does not exist' } }
        : { data: [], error: null },
    );
    await selectOverrideRows(select, 1_000_000);
    select.mockClear();
    await selectOverrideRows(select, 1_000_000 + 60_000);
    expect(select.mock.calls.map(([c]) => c.includes('species'))).toEqual([false]);
    select.mockClear();
    await selectOverrideRows(select, 1_000_000 + 11 * 60_000);
    expect(select.mock.calls[0][0]).toContain('species');
  });

  it('does not remember a transient failure — the next load tries species again', async () => {
    let fail = true;
    const select = vi.fn(async (columns: string) => {
      if (columns.includes('species') && fail) {
        fail = false;
        return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
      }
      return { data: [{ columns }], error: null };
    });
    await selectOverrideRows(select, 2_000_000);
    select.mockClear();
    const rows = (await selectOverrideRows(select, 2_000_000 + 1_000)) as Array<{ columns: string }>;
    expect(rows[0].columns).toContain('species');
  });

  it('falls back to the base columns, and throws the full-select error if even that fails', async () => {
    const fullError = { code: '42703', message: 'focus_area missing' };
    const base = vi.fn(async (columns: string) =>
      columns.includes('focus_area') ? { data: null, error: fullError } : { data: [{ ok: 1 }], error: null },
    );
    await expect(selectOverrideRows(base, 5_000_000)).resolves.toEqual([{ ok: 1 }]);

    resetSpeciesProbe();
    const none = vi.fn(async (columns: string) => ({
      data: null,
      error: columns.includes('focus_area') ? fullError : { code: 'x' },
    }));
    await expect(selectOverrideRows(none, 9_000_000)).rejects.toBe(fullError);
  });
});

/**
 * Team objections ride the public snapshot (the trainee app resolves saved
 * scenarios and builds its pickers from them). The table arrives with a
 * hand-run migration, so: a MISSING table is remembered for ten minutes, a
 * transient error serves the last good list and is not remembered.
 */
describe('flags-resolve loadPublicObjections', () => {
  const probiotics: TeamObjection = {
    id: 'team:probiotics',
    title: 'Probiotics',
    example: '"He does not need them."',
    titleFr: null,
    exampleFr: null,
    species: ['dog', 'cat'],
    focusArea: 'gi',
    coaching: {},
    visible: true,
    sortOrder: null,
    updatedAt: null,
  };
  const ok = (objections: TeamObjection[]): TeamObjectionsRead => ({ objections, missing: false, error: null });
  const missing: TeamObjectionsRead = {
    objections: [],
    missing: true,
    error: { code: 'PGRST205', message: "Could not find the table 'public.scenario_objections'" },
  };
  const blip: TeamObjectionsRead = {
    objections: [],
    missing: false,
    error: { code: '57014', message: 'canceling statement due to statement timeout' },
  };

  beforeEach(() => {
    resetObjectionsProbe();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('serves what the store read', async () => {
    const read = vi.fn(async () => ok([probiotics]));
    expect(await loadPublicObjections(read, 1_000)).toEqual([probiotics]);
  });

  it('remembers a missing table for ten minutes, then re-probes', async () => {
    const read = vi.fn(async () => missing);
    expect(await loadPublicObjections(read, 1_000_000)).toEqual([]);
    expect(await loadPublicObjections(read, 1_000_000 + 9 * 60_000)).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
    read.mockResolvedValueOnce(ok([probiotics]));
    expect(await loadPublicObjections(read, 1_000_000 + 11 * 60_000)).toEqual([probiotics]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('a transient error serves the last good list and is not remembered', async () => {
    const read = vi.fn(async () => ok([probiotics]));
    await loadPublicObjections(read, 2_000_000);
    read.mockResolvedValueOnce(blip);
    expect(await loadPublicObjections(read, 2_000_100)).toEqual([probiotics]);
    // The very next load reads again.
    expect(await loadPublicObjections(read, 2_000_200)).toEqual([probiotics]);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('a transient error before any good read is simply none', async () => {
    expect(await loadPublicObjections(async () => blip, 3_000_000)).toEqual([]);
  });
});
