/**
 * "How often people come back": people by the number of different days they
 * used the app in the window, as thin columns with the count on top.
 */
import type { EngagementReport } from '../../../../src/shared/analytics/contract';
import { COLOR } from '../../lib/tokens';
import { CHART, Panel } from '../ui';
import { activeDaysLabel } from '../lib/engagementInsights';

export function ReturnColumns({
  histogram,
  returningPct,
}: {
  histogram: EngagementReport['active_days_histogram'];
  returningPct: number | null;
}) {
  const max = Math.max(1, ...histogram.map((b) => b.visitors));
  const total = histogram.reduce((a, b) => a + b.visitors, 0);
  return (
    <Panel
      title="How often people come back"
      subtitle={
        returningPct == null
          ? 'People by the number of different days they used the app'
          : `${Math.round(returningPct)}% used the app on two or more days`
      }
    >
      {total === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '12px 0' }}>Nobody used the app in this window.</div>
      ) : (
        <div
          role="list"
          aria-label="People by number of active days"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${histogram.length}, 1fr)`, gap: 8, alignItems: 'end', height: 170 }}
        >
          {histogram.map((b) => {
            const h = (b.visitors / max) * 120;
            return (
              <div
                role="listitem"
                key={b.bucket}
                aria-label={`${activeDaysLabel(b.bucket)}: ${b.visitors} ${b.visitors === 1 ? 'person' : 'people'}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 0 }}
              >
                <span style={{ fontSize: 12.5, fontWeight: 750, color: COLOR.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {b.visitors}
                </span>
                <div
                  style={{
                    width: 22,
                    height: b.visitors > 0 ? Math.max(h, 3) : 2,
                    borderRadius: '4px 4px 0 0',
                    background: b.visitors > 0 ? CHART.primary : CHART.track,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: COLOR.inkMute,
                    whiteSpace: 'nowrap',
                    borderTop: `0.5px solid ${CHART.grid}`,
                    paddingTop: 6,
                    alignSelf: 'stretch',
                    textAlign: 'center',
                  }}
                >
                  {activeDaysLabel(b.bucket)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
