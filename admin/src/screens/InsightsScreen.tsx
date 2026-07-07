/**
 * InsightsScreen — performance analytics rollups.
 *
 * Everything here is derived client-side from rows the other screens
 * already fetch (`useAdminSessions`, `useSessionFeedback`) — no new
 * Netlify Function / Supabase query. Sections:
 *   1. KPI row — completed sessions, avg overall score, completion rate,
 *      avg session feedback.
 *   2. Scoring trend — Recharts LineChart of avg `score_overall` for
 *      completed sessions, bucketed by day (or week for the 90d range).
 *   3. ACT dimension averages — Recharts BarChart of the mean of the 5
 *      ACT-first dimensions across completed sessions that carry them.
 *   4. Sentiment distribution — each completed session's mean
 *      `turnSentiment` bucketed hostile→warm (mirrors AnalyzerScreen's
 *      hand-rolled "Verdict mix" distribution style).
 *   5. Feedback summary — mean realism / AI quality / comfort meters.
 */
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Glass } from '../primitives/Glass';
import { EmptyState, Kpi, LoadingShimmer, SectionTitle } from '../primitives';
import { ContextBar, ScreenShell, type Range } from '../primitives/Shell';
import { useAdminSessions, useSessionFeedback } from '../data/queries';
import { rangeToDays } from '../lib/api';
import { COLOR } from '../lib/tokens';
import type { AdminSession, SessionFeedbackRow } from '../data/types';

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── ACT dimensions ───────────────────────────────────────────────────

const ACT_DIMENSIONS = [
  { key: 'acknowledge', label: 'Acknowledge' },
  { key: 'clarify', label: 'Clarify' },
  { key: 'transform', label: 'Transform' },
  { key: 'empathy', label: 'Empathy' },
  { key: 'rapport', label: 'Rapport' },
] as const;

type ActKey = (typeof ACT_DIMENSIONS)[number]['key'];

const SENTIMENT_BINS = [
  { label: 'Hostile', color: COLOR.danger },
  { label: 'Cool', color: COLOR.warn },
  { label: 'Neutral', color: 'oklch(0.75 0.02 60)' },
  { label: 'Warm', color: COLOR.info },
  { label: 'Very warm', color: COLOR.success },
] as const;

// ─── tolerant readers (score_report is untyped jsonb) ─────────────────
// Unlike SessionModal's per-session reader, this does NOT back-fill from
// the pre-Phase-2 shape — mixing 1–10 legacy subscores into a 0–100 mean
// would skew the aggregate, so legacy rows are simply excluded.

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readActDimension(report: AdminSession['score_report'], key: ActKey): number | null {
  if (!report || typeof report !== 'object') return null;
  return numOrNull((report as Record<string, unknown>)[key]);
}

function readMeanTurnSentiment(report: AdminSession['score_report']): number | null {
  if (!report || typeof report !== 'object') return null;
  const arr = (report as { turnSentiment?: unknown }).turnSentiment;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const values: number[] = [];
  for (const row of arr) {
    if (!row || typeof row !== 'object') continue;
    const s = (row as Record<string, unknown>).sentiment;
    if (typeof s === 'number' && Number.isFinite(s)) {
      values.push(Math.max(-1, Math.min(1, s)));
    }
  }
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function fmtScore(v: number | null): string {
  return v == null ? '—' : String(Math.round(v));
}

function fmtPct(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}

function fmt1(v: number | null): string {
  return v == null ? '—' : v.toFixed(1);
}

function fmtShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Thin out X-axis ticks so wide buckets counts don't collide. */
function tickInterval(n: number): number {
  return Math.max(0, Math.ceil(n / 8) - 1);
}

function bandColor(value: number): string {
  return value >= 85 ? COLOR.success : value >= 70 ? COLOR.info : value >= 55 ? COLOR.warn : COLOR.danger;
}

// ─── aggregation helpers ────────────────────────────────────────────

interface ScoreTrendPoint {
  label: string;
  score: number | null;
}

function buildScoreTrend(
  completed: AdminSession[],
  range: Range,
): { data: ScoreTrendPoint[]; hasData: boolean; granularity: 'day' | 'week' } {
  const totalDays = rangeToDays(range);
  const granularity: 'day' | 'week' = totalDays > 35 ? 'week' : 'day';
  const bucketSizeDays = granularity === 'week' ? 7 : 1;
  const bucketCount = Math.max(1, Math.ceil(totalDays / bucketSizeDays));
  const now = Date.now();

  const sums = Array.from({ length: bucketCount }, () => ({ sum: 0, count: 0 }));

  for (const s of completed) {
    if (s.score_overall == null) continue;
    // Clamp to 0 so a session with a slightly-future created_at (server/client
    // clock skew) lands in the newest bucket instead of silently vanishing
    // from the trend while still counting in the KPI row.
    const ageDays = Math.max(
      0,
      Math.floor((now - new Date(s.created_at).getTime()) / DAY_MS),
    );
    const ageBuckets = Math.floor(ageDays / bucketSizeDays);
    if (ageBuckets >= bucketCount) continue;
    const idx = bucketCount - 1 - ageBuckets;
    sums[idx].sum += s.score_overall;
    sums[idx].count++;
  }

  let hasData = false;
  const data = sums.map((b, idx) => {
    const ageBuckets = bucketCount - 1 - idx;
    const anchor = new Date(now - ageBuckets * bucketSizeDays * DAY_MS);
    const score = b.count > 0 ? b.sum / b.count : null;
    if (score != null) hasData = true;
    return { label: fmtShortDate(anchor), score };
  });

  return { data, hasData, granularity };
}

interface ActBar {
  key: ActKey;
  label: string;
  value: number;
  hasData: boolean;
}

function buildActStats(completed: AdminSession[]): { data: ActBar[]; hasData: boolean; skipped: number } {
  const data = ACT_DIMENSIONS.map((d) => {
    const values = completed
      .map((s) => readActDimension(s.score_report, d.key))
      .filter((v): v is number => v != null);
    const mean = avg(values);
    return { key: d.key, label: d.label, value: mean ?? 0, hasData: mean != null };
  });
  const hasData = data.some((d) => d.hasData);
  const skipped = completed.filter((s) => ACT_DIMENSIONS.some((d) => readActDimension(s.score_report, d.key) == null))
    .length;
  return { data, hasData, skipped };
}

function buildSentimentDistribution(completed: AdminSession[]): {
  counts: number[];
  total: number;
  mean: number | null;
} {
  const values = completed.map((s) => readMeanTurnSentiment(s.score_report)).filter((v): v is number => v != null);
  const counts = [0, 0, 0, 0, 0];
  for (const v of values) {
    const idx = v < -0.6 ? 0 : v < -0.2 ? 1 : v < 0.2 ? 2 : v < 0.6 ? 3 : 4;
    counts[idx]++;
  }
  return { counts, total: values.length, mean: avg(values) };
}

function buildFeedbackStats(rows: SessionFeedbackRow[]) {
  const realism = avg(rows.map((f) => f.realism).filter((v): v is number => v != null));
  const aiQuality = avg(rows.map((f) => f.ai_quality).filter((v): v is number => v != null));
  const comfort = avg(rows.map((f) => f.comfort).filter((v): v is number => v != null));
  const dims = [realism, aiQuality, comfort].filter((v): v is number => v != null);
  return { realism, aiQuality, comfort, overall: avg(dims), count: rows.length };
}

// ─── component ──────────────────────────────────────────────────────

export function InsightsScreen({
  range,
  onRange,
  query,
  onQuery,
}: {
  range: Range;
  onRange: (r: Range) => void;
  query?: string;
  onQuery?: (q: string) => void;
}) {
  const sessions = useAdminSessions(range, 2000);
  const feedback = useSessionFeedback(range, 1000);

  const completed = useMemo(() => sessions.data.filter((s) => s.completed), [sessions.data]);

  const kpis = useMemo(() => {
    const scored = completed.filter((s) => s.score_overall != null).map((s) => s.score_overall as number);
    const completionRate = sessions.data.length ? (completed.length / sessions.data.length) * 100 : null;
    return {
      completedCount: completed.length,
      avgScore: avg(scored),
      completionRate,
    };
  }, [completed, sessions.data]);

  const scoreTrend = useMemo(() => buildScoreTrend(completed, range), [completed, range]);
  const actStats = useMemo(() => buildActStats(completed), [completed]);
  const sentimentDist = useMemo(() => buildSentimentDistribution(completed), [completed]);
  const feedbackStats = useMemo(() => buildFeedbackStats(feedback.data), [feedback.data]);

  const sessionsReady = !sessions.loading;
  const kpisReady = !sessions.loading && !feedback.loading;

  return (
    <>
      <ContextBar
        title="Insights"
        subtitle="Performance analytics across training sessions"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {!kpisReady ? (
            Array.from({ length: 4 }).map((_, i) => <LoadingShimmer key={i} height={140} />)
          ) : (
            <>
              <Kpi
                label="Completed sessions"
                value={kpis.completedCount}
                icon="◇"
                accent={COLOR.infoSoft}
                sparkColor={COLOR.info}
              />
              <Kpi
                label="Avg overall score"
                value={fmtScore(kpis.avgScore)}
                icon="✺"
                accent={COLOR.successSoft}
                sparkColor={COLOR.success}
              />
              <Kpi
                label="Completion rate"
                value={fmtPct(kpis.completionRate)}
                icon="✓"
                accent={COLOR.warnSoft}
                sparkColor={COLOR.warn}
              />
              <Kpi
                label="Avg session feedback"
                value={fmt1(feedbackStats.overall)}
                icon="☆"
                accent={COLOR.brandSoft}
                sparkColor={COLOR.brand}
              />
            </>
          )}
        </div>

        {/* ── Scoring trend ── */}
        <Glass padding={24} radius={20}>
          <SectionTitle
            title="Scoring trend over time"
            subtitle={`Average overall score of completed sessions · ${scoreTrend.granularity === 'week' ? 'weekly' : 'daily'} buckets`}
          />
          {!sessionsReady ? (
            <div style={{ marginTop: 16 }}>
              <LoadingShimmer height={260} />
            </div>
          ) : scoreTrend.hasData ? (
            <div style={{ height: 260, marginTop: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={scoreTrend.data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="rgba(60,20,15,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke={COLOR.inkMute}
                    fontSize={11}
                    tickLine={false}
                    interval={tickInterval(scoreTrend.data.length)}
                  />
                  <YAxis domain={[0, 100]} stroke={COLOR.inkMute} fontSize={11} tickLine={false} width={32} />
                  <Tooltip
                    cursor={{ stroke: 'rgba(60,20,15,0.12)' }}
                    contentStyle={{
                      background: 'rgba(255,255,255,0.95)',
                      border: '0.5px solid rgba(60,20,15,0.12)',
                      borderRadius: 10,
                      fontSize: 12,
                      boxShadow: '0 8px 20px -8px rgba(60,20,15,0.18)',
                    }}
                    formatter={(value: number) => [value == null ? '—' : Math.round(value), 'Avg score']}
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
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
            <EmptyState title="No scored sessions yet" subtitle="Complete a training session to see the trend." />
          )}
        </Glass>

        {/* ── ACT dimensions + sentiment distribution ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
          <Glass padding={24} radius={20}>
            <SectionTitle
              title="ACT dimension averages"
              subtitle="Mean score per ACT-first dimension · completed sessions"
            />
            {!sessionsReady ? (
              <div style={{ marginTop: 16 }}>
                <LoadingShimmer height={220} />
              </div>
            ) : actStats.hasData ? (
              <>
                <div style={{ height: 220, marginTop: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={actStats.data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                      <CartesianGrid stroke="rgba(60,20,15,0.06)" vertical={false} />
                      <XAxis dataKey="label" stroke={COLOR.inkMute} fontSize={11} tickLine={false} />
                      <YAxis domain={[0, 100]} stroke={COLOR.inkMute} fontSize={11} tickLine={false} width={32} />
                      <Tooltip
                        cursor={{ fill: 'rgba(60,20,15,0.04)' }}
                        contentStyle={{
                          background: 'rgba(255,255,255,0.95)',
                          border: '0.5px solid rgba(60,20,15,0.12)',
                          borderRadius: 10,
                          fontSize: 12,
                          boxShadow: '0 8px 20px -8px rgba(60,20,15,0.18)',
                        }}
                        formatter={(value: number, _name, ctx) => {
                          const payload = ctx?.payload as { hasData: boolean } | undefined;
                          return [payload?.hasData ? Math.round(value) : '—', 'Avg'];
                        }}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                        {actStats.data.map((d) => (
                          <Cell key={d.key} fill={d.hasData ? bandColor(d.value) : 'oklch(0.9 0.01 20)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {actStats.skipped > 0 && (
                  <div style={{ marginTop: 10, fontSize: 11, color: COLOR.inkMute }}>
                    {actStats.skipped} completed session{actStats.skipped === 1 ? '' : 's'} without full ACT
                    dimension scores (legacy) excluded.
                  </div>
                )}
              </>
            ) : (
              <EmptyState title="No ACT scoring data" subtitle="Phase 2 sessions will populate this chart." />
            )}
          </Glass>

          <Glass padding={24} radius={20}>
            <SectionTitle title="Sentiment across sessions" subtitle="Mean customer sentiment, completed sessions" />
            {!sessionsReady ? (
              <div style={{ marginTop: 16 }}>
                <LoadingShimmer height={220} />
              </div>
            ) : sentimentDist.total > 0 ? (
              <>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {SENTIMENT_BINS.map((bin, i) => {
                    const n = sentimentDist.counts[i];
                    const pct = sentimentDist.total ? (n / sentimentDist.total) * 100 : 0;
                    return (
                      <div key={bin.label}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 12,
                            color: COLOR.inkSoft,
                            fontWeight: 600,
                          }}
                        >
                          <span>{bin.label}</span>
                          <span style={{ fontWeight: 700, color: COLOR.ink }}>
                            {n}{' '}
                            <span style={{ color: COLOR.inkMute, fontWeight: 500, fontSize: 11 }}>
                              ({Math.round(pct)}%)
                            </span>
                          </span>
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
                              width: `${pct}%`,
                              height: '100%',
                              background: bin.color,
                              transition: 'width 0.6s ease',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 14, fontSize: 11, color: COLOR.inkMute }}>
                  Avg{' '}
                  {sentimentDist.mean != null
                    ? `${sentimentDist.mean >= 0 ? '+' : ''}${sentimentDist.mean.toFixed(2)}`
                    : '—'}{' '}
                  across {sentimentDist.total} session{sentimentDist.total === 1 ? '' : 's'} with captured sentiment.
                </div>
              </>
            ) : (
              <EmptyState title="No sentiment data" subtitle="Sessions scored with per-turn sentiment will appear here." />
            )}
          </Glass>
        </div>

        {/* ── Feedback summary ── */}
        <Glass padding={24} radius={20}>
          <SectionTitle
            title="Feedback summary"
            subtitle={`${feedbackStats.count} response${feedbackStats.count === 1 ? '' : 's'} in this window`}
          />
          {feedback.loading ? (
            <div style={{ marginTop: 16 }}>
              <LoadingShimmer height={140} />
            </div>
          ) : feedbackStats.count > 0 ? (
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
              <Meter label="Realism" value={feedbackStats.realism} color={COLOR.info} />
              <Meter label="AI quality" value={feedbackStats.aiQuality} color={COLOR.success} />
              <Meter label="Comfort" value={feedbackStats.comfort} color={COLOR.warn} />
            </div>
          ) : (
            <EmptyState title="No feedback yet" subtitle="Responses appear here once users rate a session." />
          )}
        </Glass>
      </ScreenShell>
    </>
  );
}

// ─── Meter — labeled 1–5 bar, mirrors DimensionBar/FunnelRow elsewhere ──
function Meter({ label, value, color }: { label: string; value: number | null; color: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: COLOR.inkSoft, fontWeight: 600 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color: COLOR.ink, fontFamily: 'var(--pbt-mono)' }}>{fmt1(value)}</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'oklch(0.96 0.01 20)', marginTop: 4, overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            transition: 'width 0.6s ease',
          }}
        />
      </div>
    </div>
  );
}
