/**
 * Practice calendar — the last 26 weeks as a GitHub-style grid (columns =
 * weeks, rows = Monday → Sunday). Fill = sessions that day, one hue light →
 * dark; a faint ring marks days they opened the app but didn't practise.
 */
import { COLOR } from '../../lib/tokens';
import { CHART, HeatScale, heatColor } from '../ui';
import { dayLabel, type CalendarModel } from '../lib/traineeProfile';

/** Cells grow with the panel up to this size (px), never below 9. */
const MAX_CELL = 18;
const GAP = 3;
const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const APP_RING = 'oklch(0.72 0.07 255)';

export function PracticeCalendar({ model, now, showAppDays }: { model: CalendarModel; now: number; showAppDays: boolean }) {
  // A one-session day should still read clearly, so the scale tops out at 2+.
  const top = Math.max(model.max, 2);
  const weeks = model.columns.length;
  return (
    <div>
      <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
        <div
          role="img"
          aria-label={`Practice calendar, last ${weeks} weeks: ${model.sessions} sessions on ${model.practiceDays} days`}
          style={{
            display: 'grid',
            gridTemplateColumns: `28px repeat(${weeks}, minmax(9px, 1fr))`,
            gap: GAP,
            width: '100%',
            minWidth: 28 + weeks * (9 + GAP),
            maxWidth: 28 + weeks * (MAX_CELL + GAP),
          }}
        >
          <span />
          {model.columns.map((_, c) => {
            const label = model.monthLabels.find((m) => m.col === c);
            return (
              <span
                key={`m-${c}`}
                style={{ fontSize: 10, fontWeight: 700, color: COLOR.inkMute, whiteSpace: 'nowrap', overflow: 'visible', lineHeight: '12px' }}
              >
                {label?.label ?? ''}
              </span>
            );
          })}
          {ROW_LABELS.map((label, r) => (
            <RowCells key={`r-${r}`} label={label} r={r} model={model} top={top} now={now} showAppDays={showAppDays} />
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <HeatScale less="Fewer sessions" more="More" />
        {showAppDays && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: COLOR.inkMute }}>
            <span
              aria-hidden="true"
              style={{ width: 11, height: 11, borderRadius: 3, background: CHART.track, boxShadow: `inset 0 0 0 1.5px ${APP_RING}` }}
            />
            Opened the app, no session
          </span>
        )}
      </div>
    </div>
  );
}

function RowCells({
  label,
  r,
  model,
  top,
  now,
  showAppDays,
}: {
  label: string;
  r: number;
  model: CalendarModel;
  top: number;
  now: number;
  showAppDays: boolean;
}) {
  return (
    <>
      <span style={{ fontSize: 10, fontWeight: 650, color: COLOR.inkMute, display: 'flex', alignItems: 'center' }}>{label}</span>
      {model.columns.map((col, c) => {
        const d = col[r];
        if (d.future) return <span key={`${c}-${r}`} />;
        const appOnly = showAppDays && d.sessions === 0 && d.appActive;
        const what =
          d.sessions > 0
            ? `${d.sessions} session${d.sessions === 1 ? '' : 's'}`
            : appOnly
              ? 'no session (opened the app)'
              : 'no session';
        return (
          <span
            key={`${c}-${r}`}
            className="pbt-heat-cell"
            title={`${dayLabel(d.t, now)} — ${what}`}
            style={{
              aspectRatio: '1 / 1',
              borderRadius: 3,
              background: d.sessions > 0 ? heatColor(d.sessions / top) : CHART.track,
              boxShadow: appOnly ? `inset 0 0 0 1.5px ${APP_RING}` : undefined,
              position: 'relative',
            }}
          />
        );
      })}
    </>
  );
}
