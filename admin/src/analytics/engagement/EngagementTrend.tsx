/**
 * People (or screen views) per bucket across the window — one series at a
 * time, switched with a toggle; never two measures on two axes. A 2px line
 * over a ~10% wash, the peak named in words, and a table view so every
 * number is reachable without hovering.
 */
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EngagementReport } from '../../../../src/shared/analytics/contract';
import { COLOR } from '../../lib/tokens';
import { CHART, ChipFilter, Panel, tooltipStyle } from '../ui';
import { tickEvery } from '../lib/period';
import { bucketLabel } from '../lib/engagementInsights';

type Metric = 'visitors' | 'views';

const METRIC_WORDS: Record<Metric, { one: string; many: string; title: string }> = {
  visitors: { one: 'person', many: 'people', title: 'People using the app' },
  views: { one: 'screen view', many: 'screen views', title: 'Screens opened' },
};

const GRAIN_WORDS = { hour: 'per hour', day: 'per day', week: 'per week' } as const;

export function EngagementTrend({
  report,
  trimLeadingEmpty = false,
}: {
  report: EngagementReport;
  /** All time is charted as a year; start where the activity starts instead of a long flat line. */
  trimLeadingEmpty?: boolean;
}) {
  const [metric, setMetric] = useState<Metric>('visitors');
  const [asTable, setAsTable] = useState(false);
  const words = METRIC_WORDS[metric];

  // The newest hour or day is still under way: draw its segment dashed so a
  // half-finished today doesn't read as a collapse. (A weekly bucket is the
  // trailing seven days — complete enough to draw solid.)
  const partialLast = report.granularity !== 'week' && report.trend.length > 1;
  const data = useMemo(() => {
    let trend = report.trend;
    if (trimLeadingEmpty) {
      const first = trend.findIndex((b) => b.visitors > 0 || b.screen_views > 0);
      if (first > 1) trend = trend.slice(first - 1);
    }
    const n = trend.length;
    return trend.map((b, i) => {
      const value = metric === 'visitors' ? b.visitors : b.screen_views;
      const last = i === n - 1;
      return {
        start: b.start,
        label: bucketLabel(b.start, report.granularity),
        long: `${bucketLabel(b.start, report.granularity, true)}${partialLast && last ? ' (so far)' : ''}`,
        value,
        solid: partialLast && last ? null : value,
        partial: partialLast && i >= n - 2 ? value : null,
      };
    });
  }, [report.trend, report.granularity, metric, partialLast, trimLeadingEmpty]);
  const peak = data.reduce<(typeof data)[number] | null>((best, d) => (d.value > (best?.value ?? 0) ? d : best), null);
  const fmt = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? words.one : words.many}`;

  return (
    <Panel
      title={words.title}
      subtitle={
        peak
          ? `${GRAIN_WORDS[report.granularity][0].toUpperCase()}${GRAIN_WORDS[report.granularity].slice(1)} · busiest ${report.granularity === 'hour' ? 'hour' : report.granularity === 'week' ? 'week' : 'day'}: ${peak.long} (${fmt(peak.value)})`
          : `Distinct people ${GRAIN_WORDS[report.granularity]}`
      }
      actions={
        <>
          <ChipFilter<Metric>
            label="Measure"
            value={metric}
            onChange={setMetric}
            options={[
              { key: 'visitors', label: 'People' },
              { key: 'views', label: 'Screen views' },
            ]}
          />
          <button
            type="button"
            className="pbt-link"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            style={{ fontSize: 12 }}
          >
            {asTable ? 'View as chart' : 'View as table'}
          </button>
        </>
      }
      footnote={[
        metric === 'visitors'
          ? 'Each bucket counts a person once, however many screens they opened; signed-out visitors are counted by device.'
          : null,
        partialLast ? `The dashed end is the current ${report.granularity}, still in progress.` : null,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {asTable ? (
        <div style={{ maxHeight: 260, overflow: 'auto', borderRadius: 10, border: `0.5px solid ${CHART.grid}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr>
                <th scope="col" style={thStyle}>
                  {report.granularity === 'hour' ? 'Hour' : report.granularity === 'week' ? 'Week' : 'Day'}
                </th>
                <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
                  {metric === 'visitors' ? 'People' : 'Screen views'}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.start}>
                  <td style={tdStyle}>{d.long}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: COLOR.ink }}>
                    {d.value.toLocaleString('en-US')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height: 230 }} role="img" aria-label={`${words.title} ${GRAIN_WORDS[report.granularity]}. ${peak ? `Busiest: ${peak.long}, ${fmt(peak.value)}.` : ''}`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="label"
                stroke={CHART.axis}
                fontSize={10.5}
                tickLine={false}
                axisLine={{ stroke: CHART.grid }}
                interval={tickEvery(data.length)}
                minTickGap={8}
              />
              <YAxis
                allowDecimals={false}
                stroke={CHART.axis}
                fontSize={10.5}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(60,20,15,0.18)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  const d = payload?.[0]?.payload as { long: string; value: number } | undefined;
                  if (!active || !d) return null;
                  return (
                    <div style={tooltipStyle}>
                      <div style={{ color: COLOR.inkMute, fontSize: 11, marginBottom: 2 }}>{d.long}</div>
                      <div style={{ color: COLOR.ink, fontWeight: 750 }}>{fmt(d.value)}</div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="solid"
                name="solid"
                stroke={CHART.primary}
                strokeWidth={2}
                fill={CHART.primary}
                fillOpacity={0.1}
                dot={false}
                activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                isAnimationActive={false}
                connectNulls={false}
              />
              {partialLast && (
                <Area
                  type="monotone"
                  dataKey="partial"
                  name="partial"
                  stroke={CHART.primary}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  fill={CHART.primary}
                  fillOpacity={0.04}
                  dot={false}
                  activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}

const thStyle = {
  position: 'sticky' as const,
  top: 0,
  background: 'rgba(255,255,255,0.97)',
  textAlign: 'left' as const,
  padding: '8px 12px',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: COLOR.inkMute,
  borderBottom: `0.5px solid ${CHART.grid}`,
};

const tdStyle = {
  padding: '7px 12px',
  borderBottom: `0.5px solid ${CHART.grid}`,
  color: COLOR.inkSoft,
};
