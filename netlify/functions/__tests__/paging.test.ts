// @vitest-environment node
/**
 * `selectAll` — the pager every analytics read goes through, because
 * PostgREST answers at most 1,000 rows per request whatever `limit` says.
 * Pins: it reads past 1,000, stops on a short page, honours the cap and only
 * calls the result truncated when a row really exists past it, surfaces the
 * first error, dedupes rows a concurrent insert shifted onto the next page,
 * and requests parallel batches without overshooting the cap.
 */
import { describe, expect, it, vi } from 'vitest';
import { selectAll, type PageResult } from '../_shared/paging';

/** A table of `n` rows that, like PostgREST, never returns more than `serverCap` per request. */
function table(n: number, serverCap = 1000) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const calls: Array<[number, number]> = [];
  const query = vi.fn(async (from: number, to: number): Promise<PageResult> => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + serverCap);
    return { data: rows.slice(from, end), error: null };
  });
  return { query, calls };
}

describe('selectAll', () => {
  it('reads every row past the 1,000-row page', async () => {
    const t = table(2500);
    const res = await selectAll<{ id: number }>(t.query);
    expect(res.error).toBeNull();
    expect(res.truncated).toBe(false);
    expect(res.rows).toHaveLength(2500);
    expect(res.rows[2499]).toEqual({ id: 2499 });
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('stops after a short first page (one request)', async () => {
    const t = table(12);
    const res = await selectAll(t.query);
    expect(res.rows).toHaveLength(12);
    expect(t.calls).toEqual([[0, 999]]);
  });

  it('an exact multiple of the page size costs one empty request, not truncation', async () => {
    const t = table(2000);
    const res = await selectAll(t.query);
    expect(res.rows).toHaveLength(2000);
    expect(res.truncated).toBe(false);
    expect(t.calls.at(-1)).toEqual([2000, 2999]);
  });

  it('caps at max and says truncated only when another row exists', async () => {
    const more = table(3000);
    const capped = await selectAll(more.query, { max: 1500 });
    expect(capped.rows).toHaveLength(1500);
    expect(capped.truncated).toBe(true);
    // Pages never ask past the cap; one single-row probe decides.
    expect(more.calls).toEqual([
      [0, 999],
      [1000, 1499],
      [1500, 1500],
    ]);

    const exact = table(1500);
    const fits = await selectAll(exact.query, { max: 1500 });
    expect(fits.rows).toHaveLength(1500);
    expect(fits.truncated).toBe(false);
  });

  it('a cap the data never reaches is not truncation', async () => {
    const t = table(700);
    const res = await selectAll(t.query, { max: 5000 });
    expect(res.rows).toHaveLength(700);
    expect(res.truncated).toBe(false);
  });

  it('returns the first error (with what was read before it)', async () => {
    const query = vi.fn(async (from: number): Promise<PageResult> =>
      from === 0
        ? { data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null }
        : { data: null, error: { message: 'boom' } },
    );
    const res = await selectAll(query);
    expect(res.error).toEqual({ message: 'boom' });
    expect(res.rows).toHaveLength(1000);
    expect(res.truncated).toBe(false);
  });

  it('turns a thrown page into an error instead of rejecting', async () => {
    const res = await selectAll(async () => {
      throw new Error('socket hang up');
    });
    expect(res.error?.message).toBe('socket hang up');
    expect(res.rows).toEqual([]);
  });

  it('drops a row repeated across pages (an insert shifted the offsets)', async () => {
    const pages = [
      Array.from({ length: 3 }, (_, i) => ({ id: i })),
      [{ id: 2 }, { id: 3 }],
    ];
    let n = 0;
    const res = await selectAll<{ id: number }>(async () => ({ data: pages[n++] ?? [], error: null }), {
      pageSize: 3,
      dedupeBy: (r) => r.id,
    });
    expect(res.rows.map((r) => r.id)).toEqual([0, 1, 2, 3]);
  });

  it('runs pages in parallel batches and stops at the first short page', async () => {
    const t = table(2500);
    const res = await selectAll(t.query, { concurrency: 4 });
    expect(res.rows).toHaveLength(2500);
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [3000, 3999],
    ]);
  });

  it('parallel batches respect the cap too', async () => {
    const t = table(10_000);
    const res = await selectAll(t.query, { concurrency: 4, max: 2500 });
    expect(res.rows).toHaveLength(2500);
    expect(res.truncated).toBe(true);
    expect(t.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2499],
      [2500, 2500],
    ]);
  });

  it('treats a missing data array as an empty page', async () => {
    const res = await selectAll(async () => ({ data: null, error: null }));
    expect(res).toEqual({ rows: [], truncated: false, error: null });
  });
});
