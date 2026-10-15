/**
 * Chart pieces the Overview and Skills tabs share: practice activity
 * (finished vs left early), the score line with its "Solid" threshold, a
 * skill bar list with previous-window ticks, and the "View as table" toggle
 * that keeps every charted number reachable without hovering.
 *
 * Marks follow the portal's chart rules (ui.tsx header): bars ≤ 24px with a
 * 4px rounded data end and a 2px surface gap between stacked segments, 2px
 * lines, solid hairline grid, one colour per series, text in ink colours.
 */
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts';
import { COLOR } from '../../lib/tokens';
import { CHART, DeltaChip, bandWord, tooltipStyle } from '../ui';
import { tickEvery, type Delta } from '../lib/period';
import type { TrendPoint } from '../lib/metrics';

export const AXIS_TICK = { fontSize: 11, fill: COLOR.inkMute } as const;
/** Scores at or above this are "Solid" (the band the scorer and the admin both use). */
export const SOLID = 70;
/** The "Solid" reference line — a recessive ink rule, never a series colour. */
export const SOLID_LINE = 'rgba(60,20,15,0.34)';

// ─── Small pieces ───────────────────────────────────────────────────────

/** "View as table" ⇄ "View as chart" — a quiet text button in a Panel's actions. */
export function TableToggle({ table, onToggle, label }: { table: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      className="pbt-link"
      onClick={onToggle}
      aria-pressed={table}
      aria-label={label ? `${table ? 'Show chart' : 'Show table'}: ${label}` : undefined}
      style={{ fontSize: 12, fontWeight: 700 }}
    >
      {table ? 'View as chart' : 'View as table'}
    </button>
  );
}

/** A compact, scrollable data table for a chart's numbers. */
export function MiniTable({
  columns,
  rows,
  maxHeight = 240,
  caption,
}: {
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
  rows: Array<Record<string, ReactNode> & { _key: string }>;
  maxHeight?: number;
  caption: string;
}) {
  return (
    <div style={{ maxHeight, overflow: 'auto', borderRadius: 10, border: `0.5px solid ${COLOR.border}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                style={{
                  position: 'sticky',
                  top: 0,
                  background: 'rgba(252,249,247,0.97)',
                  textAlign: c.align ?? 'right',
                  padding: '7px 10px',
                  fontSize: 10.5,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: COLOR.inkMute,
                  borderBottom: `0.5px solid ${COLOR.border}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._key}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    textAlign: c.align ?? 'right',
                    padding: '6px 10px',
                    color: c.align === 'left' ? COLOR.inkSoft : COLOR.ink,
                    fontWeight: c.align === 'left' ? 600 : 650,
                    fontVariantNumeric: 'tabular-nums',
                    borderBottom: `0.5px solid ${COLOR.borderSoft}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Week of Oct 3" / "Oct 3" / "3 PM" — what one bucket of a trend covers. */
export function bucketTitle(label: string, granularity: 'hour' | 'day' | 'week'): string {
  return granularity === 'week' ? `Week of ${label}` : label;
}

// ─── Practice activity ──────────────────────────────────────────────────

/** Path for a bar with only its top corners rounded (the data end). */
function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

/**
 * A stacked segment: the top-most non-empty segment gets the rounded data
 * end; a lower segment leaves a 2px surface gap above itself when another
 * segment sits on it.
 */
function stackSegment(position: 'bottom' | 'top', aboveKey?: string | readonly string[]) {
  const above = aboveKey == null ? [] : typeof aboveKey === 'string' ? [aboveKey] : aboveKey;
  return function Segment(props: BarShapeProps) {
    const { x, y, width, height, fill, payload } = props;
    if (!(height > 0) || !(width > 0)) return <g />;
    const covered = position === 'bottom' && above.some((k) => Number(payload?.[k] ?? 0) > 0);
    const gap = covered ? Math.min(2, height) : 0;
    const h = height - gap;
    if (h <= 0) return <g />;
    return <path d={topRoundedRect(x, y + gap, width, h, covered ? 0 : 4)} fill={fill} />;
  };
}

function ActivityTip({
  active,
  payload,
  granularity,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TrendPoint }>;
  granularity: 'hour' | 'day' | 'week';
}) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 800, color: COLOR.ink, marginBottom: 4 }}>{bucketTitle(p.label, granularity)}</div>
      <TipRow color={CHART.primary} label="Finished" value={p.finished} />
      <TipRow color={CHART.muted} label="Left early" value={p.leftEarly} />
      {p.endingUnknown > 0 && <TipRow color={ENDING_UNKNOWN_FILL} label="Ending not recorded" value={p.endingUnknown} />}
      <div style={{ marginTop: 4, color: COLOR.inkMute }}>
        {p.trainees} trainee{p.trainees === 1 ? '' : 's'}
        {p.devices > 0 && ` and ${p.devices} anonymous device${p.devices === 1 ? '' : 's'}`} practised
      </div>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLOR.inkSoft, lineHeight: 1.6 }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
      <span style={{ flex: 1 }}>{label}</span>
      <strong style={{ color: COLOR.ink, fontVariantNumeric: 'tabular-nums', marginLeft: 12 }}>{value}</strong>
    </div>
  );
}

/** The third, lightest segment: sessions whose ending wasn't recorded (rebuilt anonymous practice). */
export const ENDING_UNKNOWN_FILL = 'oklch(0.89 0.012 40)';

/**
 * Sessions per bucket, finished (primary) stacked under left early (muted),
 * with "ending not recorded" (lightest) on top when there is any.
 */
export function ActivityBars({
  points,
  granularity,
  height = 220,
}: {
  points: TrendPoint[];
  granularity: 'hour' | 'day' | 'week';
  height?: number;
}) {
  const anyUnknown = points.some((p) => p.endingUnknown > 0);
  return (
    <div style={{ height }} role="img" aria-label="Sessions per period, finished and left early. Use View as table for the numbers.">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: -14 }} barCategoryGap="22%">
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            tick={AXIS_TICK}
            interval={tickEvery(points.length, 7)}
            tickMargin={8}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} />
          <Tooltip
            cursor={{ fill: 'rgba(60,20,15,0.035)' }}
            content={(p) => (
              <ActivityTip
                active={p.active}
                payload={p.payload as ReadonlyArray<{ payload?: TrendPoint }> | undefined}
                granularity={granularity}
              />
            )}
          />
          <Bar
            dataKey="finished"
            name="Finished"
            stackId="s"
            fill={CHART.primary}
            maxBarSize={24}
            shape={stackSegment('bottom', ['leftEarly', 'endingUnknown'])}
            isAnimationActive={false}
          />
          <Bar
            dataKey="leftEarly"
            name="Left early"
            stackId="s"
            fill={CHART.muted}
            maxBarSize={24}
            shape={anyUnknown ? stackSegment('bottom', 'endingUnknown') : stackSegment('top')}
            isAnimationActive={false}
          />
          {anyUnknown && (
            <Bar
              dataKey="endingUnknown"
              name="Ending not recorded"
              stackId="s"
              fill={ENDING_UNKNOWN_FILL}
              maxBarSize={24}
              shape={stackSegment('top')}
              isAnimationActive={false}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Score line ─────────────────────────────────────────────────────────

export interface ScorePoint {
  label: string;
  avgScore: number | null;
  /** Scored sessions behind the point (tooltip). */
  scored?: number;
}

function ScoreTip({
  active,
  payload,
  granularity,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ScorePoint }>;
  granularity: 'hour' | 'day' | 'week';
}) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div style={tooltipStyle}>
      <div style={{ fontWeight: 800, color: COLOR.ink, marginBottom: 4 }}>{bucketTitle(p.label, granularity)}</div>
      {p.avgScore == null ? (
        <div style={{ color: COLOR.inkMute }}>No scored sessions</div>
      ) : (
        <>
          <TipRow color={CHART.primary} label="Average score" value={Math.round(p.avgScore)} />
          <div style={{ color: COLOR.inkMute, marginTop: 2 }}>
            {bandWord(p.avgScore)}
            {p.scored != null ? ` · ${p.scored} scored session${p.scored === 1 ? '' : 's'}` : ''}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Average score per bucket on a fixed 0–100 scale (a zoomed axis would turn a
 * 2-point wobble into a cliff), with the "Solid" threshold as a reference
 * line and the latest value labelled at the line's end.
 */
export function ScoreLine({
  points,
  granularity,
  height = 220,
}: {
  points: ScorePoint[];
  granularity: 'hour' | 'day' | 'week';
  height?: number;
}) {
  let last = -1;
  points.forEach((p, i) => {
    if (p.avgScore != null) last = i;
  });
  return (
    <div style={{ height }} role="img" aria-label="Average score per period on a 0 to 100 scale, with the Solid threshold at 70.">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 14, right: 26, bottom: 0, left: -14 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            tick={AXIS_TICK}
            interval={tickEvery(points.length, 6)}
            tickMargin={8}
          />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} />
          <ReferenceLine y={SOLID} stroke={SOLID_LINE} strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: 'rgba(60,20,15,0.14)', strokeWidth: 1 }}
            content={(p) => (
              <ScoreTip
                active={p.active}
                payload={p.payload as ReadonlyArray<{ payload?: ScorePoint }> | undefined}
                granularity={granularity}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="avgScore"
            name="Average score"
            stroke={CHART.primary}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            connectNulls
            isAnimationActive={false}
            dot={(d: { index?: number; cx?: number; cy?: number }) =>
              d.index === last && d.cx != null && d.cy != null ? (
                <circle key="end" cx={d.cx} cy={d.cy} r={4} fill={CHART.primary} stroke="#fff" strokeWidth={2} />
              ) : (
                <g key={`d${d.index}`} />
              )
            }
            activeDot={{ r: 5, fill: CHART.primary, stroke: '#fff', strokeWidth: 2 }}
          >
            <LabelList
              dataKey="avgScore"
              content={(l) => {
                const { index, x, y, value } = l as { index?: number; x?: number; y?: number; value?: number | null };
                if (index !== last || value == null || x == null || y == null) return null;
                return (
                  <text x={Number(x) + 8} y={Number(y) + 4} fontSize={12} fontWeight={800} fill={COLOR.ink}>
                    {Math.round(value)}
                  </text>
                );
              }}
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Skill bars ─────────────────────────────────────────────────────────

export interface SkillBarRow {
  key: string;
  label: string;
  value: number | null;
  /** The previous window's value — drawn as a tick on the same 0–100 scale. */
  benchmark?: number | null;
  delta?: Delta | null;
  /** Highlight (the weakest skill) — coloured AND worded. */
  flag?: string;
}

/**
 * Five skills on one 0–100 scale. A tick marks the previous window so the
 * reader sees movement without a second series; the flagged (weakest) row is
 * drawn in the warning colour and named in words beside it.
 */
export function SkillBars({
  rows,
  benchmarkTitle,
  showDelta = false,
  compareLabel,
}: {
  rows: SkillBarRow[];
  benchmarkTitle: string;
  showDelta?: boolean;
  compareLabel?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {rows.map((r) => {
        const pct = r.value == null ? 0 : Math.max(0, Math.min(100, r.value));
        const bench = r.benchmark == null ? null : Math.max(0, Math.min(100, r.benchmark));
        return (
          <div
            key={r.key}
            style={{
              display: 'grid',
              gridTemplateColumns: showDelta ? 'minmax(84px, 112px) 1fr 34px 76px' : 'minmax(84px, 112px) 1fr 34px',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft, whiteSpace: 'nowrap' }}>{r.label}</div>
              {r.flag && (
                <div style={{ fontSize: 10.5, fontWeight: 800, color: 'oklch(0.48 0.13 70)', marginTop: 1, letterSpacing: '0.02em' }}>
                  {r.flag}
                </div>
              )}
            </div>
            <div style={{ position: 'relative', height: 10, borderRadius: 4, background: CHART.track }}>
              <div
                style={{
                  width: `${pct > 0 ? Math.max(pct, 1.5) : 0}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: r.flag ? COLOR.warn : CHART.primary,
                  transition: 'width 0.6s ease',
                }}
              />
              {bench != null && (
                <span
                  title={`${benchmarkTitle}: ${Math.round(bench)}`}
                  style={{
                    position: 'absolute',
                    top: -4,
                    bottom: -4,
                    left: `calc(${bench}% - 1px)`,
                    width: 2,
                    borderRadius: 1,
                    background: CHART.benchmark,
                    boxShadow: '0 0 0 1.5px rgba(255,255,255,0.95)',
                  }}
                />
              )}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: COLOR.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {r.value == null ? '—' : Math.round(r.value)}
            </div>
            {showDelta && (
              <div style={{ justifySelf: 'start' }}>
                {r.delta ? (
                  <DeltaChip delta={r.delta} size="xs" compareLabel={compareLabel} />
                ) : (
                  <span style={{ fontSize: 10.5, color: COLOR.inkMute }}>—</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The x-axis of a 0–100 bar list: quiet ticks under the bars' column. */
export function ScaleTicks({ leftPad = 124, rightPad = 46 }: { leftPad?: number; rightPad?: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: `0 ${rightPad}px 0 ${leftPad}px`, fontSize: 10, color: COLOR.inkMute }}>
      {[0, 25, 50, 75, 100].map((t) => (
        <span key={t}>{t}</span>
      ))}
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────

/** A value-at-the-cap label for thin columns (only for non-zero values). */
export function CapLabel(props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) {
  const { x, y, width, value } = props;
  const n = Number(value);
  if (!n || x == null || y == null) return null;
  return (
    <text x={Number(x) + Number(width ?? 0) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={11} fontWeight={750} fill={COLOR.inkSoft}>
      {n}
    </text>
  );
}

/** Simple single-series columns (histograms): one colour, value on each cap. */
export function Columns({
  data,
  color = CHART.primary,
  height = 200,
  ariaLabel,
  tooltipLabel,
}: {
  data: Array<{ label: string; value: number }>;
  color?: string;
  height?: number;
  ariaLabel: string;
  tooltipLabel: (d: { label: string; value: number }) => string;
}) {
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 4, bottom: 0, left: -14 }} barCategoryGap="26%">
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: CHART.grid }} tick={{ ...AXIS_TICK, fontSize: 10.5 }} interval={0} tickMargin={8} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} />
          <Tooltip
            cursor={{ fill: 'rgba(60,20,15,0.035)' }}
            content={(p) => {
              const d = (p.payload?.[0] as { payload?: { label: string; value: number } } | undefined)?.payload;
              if (!p.active || !d) return null;
              return <div style={tooltipStyle}>{tooltipLabel(d)}</div>;
            }}
          />
          <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="value" content={CapLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
