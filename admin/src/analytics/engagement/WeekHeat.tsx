/**
 * "When your team uses the app": screen views by weekday (Monday first) ×
 * hour, one-hue sequential, with the peak named in a sentence and the key
 * facts beside the grid. "View as table" folds the hours into 3-hour blocks
 * so the numbers can be read without hovering.
 */
import { useState } from 'react';
import type { EngagementReport } from '../../../../src/shared/analytics/contract';
import { COLOR } from '../../lib/tokens';
import { CHART, Fact, HeatGrid, HeatScale, Panel } from '../ui';
import {
  WEEKDAYS_MONDAY_FIRST,
  heatSummary,
  heatValue,
  hourRange,
  hourTick,
  peakSentence,
  weekdayLong,
} from '../lib/engagementInsights';
import { useElementWidth } from './useElementWidth';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const BLOCKS = Array.from({ length: 8 }, (_, i) => i * 3);

function pctText(n: number): string {
  return `${Math.round(n)}%`;
}

export function WeekHeat({ heatmap, rangeLabel }: { heatmap: EngagementReport['heatmap']; rangeLabel: string }) {
  const [asTable, setAsTable] = useState(false);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const summary = heatSummary(heatmap);
  const sentence = peakSentence(heatmap);

  // Fit 24 columns to the space there is: row labels ~44px, 3px spacing.
  const cell = width > 0 ? Math.max(14, Math.min(30, Math.floor((width - 44) / 24) - 3)) : 22;

  return (
    <Panel
      title="When your team uses the app"
      subtitle={sentence ? `${sentence} · screen views by day and hour, ${rangeLabel}` : `Screen views by day and hour, ${rangeLabel}`}
      actions={
        <button type="button" className="pbt-link" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} style={{ fontSize: 12 }}>
          {asTable ? 'View as grid' : 'View as table'}
        </button>
      }
      footnote="Times are in your time zone."
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div ref={ref} style={{ flex: '1 1 520px', minWidth: 0 }}>
          {summary.total === 0 ? (
            <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '24px 0' }}>No screens were opened in this window.</div>
          ) : asTable ? (
            <BlockTable heatmap={heatmap} />
          ) : (
            <>
              <HeatGrid
                rows={WEEKDAYS_MONDAY_FIRST.map((d) => ({ key: String(d.index), label: d.short }))}
                cols={HOURS.map((h) => ({ key: String(h), label: hourTick(h) }))}
                value={(r, c) => heatValue(heatmap, Number(r), Number(c))}
                titleFor={(r, c, v) =>
                  `${weekdayLong(Number(r))}s, ${hourRange(Number(c))}: ${(v ?? 0).toLocaleString('en-US')} screen ${v === 1 ? 'view' : 'views'}`
                }
                cellSize={cell}
                rowLabelWidth={36}
                colLabelEvery={3}
              />
              <div style={{ marginTop: 10 }}>
                <HeatScale less="Fewer views" more="More" />
              </div>
            </>
          )}
        </div>
        {summary.total > 0 && (
          <div
            style={{
              flex: '0 1 200px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 16,
              paddingLeft: 20,
              borderLeft: `0.5px solid ${CHART.grid}`,
            }}
          >
            {summary.busiestDay && (
              <Fact
                label="Busiest day"
                value={weekdayLong(summary.busiestDay.weekday)}
                sub={`${pctText(summary.busiestDay.share)} of screen views`}
              />
            )}
            {summary.busiestHour && (
              <Fact
                label="Busiest hour"
                value={hourRange(summary.busiestHour.hour)}
                sub={`${pctText(summary.busiestHour.share)} of screen views`}
              />
            )}
            {summary.weekendShare != null && (
              <Fact label="Weekends" value={pctText(summary.weekendShare)} sub="of screen views" />
            )}
            <Fact label="Screen views" value={summary.total.toLocaleString('en-US')} sub="in the grid" />
          </div>
        )}
      </div>
    </Panel>
  );
}

function BlockTable({ heatmap }: { heatmap: EngagementReport['heatmap'] }) {
  const th = {
    padding: '7px 8px',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: COLOR.inkMute,
    textAlign: 'right' as const,
    whiteSpace: 'nowrap' as const,
    borderBottom: `0.5px solid ${CHART.grid}`,
  };
  const td = {
    padding: '7px 8px',
    fontSize: 12.5,
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
    color: COLOR.inkSoft,
    borderBottom: `0.5px solid ${CHART.grid}`,
  };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...th, textAlign: 'left' }}>
              Day
            </th>
            {BLOCKS.map((b) => (
              <th key={b} scope="col" style={th}>
                {hourTick(b)}–{hourTick((b + 3) % 24)}
              </th>
            ))}
            <th scope="col" style={th}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS_MONDAY_FIRST.map((d) => {
            const blocks = BLOCKS.map((b) => [0, 1, 2].reduce((n, k) => n + heatValue(heatmap, d.index, b + k), 0));
            const total = blocks.reduce((a, n) => a + n, 0);
            return (
              <tr key={d.index}>
                <th scope="row" style={{ ...td, textAlign: 'left', fontWeight: 650, color: COLOR.ink }}>
                  {d.long}
                </th>
                {blocks.map((n, i) => (
                  <td key={i} style={{ ...td, color: n === 0 ? COLOR.inkMute : COLOR.inkSoft }}>
                    {n === 0 ? '·' : n.toLocaleString('en-US')}
                  </td>
                ))}
                <td style={{ ...td, fontWeight: 750, color: COLOR.ink }}>{total.toLocaleString('en-US')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
