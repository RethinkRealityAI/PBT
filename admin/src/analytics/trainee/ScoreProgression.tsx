/**
 * A trainee's scores over time: every scored session as a dot, a 5-session
 * rolling average as the line, and the team's average for the same window
 * as a muted reference — all on one 0–100 axis. Dots open the session.
 * "Table" shows the same numbers without hovering.
 */
import { useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ScoreBadge } from '../../primitives';
import { AdminDifficultyMeter } from '../../primitives/DifficultyMeter';
import { COLOR } from '../../lib/tokens';
import { pushbackLabel } from '../../lib/labels';
import { difficultyLabel } from '../../lib/difficulty';
import { CHART, Legend, tooltipStyle } from '../ui';
import { dayLabel, shortDate, type ProgressPoint } from '../lib/traineeProfile';
import { thStyle, tdStyle } from './parts';

export const SCORE_DOT = 'oklch(0.74 0.08 250)';
export const ROLLING_LINE = CHART.primary;
export const TEAM_LINE = 'oklch(0.62 0.03 30)';

export function ProgressionLegend({ team }: { team: boolean }) {
  return (
    <Legend
      items={[
        { label: 'Session score', color: SCORE_DOT, shape: 'dot' },
        { label: 'Rolling average (5 sessions)', color: ROLLING_LINE, shape: 'line' },
        ...(team ? [{ label: 'Team average', color: TEAM_LINE, shape: 'line' as const }] : []),
      ]}
    />
  );
}

export function ScoreProgression({
  points,
  teamAvg,
  onOpenSession,
  view,
  now,
}: {
  points: ProgressPoint[];
  teamAvg: number | null;
  onOpenSession: (id: string) => void;
  view: 'chart' | 'table';
  now: number;
}) {
  if (view === 'table') return <ProgressTable points={points} onOpenSession={onOpenSession} now={now} />;
  const first = points[0]?.t ?? now;
  const last = points[points.length - 1]?.t ?? now;
  const pad = Math.max((last - first) * 0.03, 12 * 3_600_000);
  const lastIndex = points.length - 1;
  // Keep the line's end label clear of the team label when they sit close.
  const lastRolling = points[lastIndex]?.rolling ?? null;
  const labelDy =
    teamAvg != null && lastRolling != null && Math.abs(lastRolling - teamAvg) < 7 ? (lastRolling >= teamAvg ? -11 : 15) : 4;
  return (
    <div style={{ height: 268, marginLeft: -6 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 10, right: 56, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[first - pad, last + pad]}
            tickFormatter={(t: number) => shortDate(t, now)}
            stroke={CHART.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: CHART.grid }}
            minTickGap={36}
            tickMargin={8}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            stroke={CHART.axis}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={34}
          />
          {teamAvg != null && (
            <ReferenceLine
              y={teamAvg}
              stroke={TEAM_LINE}
              strokeOpacity={0.55}
              strokeWidth={1.5}
              ifOverflow="extendDomain"
              label={{
                value: `Team ${Math.round(teamAvg)}`,
                position: 'right',
                fill: COLOR.inkMute,
                fontSize: 11,
                fontWeight: 700,
              }}
            />
          )}
          <Tooltip
            cursor={{ stroke: CHART.grid, strokeWidth: 1 }}
            contentStyle={tooltipStyle}
            content={({ active, payload }) => {
              const p = active && payload && payload.length ? (payload[0].payload as ProgressPoint) : null;
              if (!p) return null;
              return (
                <div style={{ ...tooltipStyle, minWidth: 190 }}>
                  <div style={{ fontWeight: 800, color: COLOR.ink }}>{dayLabel(p.t, now)}</div>
                  <div style={{ color: COLOR.inkSoft, marginTop: 2 }}>{pushbackLabel(p.pushback_id, [], p.title ?? 'Session')}</div>
                  {p.difficulty != null && (
                    <div style={{ color: COLOR.inkMute, marginTop: 1 }}>{difficultyLabel(p.difficulty)} owner</div>
                  )}
                  <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
                    <span>
                      Score <strong style={{ color: COLOR.ink }}>{p.score}</strong>
                    </span>
                    <span style={{ color: COLOR.inkMute }}>
                      Rolling <strong style={{ color: COLOR.inkSoft }}>{Math.round(p.rolling)}</strong>
                    </span>
                  </div>
                  <div style={{ color: COLOR.inkMute, fontSize: 11, marginTop: 4 }}>Click the dot to open the session</div>
                </div>
              );
            }}
          />
          <Line
            dataKey="rolling"
            type="monotone"
            stroke={ROLLING_LINE}
            strokeWidth={2}
            isAnimationActive={false}
            activeDot={false}
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: ProgressPoint }) => {
              const { cx, cy, index, payload } = props;
              if (index !== lastIndex || cx == null || cy == null || !payload) return <g key={`r-${index}`} />;
              return (
                <g key={`r-${index}`}>
                  <circle cx={cx} cy={cy} r={3.5} fill={ROLLING_LINE} stroke="#fff" strokeWidth={2} />
                  <text x={cx + 7} y={cy + labelDy} fontSize={11.5} fontWeight={800} fill={COLOR.ink}>
                    {Math.round(payload.rolling)}
                  </text>
                </g>
              );
            }}
          />
          <Line
            dataKey="score"
            stroke="none"
            isAnimationActive={false}
            legendType="none"
            activeDot={(props: { cx?: number; cy?: number; payload?: ProgressPoint }) =>
              props.cx == null || props.cy == null ? (
                <g />
              ) : (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={6.5}
                  fill={ROLLING_LINE}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onClick={() => props.payload && onOpenSession(props.payload.id)}
                />
              )
            }
            dot={(props: { cx?: number; cy?: number; index?: number; payload?: ProgressPoint }) =>
              props.cx == null || props.cy == null ? (
                <g key={`d-${props.index}`} />
              ) : (
                <circle
                  key={`d-${props.index}`}
                  cx={props.cx}
                  cy={props.cy}
                  r={5}
                  fill={SCORE_DOT}
                  stroke="#fff"
                  strokeWidth={2}
                  style={{ cursor: 'pointer' }}
                  onClick={() => props.payload && onOpenSession(props.payload.id)}
                />
              )
            }
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProgressTable({
  points,
  onOpenSession,
  now,
}: {
  points: ProgressPoint[];
  onOpenSession: (id: string) => void;
  now: number;
}) {
  const [all, setAll] = useState(false);
  const rows = points.slice().reverse();
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 0 }}>Date</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>Objection</th>
            <th style={{ ...thStyle, textAlign: 'left' }}>Owner</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Score</th>
            <th style={{ ...thStyle, textAlign: 'right', paddingRight: 0 }}>Rolling</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id} className="pbt-roster-row" onClick={() => onOpenSession(p.id)}>
              <td style={{ ...tdStyle, paddingLeft: 0, whiteSpace: 'nowrap', padding: '8px 12px 8px 0' }}>
                <button
                  type="button"
                  className="pbt-name-btn"
                  style={{ fontWeight: 650, color: COLOR.inkSoft }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenSession(p.id);
                  }}
                >
                  {dayLabel(p.t, now)}
                </button>
              </td>
              <td style={{ ...tdStyle, padding: '8px 12px' }}>{pushbackLabel(p.pushback_id, [], p.title ?? 'Session')}</td>
              <td style={{ ...tdStyle, padding: '8px 12px' }}>
                {p.difficulty != null ? <AdminDifficultyMeter level={p.difficulty} /> : <span style={{ color: COLOR.inkMute }}>—</span>}
              </td>
              <td style={{ ...tdStyle, padding: '8px 12px', textAlign: 'right' }}>
                <ScoreBadge score={p.score} />
              </td>
              <td style={{ ...tdStyle, padding: '8px 0 8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
                {Math.round(p.rolling)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 8 && (
        <button type="button" className="pbt-link" onClick={() => setAll((a) => !a)} style={{ fontSize: 12, marginTop: 10 }}>
          {all ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  );
}
