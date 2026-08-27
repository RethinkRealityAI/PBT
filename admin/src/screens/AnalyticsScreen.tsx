/**
 * AnalyticsScreen — where the team goes in the app, and how long they stay.
 *
 * Everything here is derived client-side from `useNavEvents` (a single
 * Netlify Function fetch) — no new query. Sections:
 *   1. KPI row — actions recorded, people training, screen views, screens
 *      per visit (screen views per person — deliberately NOT total events
 *      per person: background telemetry rows would inflate that into a
 *      number that reads like depth but isn't).
 *   2. "Where the team spends time" — a horizontal bar list built from
 *      'dwell' events' `dwell_ms`, aggregated by `screen`. This is the hero
 *      section; bars are normalised to the leader so they read on the same
 *      scale as the screen-views list below, with the true share printed.
 *   3. Traffic trend — Recharts LineChart of daily (weekly for 90d)
 *      `screen_view` counts, mirroring InsightsScreen's trend bucketing.
 *   4. Most-visited screens — compact descending bar list of `screen_view`
 *      counts per screen.
 *   5. What people tap most — table of the most frequent `target` values for
 *      event_type in ('card_click', 'cta_click', 'tab_change'), capped at
 *      15 rows.
 *
 * Every database value that reaches the page (screen keys, interaction
 * targets) goes through `labelOf` first — this screen is read by practice
 * managers, and a raw enum key reads as a log file.
 */
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState, Glass, Kpi, LoadingShimmer, PillButton, SectionTitle } from '../primitives';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { useNavEvents } from '../data/queries';
import { rangeToDays } from '../lib/api';
import { ACTION_LABELS, SCREEN_LABELS, labelOf } from '../lib/labels';
import { COLOR } from '../lib/tokens';
import type { NavEvent } from '../data/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const INTERACTION_EVENT_TYPES = new Set(['card_click', 'cta_click', 'tab_change']);

// ─── formatting ─────────────────────────────────────────────────────

function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

function fmt1(n: number | null): string {
  return n == null ? '—' : n.toFixed(1);
}

function fmtPct(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(1)}%`;
}

/** Duration formatter for dwell totals — "4.2h", "38m", "45s". */
function fmtDuration(ms: number): string {
  if (ms >= 3600_000) return `${(ms / 3600_000).toFixed(1)}h`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Thin out X-axis ticks so wide bucket counts don't collide. */
function tickInterval(n: number): number {
  return Math.max(0, Math.ceil(n / 8) - 1);
}

// ─── aggregation helpers ────────────────────────────────────────────

interface KpiStats {
  totalEvents: number;
  uniqueVisitors: number;
  screenViews: number;
  screensPerVisit: number | null;
}

function buildKpis(events: NavEvent[]): KpiStats {
  const visitors = new Set<string>();
  let screenViews = 0;
  for (const e of events) {
    const key = e.anon_session_id ?? e.user_id;
    if (key) visitors.add(key);
    if (e.event_type === 'screen_view') screenViews++;
  }
  const uniqueVisitors = visitors.size;
  return {
    totalEvents: events.length,
    uniqueVisitors,
    screenViews,
    // Screen views, not every event: background rows (session_open, coach
    // hints, saves…) would count toward a number the reader takes for
    // "how far they got".
    screensPerVisit: uniqueVisitors > 0 ? screenViews / uniqueVisitors : null,
  };
}

interface DwellRow {
  screen: string;
  ms: number;
  share: number; // % of total dwell across all screens
}

function buildDwellHeatmap(events: NavEvent[]): { rows: DwellRow[]; total: number; hasData: boolean } {
  const sums = new Map<string, number>();
  let total = 0;
  for (const e of events) {
    if (e.event_type !== 'dwell') continue;
    if (!e.screen) continue;
    if (e.dwell_ms == null || !Number.isFinite(e.dwell_ms) || e.dwell_ms <= 0) continue;
    sums.set(e.screen, (sums.get(e.screen) ?? 0) + e.dwell_ms);
    total += e.dwell_ms;
  }
  const rows = Array.from(sums.entries())
    .map(([screen, ms]) => ({ screen, ms, share: total > 0 ? (ms / total) * 100 : 0 }))
    .sort((a, b) => b.ms - a.ms);
  return { rows, total, hasData: rows.length > 0 };
}

interface TrendPoint {
  label: string;
  count: number;
}

function buildTrafficTrend(
  events: NavEvent[],
  range: Range,
): { data: TrendPoint[]; hasData: boolean; granularity: 'day' | 'week' } {
  const totalDays = rangeToDays(range);
  const granularity: 'day' | 'week' = totalDays > 35 ? 'week' : 'day';
  const bucketSizeDays = granularity === 'week' ? 7 : 1;
  const bucketCount = Math.max(1, Math.ceil(totalDays / bucketSizeDays));
  const now = Date.now();

  const counts = Array.from({ length: bucketCount }, () => 0);

  for (const e of events) {
    if (e.event_type !== 'screen_view') continue;
    // Clamp to 0 so a slightly-future created_at (server/client clock skew)
    // lands in the newest bucket instead of vanishing from the trend.
    const ageDays = Math.max(0, Math.floor((now - new Date(e.created_at).getTime()) / DAY_MS));
    const ageBuckets = Math.floor(ageDays / bucketSizeDays);
    if (ageBuckets >= bucketCount) continue;
    const idx = bucketCount - 1 - ageBuckets;
    counts[idx]++;
  }

  let hasData = false;
  const data = counts.map((count, idx) => {
    const ageBuckets = bucketCount - 1 - idx;
    const anchor = new Date(now - ageBuckets * bucketSizeDays * DAY_MS);
    if (count > 0) hasData = true;
    return { label: fmtShortDate(anchor), count };
  });

  return { data, hasData, granularity };
}

interface ScreenViewRow {
  screen: string;
  count: number;
  share: number;
}

function buildScreenViewCounts(events: NavEvent[]): { rows: ScreenViewRow[]; total: number; hasData: boolean } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const e of events) {
    if (e.event_type !== 'screen_view' || !e.screen) continue;
    counts.set(e.screen, (counts.get(e.screen) ?? 0) + 1);
    total++;
  }
  const rows = Array.from(counts.entries())
    .map(([screen, count]) => ({ screen, count, share: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count);
  return { rows, total, hasData: rows.length > 0 };
}

interface InteractionRow {
  target: string;
  count: number;
  share: number;
}

function buildTopInteractions(events: NavEvent[]): { rows: InteractionRow[]; total: number; hasData: boolean } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const e of events) {
    if (!INTERACTION_EVENT_TYPES.has(e.event_type) || !e.target) continue;
    counts.set(e.target, (counts.get(e.target) ?? 0) + 1);
    total++;
  }
  const rows = Array.from(counts.entries())
    .map(([target, count]) => ({ target, count, share: total > 0 ? (count / total) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  return { rows, total, hasData: rows.length > 0 };
}

// ─── component ──────────────────────────────────────────────────────

/**
 * A tile's one-line definition. Each headline number here is derived from
 * raw activity rows, and the reader can only trust it if we say what went
 * into it — a bare "3.4" invites the wrong conclusion.
 */
function KpiNote({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 11.5, lineHeight: 1.4, color: COLOR.inkMute, padding: '0 4px' }}>
      {children}
    </div>
  );
}

export function AnalyticsScreen({ range, onRange }: { range: Range; onRange: (r: Range) => void }) {
  const nav = useNavEvents(range, 5000);

  const kpis = useMemo(() => buildKpis(nav.data), [nav.data]);
  const dwellHeatmap = useMemo(() => buildDwellHeatmap(nav.data), [nav.data]);
  const trafficTrend = useMemo(() => buildTrafficTrend(nav.data, range), [nav.data, range]);
  const screenViewCounts = useMemo(() => buildScreenViewCounts(nav.data), [nav.data]);
  const topInteractions = useMemo(() => buildTopInteractions(nav.data), [nav.data]);

  const ready = !nav.loading;
  const maxDwellShare = dwellHeatmap.rows.length > 0 ? dwellHeatmap.rows[0].share : 0;
  const maxScreenViewShare = screenViewCounts.rows.length > 0 ? screenViewCounts.rows[0].share : 0;

  // An empty panel is usually a narrow window, not an idle team — offer the
  // widest window as the first thing to try.
  const widenRange =
    range === 'all' ? undefined : (
      <PillButton active={false} size="sm" onClick={() => onRange('all')}>
        Show all time
      </PillButton>
    );

  return (
    <>
      <ContextBar
        title="Traffic"
        subtitle="Where your team goes in the app, and how long they stay"
        range={range}
        onRange={onRange}
      />
      <ScreenShell>
        <QueryBoundary query={nav} title="Couldn't load activity data" showLoading={false}>
          {/* ── KPI row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {!ready ? (
              Array.from({ length: 4 }).map((_, i) => <LoadingShimmer key={i} height={140} />)
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Kpi label="Actions recorded" value={fmtInt(kpis.totalEvents)} icon="⌁" accent={COLOR.brandSoft} sparkColor={COLOR.brand} />
                  <KpiNote>Everything the app noted in this window — screens opened, taps, sessions started.</KpiNote>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Kpi
                    label="People training"
                    value={fmtInt(kpis.uniqueVisitors)}
                    icon="◔"
                    accent={COLOR.infoSoft}
                    sparkColor={COLOR.info}
                  />
                  <KpiNote>Counted by device, so one person using a phone and a laptop counts twice.</KpiNote>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Kpi
                    label="Screen views"
                    value={fmtInt(kpis.screenViews)}
                    icon="◇"
                    accent={COLOR.successSoft}
                    sparkColor={COLOR.success}
                  />
                  <KpiNote>How many times a screen was opened, across everyone.</KpiNote>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Kpi
                    label="Screens per visit"
                    value={fmt1(kpis.screensPerVisit)}
                    icon="✺"
                    accent={COLOR.warnSoft}
                    sparkColor={COLOR.warn}
                  />
                  <KpiNote>Screen views divided by the people training — how far the average person gets.</KpiNote>
                </div>
              </>
            )}
          </div>

          {/* ── Where the team spends time (hero) ── */}
          <Glass padding={24} radius={20}>
            <SectionTitle
              title="Where the team spends time"
              subtitle="Total time spent on each screen"
            />
            {!ready ? (
              <div style={{ marginTop: 16 }}>
                <LoadingShimmer height={280} />
              </div>
            ) : dwellHeatmap.hasData ? (
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {dwellHeatmap.rows.map((row) => {
                  // Normalised to the leader, matching the most-visited list
                  // below — two bar lists on one screen have to share a scale
                  // or the eye compares them anyway and reads it wrong.
                  const relWidth = maxDwellShare > 0 ? (row.share / maxDwellShare) * 100 : 0;
                  return (
                    <div key={row.screen}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: 12,
                          color: COLOR.inkSoft,
                          fontWeight: 600,
                        }}
                      >
                        <span>{labelOf(SCREEN_LABELS, row.screen)}</span>
                        <span style={{ fontWeight: 700, color: COLOR.ink, fontFamily: 'var(--pbt-mono)' }}>
                          {fmtDuration(row.ms)}{' '}
                          <span style={{ color: COLOR.inkMute, fontWeight: 500, fontSize: 11 }}>
                            ({row.share.toFixed(1)}%)
                          </span>
                        </span>
                      </div>
                      <div
                        style={{
                          height: 14,
                          borderRadius: 5,
                          background: 'oklch(0.96 0.01 20)',
                          marginTop: 4,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.max(relWidth, 1.5)}%`,
                            height: '100%',
                            background: COLOR.brand,
                            transition: 'width 0.6s ease',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                title="No time-on-screen data yet"
                subtitle="This fills in as your team uses the app. If it stays empty over a wide date range, send your support contact a note."
                action={widenRange}
              />
            )}
          </Glass>

          {/* ── Traffic trend ── */}
          <Glass padding={24} radius={20}>
            <SectionTitle
              title="Traffic trend"
              subtitle={`Screens opened over time, grouped by ${trafficTrend.granularity === 'week' ? 'week' : 'day'}`}
            />
            {!ready ? (
              <div style={{ marginTop: 16 }}>
                <LoadingShimmer height={260} />
              </div>
            ) : trafficTrend.hasData ? (
              <div style={{ height: 260, marginTop: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trafficTrend.data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="rgba(60,20,15,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke={COLOR.inkMute}
                      fontSize={11}
                      tickLine={false}
                      interval={tickInterval(trafficTrend.data.length)}
                    />
                    <YAxis allowDecimals={false} stroke={COLOR.inkMute} fontSize={11} tickLine={false} width={32} />
                    <Tooltip
                      cursor={{ stroke: 'rgba(60,20,15,0.12)' }}
                      contentStyle={{
                        background: 'rgba(255,255,255,0.95)',
                        border: '0.5px solid rgba(60,20,15,0.12)',
                        borderRadius: 10,
                        fontSize: 12,
                        boxShadow: '0 8px 20px -8px rgba(60,20,15,0.18)',
                      }}
                      formatter={(value: number) => [fmtInt(value), 'Screen views']}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke={COLOR.brand}
                      strokeWidth={2}
                      dot={{ r: 3, fill: COLOR.brand }}
                      connectNulls={false}
                      animationDuration={500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                title="Nobody opened the app in this window"
                subtitle="Try a wider date range, or ask your team to run a few sessions."
                action={widenRange}
              />
            )}
          </Glass>

          {/* ── Most-visited screens + what people tap ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 16 }}>
            <Glass padding={24} radius={20}>
              <SectionTitle title="Most-visited screens" subtitle="How many times each screen was opened" />
              {!ready ? (
                <div style={{ marginTop: 16 }}>
                  <LoadingShimmer height={240} />
                </div>
              ) : screenViewCounts.hasData ? (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {screenViewCounts.rows.map((row) => {
                    const relWidth = maxScreenViewShare > 0 ? (row.share / maxScreenViewShare) * 100 : 0;
                    return (
                      <div key={row.screen}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                            color: COLOR.inkSoft,
                            fontWeight: 600,
                          }}
                        >
                          <span>{labelOf(SCREEN_LABELS, row.screen)}</span>
                          <span style={{ fontWeight: 700, color: COLOR.ink }}>{fmtInt(row.count)}</span>
                        </div>
                        <div
                          style={{
                            height: 8,
                            borderRadius: 4,
                            background: 'oklch(0.96 0.01 20)',
                            marginTop: 4,
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(relWidth, 1.5)}%`,
                              height: '100%',
                              background: COLOR.info,
                              transition: 'width 0.6s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title="No screens opened in this window"
                  subtitle="Try a wider date range, or ask your team to run a few sessions."
                  action={widenRange}
                />
              )}
            </Glass>

            <Glass padding={24} radius={20}>
              <SectionTitle
                title="What people tap most"
                subtitle="The cards, buttons, and tabs used most often"
              />
              {!ready ? (
                <div style={{ marginTop: 16 }}>
                  <LoadingShimmer height={240} />
                </div>
              ) : topInteractions.hasData ? (
                <div style={{ marginTop: 16, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 320 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(60,20,15,0.08)' }}>
                        <th style={{ textAlign: 'left', padding: '6px 8px 8px 0', color: COLOR.inkMute, fontWeight: 700 }}>
                          What they did
                        </th>
                        <th style={{ textAlign: 'right', padding: '6px 0 8px', color: COLOR.inkMute, fontWeight: 700 }}>
                          Times
                        </th>
                        <th style={{ textAlign: 'right', padding: '6px 0 8px 8px', color: COLOR.inkMute, fontWeight: 700 }}>
                          Share
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topInteractions.rows.map((row) => (
                        <tr key={row.target} style={{ borderBottom: '1px solid rgba(60,20,15,0.04)' }}>
                          <td style={{ padding: '7px 8px 7px 0', color: COLOR.ink, fontWeight: 600 }}>
                            {labelOf(ACTION_LABELS, row.target)}
                          </td>
                          <td style={{ padding: '7px 0', textAlign: 'right', color: COLOR.ink, fontWeight: 700 }}>
                            {fmtInt(row.count)}
                          </td>
                          <td style={{ padding: '7px 0 7px 8px', textAlign: 'right', color: COLOR.inkMute }}>
                            {fmtPct(row.share)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="Nothing tapped in this window"
                  subtitle="Try a wider date range, or ask your team to run a few sessions."
                  action={widenRange}
                />
              )}
            </Glass>
          </div>
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}
