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
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { useAdminSessions, useAiCalls } from '../data/queries';
import { COLOR } from '../lib/tokens';
import { fmtAgo, fmtMoney, fmtNumber } from '../lib/format';
import { rangeToDays } from '../lib/api';
import type { AiCall } from '../data/types';

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Nearest-rank p95 — null when there's nothing to sample. */
function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[idx];
}

function fmtPct1(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}

function fmtMs(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}ms`;
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Thin out X-axis ticks so wide bucket counts don't collide. */
function tickInterval(n: number): number {
  return Math.max(0, Math.ceil(n / 8) - 1);
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
    const flagged = s.filter((x) => x.flagged);
    const lowScore = s.filter(
      (x) => x.score_overall != null && x.score_overall < 60,
    );
    const slow = c.filter((x) => x.latency_ms > 2200);
    const refused = c.filter((x) => x.refusal);
    const errored = c.filter((x) => x.error != null);
    const totalCost = c.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0);
    const totalTokens = c.reduce(
      (a, x) => a + (x.tokens_in ?? 0) + (x.tokens_out ?? 0),
      0,
    );
    const flagReasons: Record<string, number> = {};
    for (const f of flagged) {
      const r = f.flag_reason ?? 'Unspecified';
      flagReasons[r] = (flagReasons[r] ?? 0) + 1;
    }
    return {
      flagged,
      lowScore,
      slow,
      refused,
      errored,
      totalCost,
      totalTokens,
      flagReasons,
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
    const totalDays = Math.max(1, rangeToDays(range));
    const dailyCostUsd = totalCost / totalDays;

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
        label: 'Error rate',
        current: fmtPct1(errorRatePct),
        threshold: `${ALERT_THRESHOLDS.errorRatePct}%`,
        severity: sev(errorRatePct, ALERT_THRESHOLDS.errorRatePct),
      });
    }
    if (n > 0 && refusalRatePct > ALERT_THRESHOLDS.refusalRatePct) {
      alerts.push({
        label: 'Refusal rate',
        current: fmtPct1(refusalRatePct),
        threshold: `${ALERT_THRESHOLDS.refusalRatePct}%`,
        severity: sev(refusalRatePct, ALERT_THRESHOLDS.refusalRatePct),
      });
    }
    if (n > 0 && p95LatencyMs > ALERT_THRESHOLDS.p95LatencyMs) {
      alerts.push({
        label: 'p95 latency',
        current: fmtMs(p95LatencyMs),
        threshold: `${ALERT_THRESHOLDS.p95LatencyMs}ms`,
        severity: sev(p95LatencyMs, ALERT_THRESHOLDS.p95LatencyMs),
      });
    }
    if (dailyCostUsd > ALERT_THRESHOLDS.dailyCostUsd) {
      alerts.push({
        label: 'Cost / day',
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
    const totalDays = Math.max(1, rangeToDays(range));
    const projectedMonthly = (totalCost / totalDays) * 30;
    return { data, hasData: data.length > 0 && totalCost > 0, granularity, totalCost, projectedMonthly };
  }, [aiCalls.data, range]);

  // ── Per-model breakdown ──────────────────────────────────────────────
  const modelRows = useMemo(() => {
    const byModel = new Map<string, AiCall[]>();
    for (const call of aiCalls.data) {
      const arr = byModel.get(call.model_id) ?? [];
      arr.push(call);
      byModel.set(call.model_id, arr);
    }
    const rows = Array.from(byModel.entries()).map(([model_id, calls]) => {
      const n = calls.length;
      const latencies = calls.map((x) => x.latency_ms);
      return {
        model_id,
        calls: n,
        errorPct: pct(calls.filter((x) => x.error != null).length, n),
        refusalPct: pct(calls.filter((x) => x.refusal).length, n),
        avgLatency: avgOf(latencies) ?? 0,
        p95Latency: p95(latencies) ?? 0,
        tokensIn: calls.reduce((a, x) => a + (x.tokens_in ?? 0), 0),
        tokensOut: calls.reduce((a, x) => a + (x.tokens_out ?? 0), 0),
        cost: calls.reduce((a, x) => a + Number(x.cost_usd ?? 0), 0),
      };
    });
    rows.sort((a, b) => b.calls - a.calls);
    return rows;
  }, [aiCalls.data]);

  const MODEL_GRID_COLS = '1.6fr 70px 80px 80px 100px 100px 140px 90px';

  return (
    <>
      <ContextBar
        title="AI Quality"
        subtitle="Flags, low scores, latency outliers, refusals"
        range={range}
        onRange={onRange}
      />
      <ScreenShell>
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
                  ? 'All systems normal'
                  : `${alertStats.alerts.length} alert${alertStats.alerts.length === 1 ? '' : 's'} tripped`}
              </StatusPill>
              {alertStats.alerts.length === 0 ? (
                <span style={{ fontSize: 12, color: COLOR.inkSoft }}>
                  Error {fmtPct1(alertStats.errorRatePct)} · Refusal {fmtPct1(alertStats.refusalRatePct)} · p95{' '}
                  {fmtMs(alertStats.p95LatencyMs)} · {fmtMoney(alertStats.dailyCostUsd)}/day
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
                    <span style={{ color: COLOR.inkMute }}>vs threshold {a.threshold}</span>
                  </span>
                ))
              )}
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
                label="Flagged sessions"
                value={stats.flagged.length}
                icon="⚑"
                accent={COLOR.dangerSoft}
                sparkColor={COLOR.danger}
              />
              <Kpi
                label="Low scores (<60)"
                value={stats.lowScore.length}
                icon="↓"
                accent={COLOR.warnSoft}
                sparkColor={COLOR.warn}
              />
              <Kpi
                label="Slow responses"
                value={stats.slow.length}
                icon="◷"
                accent="oklch(0.94 0.06 70)"
                sparkColor={COLOR.warn}
              />
              <Kpi
                label="Refusals / errors"
                value={`${stats.refused.length}/${stats.errored.length}`}
                icon="✕"
                accent={COLOR.dangerSoft}
                sparkColor={COLOR.danger}
              />
            </>
          )}
        </div>

        <Glass padding={24} radius={20}>
          <SectionTitle
            title="Flag reason breakdown"
            subtitle="What's tripping the quality heuristics"
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 10,
              marginTop: 16,
            }}
          >
            {Object.entries(stats.flagReasons)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, n]) => (
                <Glass
                  key={reason}
                  padding={14}
                  radius={12}
                  shine={false}
                  style={{ background: COLOR.dangerSoft }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 800,
                      color: 'oklch(0.45 0.18 25)',
                    }}
                  >
                    {n}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'oklch(0.40 0.14 25)',
                      fontWeight: 600,
                      marginTop: 2,
                    }}
                  >
                    {reason}
                  </div>
                </Glass>
              ))}
            {Object.keys(stats.flagReasons).length === 0 && (
              <EmptyState title="Nothing flagged in this window" />
            )}
          </div>
        </Glass>

        {/* ── Failure-rate trend ── */}
        <Glass padding={24} radius={20}>
          <SectionTitle
            title="Failure-rate trend"
            subtitle={`% of calls erroring or refused · ${failureTrend.granularity === 'week' ? 'weekly' : 'daily'} buckets`}
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
                      name === 'errorPct' ? 'Error rate' : 'Refusal rate',
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value: string) => (value === 'errorPct' ? 'Error rate' : 'Refusal rate')}
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
            <EmptyState title="No AI calls in this window" />
          )}
        </Glass>

        {/* ── Latency trend ── */}
        <Glass padding={24} radius={20}>
          <SectionTitle
            title="Latency trend"
            subtitle={`Avg / p95 response latency · ${latencyTrend.granularity === 'week' ? 'weekly' : 'daily'} buckets`}
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
                    tickFormatter={(v: number) => `${Math.round(v)}ms`}
                  />
                  <Tooltip
                    cursor={{ stroke: 'rgba(60,20,15,0.12)' }}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number | null, name: string) => [
                      value == null ? '—' : `${Math.round(value)}ms`,
                      name === 'avgLatency' ? 'Avg latency' : 'p95 latency',
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    formatter={(value: string) => (value === 'avgLatency' ? 'Avg latency' : 'p95 latency')}
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
            <EmptyState title="No AI calls in this window" />
          )}
        </Glass>

        {/* ── Cost tracking ── */}
        <Glass padding={24} radius={20}>
          <SectionTitle
            title="Cost tracking"
            subtitle={`${fmtMoney(costTrend.totalCost)} total this range · ${fmtMoney(costTrend.projectedMonthly)} projected / month · ${costTrend.granularity === 'week' ? 'weekly' : 'daily'} buckets`}
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
            <EmptyState title="No cost data in this window" />
          )}
        </Glass>

        {/* ── Per-model breakdown ── */}
        <Glass padding={0} radius={20}>
          <div
            style={{
              padding: '16px 24px',
              borderBottom: '0.5px solid rgba(60,20,15,0.06)',
            }}
          >
            <SectionTitle
              title="Per-model performance"
              subtitle="Failure rate, latency, tokens, and cost by Gemini model · sorted by call volume"
            />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: MODEL_GRID_COLS,
                padding: '14px 22px',
                gap: 12,
                background: 'rgba(255,255,255,0.5)',
                borderBottom: '0.5px solid rgba(60,20,15,0.06)',
                minWidth: 760,
              }}
            >
              {['Model', 'Calls', 'Error %', 'Refusal %', 'Avg latency', 'p95 latency', 'Tokens in/out', 'Cost'].map(
                (h) => (
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
                ),
              )}
            </div>
            {modelRows.map((m) => (
              <div
                key={m.model_id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: MODEL_GRID_COLS,
                  padding: '12px 22px',
                  gap: 12,
                  alignItems: 'center',
                  borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                  minWidth: 760,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>{m.model_id}</div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: COLOR.inkSoft,
                    fontFamily: 'var(--pbt-mono)',
                  }}
                >
                  {m.calls}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--pbt-mono)',
                    color: m.errorPct > ALERT_THRESHOLDS.errorRatePct ? COLOR.danger : COLOR.inkSoft,
                  }}
                >
                  {fmtPct1(m.errorPct)}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--pbt-mono)',
                    color: m.refusalPct > ALERT_THRESHOLDS.refusalRatePct ? COLOR.warn : COLOR.inkSoft,
                  }}
                >
                  {fmtPct1(m.refusalPct)}
                </div>
                <div style={{ fontSize: 12, color: COLOR.inkSoft, fontFamily: 'var(--pbt-mono)' }}>
                  {fmtMs(m.avgLatency)}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: 'var(--pbt-mono)',
                    color: m.p95Latency > ALERT_THRESHOLDS.p95LatencyMs ? COLOR.warn : COLOR.inkSoft,
                  }}
                >
                  {fmtMs(m.p95Latency)}
                </div>
                <div style={{ fontSize: 12, color: COLOR.inkSoft, fontFamily: 'var(--pbt-mono)' }}>
                  {fmtNumber(m.tokensIn)} / {fmtNumber(m.tokensOut)}
                </div>
                <div style={{ fontSize: 12, color: COLOR.inkSoft, fontFamily: 'var(--pbt-mono)' }}>
                  {fmtMoney(m.cost)}
                </div>
              </div>
            ))}
          </div>
          {modelRows.length === 0 && <EmptyState title="No AI calls in this window" />}
        </Glass>

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
            <SectionTitle title="All flagged sessions" />
            <Eyebrow>{stats.flagged.length} total</Eyebrow>
          </div>
          {stats.flagged.slice(0, 30).map((s) => (
            <div
              key={s.id}
              style={{
                padding: '14px 24px',
                display: 'grid',
                gridTemplateColumns: '1.5fr 1.4fr 80px 90px 80px',
                gap: 12,
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.04)',
              }}
            >
              <div style={{ fontSize: 13, color: COLOR.ink, fontWeight: 600 }}>
                {s.scenario_summary ?? s.pushback_id ?? '—'}
              </div>
              <StatusPill tone="warn">{s.flag_reason ?? '—'}</StatusPill>
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
          {stats.flagged.length === 0 && (
            <EmptyState title="No flagged sessions" />
          )}
        </Glass>
      </ScreenShell>
    </>
  );
}
