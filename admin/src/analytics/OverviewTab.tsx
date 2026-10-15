/**
 * Overview — the landing tab: the 30-second answer to "how is my team doing,
 * and what needs my attention?".
 *
 *   1. A plain-English summary of the window beside the team's practice habit.
 *   2. Six headline tiles, each against the previous window of the same length.
 *   3. What needs attention (an inbox of actionable items) · leaders.
 *   4. Practice activity · average score.
 *   5. Skills at a glance (→ Skills) · how far people get (getting started).
 *   6. A one-row AI health strip for viewers who can read AI quality.
 *
 * Everything else lives one click away on its own tab, so nothing here
 * repeats another screen in full. Numbers come from `lib/*` only (the same
 * functions the Trainees, Sessions and Skills tabs use), so tabs agree.
 */
import { useMemo } from 'react';
import type { AnalyticsTabProps } from './AnalyticsDestination';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { EmptyState, LoadingShimmer } from '../primitives';
import { useAccess } from '../primitives/access';
import { COLOR } from '../lib/tokens';
import { pushbackLabel } from '../lib/labels';
import { AutoGrid, CHART, FreshnessNote, Legend, Panel, SplitRow, StatTile } from './ui';
import {
  useAiCallsWindow,
  useOpenReports,
  useSessionSummaries,
  useTraineeDirectory,
} from './data';
import {
  compareWords,
  DAY_MS,
  pctDelta,
  pointsDelta,
  rangeWords,
  splitByPeriod,
  windows,
  type Range,
} from './lib/period';
import {
  SKILL_HINTS,
  SKILL_KEYS,
  SKILL_LABELS,
  extremeSkill,
  sessionStats,
  sessionTrend,
  skillAverages,
} from './lib/metrics';
import { rollupTrainees, statusCounts } from './lib/trainees';
import { overviewNarrative } from './lib/narrative';
import { aiHealth, buildAttention, type AttentionTarget } from './lib/attention';
import { firstActiveBucket, leaders, measured, practiceFunnel, trendExtras } from './lib/overview';
import { teamObjectionTitles } from './lib/skills';
import { NarrativeHero } from './overview/Hero';
import { AttentionPanel } from './overview/Attention';
import { FunnelPanel, LeadersPanel } from './overview/People';
import { AiHealthStrip } from './overview/AiHealthStrip';
import { PracticeActivityPanel, ScoreTrendPanel, granularityWord, inWindow } from './overview/TrendPanels';
import { SkillBars } from './overview/charts';

export function OverviewTab(props: AnalyticsTabProps) {
  const { can } = useAccess();
  if (!can('sessions.read')) {
    return (
      <>
        <ContextBar title="Overview" subtitle="Your team’s training at a glance" range={props.range} onRange={props.onRange} />
        <ScreenShell>
          <EmptyState
            title="Your role can’t read training sessions"
            subtitle="The Overview is built from the team’s sessions. Ask an owner to add “Sessions” access to your role."
          />
        </ScreenShell>
      </>
    );
  }
  return <OverviewBody {...props} />;
}

// ─── Formatting ─────────────────────────────────────────────────────────

/** Practice time as a tile value: minutes under an hour, else hours. */
function durationParts(seconds: number): { value: string; unit: string } {
  if (seconds < 3600) return { value: String(Math.round(seconds / 60)), unit: 'min' };
  const h = seconds / 3600;
  return { value: h < 10 ? h.toFixed(1) : String(Math.round(h)), unit: h === 1 ? 'hour' : 'hours' };
}

function pctText(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}

// ─── Body ───────────────────────────────────────────────────────────────

function OverviewBody({ range, onRange, onOpen, onNav }: AnalyticsTabProps) {
  const { can } = useAccess();
  const canQuality = can('quality.read');
  const canReports = can('reports.read');
  const canSkills = can('insights.read');

  const sessions = useSessionSummaries(range);
  const all = useSessionSummaries('all');
  const directory = useTraineeDirectory();
  const aiCalls = useAiCallsWindow(range, canQuality);
  const reports = useOpenReports(canReports);

  const loading = sessions.loading || all.loading || directory.loading;
  const comparable = range !== 'all';
  const windowWords = rangeWords(range);
  const compareLabel = comparable ? compareWords(range) : undefined;

  const model = useMemo(() => {
    const now = sessions.updatedAt ?? Date.now();
    const { current, previous } = splitByPeriod(sessions.data.rows, range, now);
    const cur = sessionStats(current);
    const prev = comparable ? sessionStats(previous) : null;
    const fullTrend = sessionTrend(current, range, now);
    const fullExtras = trendExtras(current, range, now);
    // All time is bucketed as a year: start the charts where the team did.
    const from = range === 'all' ? firstActiveBucket(fullTrend.points) : 0;
    const trend = { granularity: fullTrend.granularity, points: fullTrend.points.slice(from) };
    const extras = {
      practiceHours: fullExtras.practiceHours.slice(from),
      resolvedRate: fullExtras.resolvedRate.slice(from),
      finishRate: fullExtras.finishRate.slice(from),
      scored: fullExtras.scored.slice(from),
    };
    const chartSince = from > 0 && trend.points.length ? trend.points[0].label : null;
    const skillsCur = skillAverages(current);
    const skillsPrev = comparable ? skillAverages(previous) : null;
    const weakest = extremeSkill(skillsCur.avg, 'weakest');
    const windowStart = windows(range, now).current.start;

    const dir = directory.data.rows;
    const allRows = all.data.rows;
    const trainees = rollupTrainees(dir, allRows, { windowStart, now });
    const live = trainees.filter((t) => !t.disabled);
    const team = statusCounts(live);
    const lead = leaders(trainees);
    // "Practising now" is the window; on all-time it falls back to the
    // last 7 days (= Active), or the step would just repeat "practised once".
    const funnel =
      range === 'all'
        ? practiceFunnel(dir, allRows, now - 7 * DAY_MS, 'last 7 days')
        : practiceFunnel(dir, allRows, windowStart, windowWords);

    const team_ = teamObjectionTitles(allRows);
    const names = new Map(trainees.map((t) => [t.user_id, t.name]));
    const nameOf = (id: string) => names.get(id) ?? 'A trainee';
    const objectionLabel = (id: string | null) => pushbackLabel(id, team_, 'Other pushback');

    const health = canQuality && !aiCalls.loading && !aiCalls.error ? aiHealth(aiCalls.data, range, now) : null;
    const attention = buildAttention({
      trainees,
      windowSessions: current,
      nameOf,
      objectionLabel,
      reports: canReports && !reports.loading && !reports.error ? reports.data : null,
      ai: health,
      now,
    });

    const narrative = overviewNarrative({
      range,
      current: cur,
      previous: prev,
      weakestSkill: weakest,
      skillSessions: skillsCur.count,
      improvers: lead.improved.map((r) => ({ user_id: r.user_id, name: r.name, momentum: r.momentum as number })),
    });

    const busiest = trend.points.reduce<(typeof trend.points)[number] | null>(
      (best, p) => (p.sessions > (best?.sessions ?? 0) ? p : best),
      null,
    );

    return {
      cur,
      prev,
      trend,
      extras,
      skillsCur,
      skillsPrev,
      weakest,
      team,
      lead,
      funnel,
      health,
      attention,
      narrative,
      busiest,
      chartSince,
      truncated: sessions.data.truncated || all.data.truncated,
    };
  }, [
    sessions.data,
    sessions.updatedAt,
    all.data,
    directory.data,
    aiCalls.data,
    aiCalls.loading,
    aiCalls.error,
    reports.data,
    reports.loading,
    reports.error,
    range,
    comparable,
    windowWords,
    canQuality,
    canReports,
  ]);

  const refresh = () => {
    sessions.refetch();
    all.refetch();
    directory.refetch();
    if (canQuality) aiCalls.refetch();
    if (canReports) reports.refetch();
  };

  const goTarget = (t: AttentionTarget) => {
    if (t.kind === 'tab') onOpen(t.tab, t.id ?? null);
    else onNav(t.screen, t.tab);
  };
  const openProfile = (id: string) => onOpen('trainees', id);
  const openTrainees = () => onOpen('trainees');

  const { cur, prev } = model;
  const points = model.trend.points;
  // Deltas sit in narrow tiles: the comparison is said once above the row,
  // and a tile only spells it out when there is nothing to compare with.
  const d = comparable
    ? {
        trainees: pctDelta(cur.activeTrainees, prev?.activeTrainees),
        sessions: pctDelta(cur.sessions, prev?.sessions),
        score: pointsDelta(cur.avgScore, prev?.avgScore ?? null),
        finish: pointsDelta(cur.finishRate, prev?.finishRate ?? null),
        practice: pctDelta(cur.practiceSeconds, prev?.practiceSeconds),
        resolved: pointsDelta(cur.resolvedRate, prev?.resolvedRate ?? null),
      }
    : null;
  const tileCompare = (delta: unknown) => (comparable && delta == null ? compareLabel : undefined);
  const scorePoints = points.map((p, i) => ({ ...p, scored: model.extras.scored[i] }));
  const practice = durationParts(cur.practiceSeconds);

  const checked = ['practice habits', 'low and unscored sessions', canReports ? 'problem reports' : null, canQuality ? 'AI failures and speed' : null]
    .filter(Boolean)
    .join(', ');

  return (
    <>
      <ContextBar
        title="Overview"
        subtitle="Your team’s training at a glance"
        range={range}
        onRange={onRange}
        actions={<FreshnessNote updatedAt={sessions.updatedAt} refreshing={sessions.refreshing} onRefresh={refresh} />}
      />
      <ScreenShell>
        <QueryBoundary queries={[sessions, all, directory]} title="Couldn’t load the overview" showLoading={false}>
          {loading ? (
            <OverviewSkeleton />
          ) : (
            <>
              <NarrativeHero
                eyebrow={range === 'all' ? 'All time' : windowWords.replace(/^./, (c) => c.toUpperCase())}
                sentences={model.narrative}
                team={model.team}
                onOpenProfile={openProfile}
                onOpenTrainees={openTrainees}
              />

              <div>
              {comparable && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 11, color: COLOR.inkMute, margin: '0 4px 8px' }}>
                  ▲▼ Change {compareWords(range)}
                </div>
              )}
              <AutoGrid min={168} gap={14}>
                <StatTile
                  label="Trainees practising"
                  value={cur.activeTrainees}
                  delta={d?.trainees}
                  compareLabel={tileCompare(d?.trainees)}
                  trend={points.map((p) => p.trainees)}
                  hint="Different people with at least one session"
                  onClick={openTrainees}
                />
                <StatTile
                  label="Sessions"
                  value={cur.sessions.toLocaleString('en-US')}
                  delta={d?.sessions}
                  compareLabel={tileCompare(d?.sessions)}
                  trend={points.map((p) => p.sessions)}
                  hint="Every session started, finished or not"
                  onClick={() => onOpen('sessions')}
                />
                <StatTile
                  label="Average score"
                  value={cur.avgScore == null ? '—' : Math.round(cur.avgScore)}
                  unit={cur.avgScore == null ? undefined : '/ 100'}
                  delta={d?.score}
                  compareLabel={tileCompare(d?.score)}
                  trend={measured(points.map((p) => p.avgScore))}
                  hint={`${cur.scored.toLocaleString('en-US')} scored session${cur.scored === 1 ? '' : 's'}; scoring failures left out`}
                  onClick={canSkills ? () => onOpen('skills') : undefined}
                />
                <StatTile
                  label="Finish rate"
                  value={pctText(cur.finishRate)}
                  delta={d?.finish}
                  compareLabel={tileCompare(d?.finish)}
                  trend={measured(model.extras.finishRate)}
                  hint="Sessions played through to the end"
                />
                <StatTile
                  label="Practice time"
                  value={practice.value}
                  unit={practice.unit}
                  delta={d?.practice}
                  compareLabel={tileCompare(d?.practice)}
                  trend={model.extras.practiceHours}
                  hint={
                    cur.medianMinutes == null
                      ? 'Time spent in conversation'
                      : `Time in conversation · typical session ${Math.max(1, Math.round(cur.medianMinutes))} min`
                  }
                />
                <StatTile
                  label="Owners won over"
                  value={pctText(cur.resolvedRate)}
                  delta={d?.resolved}
                  compareLabel={tileCompare(d?.resolved)}
                  trend={measured(model.extras.resolvedRate)}
                  hint="Finished sessions where the owner ended happy"
                />
              </AutoGrid>
              </div>

              {model.truncated && (
                <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: -4 }}>
                  This window holds more sessions than one read returns; the oldest ones aren’t counted.
                </div>
              )}

              <SplitRow ratio="minmax(0, 1.2fr) minmax(0, 1fr)">
                <AttentionPanel items={model.attention} checked={checked} onGo={goTarget} />
                <LeadersPanel
                  improved={model.lead.improved}
                  active={model.lead.active}
                  inWindow={inWindow(range)}
                  onOpenProfile={openProfile}
                  onOpenTrainees={openTrainees}
                />
              </SplitRow>

              <SplitRow ratio="minmax(0, 1.55fr) minmax(0, 1fr)">
                <PracticeActivityPanel
                  points={points}
                  granularity={model.trend.granularity}
                  range={range}
                  windowWords={windowWords}
                  since={model.chartSince}
                  onWiden={() => onRange('all')}
                  footnote={
                    <>
                      <strong style={{ color: COLOR.inkSoft }}>{cur.finished}</strong> finished ·{' '}
                      <strong style={{ color: COLOR.inkSoft }}>{cur.leftEarly}</strong> left early
                      {model.busiest && model.busiest.sessions > 0 && (
                        <>
                          {' '}
                          · busiest {granularityWord(model.trend.granularity)}: {model.busiest.label} ({model.busiest.sessions})
                        </>
                      )}
                    </>
                  }
                />
                <ScoreTrendPanel
                  points={scorePoints}
                  granularity={model.trend.granularity}
                  range={range}
                  windowWords={windowWords}
                  since={model.chartSince}
                  onWiden={() => onRange('all')}
                  footnote={
                    cur.scoringFailed > 0
                      ? `${cur.scoringFailed} session${cur.scoringFailed === 1 ? '' : 's'} couldn’t be scored and ${cur.scoringFailed === 1 ? 'is' : 'are'} left out.`
                      : undefined
                  }
                />
              </SplitRow>

              <SplitRow ratio="minmax(0, 1fr) minmax(0, 1fr)">
                <SkillsGlance
                  avg={model.skillsCur.avg}
                  prev={model.skillsPrev?.avg ?? null}
                  count={model.skillsCur.count}
                  weakest={model.weakest}
                  range={range}
                  onOpenSkills={canSkills ? () => onOpen('skills') : undefined}
                />
                <FunnelPanel steps={model.funnel} onOpenTrainees={openTrainees} />
              </SplitRow>

              {canQuality && model.health && (
                <AiHealthStrip health={model.health} windowWords={windowWords} onOpen={() => onOpen('quality')} />
              )}
            </>
          )}
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}

// ─── Skills at a glance ─────────────────────────────────────────────────

function SkillsGlance({
  avg,
  prev,
  count,
  weakest,
  range,
  onOpenSkills,
}: {
  avg: Record<(typeof SKILL_KEYS)[number], number | null>;
  prev: Record<(typeof SKILL_KEYS)[number], number | null> | null;
  count: number;
  weakest: (typeof SKILL_KEYS)[number] | null;
  range: Range;
  onOpenSkills?: () => void;
}) {
  const prevWords = range === 'all' ? null : compareWords(range).replace(/^vs /, '');
  const hasPrev = prev != null && SKILL_KEYS.some((k) => prev[k] != null);
  return (
    <Panel
      title="Skills at a glance"
      subtitle="Average of each ACT skill, out of 100"
      actions={
        onOpenSkills ? (
          <button type="button" className="pbt-link" onClick={onOpenSkills} style={{ fontSize: 12 }}>
            Open Skills →
          </button>
        ) : undefined
      }
      footnote={
        count > 0 ? (
          <span style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {hasPrev && prevWords && <Legend items={[{ label: prevWords, color: CHART.benchmark, shape: 'tick' }]} />}
            <span>
              From {count.toLocaleString('en-US')} scored session{count === 1 ? '' : 's'} with skill scores.
            </span>
          </span>
        ) : undefined
      }
    >
      {count === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '10px 0', lineHeight: 1.5 }}>
          No scored sessions with skill scores {inWindow(range)}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SkillBars
            benchmarkTitle={prevWords ? `Previous: ${prevWords}` : 'Previous window'}
            rows={SKILL_KEYS.map((k) => ({
              key: k,
              label: SKILL_LABELS[k],
              value: avg[k],
              benchmark: hasPrev ? prev?.[k] ?? null : null,
              flag: k === weakest && count >= 3 ? 'Weakest' : undefined,
            }))}
          />
          {weakest && count >= 3 && (
            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: '11px 13px',
                borderRadius: 12,
                background: 'oklch(0.975 0.02 75)',
                border: '0.5px solid oklch(0.9 0.05 75)',
              }}
            >
              <span aria-hidden="true" style={{ width: 3, borderRadius: 2, background: COLOR.warn, flexShrink: 0 }} />
              <div style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.5 }}>
                <strong style={{ color: COLOR.ink }}>Coach {SKILL_LABELS[weakest]} next</strong> — {SKILL_HINTS[weakest]}.
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ─── Loading ────────────────────────────────────────────────────────────

function OverviewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the overview" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <LoadingShimmer height={176} />
      <AutoGrid min={168} gap={14}>
        {Array.from({ length: 6 }).map((_, i) => (
          <LoadingShimmer key={i} height={158} />
        ))}
      </AutoGrid>
      <SplitRow ratio="minmax(0, 1.2fr) minmax(0, 1fr)">
        <LoadingShimmer height={300} />
        <LoadingShimmer height={300} />
      </SplitRow>
      <SplitRow ratio="minmax(0, 1.55fr) minmax(0, 1fr)">
        <LoadingShimmer height={310} />
        <LoadingShimmer height={310} />
      </SplitRow>
    </div>
  );
}
