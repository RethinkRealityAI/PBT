/**
 * The two trend panels — practice activity (finished vs left early) and the
 * average score — each with a "View as table" toggle so every bucket's
 * numbers are reachable without hovering. The score panel is shared with the
 * Skills tab.
 */
import { useState, type ReactNode } from 'react';
import { EmptyState } from '../../primitives';
import { COLOR } from '../../lib/tokens';
import { CHART, GhostButton, Legend, Panel } from '../ui';
import type { TrendPoint } from '../lib/metrics';
import { inWindowWords, type Range } from '../lib/period';
import { ActivityBars, ENDING_UNKNOWN_FILL, MiniTable, SOLID, SOLID_LINE, ScoreLine, TableToggle, bucketTitle } from './charts';

type Granularity = 'hour' | 'day' | 'week';

export function granularityWord(g: Granularity): string {
  return g === 'hour' ? 'hour' : g === 'day' ? 'day' : 'week';
}

/**
 * Chart window in words. All time is bucketed as the last 12 months, and
 * starts at the team's first session when that's later (`since`).
 */
export function chartWindowWords(range: Range, words: string, since?: string | null): string {
  if (range !== 'all') return words;
  return since ? `since ${since}` : 'last 12 months';
}

/** "in the last 28 days" — or "so far" for all time ("No practice so far"). */
export function inWindow(range: Range): string {
  return inWindowWords(range);
}

function WidenEmpty({ title, subtitle, onWiden }: { title: string; subtitle: string; onWiden?: () => void }) {
  return (
    <EmptyState
      title={title}
      subtitle={subtitle}
      action={onWiden ? <GhostButton onClick={onWiden}>Show all time</GhostButton> : undefined}
    />
  );
}

export function PracticeActivityPanel({
  points,
  granularity,
  range,
  windowWords,
  since,
  footnote,
  onWiden,
}: {
  points: TrendPoint[];
  granularity: Granularity;
  range: Range;
  windowWords: string;
  since?: string | null;
  footnote?: ReactNode;
  onWiden?: () => void;
}) {
  const [table, setTable] = useState(false);
  const total = points.reduce((a, p) => a + p.sessions, 0);
  const anyUnknown = points.some((p) => p.endingUnknown > 0);
  const anyDevices = points.some((p) => p.devices > 0);
  return (
    <Panel
      title="Practice activity"
      subtitle={`Sessions per ${granularityWord(granularity)} · ${chartWindowWords(range, windowWords, since)}`}
      actions={
        total > 0 ? (
          <>
            {!table && (
              <Legend
                items={[
                  { label: 'Finished', color: CHART.primary },
                  { label: 'Left early', color: CHART.muted },
                  ...(anyUnknown ? [{ label: 'Ending not recorded', color: ENDING_UNKNOWN_FILL }] : []),
                ]}
              />
            )}
            <TableToggle table={table} onToggle={() => setTable((t) => !t)} label="practice activity" />
          </>
        ) : undefined
      }
      footnote={total > 0 ? footnote : undefined}
    >
      {total === 0 ? (
        <WidenEmpty
          title={`No practice ${inWindow(range)}`}
          subtitle="Sessions appear here as soon as someone practises."
          onWiden={range === 'all' ? undefined : onWiden}
        />
      ) : table ? (
        <MiniTable
          caption="Practice activity by period"
          maxHeight={220}
          columns={[
            { key: 'period', label: granularity === 'week' ? 'Week of' : granularity === 'hour' ? 'Hour' : 'Day', align: 'left' },
            { key: 'sessions', label: 'Sessions' },
            { key: 'finished', label: 'Finished' },
            { key: 'left', label: 'Left early' },
            ...(anyUnknown ? [{ key: 'unknown', label: 'Ending not recorded' }] : []),
            { key: 'trainees', label: 'Trainees' },
            ...(anyDevices ? [{ key: 'devices', label: 'Anonymous devices' }] : []),
          ]}
          rows={points
            .slice()
            .reverse()
            .map((p) => ({
              _key: String(p.start),
              period: p.label,
              sessions: p.sessions,
              finished: p.finished,
              left: p.leftEarly,
              unknown: p.endingUnknown,
              trainees: p.trainees,
              devices: p.devices,
            }))}
        />
      ) : (
        <ActivityBars points={points} granularity={granularity} />
      )}
    </Panel>
  );
}

export function ScoreTrendPanel({
  points,
  granularity,
  range,
  windowWords,
  since,
  title = 'Average score',
  footnote,
  height = 220,
  onWiden,
}: {
  points: Array<TrendPoint & { scored?: number }>;
  granularity: Granularity;
  range: Range;
  windowWords: string;
  since?: string | null;
  title?: string;
  footnote?: ReactNode;
  height?: number;
  onWiden?: () => void;
}) {
  const [table, setTable] = useState(false);
  const measured = points.filter((p) => p.avgScore != null);
  const values = measured.map((p) => p.avgScore as number);
  const lo = values.length ? Math.round(Math.min(...values)) : null;
  const hi = values.length ? Math.round(Math.max(...values)) : null;
  return (
    <Panel
      title={title}
      subtitle={`By ${granularityWord(granularity)} · scored sessions · ${chartWindowWords(range, windowWords, since)}`}
      actions={measured.length > 0 ? <TableToggle table={table} onToggle={() => setTable((t) => !t)} label={title} /> : undefined}
      footnote={
        measured.length > 0 ? (
          <>
            {!table && (
              <div style={{ marginBottom: 6 }}>
                <Legend
                  items={[
                    { label: 'Average score', color: CHART.primary, shape: 'line' },
                    { label: `Solid (${SOLID}+)`, color: SOLID_LINE, shape: 'line' },
                  ]}
                />
              </div>
            )}
            {measured.length > 1 && lo != null && hi != null && (
              <>
                {granularityWord(granularity) === 'week' ? 'Weekly' : granularityWord(granularity) === 'day' ? 'Daily' : 'Hourly'} averages ranged{' '}
                <strong style={{ color: COLOR.inkSoft }}>{lo}</strong>–<strong style={{ color: COLOR.inkSoft }}>{hi}</strong>.{' '}
              </>
            )}
            {footnote}
          </>
        ) : undefined
      }
    >
      {measured.length === 0 ? (
        <WidenEmpty
          title="No scored sessions yet"
          subtitle={`Nothing ${inWindow(range)} was finished and scored.`}
          onWiden={range === 'all' ? undefined : onWiden}
        />
      ) : table ? (
        <MiniTable
          caption={`${title} by period`}
          maxHeight={height}
          columns={[
            { key: 'period', label: granularity === 'week' ? 'Week of' : granularity === 'hour' ? 'Hour' : 'Day', align: 'left' },
            { key: 'avg', label: 'Avg score' },
            { key: 'scored', label: 'Scored' },
          ]}
          rows={measured
            .slice()
            .reverse()
            .map((p) => ({
              _key: String(p.start),
              period: bucketTitle(p.label, granularity).replace('Week of ', ''),
              avg: Math.round(p.avgScore as number),
              scored: p.scored ?? '—',
            }))}
        />
      ) : (
        <ScoreLine points={points} granularity={granularity} height={height} />
      )}
    </Panel>
  );
}
