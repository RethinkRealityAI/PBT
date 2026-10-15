/**
 * Read EVERY row a query matches, a page at a time.
 *
 * Supabase (PostgREST) answers at most 1,000 rows per request whatever
 * `.limit()` says, so a plain `.limit(5000)` silently stops at 1,000 — the
 * admin screens used to count a busy month as if it had 1,000 events. Every
 * analytics read pages with `.range(from, to)` through here instead, up to a
 * hard cap (`max`), and reports `truncated` when the cap stopped it so the
 * screen can say "showing the newest N" instead of presenting a partial
 * count as the whole.
 *
 * The query must be ORDERED (and ideally tie-broken on a unique column):
 * offset paging over an unordered result can repeat or skip rows. A row
 * inserted while the pages are being read shifts later pages by one; pass
 * `dedupeBy` (the primary key) so a repeat is dropped rather than counted
 * twice.
 */

export interface PageError {
  message: string;
  code?: string;
}

/** What one page request resolves to — the shape of an awaited Supabase builder. */
export interface PageResult {
  data: unknown;
  error: PageError | null;
}

export interface SelectAllOptions<T> {
  /** Rows per request. 1,000 = PostgREST's default `max-rows`. */
  pageSize?: number;
  /** Hard cap on rows returned; `truncated` is set when more may exist. */
  max?: number;
  /** Pages requested in parallel (default 1). Each batch stops the read when any page comes back short. */
  concurrency?: number;
  /** Drop a row whose key was already read (a concurrent insert shifts offsets). */
  dedupeBy?: (row: T) => unknown;
}

export interface SelectAllResult<T> {
  rows: T[];
  /** True when `max` stopped the read and at least one more row exists. */
  truncated: boolean;
  /** The first page error, if any (rows read before it are still returned). */
  error: PageError | null;
}

export const DEFAULT_PAGE_SIZE = 1000;

async function runPage(
  makeQuery: (from: number, to: number) => PromiseLike<PageResult>,
  from: number,
  to: number,
): Promise<PageResult> {
  try {
    const res = await makeQuery(from, to);
    return { data: res?.data ?? null, error: res?.error ?? null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/**
 * Page through a query. `makeQuery(from, to)` builds a FRESH query for the
 * inclusive row range (`.range(from, to)` on a Supabase builder).
 *
 * Stops when a page returns fewer rows than it asked for, or when `max` rows
 * have been read — then one single-row probe past the cap decides whether
 * the result was really cut short.
 */
export async function selectAll<T>(
  makeQuery: (from: number, to: number) => PromiseLike<PageResult>,
  options: SelectAllOptions<T> = {},
): Promise<SelectAllResult<T>> {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? DEFAULT_PAGE_SIZE));
  const max =
    options.max === undefined || !Number.isFinite(options.max) ? Infinity : Math.max(0, Math.floor(options.max));
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 1));
  const seen = options.dedupeBy ? new Set<unknown>() : null;

  const rows: T[] = [];
  // Offsets advance by what was REQUESTED, not by what was kept, so a dropped
  // duplicate never makes the next page re-read the same window.
  let offset = 0;

  const keep = (data: unknown): number => {
    const list = Array.isArray(data) ? (data as T[]) : [];
    for (const row of list) {
      if (seen && options.dedupeBy) {
        const key = options.dedupeBy(row);
        if (key !== undefined && key !== null) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
      }
      rows.push(row);
    }
    return list.length;
  };

  for (;;) {
    const batch: Array<{ from: number; to: number }> = [];
    for (let i = 0; i < concurrency; i++) {
      const from = offset + i * pageSize;
      if (from >= max) break;
      const to = Math.min(from + pageSize, max) - 1;
      batch.push({ from, to });
    }
    if (batch.length === 0) break; // the cap is reached

    const results = await Promise.all(batch.map((b) => runPage(makeQuery, b.from, b.to)));
    for (let i = 0; i < batch.length; i++) {
      const res = results[i];
      if (res.error) return { rows: trim(rows, max), truncated: false, error: res.error };
      const got = keep(res.data);
      if (got < batch[i].to - batch[i].from + 1) {
        // A short page is the end of the result; later pages of this batch
        // (if any) asked past it and came back empty.
        return { rows: trim(rows, max), truncated: rows.length > max, error: null };
      }
    }
    offset = batch[batch.length - 1].to + 1;
  }

  // Every page up to the cap came back full: is there anything past it?
  const probe = await runPage(makeQuery, max, max);
  const more = probe.error ? true : Array.isArray(probe.data) && probe.data.length > 0;
  return { rows: trim(rows, max), truncated: more || rows.length > max, error: null };
}

function trim<T>(rows: T[], max: number): T[] {
  return rows.length > max ? rows.slice(0, max) : rows;
}
