/**
 * App-usage aggregation over `nav_events`, done on the server.
 *
 * The admin portal used to fetch the newest 1,000 events and count them in
 * the browser — a busy month (~4k events) was silently a fraction of itself.
 * `admin-analytics?op=engagement` now pages through EVERY event in the window
 * and folds it here into the small `EngagementReport`; one trainee's events
 * fold into `TraineeActivity` the same way.
 *
 * Pure, dependency-free and clock-injected (`now`, `tzOffsetMinutes`) so the
 * windows, buckets and calendar days are unit-tested. Time zone: the caller
 * sends `Date#getTimezoneOffset()` — minutes WEST of UTC — so
 * `local = utc − offset`. Calendar days, hours and weekdays are computed in
 * that fixed offset (across a DST change a bucket edge is an hour off, which
 * a usage chart can live with).
 *
 * `nav_events` rows are written by anonymous browsers too, so every string
 * that becomes a key (screen, target, `app_open` context) is length-capped
 * and every list is bounded — junk can't blow up the response.
 */
import type {
  ContextBreakdown,
  EngagementActionRow,
  EngagementBucket,
  EngagementPerUser,
  EngagementReport,
  EngagementScreenRow,
  EngagementTotals,
  TraineeActivity,
} from './contract';

export type EngagementRange = '24h' | '7d' | '28d' | '90d' | 'all';

export const ENGAGEMENT_RANGES: readonly EngagementRange[] = ['24h', '7d', '28d', '90d', 'all'];

export function isEngagementRange(v: unknown): v is EngagementRange {
  return typeof v === 'string' && (ENGAGEMENT_RANGES as readonly string[]).includes(v);
}

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
/**
 * How far ahead of "now" a client-stamped event may be and still count
 * (phones with a fast clock). Anything later is ignored, and the server reads
 * stop there, so junk dated in 2099 can never crowd real events out of a cap.
 */
export const FUTURE_SKEW_MS = 10 * 60 * 1000;

/** Window length in days; `all` is charted as a year (its totals count every row). */
export function engagementRangeDays(range: EngagementRange): number {
  switch (range) {
    case '24h':
      return 1;
    case '7d':
      return 7;
    case '28d':
      return 28;
    case '90d':
      return 90;
    case 'all':
      return 365;
  }
}

/** The `nav_events` columns the aggregation reads. */
export interface CompactNavRow {
  user_id: string | null;
  anon_session_id: string | null;
  event_type: string;
  screen: string | null;
  target: string | null;
  meta: unknown;
  dwell_ms: number | null;
  created_at: string;
}

export const NAV_EVENT_COLUMNS = 'id, user_id, anon_session_id, event_type, screen, target, meta, dwell_ms, created_at';

/** Longest screen / action / context value kept as a key. */
const MAX_KEY_LEN = 64;
/** Longest list of screens / actions returned. */
const MAX_ROWS = 200;
/** Distinct values kept per context dimension; the rest fold into "other". */
const MAX_CONTEXT_VALUES = 20;
/** Most recent events on a trainee's timeline. */
const RECENT_EVENTS = 60;

export const ACTIVE_DAY_BUCKETS = ['1', '2', '3-5', '6-10', '11+'] as const;

// ─── Small readers ─────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function key(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t.slice(0, MAX_KEY_LEN);
}

function ts(row: CompactNavRow): number | null {
  const t = typeof row.created_at === 'string' ? Date.parse(row.created_at) : NaN;
  return Number.isFinite(t) ? t : null;
}

function dwell(row: CompactNavRow): number {
  const d = row.dwell_ms;
  return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 0;
}

/** Visitor = the signed-in account, else the device; null when neither was recorded. */
function visitorOf(row: CompactNavRow): string | null {
  const u = key(row.user_id);
  if (u) return `u:${u}`;
  const a = key(row.anon_session_id);
  return a ? `a:${a}` : null;
}

/** The local calendar day of a timestamp, as YYYY-MM-DD. */
export function localDayKey(t: number, tzOffsetMinutes: number): string {
  return new Date(t - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

function isAction(row: CompactNavRow): boolean {
  return row.event_type !== 'screen_view' && row.event_type !== 'dwell' && row.event_type !== 'error';
}

function isAppOpen(row: CompactNavRow): boolean {
  return row.event_type === 'custom' && row.target === 'app_open';
}

// ─── Screens + actions (shared by the report and one trainee) ──────────

function screensOf(rows: readonly CompactNavRow[]): EngagementScreenRow[] {
  const map = new Map<string, { views: number; dwell_ms: number; visitors: Set<string> }>();
  for (const row of rows) {
    const screen = key(row.screen);
    if (!screen) continue;
    const isView = row.event_type === 'screen_view';
    const d = dwell(row);
    if (!isView && d === 0) continue;
    let s = map.get(screen);
    if (!s) map.set(screen, (s = { views: 0, dwell_ms: 0, visitors: new Set() }));
    if (isView) {
      s.views += 1;
      const v = visitorOf(row);
      if (v) s.visitors.add(v);
    }
    s.dwell_ms += d;
  }
  return [...map.entries()]
    .map(([screen, s]) => ({ screen, views: s.views, dwell_ms: s.dwell_ms, visitors: s.visitors.size }))
    .sort((a, b) => b.views - a.views || b.dwell_ms - a.dwell_ms || a.screen.localeCompare(b.screen))
    .slice(0, MAX_ROWS);
}

function actionsOf(rows: readonly CompactNavRow[]): EngagementActionRow[] {
  const map = new Map<string, { count: number; visitors: Set<string> }>();
  for (const row of rows) {
    if (!isAction(row)) continue;
    const action = key(row.target);
    if (!action) continue;
    let a = map.get(action);
    if (!a) map.set(action, (a = { count: 0, visitors: new Set() }));
    a.count += 1;
    const v = visitorOf(row);
    if (v) a.visitors.add(v);
  }
  return [...map.entries()]
    .map(([action, a]) => ({ action, count: a.count, visitors: a.visitors.size }))
    .sort((a, b) => b.count - a.count || a.action.localeCompare(b.action))
    .slice(0, MAX_ROWS);
}

// ─── `app_open` context ────────────────────────────────────────────────

export interface AppContext {
  device?: string;
  os?: string;
  installed?: boolean;
  locale?: string;
  theme?: string;
}

/** The context an `app_open` event reported; null when it carried none we can read. */
export function readAppContext(meta: unknown): AppContext | null {
  if (!isObj(meta)) return null;
  const out: AppContext = {};
  const device = key(meta.device);
  const os = key(meta.os);
  const locale = key(meta.locale);
  const theme = key(meta.theme);
  if (device) out.device = device.toLowerCase();
  if (os) out.os = os.toLowerCase();
  if (typeof meta.installed === 'boolean') out.installed = meta.installed;
  if (locale) out.locale = locale;
  if (theme) out.theme = theme.toLowerCase();
  return Object.keys(out).length > 0 ? out : null;
}

function breakdown(values: Map<string, number>): ContextBreakdown {
  const sorted = [...values.entries()]
    .map(([value, visitors]) => ({ value, visitors }))
    .sort((a, b) => b.visitors - a.visitors || a.value.localeCompare(b.value));
  if (sorted.length <= MAX_CONTEXT_VALUES) return sorted;
  const head = sorted.slice(0, MAX_CONTEXT_VALUES - 1);
  // Each visitor has one value per dimension, so the tail sums to distinct visitors.
  const rest = sorted.slice(MAX_CONTEXT_VALUES - 1).reduce((n, r) => n + r.visitors, 0);
  const other = head.find((r) => r.value === 'other');
  if (other) other.visitors += rest;
  else head.push({ value: 'other', visitors: rest });
  return head.sort((a, b) => b.visitors - a.visitors || a.value.localeCompare(b.value));
}

function contextOf(rows: readonly CompactNavRow[]): EngagementReport['context'] {
  // The LATEST app_open per visitor in the window: a trainee who installed
  // the app last week counts as installed, not as both.
  const latest = new Map<string, { t: number; ctx: AppContext }>();
  for (const row of rows) {
    if (!isAppOpen(row)) continue;
    const v = visitorOf(row);
    const t = ts(row);
    const ctx = readAppContext(row.meta);
    if (!v || t === null || !ctx) continue;
    const prev = latest.get(v);
    if (!prev || t >= prev.t) latest.set(v, { t, ctx });
  }
  const dims = {
    device: new Map<string, number>(),
    os: new Map<string, number>(),
    installed: new Map<string, number>(),
    locale: new Map<string, number>(),
    theme: new Map<string, number>(),
  };
  const bump = (m: Map<string, number>, value: string | undefined) => {
    if (value) m.set(value, (m.get(value) ?? 0) + 1);
  };
  for (const { ctx } of latest.values()) {
    bump(dims.device, ctx.device);
    bump(dims.os, ctx.os);
    bump(dims.installed, ctx.installed === undefined ? undefined : ctx.installed ? 'installed' : 'browser');
    bump(dims.locale, ctx.locale);
    bump(dims.theme, ctx.theme);
  }
  return {
    device: breakdown(dims.device),
    os: breakdown(dims.os),
    installed: breakdown(dims.installed),
    locale: breakdown(dims.locale),
    theme: breakdown(dims.theme),
  };
}

// ─── Totals ────────────────────────────────────────────────────────────

function totalsOf(rows: readonly CompactNavRow[], tzOffsetMinutes: number): EngagementTotals {
  const visitors = new Set<string>();
  const signedIn = new Set<string>();
  const daysByVisitor = new Map<string, Set<string>>();
  let screen_views = 0;
  let dwell_ms = 0;
  let sessions_started = 0;
  let hint_requests = 0;
  for (const row of rows) {
    const v = visitorOf(row);
    const t = ts(row);
    if (!v || t === null) continue;
    visitors.add(v);
    const u = key(row.user_id);
    if (u) signedIn.add(u);
    let days = daysByVisitor.get(v);
    if (!days) daysByVisitor.set(v, (days = new Set()));
    days.add(localDayKey(t, tzOffsetMinutes));
    if (row.event_type === 'screen_view') screen_views += 1;
    dwell_ms += dwell(row);
    if (row.target === 'session_open') sessions_started += 1;
    if (row.target === 'coach_hint_request') hint_requests += 1;
  }
  let returning_visitors = 0;
  for (const days of daysByVisitor.values()) if (days.size >= 2) returning_visitors += 1;
  return {
    visitors: visitors.size,
    signed_in: signedIn.size,
    screen_views,
    dwell_ms,
    sessions_started,
    hint_requests,
    returning_visitors,
  };
}

function histogramOf(rows: readonly CompactNavRow[], tzOffsetMinutes: number): EngagementReport['active_days_histogram'] {
  const daysByVisitor = new Map<string, Set<string>>();
  for (const row of rows) {
    const v = visitorOf(row);
    const t = ts(row);
    if (!v || t === null) continue;
    let days = daysByVisitor.get(v);
    if (!days) daysByVisitor.set(v, (days = new Set()));
    days.add(localDayKey(t, tzOffsetMinutes));
  }
  const counts: Record<(typeof ACTIVE_DAY_BUCKETS)[number], number> = { '1': 0, '2': 0, '3-5': 0, '6-10': 0, '11+': 0 };
  for (const days of daysByVisitor.values()) {
    const n = days.size;
    if (n <= 1) counts['1'] += 1;
    else if (n === 2) counts['2'] += 1;
    else if (n <= 5) counts['3-5'] += 1;
    else if (n <= 10) counts['6-10'] += 1;
    else counts['11+'] += 1;
  }
  return ACTIVE_DAY_BUCKETS.map((bucket) => ({ bucket, visitors: counts[bucket] }));
}

// ─── Trend buckets ─────────────────────────────────────────────────────

export interface TrendLayout {
  granularity: 'hour' | 'day' | 'week';
  /** Bucket starts, oldest first (ms epoch, aligned to the caller's local hour / midnight). */
  starts: number[];
  size: number;
  /** End of the newest bucket. */
  end: number;
}

/**
 * Trend buckets across the current window: 24 hourly buckets ending at the
 * end of the current local hour (24h), daily buckets up to 35 days, weekly
 * beyond — both ending at the end of today (local midnight).
 */
export function trendLayout(range: EngagementRange, now: number, tzOffsetMinutes: number): TrendLayout {
  const off = tzOffsetMinutes * 60_000;
  const localNow = now - off;
  if (range === '24h') {
    const end = Math.floor(localNow / HOUR_MS) * HOUR_MS + HOUR_MS + off;
    const starts = Array.from({ length: 24 }, (_, i) => end - (24 - i) * HOUR_MS);
    return { granularity: 'hour', starts, size: HOUR_MS, end };
  }
  const days = engagementRangeDays(range);
  const granularity = days > 35 ? 'week' : 'day';
  const size = (granularity === 'week' ? 7 : 1) * DAY_MS;
  const count = Math.ceil((days * DAY_MS) / size);
  const end = Math.floor(localNow / DAY_MS) * DAY_MS + DAY_MS + off;
  const starts = Array.from({ length: count }, (_, i) => end - (count - i) * size);
  return { granularity, starts, size, end };
}

function trendOf(rows: readonly CompactNavRow[], layout: TrendLayout): EngagementBucket[] {
  const first = layout.starts[0];
  const n = layout.starts.length;
  const visitors = layout.starts.map(() => new Set<string>());
  const views = layout.starts.map(() => 0);
  for (const row of rows) {
    const v = visitorOf(row);
    const t = ts(row);
    if (!v || t === null || t < first) continue;
    // A row stamped in the future (client clock skew) lands in the newest bucket.
    const i = t >= layout.end ? n - 1 : Math.min(n - 1, Math.floor((t - first) / layout.size));
    visitors[i].add(v);
    if (row.event_type === 'screen_view') views[i] += 1;
  }
  return layout.starts.map((start, i) => ({ start, visitors: visitors[i].size, screen_views: views[i] }));
}

function heatmapOf(rows: readonly CompactNavRow[], tzOffsetMinutes: number): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const row of rows) {
    if (row.event_type !== 'screen_view' || !visitorOf(row)) continue;
    const t = ts(row);
    if (t === null) continue;
    const local = new Date(t - tzOffsetMinutes * 60_000);
    grid[local.getUTCDay()][local.getUTCHours()] += 1;
  }
  return grid;
}

function perUserOf(rows: readonly CompactNavRow[], tzOffsetMinutes: number): EngagementPerUser[] {
  const map = new Map<
    string,
    { last: number; days: Set<string>; screen_views: number; dwell_ms: number; hint_requests: number }
  >();
  for (const row of rows) {
    const u = key(row.user_id);
    const t = ts(row);
    if (!u || t === null) continue;
    let p = map.get(u);
    if (!p) map.set(u, (p = { last: t, days: new Set(), screen_views: 0, dwell_ms: 0, hint_requests: 0 }));
    if (t > p.last) p.last = t;
    p.days.add(localDayKey(t, tzOffsetMinutes));
    if (row.event_type === 'screen_view') p.screen_views += 1;
    p.dwell_ms += dwell(row);
    if (row.target === 'coach_hint_request') p.hint_requests += 1;
  }
  return [...map.entries()]
    .map(([user_id, p]) => ({
      user_id,
      last_seen: new Date(p.last).toISOString(),
      active_days: p.days.size,
      screen_views: p.screen_views,
      dwell_ms: p.dwell_ms,
      hint_requests: p.hint_requests,
    }))
    .sort((a, b) => (a.last_seen < b.last_seen ? 1 : a.last_seen > b.last_seen ? -1 : 0));
}

// ─── The report ────────────────────────────────────────────────────────

export interface EngagementOptions {
  range: EngagementRange;
  now: number;
  tzOffsetMinutes: number;
}

/**
 * Fold `nav_events` rows into the Engagement tab's report. Rows should cover
 * the current window AND the one before it (twice the window), so the
 * headline totals can be compared; for `all` every row is current.
 */
export function aggregateEngagement(
  rows: readonly CompactNavRow[],
  { range, now, tzOffsetMinutes }: EngagementOptions,
): Omit<EngagementReport, 'scanned' | 'truncated' | 'generated_at'> {
  const len = engagementRangeDays(range) * DAY_MS;
  const currentStart = range === 'all' ? -Infinity : now - len;
  const previousStart = now - 2 * len;

  const current: CompactNavRow[] = [];
  const previous: CompactNavRow[] = [];
  const latest = now + FUTURE_SKEW_MS;
  for (const row of rows) {
    if (!visitorOf(row)) continue;
    const t = ts(row);
    if (t === null) continue;
    // Events are stamped by the client and anonymous visitors can write them:
    // a row from beyond clock skew in the future is not real and is ignored.
    if (t > latest) continue;
    // A row stamped slightly in the future (clock skew) counts as current.
    if (t >= currentStart) current.push(row);
    else if (range !== 'all' && t >= previousStart) previous.push(row);
  }

  const layout = trendLayout(range, now, tzOffsetMinutes);
  return {
    range,
    granularity: layout.granularity,
    current: totalsOf(current, tzOffsetMinutes),
    previous: range === 'all' ? null : totalsOf(previous, tzOffsetMinutes),
    trend: trendOf(current, layout),
    screens: screensOf(current),
    actions: actionsOf(current),
    heatmap: heatmapOf(current, tzOffsetMinutes),
    active_days_histogram: histogramOf(current, tzOffsetMinutes),
    context: contextOf(current),
    per_user: perUserOf(current, tzOffsetMinutes),
  };
}

// ─── One trainee ───────────────────────────────────────────────────────

export interface TraineeActivityOptions {
  now: number;
  tzOffsetMinutes: number;
}

/** Fold one trainee's events (the last 365 days) into their profile's activity card. */
export function aggregateTraineeActivity(
  rows: readonly CompactNavRow[],
  { now, tzOffsetMinutes }: TraineeActivityOptions,
): TraineeActivity {
  const latest = now + FUTURE_SKEW_MS;
  const dated = rows
    .map((row) => ({ row, t: ts(row) }))
    // Future-dated rows (client-stamped) are not real activity.
    .filter((x): x is { row: CompactNavRow; t: number } => x.t !== null && x.t <= latest)
    .sort((a, b) => b.t - a.t);
  const list = dated.map((x) => x.row);

  const yearAgo = now - 365 * DAY_MS;
  const days = new Set<string>();
  let screen_views = 0;
  let dwell_ms = 0;
  let lastContext: AppContext | null = null;
  for (const { row, t } of dated) {
    if (t >= yearAgo) days.add(localDayKey(t, tzOffsetMinutes));
    if (row.event_type === 'screen_view') screen_views += 1;
    dwell_ms += dwell(row);
    // Newest first, so the first readable app_open is the latest.
    if (!lastContext && isAppOpen(row)) lastContext = readAppContext(row.meta);
  }

  return {
    first_seen: dated.length ? new Date(dated[dated.length - 1].t).toISOString() : null,
    last_seen: dated.length ? new Date(dated[0].t).toISOString() : null,
    active_days: [...days].sort(),
    screen_views,
    dwell_ms,
    screens: screensOf(list),
    actions: actionsOf(list),
    last_context: lastContext,
    recent: dated.slice(0, RECENT_EVENTS).map(({ row, t }) => ({
      at: new Date(t).toISOString(),
      type: key(row.event_type) ?? 'unknown',
      screen: key(row.screen),
      action: key(row.target),
    })),
  };
}
