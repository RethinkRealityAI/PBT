/**
 * Time windows for the Analytics tabs.
 *
 * Every headline number is shown against the PREVIOUS window of the same
 * length ("+12% vs the 28 days before"), which is the comparison a manager
 * actually wants — a number on its own can't say whether things got better.
 * To compute it the tabs fetch twice the window (`fetchSince`) and split the
 * rows with `splitByPeriod`.
 *
 * Pure and clock-injectable (`now`) so it is unit-tested.
 */

export type Range = '24h' | '7d' | '28d' | '90d' | 'all';

export const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_DAYS: Record<Exclude<Range, 'all'>, number> = { '24h': 1, '7d': 7, '28d': 28, '90d': 90 };

/** Length of the window in days; `all` is charted as a year. */
export function rangeDays(range: Range): number {
  return range === 'all' ? 365 : RANGE_DAYS[range];
}

/** Does this range have a previous window to compare against? */
export function hasComparison(range: Range): boolean {
  return range !== 'all';
}

export interface Window {
  start: number;
  end: number;
}

/** The current window and the one immediately before it, same length. */
export function windows(range: Range, now = Date.now()): { current: Window; previous: Window | null } {
  if (range === 'all') return { current: { start: 0, end: now }, previous: null };
  const len = rangeDays(range) * DAY_MS;
  return {
    current: { start: now - len, end: now },
    previous: { start: now - 2 * len, end: now - len },
  };
}

/** ISO `since` to fetch: twice the window, so the previous period is in hand. */
export function fetchSince(range: Range, now = Date.now()): string {
  if (range === 'all') return new Date(0).toISOString();
  return new Date(now - 2 * rangeDays(range) * DAY_MS).toISOString();
}

/** "last 28 days" — what a tile label says the window is. */
export function rangeWords(range: Range): string {
  switch (range) {
    case '24h':
      return 'last 24 hours';
    case '7d':
      return 'last 7 days';
    case '28d':
      return 'last 28 days';
    case '90d':
      return 'last 90 days';
    case 'all':
      return 'all time';
  }
}

/** "vs previous 28 days" — the comparison a delta is against. */
export function compareWords(range: Range): string {
  switch (range) {
    case '24h':
      return 'vs the day before';
    case '7d':
      return 'vs previous 7 days';
    case '28d':
      return 'vs previous 28 days';
    case '90d':
      return 'vs previous 90 days';
    case 'all':
      return '';
  }
}

function ts(row: { created_at: string }): number {
  return new Date(row.created_at).getTime();
}

/**
 * Split rows into the current and previous window. A row stamped slightly in
 * the future (client/server clock skew) counts as current rather than
 * vanishing.
 */
export function splitByPeriod<T extends { created_at: string }>(
  rows: readonly T[],
  range: Range,
  now = Date.now(),
): { current: T[]; previous: T[] } {
  const { current, previous } = windows(range, now);
  const cur: T[] = [];
  const prev: T[] = [];
  for (const r of rows) {
    const t = ts(r);
    if (!Number.isFinite(t)) continue;
    if (t >= current.start) cur.push(r);
    else if (previous && t >= previous.start) prev.push(r);
  }
  return { current: cur, previous: prev };
}

// ─── Deltas ────────────────────────────────────────────────────────────

export interface Delta {
  /** 'pct' compares counts (+12%); 'points' compares scores/rates (+3 pts). */
  kind: 'pct' | 'points';
  value: number;
}

/** Percentage change in a count. Null when there is nothing earlier to compare. */
export function pctDelta(current: number, previous: number | null | undefined): Delta | null {
  if (previous == null || !Number.isFinite(previous) || previous <= 0) return null;
  if (!Number.isFinite(current)) return null;
  return { kind: 'pct', value: ((current - previous) / previous) * 100 };
}

/** Point change in a score or a rate (both already on a 0–100 scale). */
export function pointsDelta(current: number | null, previous: number | null): Delta | null {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return { kind: 'points', value: current - previous };
}

export function formatDelta(d: Delta): { text: string; direction: 'up' | 'down' | 'flat' } {
  const rounded = Math.round(d.value);
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const abs = Math.abs(rounded);
  if (d.kind === 'pct') return { text: direction === 'flat' ? 'No change' : `${abs}%`, direction };
  return { text: direction === 'flat' ? 'No change' : `${abs} pt${abs === 1 ? '' : 's'}`, direction };
}

// ─── Buckets ───────────────────────────────────────────────────────────

export interface Bucket {
  start: number;
  end: number;
  label: string;
}

/**
 * Time buckets across the current window: hourly for 24h, daily up to 35
 * days, weekly beyond. Oldest first.
 */
export function buckets(range: Range, now = Date.now()): { granularity: 'hour' | 'day' | 'week'; list: Bucket[] } {
  const days = rangeDays(range);
  if (range === '24h') {
    const list: Bucket[] = [];
    const endHour = Math.ceil(now / 3_600_000) * 3_600_000;
    for (let i = 23; i >= 0; i--) {
      const end = endHour - i * 3_600_000;
      const start = end - 3_600_000;
      list.push({ start, end, label: new Date(start).toLocaleTimeString('en-US', { hour: 'numeric' }) });
    }
    return { granularity: 'hour', list };
  }
  const granularity = days > 35 ? 'week' : 'day';
  const size = (granularity === 'week' ? 7 : 1) * DAY_MS;
  const count = Math.ceil((days * DAY_MS) / size);
  // Anchor on the end of today (local) so a day bucket is a calendar day.
  const endOfToday = new Date(now);
  endOfToday.setHours(24, 0, 0, 0);
  const anchor = endOfToday.getTime();
  const list: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const end = anchor - i * size;
    const start = end - size;
    list.push({
      start,
      end,
      label: new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }
  return { granularity, list };
}

/** Index of the bucket a timestamp falls in, or -1. */
export function bucketIndex(list: readonly Bucket[], t: number): number {
  if (list.length === 0) return -1;
  if (t >= list[list.length - 1].end) return list.length - 1; // future skew → newest
  for (let i = list.length - 1; i >= 0; i--) if (t >= list[i].start && t < list[i].end) return i;
  return -1;
}

/** Thin out x-axis ticks so labels don't collide (~8 visible). */
export function tickEvery(n: number, target = 8): number {
  return Math.max(0, Math.ceil(n / target) - 1);
}

// ─── Small numeric helpers ─────────────────────────────────────────────

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function pct(n: number, d: number): number | null {
  return d > 0 ? (n / d) * 100 : null;
}

/** Local calendar-day key (YYYY-MM-DD) — streaks and calendars count local days. */
export function dayKey(t: number): string {
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
