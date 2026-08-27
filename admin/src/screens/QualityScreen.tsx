import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Glass } from '../primitives/Glass';
import {
  EmptyState,
  Eyebrow,
  Kpi,
  LoadingShimmer,
  ScoreBadge,
  SectionTitle,
  StatusPill,
} from '../primitives';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { useAdminSessions, useAiCalls } from '../data/queries';
import { COLOR } from '../lib/tokens';
import { CALL_TYPE_LABELS, PUSHBACK_LABELS, labelOf } from '../lib/labels';
import { fmtAgo, fmtMoney } from '../lib/format';
import { rangeToDays } from '../lib/api';
import type { AiCall } from '../data/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A reply slower than this feels like a stall to the person waiting on it. */
const SLOW_REPLY_MS = 2200;

/** A session below this is worth watching back with the trainee. */
const LOW_SCORE = 60;

// ─── Enhanced Observability Layer ──────────────────────────────────────
// Ops-tunable alert thresholds. These are the trip points for the banner
// at the top of the screen — bump them here if the operational bar for
// "healthy" changes (e.g. a slower/cheaper model becomes the default).
const ALERT_THRESHOLDS = {
  errorRatePct: 5,
  refusalRatePct: 3,
  p95LatencyMs: 6000,
  dailyCostUsd: 5,
} as const;

// ─── shared numeric helpers ─────────────────────────────────────────────

function pct(n: number, total: number): number {
  return total > 0 ? (n / total) * 100 : 0;
}

function avgOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Nearest-rank p95 — null when there's nothing to sample. Shown as
 *  "slowest 5% of replies", which is what the number actually means. */
function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[idx];
}

function fmtPct1(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}

/** Milliseconds are an engineer's unit; everyone else reads seconds. */
function fmtSecs(ms: number | null): string {
  return ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

function fmtCount(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Thin out X-axis ticks so wide bucket counts don't collide. */
function tickInterval(n: number): number {
  return Math.max(0, Math.ceil(n / 8) - 1);
}

/**
 * Days of activity actually present, not the width of the selected window.
 * Dividing spend by the window turns "$3 across the two days since launch"
 * into "$0.10 a day" on a 30-day range, which under-reads the real burn.
 */
function observedSpanDays(calls: AiCall[], range: Range): number {
  if (calls.length === 0) return Math.max(1, rangeToDays(range));
  const oldest = calls.reduce(
    (min, x) => Math.min(min, new Date(x.created_at).getTime()),
    Number.POSITIVE_INFINITY,
  );
  return Math.max(1, (Date.now() - oldest) / DAY_MS);
}

const CHART_TOOLTIP_STYLE = {
  background: 'rgba(255,255,255,0.95)',
  border: '0.5px solid rgba(60,20,15,0.12)',
  borderRadius: 10,
  fontSize: 12,
  boxShadow: '0 8px 20px -8px rgba(60,20,15,0.18)',
} as const;

// ─── time bucketing (mirrors InsightsScreen's day/week granularity) ────

interface BucketSet {
  labels: string[];
  buckets: AiCall[][];
  granularity: 'day' | 'week';
}

function bucketizeCalls(calls: AiCall[], range: Range): BucketSet {
  const totalDays = rangeToDays(range);
  const granularity: 'day' | 'week' = totalDays > 35 ? 'week' : 'day';
  const bucketSizeDays = granularity === 'week' ? 7 : 1;
  const bucketCount = Math.max(1, Math.ceil(totalDays / bucketSizeDays));
  const now = Date.now();

  const labels: string[] = [];
  const buckets: AiCall[][] = Array.from({ length: bucketCount }, () => []);
  for (let idx = 0; idx < bucketCount; idx++) {
    const ageBuckets = bucketCount - 1 - idx;
    labels.push(fmtShortDate(new Date(now - ageBuckets * bucketSizeDays * DAY_MS)));
  }

  for (const call of calls) {
    // Clamp to 0 so clock-skewed created_at values land in the newest
    // bucket instead of vanishing from the trend (mirrors InsightsScreen).
    const ageDays = Math.max(0, Math.floor((now - new Date(call.created_at).getTime()) / DAY_MS));
    const ageBuckets = Math.floor(ageDays / bucketSizeDays);
    if (ageBuckets >= bucketCount) continue;
    buckets[bucketCount - 1 - ageBuckets].push(call);
  }

  return { labels, buckets, granularity };
}

function bucketWord(granularity: 'day' | 'week'): string {
  return granularity === 'week' ? 'by week' : 'by day';
}

// ─── component ──────────────────────────────────────────────────────

export function QualityScreen({
  range,
  onRange,
}: {
  range: Range;
  onRange: (r: Range) => void;
}) {
  const sessions = useAdminSessions(range, 1000);
  const aiCalls = useAiCalls(range, 5000);

  const stats = useMemo(() => {
    const s = sessions.data;
    const c = aiCalls.data;
    // Lowest first: the point of the list is which conversation to review next.
    const lowScore = s
      .filter((x) => x.score_overall != null && x.score_overall < LOW_SCORE)
      .sort((a, b) => (a.score_overall ?? 0) - (b.score_overall ?? 0));
    return {
      lowScore,
      slow: c.filter((x) => x.latency_ms > SLOW_REPLY_MS),
      refused: c.filter((x) => x.refusal),
      errored: c.filter((x) => x.error != null),
    };
  }, [sessions.data, aiCalls.data]);

  // ── Alert threshold banner ──────────────────────────────────────────
  const alertStats = useMemo(() => {
    const c = aiCalls.data;
    const n = c.length;
    const errorRatePct = pct(c.filter((x) => x.error != null).length, n);
    const refusalRatePct = pct(c.filter((x) => x.refusal).length, n);
    const p95LatencyMs = p95(c.map((x) => x.latency_ms)) ?? 0;
    const totalCost = c.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
    const dailyCostUsd = totalCost / observedSpanDays(c, range);

    const alerts: Array<{
      label: string;
      current: string;
      threshold: string;
      severity: 'warn' | 'danger';
    }> = [];
    const sev = (current: number, threshold: number): 'warn' | 'danger' =>
      current >= threshold * 1.5 ? 'danger' : 'warn';

    if (n > 0 && errorRatePct > ALERT_THRESHOLDS.errorRatePct) {
      alerts.push({
        label: 'Replies that failed',
        current: fmtPct1(errorRatePct),
        threshold: `${ALERT_THRESHOLDS.errorRatePct}%`,
        severity: sev(errorRatePct, ALERT_THRESHOLDS.errorRatePct),
      });
    }
    if (n > 0 && refusalRatePct > ALERT_THRESHOLDS.refusalRatePct) {
      alerts.push({
        label: 'Replies the AI declined',
        current: fmtPct1(refusalRatePct),
        threshold: `${ALERT_THRESHOLDS.refusalRatePct}%`,
        severity: sev(refusalRatePct, ALERT_THRESHOLDS.refusalRatePct),
      });
    }
    if (n > 0 && p95LatencyMs > ALERT_THRESHOLDS.p95LatencyMs) {
      alerts.push({
        label: 'Slowest replies',
        current: fmtSecs(p95LatencyMs),
        threshold: fmtSecs(ALERT_THRESHOLDS.p95LatencyMs),
        severity: sev(p95LatencyMs, ALERT_THRESHOLDS.p95LatencyMs),
      });
    }
    if (dailyCostUsd > ALERT_THRESHOLDS.dailyCostUsd) {
      alerts.push({
        label: 'Spend per day',
        current: fmtMoney(dailyCostUsd),
        threshold: fmtMoney(ALERT_THRESHOLDS.dailyCostUsd),
        severity: sev(dailyCostUsd, ALERT_THRESHOLDS.dailyCostUsd),
      });
    }

    return { errorRatePct, refusalRatePct, p95LatencyMs, dailyCostUsd, alerts };
  }, [aiCalls.data, range]);

  // ── Failure-rate trend ──────────────────────────────────────────────
  const failureTrend = useMemo(() => {
    const { labels, buckets, granularity } = bucketizeCalls(aiCalls.data, range);
    const data = labels.map((label, i) => {
      const b = buckets[i];
      const n = b.length;
      return {
        label,
        errorPct: n > 0 ? pct(b.filter((x) => x.error != null).length, n) : null,
        refusalPct: n > 0 ? pct(b.filter((x) => x.refusal).length, n) : null,
        n,
      };
    });
    return { data, hasData: data.some((d) => d.n > 0), granularity };
  }, [aiCalls.data, range]);

  // ── Latency trend ───────────────────────────────────────────────────
  const latencyTrend = useMemo(() => {
    const { labels, buckets, granularity } = bucketizeCalls(aiCalls.data, range);
    const data = labels.map((label, i) => {
      const b = buckets[i];
      const n = b.length;
      return {
        label,
        avgLatency: n > 0 ? avgOf(b.map((x) => x.latency_ms)) : null,
        p95Latency: n > 0 ? p95(b.map((x) => x.latency_ms)) : null,
        n,
      };
    });
    return { data, hasData: data.some((d) => d.n > 0), granularity };
  }, [aiCalls.data, range]);

  // ── Cost tracking ───────────────────────────────────────────────────
  const costTrend = useMemo(() => {
    const { labels, buckets, granularity } = bucketizeCalls(aiCalls.data, range);
    const data = labels.map((label, i) => ({
      label,
      cost: buckets[i].reduce((a, x) => a + Number(x.cost_usd ?? 0), 0),
    }));
    const totalCost = data.reduce((a, d) => a + d.cost, 0);
    const projectedMonthly = (totalCost / observedSpanDays(aiCalls.data, range)) * 30;
    return { data, hasData: data.length > 0 && totalCost > 0, granularity, totalCost, projectedMonthly };
  }, [aiCalls.data, range]);

  // ── Breakdown by what the AI was asked to do ────────────────────────
  // Grouped by job rather than by model: "scoring a session is the slow part"
  // is actionable, "gemini-3-flash-preview is the slow part" is not. The model
  // id still rides along underneath for whoever needs it.
  const jobRows = useMemo(() => {
    const byType = new Map<string, AiCall[]>();
    for (const call of aiCalls.data) {
      const arr = byType.get(call.call_type) ?? [];
      arr.push(call);
      byType.set(call.call_type, arr);
    }
    const rows = Array.from(byType.entries()).map(([callType, calls]) => {
      const n = calls.length;
      const latencies = calls.map((x) => x.latency_ms);
      const errors = calls.filter((x) => x.error != null).length;
      const refusals = calls.filter((x) => x.refusal).length;
      return {
        callType,
        models: Array.from(new Set(calls.map((x) => x.model_id))).sort(),
        calls: n,
        errors,
        errorPct: pct(errors, n),
        refusals,
        refusalPct: pct(refusals, n),
        avgLatency: avgOf(latencies) ?? 0,
        p95Latency: p95(latencies) ?? 0,
        cost: calls.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0),
      };
    });
    rows.sort((a, b) => b.calls - a.calls);
    return rows;
  }, [aiCalls.data]);

  const JOB_GRID_COLS = '1.9fr 100px 110px 110px 160px 90px';

  return (
    <>
      <ContextBar
        title="AI Quality"
        subtitle="How the AI is behaving: failures, refusals, reply speed and cost"
        range={range}
        onRange={onRange}
      />
      <ScreenShell>
        <QueryBoundary
          queries={[sessions, aiCalls]}
          title="Couldn't load AI quality data"
          showLoading={false}
        >
          {/* ── Alert threshold banner ── */}
          {aiCalls.loading ? (
            <LoadingShimmer height={60} />
          ) : (
            <Glass
              padding={16}
              radius={16}
              shine={false}
              style={{ background: alertStats.alerts.length === 0 ? COLOR.successSoft : COLOR.dangerSoft }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <StatusPill tone={alertStats.alerts.length === 0 ? 'success' : 'danger'}>
                  {alertStats.alerts.length === 0
                    ? 'Everything looks healthy'
                    : `${alertStats.alerts.length} thing${alertStats.alerts.length === 1 ? '' : 's'} to look at`}
                </StatusPill>
                {alertStats.alerts.length === 0 ? (
                  <span style={{ fontSize: 12, color: COLOR.inkSoft }}>
                    {fmtPct1(alertStats.errorRatePct)} of replies failed · {fmtPct1(alertStats.refusalRatePct)}{' '}
                    declined · slowest 5% of replies {fmtSecs(alertStats.p95LatencyMs)} ·{' '}
                    {fmtMoney(alertStats.dailyCostUsd)} a day
                  </span>
                ) : (
                  alertStats.alerts.map((a) => (
                    <span
                      key={a.label}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: COLOR.inkSoft,
                        fontWeight: 600,
                      }}
                    >
                      <StatusPill tone={a.severity}>{a.label}</StatusPill>
                      <strong style={{ color: COLOR.ink, fontFamily: 'var(--pbt-mono)' }}>{a.current}</strong>
                      <span style={{ color: COLOR.inkMute }}>past the {a.threshold} limit</span>
                    </span>
                  ))
                )}
              </div>
              <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 8 }}>
                We watch four things: replies that failed, replies the AI declined to give, how long
                the slowest replies take, and what the AI costs per day.
              </div>
            </Glass>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
            }}
          >
            {sessions.loading || aiCalls.loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <LoadingShimmer key={i} height={140} />
              ))
            ) : (
              <>
                <Kpi
                  label="Replies that failed"
                  value={fmtCount(stats.errored.length)}
                  icon="✕"
                  accent={COLOR.dangerSoft}
                  sparkColor={COLOR.danger}
                />
                <Kpi
                  label="Replies the AI declined"
                  value={fmtCount(stats.refused.length)}
                  icon="⊘"
                  accent={COLOR.warnSoft}
                  sparkColor={COLOR.warn}
                />
                <Kpi
                  label="Replies slower than 2 seconds"
                  value={fmtCount(stats.slow.length)}
                  icon="◷"
                  accent="oklch(0.94 0.06 70)"
                  sparkColor={COLOR.warn}
                />
                <Kpi
                  label="Sessions scored under 60"
                  value={fmtCount(stats.lowScore.length)}
                  icon="↓"
                  accent={COLOR.warnSoft}
                  sparkColor={COLOR.warn}
                />
              </>
            )}
          </div>

          {/* ── Failure-rate trend ── */}
          <Glass padding={24} radius={20}>
            <SectionTitle
              title="Failed and declined replies"
              subtitle={`Share of AI replies that errored out or were declined · ${bucketWord(failureTrend.granularity)}`}
            />
            {aiCalls.loading ? (
              <div style={{ marginTop: 16 }}>
                <LoadingShimmer height={260} />
              </div>
            ) : failureTrend.hasData ? (
              <div style={{ height: 260, marginTop: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={failureTrend.data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="rgba(60,20,15,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke={COLOR.inkMute}
                      fontSize={11}
                      tickLine={false}
                      interval={tickInterval(failureTrend.data.length)}
                    />
                    <YAxis
                      stroke={COLOR.inkMute}
                      fontSize={11}
                      tickLine={false}
                      width={36}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <Tooltip
                      cursor={{ stroke: 'rgba(60,20,15,0.12)' }}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number | null, name: string) => [
                        value == null ? '—' : `${value.toFixed(1)}%`,
                        name === 'errorPct' ? 'Failed' : 'Declined',
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value: string) => (value === 'errorPct' ? 'Failed' : 'Declined')}
                    />
                    <Line
                      type="monotone"
                      dataKey="errorPct"
                      name="errorPct"
                      stroke={COLOR.danger}
                      strokeWidth={2}
                      dot={{ r: 3, fill: COLOR.danger }}
                      connectNulls={false}
                      animationDuration={500}
                    />
                    <Line
                      type="monotone"
                      dataKey="refusalPct"
                      name="refusalPct"
                      stroke={COLOR.warn}
                      strokeWidth={2}
                      dot={{ r: 3, fill: COLOR.warn }}
                      connectNulls={false}
                      animationDuration={500}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                title="No AI activity in this window"
                subtitle="Widen the date range, or have your team run a few sessions."
              />
            )}
          </Glass>

          {/* ── Latency trend ── */}
          <Glass padding={24} radius={20}>
            <SectionTitle
              title="Reply speed"
              subtitle={`Typical reply time, and the slowest 5% of replies · ${bucketWord(latencyTrend.granularity)}`}
            />
            {aiCalls.loading ? (
              <div style={{ marginTop: 16 }}>
                <LoadingShimmer height={260} />
              </div>
            ) : latencyTrend.hasData ? (
              <div style={{ height: 260, marginTop: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={latencyTrend.data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="rgba(60,20,15,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke={COLOR.inkMute}
                      fontSize={11}
                      tickLine={false}
                      interval={tickInterval(latencyTrend.data.length)}
                    />
                    <YAxis
                      stroke={COLOR.inkMute}
                      fontSize={11}
                      tickLine={false}
                      width={48}
                      tickFormatter={(v: number) => fmtSecs(v)}
                    />
                    <Tooltip
                      cursor={{ stroke: 'rgba(60,20,15,0.12)' }}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number | null, name: string) => [
                        fmtSecs(value),
                        name === 'avgLatency' ? 'Typical reply' : 'Slowest 5% of replies',
                      ]}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value: string) =>
                        value === 'avgLatency' ? 'Typical reply' : 'Slowest 5% of replies'
                      }
                    />
                    <Line
                      type="monotone"
                      dataKey="avgLatency"
                      name="avgLatency"
                      stroke={COLOR.info}
                      strokeWidth={2}
                      dot={{ r: 3, fill: COLOR.info }}
                      connectNulls={false}
                      animationDuration={500}
                    />
                    <Line
                      type="monotone"
                      dataKey="p95Latency"
                      name="p95Latency"
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
                title="No AI activity in this window"
                subtitle="Widen the date range, or have your team run a few sessions."
              />
            )}
          </Glass>

          {/* ── Cost tracking ── */}
          <Glass padding={24} radius={20}>
            <SectionTitle
              title="What the AI costs"
              subtitle={`${fmtMoney(costTrend.totalCost)} in this window · about ${fmtMoney(costTrend.projectedMonthly)} a month at the current rate · ${bucketWord(costTrend.granularity)}`}
            />
            {aiCalls.loading ? (
              <div style={{ marginTop: 16 }}>
                <LoadingShimmer height={220} />
              </div>
            ) : costTrend.hasData ? (
              <div style={{ height: 220, marginTop: 16 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={costTrend.data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid stroke="rgba(60,20,15,0.06)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke={COLOR.inkMute}
                      fontSize={11}
                      tickLine={false}
                      interval={tickInterval(costTrend.data.length)}
                    />
                    <YAxis
                      stroke={COLOR.inkMute}
                      fontSize={11}
                      tickLine={false}
                      width={56}
                      tickFormatter={(v: number) => fmtMoney(v)}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(60,20,15,0.04)' }}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      formatter={(value: number) => [fmtMoney(value), 'Cost']}
                    />
                    <Bar dataKey="cost" fill={COLOR.brand} radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                title="No AI activity in this window"
                subtitle="Widen the date range, or have your team run a few sessions."
              />
            )}
          </Glass>

          {/* ── Breakdown by job ── */}
          <Glass padding={0} radius={20}>
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '0.5px solid rgba(60,20,15,0.06)',
              }}
            >
              <SectionTitle
                title="What the AI is doing"
                subtitle="Failures, refusals, reply speed and cost for each job the AI does · busiest first"
              />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: JOB_GRID_COLS,
                  padding: '14px 22px',
                  gap: 12,
                  background: 'rgba(255,255,255,0.5)',
                  borderBottom: '0.5px solid rgba(60,20,15,0.06)',
                  minWidth: 760,
                }}
              >
                {[
                  'What the AI was doing',
                  'Times used',
                  'Failed',
                  'Refused',
                  'Typical reply time',
                  'Cost',
                ].map((h) => (
                  <div
                    key={h}
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.10em',
                      color: COLOR.inkMute,
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>
              {jobRows.map((j) => (
                <div
                  key={j.callType}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: JOB_GRID_COLS,
                    padding: '12px 22px',
                    gap: 12,
                    alignItems: 'center',
                    borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                    minWidth: 760,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
                      {labelOf(CALL_TYPE_LABELS, j.callType)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: COLOR.inkMute,
                        fontFamily: 'var(--pbt-mono)',
                        marginTop: 2,
                      }}
                    >
                      {j.models.join(' · ')}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: COLOR.inkSoft,
                      fontFamily: 'var(--pbt-mono)',
                    }}
                  >
                    {fmtCount(j.calls)}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontFamily: 'var(--pbt-mono)',
                      color: j.errorPct > ALERT_THRESHOLDS.errorRatePct ? COLOR.danger : COLOR.inkSoft,
                    }}
                  >
                    {fmtCount(j.errors)}
                    <span style={{ fontSize: 11, color: COLOR.inkMute }}> ({fmtPct1(j.errorPct)})</span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontFamily: 'var(--pbt-mono)',
                      color: j.refusalPct > ALERT_THRESHOLDS.refusalRatePct ? COLOR.warn : COLOR.inkSoft,
                    }}
                  >
                    {fmtCount(j.refusals)}
                    <span style={{ fontSize: 11, color: COLOR.inkMute }}> ({fmtPct1(j.refusalPct)})</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: COLOR.inkSoft, fontFamily: 'var(--pbt-mono)' }}>
                      {fmtSecs(j.avgLatency)}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        marginTop: 2,
                        color: j.p95Latency > ALERT_THRESHOLDS.p95LatencyMs ? COLOR.warn : COLOR.inkMute,
                      }}
                    >
                      slowest 5% {fmtSecs(j.p95Latency)}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: COLOR.inkSoft, fontFamily: 'var(--pbt-mono)' }}>
                    {fmtMoney(j.cost)}
                  </div>
                </div>
              ))}
            </div>
            {jobRows.length === 0 && (
              <EmptyState
                title="No AI activity in this window"
                subtitle="Widen the date range, or have your team run a few sessions."
              />
            )}
          </Glass>

          {/* ── Sessions worth reviewing ── */}
          <Glass padding={0} radius={20}>
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '0.5px solid rgba(60,20,15,0.06)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <SectionTitle
                title="Sessions worth reviewing"
                subtitle="Scored under 60 — lowest first. These are the conversations to watch back with the team."
              />
              <Eyebrow>{stats.lowScore.length} sessions</Eyebrow>
            </div>
            {stats.lowScore.slice(0, 30).map((s) => (
              <div
                key={s.id}
                style={{
                  padding: '14px 24px',
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 1.4fr 90px 90px 80px',
                  gap: 12,
                  alignItems: 'center',
                  borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                }}
              >
                <div style={{ fontSize: 13, color: COLOR.ink, fontWeight: 600 }}>
                  {s.scenario_summary ?? labelOf(PUSHBACK_LABELS, s.pushback_id, 'Untitled scenario')}
                </div>
                <StatusPill tone="neutral">
                  {labelOf(PUSHBACK_LABELS, s.pushback_id, 'Pushback not recorded')}
                </StatusPill>
                <div
                  style={{
                    fontSize: 12,
                    color: COLOR.inkSoft,
                    fontFamily: 'var(--pbt-mono)',
                  }}
                >
                  {s.turns ?? 0} turns
                </div>
                <ScoreBadge score={s.score_overall} />
                <div
                  style={{
                    fontSize: 11,
                    color: COLOR.inkMute,
                    textAlign: 'right',
                  }}
                >
                  {fmtAgo(new Date(s.created_at).getTime())}
                </div>
              </div>
            ))}
            {stats.lowScore.length > 30 && (
              <div style={{ padding: '12px 24px', fontSize: 12, color: COLOR.inkMute }}>
                Showing the 30 lowest of {stats.lowScore.length}. Narrow the date range to see the rest.
              </div>
            )}
            {stats.lowScore.length === 0 && (
              <EmptyState
                title="No low scores in this window"
                subtitle="Every scored session came in at 60 or above."
              />
            )}
          </Glass>
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}
