import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSpeciesProbe, selectOverrideRows } from '../flags-resolve';

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
