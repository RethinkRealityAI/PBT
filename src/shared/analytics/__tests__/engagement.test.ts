/**
 * Server-side engagement aggregation over `nav_events`. Clock and time zone
 * are injected, so these pin: the current / previous windows (and `all`),
 * trend bucket layout (hourly / daily / weekly, aligned to the caller's
 * local hour and midnight — including half-hour zones), the calendar shift a
 * time zone causes (days, heatmap), returning visitors and the active-days
 * histogram, the `app_open` context (latest per visitor), per-user rows, and
 * the one-trainee activity fold.
 */
import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  HOUR_MS,
  aggregateEngagement,
  aggregateTraineeActivity,
  isEngagementRange,
  localDayKey,
  readAppContext,
  trendLayout,
  type CompactNavRow,
} from '../engagement';

/** Thursday 2026-10-15, 15:30 UTC (11:30 in New York, EDT = offset 240). */
const NOW = Date.parse('2026-10-15T15:30:00.000Z');
const EDT = 240;
const IST = -330;

let seq = 0;
function ev(over: Partial<CompactNavRow> & { at: number }): CompactNavRow {
  const { at, ...rest } = over;
  seq += 1;
  return {
    user_id: null,
    anon_session_id: `device-${seq}`,
    event_type: 'screen_view',
    screen: 'home',
    target: null,
    meta: null,
    dwell_ms: null,
    created_at: new Date(at).toISOString(),
    ...rest,
  };
}

const ago = (ms: number) => NOW - ms;

describe('ranges', () => {
  it('accepts only the five ranges', () => {
    for (const r of ['24h', '7d', '28d', '90d', 'all']) expect(isEngagementRange(r)).toBe(true);
    for (const r of ['30d', '', 'ALL', null, 7]) expect(isEngagementRange(r)).toBe(false);
  });
});

describe('windows', () => {
  it('splits current vs the same-length window before; older rows count in neither', () => {
    const rows = [
      ev({ at: ago(1 * DAY_MS), user_id: 'u1' }),
      ev({ at: ago(2 * DAY_MS), anon_session_id: 'dev-a' }),
      ev({ at: ago(8 * DAY_MS), user_id: 'u1' }),
      ev({ at: ago(15 * DAY_MS), user_id: 'u2' }),
      // Clock skew: a row from the future counts as current, not lost.
      ev({ at: NOW + 60_000, anon_session_id: 'dev-b' }),
    ];
    const r = aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: 0 });
    expect(r.range).toBe('7d');
    expect(r.current.screen_views).toBe(3);
    expect(r.current.visitors).toBe(3);
    expect(r.current.signed_in).toBe(1);
    expect(r.previous).toEqual({
      visitors: 1,
      signed_in: 1,
      screen_views: 1,
      dwell_ms: 0,
      sessions_started: 0,
      hint_requests: 0,
      returning_visitors: 0,
    });
  });

  it('all: every row counts, no comparison, the trend charts a year', () => {
    const rows = [ev({ at: ago(2 * DAY_MS) }), ev({ at: ago(500 * DAY_MS) })];
    const r = aggregateEngagement(rows, { range: 'all', now: NOW, tzOffsetMinutes: 0 });
    expect(r.previous).toBeNull();
    expect(r.current.screen_views).toBe(2);
    expect(r.granularity).toBe('week');
    expect(r.trend).toHaveLength(53);
    // The 500-day-old view is in the totals, not on the year chart.
    expect(r.trend.reduce((n, b) => n + b.screen_views, 0)).toBe(1);
  });

  it('counts totals: dwell, sessions started, hint requests; skips rows with no visitor', () => {
    const rows = [
      ev({ at: ago(HOUR_MS), user_id: 'u1', event_type: 'dwell', dwell_ms: 5000 }),
      ev({ at: ago(HOUR_MS), user_id: 'u1', event_type: 'custom', screen: 'chat', target: 'session_open' }),
      ev({ at: ago(HOUR_MS), user_id: 'u1', event_type: 'custom', screen: 'chat', target: 'coach_hint_request' }),
      ev({ at: ago(HOUR_MS), user_id: 'u1', event_type: 'dwell', dwell_ms: -20 }),
      ev({ at: ago(HOUR_MS), user_id: null, anon_session_id: null }),
      ev({ at: ago(HOUR_MS), user_id: null, anon_session_id: '   ' }),
    ];
    const r = aggregateEngagement(rows, { range: '24h', now: NOW, tzOffsetMinutes: 0 });
    expect(r.current).toMatchObject({
      visitors: 1,
      screen_views: 0,
      dwell_ms: 5000,
      sessions_started: 1,
      hint_requests: 1,
    });
  });
});

describe('trend buckets', () => {
  it('24h: 24 hourly buckets ending with the current LOCAL hour', () => {
    const edt = trendLayout('24h', NOW, EDT);
    expect(edt.granularity).toBe('hour');
    expect(edt.starts).toHaveLength(24);
    expect(new Date(edt.starts[23]).toISOString()).toBe('2026-10-15T15:00:00.000Z');
    expect(edt.end - edt.starts[0]).toBe(24 * HOUR_MS);
    // India is UTC+5:30: its hours start on the half hour.
    const ist = trendLayout('24h', NOW, IST);
    expect(new Date(ist.starts[23]).toISOString()).toBe('2026-10-15T15:30:00.000Z');
  });

  it('7d / 28d: daily buckets from local midnight', () => {
    const week = trendLayout('7d', NOW, EDT);
    expect(week.granularity).toBe('day');
    expect(week.starts).toHaveLength(7);
    // Midnight Oct 15 in New York = 04:00 UTC.
    expect(new Date(week.starts[6]).toISOString()).toBe('2026-10-15T04:00:00.000Z');
    expect(new Date(week.starts[0]).toISOString()).toBe('2026-10-09T04:00:00.000Z');
    expect(trendLayout('28d', NOW, 0).starts).toHaveLength(28);
    expect(new Date(trendLayout('28d', NOW, 0).starts[27]).toISOString()).toBe('2026-10-15T00:00:00.000Z');
  });

  it('90d: weekly buckets ending at the end of today (local)', () => {
    const q = trendLayout('90d', NOW, EDT);
    expect(q.granularity).toBe('week');
    expect(q.starts).toHaveLength(13);
    expect(new Date(q.end).toISOString()).toBe('2026-10-16T04:00:00.000Z');
    expect(q.end - q.starts[12]).toBe(7 * DAY_MS);
  });

  it('places events in buckets by local day and counts distinct visitors', () => {
    const rows = [
      // 02:00 UTC on Oct 15 is still Oct 14 in New York.
      ev({ at: Date.parse('2026-10-15T02:00:00Z'), user_id: 'u1' }),
      ev({ at: Date.parse('2026-10-15T02:30:00Z'), user_id: 'u1' }),
      ev({ at: Date.parse('2026-10-15T05:00:00Z'), user_id: 'u2' }),
      ev({ at: Date.parse('2026-10-15T06:00:00Z'), user_id: 'u2', event_type: 'dwell', dwell_ms: 1000 }),
    ];
    const r = aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: EDT });
    const byStart = new Map(r.trend.map((b) => [new Date(b.start).toISOString(), b]));
    expect(byStart.get('2026-10-14T04:00:00.000Z')).toEqual({
      start: Date.parse('2026-10-14T04:00:00.000Z'),
      visitors: 1,
      screen_views: 2,
    });
    expect(byStart.get('2026-10-15T04:00:00.000Z')).toMatchObject({ visitors: 1, screen_views: 1 });
    // In UTC the same four events are all on Oct 15.
    const utc = aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: 0 });
    expect(utc.trend[6]).toMatchObject({ visitors: 2, screen_views: 3 });
  });
});

describe('time zone', () => {
  it('local day keys shift with the offset', () => {
    const t = Date.parse('2026-10-15T02:00:00Z');
    expect(localDayKey(t, 0)).toBe('2026-10-15');
    expect(localDayKey(t, EDT)).toBe('2026-10-14');
    expect(localDayKey(Date.parse('2026-10-15T20:00:00Z'), IST)).toBe('2026-10-16');
  });

  it('the heatmap is [weekday][hour] in the caller’s time', () => {
    const rows = [
      ev({ at: Date.parse('2026-10-15T02:00:00Z') }),
      ev({ at: Date.parse('2026-10-15T02:10:00Z'), event_type: 'card_click', target: 'x' }),
    ];
    const utc = aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: 0 });
    expect(utc.heatmap).toHaveLength(7);
    expect(utc.heatmap.every((row) => row.length === 24)).toBe(true);
    expect(utc.heatmap[4][2]).toBe(1); // Thursday 02:00
    const ny = aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: EDT });
    expect(ny.heatmap[3][22]).toBe(1); // Wednesday 22:00
    expect(ny.heatmap.flat().reduce((a, b) => a + b, 0)).toBe(1); // screen views only
  });

  it('returning visitors are counted on local days', () => {
    // Two events 1 h apart straddling UTC midnight: one local day in New York.
    const rows = [
      ev({ at: Date.parse('2026-10-14T23:30:00Z'), user_id: 'u1' }),
      ev({ at: Date.parse('2026-10-15T00:30:00Z'), user_id: 'u1' }),
    ];
    expect(aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: 0 }).current.returning_visitors).toBe(1);
    expect(aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: EDT }).current.returning_visitors).toBe(0);
  });
});

describe('active days', () => {
  it('buckets visitors by distinct active days', () => {
    const rows: CompactNavRow[] = [];
    const visitOn = (who: string, days: number) => {
      for (let d = 0; d < days; d++) rows.push(ev({ at: ago(d * DAY_MS + HOUR_MS), user_id: who }));
    };
    visitOn('one', 1);
    visitOn('two', 2);
    visitOn('four', 4);
    visitOn('five', 5);
    visitOn('seven', 7);
    visitOn('twelve', 12);
    // A second event on the same day doesn't add a day.
    rows.push(ev({ at: ago(2 * HOUR_MS), user_id: 'one' }));
    const r = aggregateEngagement(rows, { range: '28d', now: NOW, tzOffsetMinutes: 0 });
    expect(r.active_days_histogram).toEqual([
      { bucket: '1', visitors: 1 },
      { bucket: '2', visitors: 1 },
      { bucket: '3-5', visitors: 2 },
      { bucket: '6-10', visitors: 1 },
      { bucket: '11+', visitors: 1 },
    ]);
    expect(r.current.returning_visitors).toBe(5);
    expect(r.per_user.find((p) => p.user_id === 'twelve')?.active_days).toBe(12);
  });
});

describe('screens, actions, per user', () => {
  it('sorts screens by views and actions by count, with distinct visitors', () => {
    const rows = [
      ev({ at: ago(HOUR_MS), user_id: 'u1', screen: 'home' }),
      ev({ at: ago(HOUR_MS), user_id: 'u1', screen: 'home' }),
      ev({ at: ago(HOUR_MS), user_id: 'u2', screen: 'home' }),
      ev({ at: ago(HOUR_MS), user_id: 'u1', screen: 'chat' }),
      ev({ at: ago(HOUR_MS), user_id: 'u1', screen: 'chat', event_type: 'dwell', dwell_ms: 9000 }),
      ev({ at: ago(HOUR_MS), user_id: 'u2', screen: 'stats', event_type: 'dwell', dwell_ms: 500 }),
      ev({ at: ago(HOUR_MS), user_id: 'u1', screen: 'home', event_type: 'card_click', target: 'today_pick' }),
      ev({ at: ago(HOUR_MS), user_id: 'u1', screen: 'chat', event_type: 'custom', target: 'session_open' }),
      ev({ at: ago(HOUR_MS), user_id: 'u2', screen: 'chat', event_type: 'custom', target: 'session_open' }),
      ev({ at: ago(HOUR_MS), user_id: 'u2', screen: 'chat', event_type: 'custom', target: 'session_open' }),
      ev({ at: ago(HOUR_MS), anon_session_id: 'dev', screen: 'quiz', event_type: 'custom', target: null }),
    ];
    const r = aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: 0 });
    expect(r.screens).toEqual([
      { screen: 'home', views: 3, dwell_ms: 0, visitors: 2 },
      { screen: 'chat', views: 1, dwell_ms: 9000, visitors: 1 },
      { screen: 'stats', views: 0, dwell_ms: 500, visitors: 0 },
    ]);
    expect(r.actions).toEqual([
      { action: 'session_open', count: 3, visitors: 2 },
      { action: 'today_pick', count: 1, visitors: 1 },
    ]);
  });

  it('per_user covers signed-in accounts only, newest first', () => {
    const rows = [
      ev({ at: ago(3 * HOUR_MS), user_id: 'u1' }),
      ev({ at: ago(1 * HOUR_MS), user_id: 'u2', event_type: 'custom', target: 'coach_hint_request' }),
      ev({ at: ago(2 * HOUR_MS), user_id: 'u1', event_type: 'dwell', dwell_ms: 4000 }),
      ev({ at: ago(HOUR_MS), anon_session_id: 'anon-only' }),
    ];
    const r = aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: 0 });
    expect(r.per_user).toEqual([
      {
        user_id: 'u2',
        last_seen: new Date(ago(HOUR_MS)).toISOString(),
        active_days: 1,
        screen_views: 0,
        dwell_ms: 0,
        hint_requests: 1,
      },
      {
        user_id: 'u1',
        last_seen: new Date(ago(2 * HOUR_MS)).toISOString(),
        active_days: 1,
        screen_views: 1,
        dwell_ms: 4000,
        hint_requests: 0,
      },
    ]);
    expect(r.current.visitors).toBe(3);
  });

  it('caps junk keys from anonymous writers', () => {
    const long = 'x'.repeat(500);
    const r = aggregateEngagement([ev({ at: ago(HOUR_MS), screen: long })], {
      range: '7d',
      now: NOW,
      tzOffsetMinutes: 0,
    });
    expect(r.screens[0].screen).toHaveLength(64);
  });
});

describe('app_open context', () => {
  const open = (at: number, who: Partial<CompactNavRow>, meta: unknown) =>
    ev({ at, event_type: 'custom', screen: null, target: 'app_open', meta, ...who });

  it('counts each visitor once, by their LATEST app_open in the window', () => {
    const rows = [
      open(ago(5 * DAY_MS), { user_id: 'u1' }, { device: 'mobile', os: 'ios', installed: false, locale: 'en', theme: 'light' }),
      open(ago(1 * DAY_MS), { user_id: 'u1' }, { device: 'mobile', os: 'ios', installed: true, locale: 'fr-CA', theme: 'dark' }),
      open(ago(2 * DAY_MS), { anon_session_id: 'dev-x' }, { device: 'Desktop', os: 'windows', installed: false, theme: 'system' }),
      open(ago(3 * DAY_MS), { user_id: 'u3' }, { device: 'tablet', os: 'android' }),
      // Previous window — not current context.
      open(ago(10 * DAY_MS), { user_id: 'u4' }, { device: 'desktop', os: 'macos', installed: true }),
      // Unreadable meta adds nothing.
      open(ago(1 * DAY_MS), { user_id: 'u5' }, 'junk'),
    ];
    const r = aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: 0 });
    expect(r.context.device).toEqual([
      { value: 'desktop', visitors: 1 },
      { value: 'mobile', visitors: 1 },
      { value: 'tablet', visitors: 1 },
    ]);
    expect(r.context.installed).toEqual([
      { value: 'browser', visitors: 1 },
      { value: 'installed', visitors: 1 },
    ]);
    expect(r.context.locale).toEqual([{ value: 'fr-CA', visitors: 1 }]);
    expect(r.context.theme).toEqual([
      { value: 'dark', visitors: 1 },
      { value: 'system', visitors: 1 },
    ]);
    // app_open is also an action (app opens), whatever its meta.
    expect(r.actions.find((a) => a.action === 'app_open')?.count).toBe(5);
  });

  it('is empty until the event ships', () => {
    const r = aggregateEngagement([ev({ at: ago(HOUR_MS) })], { range: '7d', now: NOW, tzOffsetMinutes: 0 });
    expect(r.context).toEqual({ device: [], os: [], installed: [], locale: [], theme: [] });
  });

  it('folds a long tail of values into "other"', () => {
    const rows = Array.from({ length: 30 }, (_, i) => open(ago(HOUR_MS), { user_id: `u${i}` }, { os: `os-${i}` }));
    const r = aggregateEngagement(rows, { range: '7d', now: NOW, tzOffsetMinutes: 0 });
    expect(r.context.os).toHaveLength(20);
    expect(r.context.os.reduce((n, v) => n + v.visitors, 0)).toBe(30);
    expect(r.context.os.find((v) => v.value === 'other')?.visitors).toBe(11);
  });

  it('readAppContext keeps only readable fields', () => {
    expect(readAppContext({ device: 'Mobile', installed: 'yes', locale: ' en ', tz: 'America/Toronto' })).toEqual({
      device: 'mobile',
      locale: 'en',
    });
    expect(readAppContext({ installed: false })).toEqual({ installed: false });
    expect(readAppContext({})).toBeNull();
    expect(readAppContext(null)).toBeNull();
  });
});

describe('aggregateTraineeActivity', () => {
  it('folds one trainee’s events', () => {
    const rows = [
      ev({ at: ago(400 * DAY_MS), user_id: 'u1', screen: 'home' }),
      ev({ at: Date.parse('2026-10-15T02:00:00Z'), user_id: 'u1', screen: 'home' }),
      ev({ at: ago(3 * DAY_MS), user_id: 'u1', screen: 'chat', event_type: 'dwell', dwell_ms: 3000 }),
      ev({
        at: ago(2 * DAY_MS),
        user_id: 'u1',
        event_type: 'custom',
        screen: null,
        target: 'app_open',
        meta: { device: 'desktop', os: 'macos', installed: false, locale: 'en', theme: 'dark' },
      }),
      ev({
        at: ago(1 * DAY_MS),
        user_id: 'u1',
        event_type: 'custom',
        screen: null,
        target: 'app_open',
        meta: { device: 'mobile', os: 'ios', installed: true },
      }),
      ev({ at: ago(HOUR_MS), user_id: 'u1', screen: 'chat', event_type: 'custom', target: 'session_open' }),
    ];
    const a = aggregateTraineeActivity(rows, { now: NOW, tzOffsetMinutes: EDT });
    expect(a.first_seen).toBe(new Date(ago(400 * DAY_MS)).toISOString());
    expect(a.last_seen).toBe(new Date(ago(HOUR_MS)).toISOString());
    // Last 365 days only, local calendar, oldest first.
    expect(a.active_days).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
    expect(a.screen_views).toBe(2);
    expect(a.dwell_ms).toBe(3000);
    expect(a.screens.map((s) => s.screen)).toEqual(['home', 'chat']);
    expect(a.actions).toEqual([
      { action: 'app_open', count: 2, visitors: 1 },
      { action: 'session_open', count: 1, visitors: 1 },
    ]);
    expect(a.last_context).toEqual({ device: 'mobile', os: 'ios', installed: true });
    expect(a.recent[0]).toEqual({
      at: new Date(ago(HOUR_MS)).toISOString(),
      type: 'custom',
      screen: 'chat',
      action: 'session_open',
    });
    expect(a.recent).toHaveLength(6);
  });

  it('keeps the 60 newest events and handles none', () => {
    const rows = Array.from({ length: 75 }, (_, i) => ev({ at: ago(i * HOUR_MS), user_id: 'u1' }));
    const a = aggregateTraineeActivity(rows, { now: NOW, tzOffsetMinutes: 0 });
    expect(a.recent).toHaveLength(60);
    expect(a.recent[0].at).toBe(new Date(NOW).toISOString());
    expect(a.last_context).toBeNull();

    const empty = aggregateTraineeActivity([], { now: NOW, tzOffsetMinutes: 0 });
    expect(empty).toEqual({
      first_seen: null,
      last_seen: null,
      active_days: [],
      screen_views: 0,
      dwell_ms: 0,
      screens: [],
      actions: [],
      last_context: null,
      recent: [],
    });
  });
});
