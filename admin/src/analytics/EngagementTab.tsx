/**
 * Analytics → Engagement: how the team uses the trainee app — when, where and
 * on what (`#/analytics/engagement`, `analytics.read`). Replaces the old
 * Traffic screen.
 *
 * Everything reads ONE server-aggregated `EngagementReport` (every
 * `nav_events` row in the window, distinct people per screen and action), so
 * the numbers hold for a busy window. Headline tiles compare with the
 * previous window of the same length.
 *
 *   tiles        people · signed-in · returning · screens per person · time · sessions started
 *   trend        people (or screen views) per bucket
 *   week heat    weekday × hour, with the peak named
 *   adoption     share of people who used each feature  |  onboarding path
 *   where time   time by screen  |  most-opened screens
 *   return       active-days columns  |  most-used actions
 *   context      device, OS, installed, language, theme
 */
import type { AnalyticsTabProps } from './AnalyticsDestination';
import type { EngagementReport } from '../../../src/shared/analytics/contract';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { EmptyState, LoadingShimmer } from '../primitives';
import { Glass } from '../primitives/Glass';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { COLOR } from '../lib/tokens';
import { ACTION_LABELS, SCREEN_LABELS, labelOf } from '../lib/labels';
import { useEngagement } from './data';
import { AutoGrid, BarList, CHART, FreshnessNote, GhostButton, Panel, SplitRow, StatTile } from './ui';
import { compareWords, hasComparison, pctDelta, pointsDelta, rangeWords, type Range } from './lib/period';
import { featureAdoption } from './lib/engagementFeatures';
import { fmtDwell, returningRate, screensPerVisitor } from './lib/engagementInsights';
import { EngagementTrend } from './engagement/EngagementTrend';
import { WeekHeat } from './engagement/WeekHeat';
import { OnboardingPath } from './engagement/OnboardingPath';
import { ReturnColumns } from './engagement/ReturnColumns';
import { ContextPanel } from './engagement/ContextPanel';

const TOP_SCREENS = 8;

function people(n: number): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'person' : 'people'}`;
}

export function EngagementTab({ range, onRange }: AnalyticsTabProps) {
  const engagement = useEngagement(range);
  const report = engagement.data;

  return (
    <>
      <ContextBar
        title="Engagement"
        subtitle="How your team uses the app — when, where and on what"
        range={range}
        onRange={onRange}
        actions={
          <FreshnessNote
            updatedAt={engagement.updatedAt}
            refreshing={engagement.refreshing}
            onRefresh={engagement.refetch}
          />
        }
      />
      <ScreenShell>
        <QueryBoundary query={engagement} title="Couldn’t load app usage" showLoading={false}>
          {engagement.loading || !report ? (
            <EngagementSkeleton />
          ) : report.current.visitors === 0 ? (
            <Glass padding={0} radius={20}>
              <EmptyState
                title={`Nobody used the app in the ${rangeWords(range)}`}
                subtitle={
                  range === 'all'
                    ? 'Activity appears here as soon as someone opens the trainee app.'
                    : 'Widen the window to see earlier activity.'
                }
                action={range !== 'all' ? <GhostButton onClick={() => onRange('all')}>Show all time</GhostButton> : undefined}
              />
            </Glass>
          ) : (
            <EngagementBody report={report} range={range} />
          )}
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}

function EngagementBody({ report, range }: { report: EngagementReport; range: Range }) {
  const cur = report.current;
  const prev = hasComparison(range) ? report.previous : null;
  const compareLabel = hasComparison(range) ? compareWords(range) : undefined;
  /** No chip at all for 'all'; "No earlier data" when the previous window is empty. */
  const delta = <T,>(d: T | null) => (hasComparison(range) ? d : undefined);

  const curReturn = returningRate(cur);
  const curPerVisitor = screensPerVisitor(cur);
  const adoption = featureAdoption(report);

  const totalDwell = report.screens.reduce((a, s) => a + s.dwell_ms, 0);
  const byDwell = [...report.screens].filter((s) => s.dwell_ms > 0).sort((a, b) => b.dwell_ms - a.dwell_ms);
  const byViews = [...report.screens].filter((s) => s.views > 0).sort((a, b) => b.views - a.views);
  const actions = [...report.actions].sort((a, b) => b.count - a.count).slice(0, 12);

  return (
    <>
      <AutoGrid min={165} gap={14}>
        <StatTile
          label="People using the app"
          value={cur.visitors.toLocaleString('en-US')}
          delta={delta(prev ? pctDelta(cur.visitors, prev.visitors) : null)}
          compareLabel={compareLabel}
          hint="Counted by account, or by device when signed out"
        />
        <StatTile
          label="Signed-in trainees"
          value={cur.signed_in.toLocaleString('en-US')}
          delta={delta(prev ? pctDelta(cur.signed_in, prev.signed_in) : null)}
          compareLabel={compareLabel}
          hint="Distinct accounts that opened the app"
        />
        {range === '24h' ? (
          // Coming back on two different days can't be measured inside one day.
          <StatTile label="Returning" value="—" hint="Measured over several days — pick 7 days or longer" />
        ) : (
          <StatTile
            label="Returning"
            value={curReturn == null ? '—' : `${Math.round(curReturn)}%`}
            delta={delta(prev ? pointsDelta(curReturn, returningRate(prev)) : null)}
            compareLabel={compareLabel}
            hint={`${people(cur.returning_visitors)} came back on 2 or more days`}
          />
        )}
        <StatTile
          label="Screens per person"
          value={curPerVisitor == null ? '—' : curPerVisitor.toFixed(1)}
          delta={delta(prev ? pctDelta(curPerVisitor ?? 0, screensPerVisitor(prev)) : null)}
          goodWhen="neither"
          compareLabel={compareLabel}
          hint={`${cur.screen_views.toLocaleString('en-US')} screens opened in all`}
        />
        <StatTile
          label="Time in app"
          value={fmtDwell(cur.dwell_ms)}
          delta={delta(prev ? pctDelta(cur.dwell_ms, prev.dwell_ms) : null)}
          compareLabel={compareLabel}
          hint="Time on screen, everyone together"
        />
        <StatTile
          label="Sessions started"
          value={cur.sessions_started.toLocaleString('en-US')}
          delta={delta(prev ? pctDelta(cur.sessions_started, prev.sessions_started) : null)}
          compareLabel={compareLabel}
          hint="Practice conversations opened"
        />
      </AutoGrid>

      <EngagementTrend report={report} />

      <WeekHeat heatmap={report.heatmap} rangeLabel={rangeWords(range)} />

      <SplitRow ratio="1fr 1fr">
        <Panel
          title="Which features people use"
          subtitle={`Share of the ${people(cur.visitors)} who used the app in the ${rangeWords(range)}`}
          footnote="A person counts once per feature, however often they used it."
        >
          <BarList
            max={100}
            rows={adoption.map((f) => ({
              key: f.key,
              label: f.label,
              value: f.share ?? 0,
              display:
                f.people === 0 ? (
                  <span style={{ color: COLOR.inkMute, fontWeight: 600 }}>Not used</span>
                ) : (
                  <>
                    {Math.round(f.share ?? 0)}%
                    <span style={{ color: COLOR.inkMute, fontWeight: 600 }}> · {people(f.people)}</span>
                  </>
                ),
            }))}
          />
        </Panel>
        <OnboardingPath screens={report.screens} />
      </SplitRow>

      <SplitRow ratio="1fr 1fr">
        <Panel
          title="Where time goes"
          subtitle={`Time on screen, ${fmtDwell(totalDwell)} in all`}
          footnote={byDwell.length > TOP_SCREENS ? `Top ${TOP_SCREENS} of ${byDwell.length} screens.` : undefined}
        >
          <BarList
            emptyText="No time on screen was recorded in this window."
            rows={byDwell.slice(0, TOP_SCREENS).map((s) => ({
              key: s.screen,
              label: labelOf(SCREEN_LABELS, s.screen),
              value: s.dwell_ms,
              display: (
                <>
                  {fmtDwell(s.dwell_ms)}
                  {totalDwell > 0 && (
                    <span style={{ color: COLOR.inkMute, fontWeight: 600 }}> · {Math.round((s.dwell_ms / totalDwell) * 100)}%</span>
                  )}
                </>
              ),
            }))}
          />
        </Panel>
        <Panel
          title="Most-opened screens"
          subtitle={`${cur.screen_views.toLocaleString('en-US')} screen views`}
          footnote={byViews.length > TOP_SCREENS ? `Top ${TOP_SCREENS} of ${byViews.length} screens.` : undefined}
        >
          <BarList
            color={CHART.primary}
            emptyText="No screens were opened in this window."
            rows={byViews.slice(0, TOP_SCREENS).map((s) => ({
              key: s.screen,
              label: labelOf(SCREEN_LABELS, s.screen),
              value: s.views,
              display: (
                <>
                  {s.views.toLocaleString('en-US')}
                  <span style={{ color: COLOR.inkMute, fontWeight: 600 }}> · {people(s.visitors)}</span>
                </>
              ),
            }))}
          />
        </Panel>
      </SplitRow>

      <SplitRow ratio="1fr 1.25fr">
        <ReturnColumns
          histogram={report.active_days_histogram}
          returningPct={curReturn}
          singleDay={range === '24h'}
        />
        <Panel title="Most-used actions" subtitle="What people did, most frequent first">
          {actions.length === 0 ? (
            <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '12px 0' }}>No actions were recorded in this window.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th scope="col" style={actionTh}>
                    Action
                  </th>
                  <th scope="col" style={{ ...actionTh, textAlign: 'right' }}>
                    Times
                  </th>
                  <th scope="col" style={{ ...actionTh, textAlign: 'right' }}>
                    People
                  </th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.action}>
                    <td style={{ ...actionTd, color: COLOR.inkSoft, fontWeight: 600 }}>{labelOf(ACTION_LABELS, a.action)}</td>
                    <td style={{ ...actionTd, textAlign: 'right', fontWeight: 750, color: COLOR.ink }}>
                      {a.count.toLocaleString('en-US')}
                    </td>
                    <td style={{ ...actionTd, textAlign: 'right' }}>{a.visitors.toLocaleString('en-US')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </SplitRow>

      <ContextPanel context={report.context} />

      {report.truncated && (
        <div style={{ fontSize: 11.5, color: COLOR.inkMute }}>
          This window held more activity than can be counted in one pass; these figures cover the most recent{' '}
          {report.scanned.toLocaleString('en-US')} events. A shorter window is counted in full.
        </div>
      )}
    </>
  );
}

const actionTh = {
  padding: '0 0 8px',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  color: COLOR.inkMute,
  textAlign: 'left' as const,
  borderBottom: `0.5px solid ${CHART.grid}`,
};

const actionTd = {
  padding: '8px 0',
  borderBottom: `0.5px solid ${CHART.grid}`,
  fontVariantNumeric: 'tabular-nums' as const,
  color: COLOR.inkMute,
};

function EngagementSkeleton() {
  return (
    <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        Loading app usage…
      </span>
      <AutoGrid min={165} gap={14}>
        {Array.from({ length: 6 }, (_, i) => (
          <LoadingShimmer key={i} height={128} />
        ))}
      </AutoGrid>
      <LoadingShimmer height={300} />
      <LoadingShimmer height={300} />
      <SplitRow>
        <LoadingShimmer height={360} />
        <LoadingShimmer height={360} />
      </SplitRow>
    </div>
  );
}
