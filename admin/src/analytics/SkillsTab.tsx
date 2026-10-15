/**
 * Skills — the deep dive on training OUTCOMES (was "Insights"): how well the
 * team handles pushback, where it's weakest, and what to coach next.
 *
 *   tiles        average score · pass rate · owners won over · scored sessions
 *   skills       the five ACT skills vs the previous window + what to coach
 *   trend        average score over time against the "Solid" line
 *   objection ×  which objection the team handles worst, on which skill
 *   difficulty · communication-style matchups
 *   distribution · animal & scenario source
 *   how owners felt · what trainees said (feedback.read)
 *
 * Every average is over scored sessions only (`isScored`); what's left out is
 * said in the panel's footnote. Numbers come from `lib/*` so they agree with
 * the Overview and a trainee's profile.
 */
import { useMemo } from 'react';
import type { AnalyticsTabProps } from './AnalyticsDestination';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { QueryBoundary } from '../primitives/QueryBoundary';
import { EmptyState, LoadingShimmer } from '../primitives';
import { useAccess } from '../primitives/access';
import { COLOR, DRIVER_KEYS, type DriverKey } from '../lib/tokens';
import { pushbackLabel } from '../lib/labels';
import { averageScoreByDifficulty } from '../lib/difficulty';
import { CHART, FreshnessNote, Legend, Panel, SplitRow, StatTile } from './ui';
import { useFeedbackWindow, useSessionSummaries, useTraineeDirectory } from './data';
import { compareWords, pct, pctDelta, pointsDelta, rangeWords, splitByPeriod } from './lib/period';
import {
  SKILL_HINTS,
  SKILL_KEYS,
  SKILL_LABELS,
  driverMatchup,
  extremeSkill,
  groupStats,
  isScored,
  scoreHistogram,
  sessionStats,
  sessionTrend,
  skillAverages,
} from './lib/metrics';
import { firstActiveBucket, measured, trendExtras } from './lib/overview';
import {
  SKILL_COACHING,
  feedbackSummary,
  hardestCell,
  hardestPairing,
  latestComments,
  moodSplit,
  objectionSkillTable,
  sentimentShift,
  splitBy,
} from './lib/skills';
import { SkillBars } from './overview/charts';
import { ScoreTrendPanel, inWindow } from './overview/TrendPanels';
import { BandLegend, MatchupGrid, ObjectionSkillTable } from './skills/BandTable';
import {
  DifficultyPanel,
  DistributionPanel,
  FeedbackPanel,
  OwnersFeltPanel,
  SplitsPanel,
  type CommentView,
} from './skills/Panels';
import { useObjectionTitles } from './objectionTitles';
import { TileRow } from './overview/TileRow';
import './overview/styles';

export function SkillsTab(props: AnalyticsTabProps) {
  const { can } = useAccess();
  if (!can('sessions.read')) {
    return (
      <>
        <ContextBar
          title="Skills"
          subtitle="How well the team handles pushback — and where to coach next"
          range={props.range}
          onRange={props.onRange}
        />
        <ScreenShell>
          <EmptyState
            title="Your role can’t read training sessions"
            subtitle="Skills are worked out from the team’s scored sessions. Ask an owner to add “Training sessions” access to your role."
          />
        </ScreenShell>
      </>
    );
  }
  return <SkillsBody {...props} />;
}

function pctText(v: number | null): string {
  return v == null ? '—' : `${Math.round(v)}%`;
}

function SkillsBody({ range, onRange, onOpen, onNav }: AnalyticsTabProps) {
  const { can } = useAccess();
  const canFeedback = can('feedback.read');
  const sessions = useSessionSummaries(range);
  const directory = useTraineeDirectory();
  const feedback = useFeedbackWindow(range, canFeedback);
  const teamTitles = useObjectionTitles(sessions.data.rows);

  const comparable = range !== 'all';
  const windowWords = rangeWords(range);
  const compareLabel = comparable ? compareWords(range) : undefined;
  const loading = sessions.loading || directory.loading;

  const m = useMemo(() => {
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
      resolvedRate: fullExtras.resolvedRate.slice(from),
      scored: fullExtras.scored.slice(from),
      passRate: fullExtras.passRate.slice(from),
    };
    const chartSince = from > 0 && trend.points.length ? trend.points[0].label : null;
    const skillsCur = skillAverages(current);
    const skillsPrev = comparable ? skillAverages(previous) : null;
    const weakest = extremeSkill(skillsCur.avg, 'weakest');
    const strongest = extremeSkill(skillsCur.avg, 'strongest');

    const label = (id: string) => pushbackLabel(id, teamTitles, 'Other pushback');
    const objections = objectionSkillTable(current, label);
    const hardest = hardestCell(objections.rows);

    const scored = current.filter(isScored);
    const leftEarly = new Map(
      groupStats(current, (s) => (s.difficulty == null ? null : String(s.difficulty))).map((g) => [
        Number(g.key),
        { sessions: g.sessions, leftEarlyPct: g.finishRate == null ? null : 100 - g.finishRate },
      ]),
    );
    const difficulty = averageScoreByDifficulty(
      scored.map((s) => ({ difficulty: s.difficulty, scenario: null, score_overall: s.score_overall })),
    );

    const driverOf = new Map(directory.data.rows.map((d) => [d.user_id, d.echo_primary]));
    const traineeDriver = (u: string) => {
      const d = driverOf.get(u);
      return d && (DRIVER_KEYS as readonly string[]).includes(d) ? d : null;
    };
    const matchup = driverMatchup(current, traineeDriver);
    // Same bar as the grid's cells (2+), so the sentence names a cell the reader can see.
    const pairing = hardestPairing(matchup, 2);
    const noStyle = scored.filter((s) => s.owner_driver && !traineeDriver(s.user_id)).length;

    const moodCur = moodSplit(current);
    const moodPrev = comparable ? moodSplit(previous) : null;
    const wonDelta = moodPrev
      ? pointsDelta(pct(moodCur.green, moodCur.total), pct(moodPrev.green, moodPrev.total))
      : undefined;

    const fb = splitByPeriod(feedback.data, range, now);
    const names = new Map(directory.data.rows.map((d) => [d.user_id, d.display_name?.trim() || null]));
    const comments: CommentView[] = latestComments(fb.current, 3).map((f) => {
      const name = f.user_id ? names.get(f.user_id) : null;
      return {
        id: f.id,
        text: (f.comment ?? '').trim(),
        at: new Date(f.created_at).getTime(),
        who: f.user_id && name ? { id: f.user_id, name } : null,
        about: f.pushback_id ? label(f.pushback_id) : null,
      };
    });

    return {
      cur,
      prev,
      trend,
      scorePoints: trend.points.map((p, i) => ({ ...p, scored: extras.scored[i] })),
      chartSince,
      extras,
      skillsCur,
      skillsPrev,
      weakest,
      strongest,
      objections,
      hardest,
      difficulty,
      leftEarly,
      matchup,
      matchupHasData: [...matchup.values()].some((v) => v.scored >= 2),
      pairing,
      noStyle,
      histogram: scoreHistogram(current),
      animals: splitBy(current, (s) => s.species, ['dog', 'cat']),
      sources: splitBy(current, (s) => s.scenario_source, ['library', 'studio', 'self-built', 'unknown']),
      moodCur,
      wonDelta,
      shift: sentimentShift(current),
      fbCur: feedbackSummary(fb.current),
      fbPrev: comparable ? feedbackSummary(fb.previous) : null,
      comments,
    };
  }, [sessions.data, sessions.updatedAt, directory.data, feedback.data, teamTitles, range, comparable]);

  const refresh = () => {
    sessions.refetch();
    directory.refetch();
    if (canFeedback) feedback.refetch();
  };

  const { cur, prev } = m;
  const d = comparable
    ? {
        score: pointsDelta(cur.avgScore, prev?.avgScore ?? null),
        pass: pointsDelta(cur.passRate, prev?.passRate ?? null),
        won: pointsDelta(cur.resolvedRate, prev?.resolvedRate ?? null),
        scored: pctDelta(cur.scored, prev?.scored),
      }
    : null;
  const tileCompare = (delta: unknown) => (comparable && delta == null ? compareLabel : undefined);
  const prevWords = compareLabel?.replace(/^vs /, '') ?? null;
  const preSkills = cur.scored - m.skillsCur.count;
  const hasPrevSkills = m.skillsPrev != null && SKILL_KEYS.some((k) => m.skillsPrev?.avg[k] != null);

  const exclusions = [
    cur.scoringFailed > 0
      ? `${cur.scoringFailed} finished session${cur.scoringFailed === 1 ? '' : 's'} couldn’t be scored and ${cur.scoringFailed === 1 ? 'is' : 'are'} left out of every figure here.`
      : null,
    cur.leftEarly > 0 ? `${cur.leftEarly} session${cur.leftEarly === 1 ? '' : 's'} left early ${cur.leftEarly === 1 ? 'has' : 'have'} no score.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <ContextBar
        title="Skills"
        subtitle="How well the team handles pushback — and where to coach next"
        range={range}
        onRange={onRange}
        actions={<FreshnessNote updatedAt={sessions.updatedAt} refreshing={sessions.refreshing} onRefresh={refresh} />}
      />
      <ScreenShell>
        <QueryBoundary queries={[sessions, directory]} title="Couldn’t load the training scores" showLoading={false}>
          {loading ? (
            <SkillsSkeleton />
          ) : cur.scored === 0 ? (
            <Panel title="No scored sessions" subtitle={`Nothing ${inWindow(range)} was finished and scored.`}>
              <EmptyState
                title={`No scores ${inWindow(range)}`}
                subtitle={
                  cur.sessions > 0
                    ? `${cur.sessions} session${cur.sessions === 1 ? ' was' : 's were'} started, but none finished with a score.`
                    : 'Scores appear here once trainees finish a session.'
                }
                action={
                  range !== 'all' ? (
                    <button type="button" className="pbt-link" onClick={() => onRange('all')}>
                      Show all time
                    </button>
                  ) : undefined
                }
              />
            </Panel>
          ) : (
            <>
              <TileRow count={4} compare={compareLabel}>
                <StatTile
                  label="Average score"
                  value={cur.avgScore == null ? '—' : Math.round(cur.avgScore)}
                  unit={cur.avgScore == null ? undefined : '/ 100'}
                  delta={d?.score}
                  compareLabel={tileCompare(d?.score)}
                  trend={measured(m.trend.points.map((p) => p.avgScore))}
                  hint="Scored sessions only; scoring failures left out"
                />
                <StatTile
                  label="Pass rate"
                  value={pctText(cur.passRate)}
                  delta={d?.pass}
                  compareLabel={tileCompare(d?.pass)}
                  trend={measured(m.extras.passRate)}
                  hint="Scored sessions at 70 or more (Solid or Strong)"
                />
                <StatTile
                  label="Owners won over"
                  value={pctText(cur.resolvedRate)}
                  delta={d?.won}
                  compareLabel={tileCompare(d?.won)}
                  trend={measured(m.extras.resolvedRate)}
                  hint="Finished sessions where the owner ended happy"
                />
                <StatTile
                  label="Scored sessions"
                  value={cur.scored.toLocaleString('en-US')}
                  delta={d?.scored}
                  compareLabel={tileCompare(d?.scored)}
                  trend={m.extras.scored}
                  hint={`What every figure on this page rests on · ${cur.activeTrainees} trainee${cur.activeTrainees === 1 ? '' : 's'}`}
                  onClick={() => onOpen('sessions')}
                />
              </TileRow>

              <SplitRow ratio="minmax(0, 1fr) minmax(0, 1fr)">
                <Panel
                  title="Skill breakdown"
                  subtitle="Average of each ACT skill, out of 100"
                  footnote={
                    <span style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      {hasPrevSkills && prevWords && <Legend items={[{ label: prevWords, color: CHART.benchmark, shape: 'tick' }]} />}
                      <span>
                        From {m.skillsCur.count} session{m.skillsCur.count === 1 ? '' : 's'} with skill scores
                        {preSkills > 0 &&
                          `; ${preSkills} older scored session${preSkills === 1 ? '' : 's'} predate the five skills and count only in the overall score`}
                        .
                      </span>
                    </span>
                  }
                >
                  {m.skillsCur.count === 0 ? (
                    <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>None of the scored sessions in this window carry the five skill scores.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                      <SkillBars
                        showDelta={comparable}
                        compareLabel={compareLabel}
                        benchmarkTitle={prevWords ? `Previous: ${prevWords}` : 'Previous window'}
                        rows={SKILL_KEYS.map((k) => ({
                          key: k,
                          label: SKILL_LABELS[k],
                          value: m.skillsCur.avg[k],
                          benchmark: hasPrevSkills ? m.skillsPrev?.avg[k] ?? null : null,
                          delta: hasPrevSkills ? pointsDelta(m.skillsCur.avg[k], m.skillsPrev?.avg[k] ?? null) : null,
                          flag: k === m.weakest && m.skillsCur.count >= 3 ? 'Weakest' : undefined,
                        }))}
                      />
                      {m.weakest && m.skillsCur.count >= 3 && (
                        <CoachCallout
                          weakest={m.weakest}
                          weakestValue={m.skillsCur.avg[m.weakest]}
                          strongest={m.strongest !== m.weakest ? m.strongest : null}
                          strongestValue={m.strongest ? m.skillsCur.avg[m.strongest] : null}
                        />
                      )}
                    </div>
                  )}
                </Panel>
                <ScoreTrendPanel
                  title="Score trend"
                  points={m.scorePoints}
                  granularity={m.trend.granularity}
                  range={range}
                  windowWords={windowWords}
                  since={m.chartSince}
                  height={250}
                  onWiden={() => onRange('all')}
                  footnote={exclusions || undefined}
                />
              </SplitRow>

              <Panel
                title="Objection × skill"
                subtitle="Average per skill for each objection practised — which objection, and which part of the answer, to coach"
                actions={m.objections.rows.length > 0 ? <BandLegend /> : undefined}
                footnote={
                  m.objections.thin.length > 0 ? (
                    <>
                      Set aside — fewer than 2 scored sessions:{' '}
                      {m.objections.thin
                        .map((t) => `${t.label} (${t.scored})`)
                        .join(', ')}
                      .
                    </>
                  ) : (
                    'Sorted by how often each objection was practised. Scored sessions only.'
                  )
                }
              >
                {m.objections.rows.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>No objection has 2 or more scored sessions in this window yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {m.hardest && (
                      <div style={{ fontSize: 13, color: COLOR.inkSoft, lineHeight: 1.5 }}>
                        Hardest spot: <strong style={{ color: COLOR.ink }}>{SKILL_LABELS[m.hardest.skill]}</strong> on{' '}
                        <strong style={{ color: COLOR.ink }}>{m.hardest.label}</strong> — averages{' '}
                        <strong style={{ color: COLOR.ink }}>{Math.round(m.hardest.value)}</strong> across {m.hardest.sessions} sessions
                        (outlined below).
                      </div>
                    )}
                    <ObjectionSkillTable rows={m.objections.rows} hardest={m.hardest} />
                  </div>
                )}
              </Panel>

              <SplitRow ratio="minmax(0, 1fr) minmax(0, 1fr)">
                <DifficultyPanel buckets={m.difficulty.buckets} unknown={m.difficulty.unknown} leftEarly={m.leftEarly} />
                <Panel
                  title="Communication styles"
                  subtitle="Average score by the trainee’s ECHO style and the AI owner’s"
                  footnote={
                    m.matchupHasData && (
                    <>
                      Cells with fewer than 2 scored sessions show “—”.
                      {m.noStyle > 0 &&
                        ` ${m.noStyle} session${m.noStyle === 1 ? '' : 's'} by trainees without a quiz result ${m.noStyle === 1 ? 'is' : 'are'} left out.`}
                    </>
                    )
                  }
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {m.pairing && (
                      <div style={{ fontSize: 13, color: COLOR.inkSoft, lineHeight: 1.5 }}>
                        Hardest pairing: <strong style={{ color: COLOR.ink }}>{m.pairing.trainee}</strong> trainees facing{' '}
                        {/^[AEIOU]/.test(m.pairing.owner) ? 'an' : 'a'}{' '}
                        <strong style={{ color: COLOR.ink }}>{m.pairing.owner}</strong> owner average{' '}
                        <strong style={{ color: COLOR.ink }}>{Math.round(m.pairing.avgScore)}</strong> ({m.pairing.scored} sessions).
                      </div>
                    )}
                    {m.matchupHasData ? (
                      <MatchupGrid
                        drivers={DRIVER_KEYS}
                        cell={(t: DriverKey, o: DriverKey) => m.matchup.get(`${t}|${o}`)}
                      />
                    ) : (
                      <div style={{ fontSize: 12.5, color: COLOR.inkMute, lineHeight: 1.5 }}>
                        Not enough sessions yet — each pairing needs 2 or more scored sessions {inWindow(range)}.
                      </div>
                    )}
                  </div>
                </Panel>
              </SplitRow>

              <SplitRow ratio="minmax(0, 1fr) minmax(0, 1fr)">
                <DistributionPanel bins={m.histogram} />
                <SplitsPanel animals={m.animals} sources={m.sources} />
              </SplitRow>

              {canFeedback ? (
                <SplitRow ratio="minmax(0, 1fr) minmax(0, 1fr)">
                  <OwnersFeltPanel mood={m.moodCur} wonDelta={m.wonDelta} compareLabel={compareLabel} shift={m.shift} />
                  <QueryBoundary query={feedback} title="Couldn’t load trainee feedback" showLoading={false}>
                    {feedback.loading ? (
                      <LoadingShimmer height={320} />
                    ) : (
                      <FeedbackPanel
                        cur={m.fbCur}
                        prev={m.fbPrev}
                        compareLabel={compareLabel}
                        comments={m.comments}
                        onOpenProfile={(id) => onOpen('trainees', id)}
                        onOpenFeedback={() => onNav('feedback', 'sessions')}
                      />
                    )}
                  </QueryBoundary>
                </SplitRow>
              ) : (
                <OwnersFeltPanel mood={m.moodCur} wonDelta={m.wonDelta} compareLabel={compareLabel} shift={m.shift} />
              )}
            </>
          )}
        </QueryBoundary>
      </ScreenShell>
    </>
  );
}

function CoachCallout({
  weakest,
  weakestValue,
  strongest,
  strongestValue,
}: {
  weakest: (typeof SKILL_KEYS)[number];
  weakestValue: number | null;
  strongest: (typeof SKILL_KEYS)[number] | null;
  strongestValue: number | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        padding: '13px 15px',
        borderRadius: 14,
        background: 'oklch(0.975 0.02 75)',
        border: '0.5px solid oklch(0.9 0.05 75)',
      }}
    >
      <span aria-hidden="true" style={{ width: 3, borderRadius: 2, background: COLOR.warn, flexShrink: 0 }} />
      <div style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.55 }}>
        <div>
          <strong style={{ color: COLOR.ink }}>
            Coach {SKILL_LABELS[weakest]} next{weakestValue != null ? ` (${Math.round(weakestValue)})` : ''}
          </strong>{' '}
          — {SKILL_HINTS[weakest]}.
        </div>
        <div style={{ marginTop: 4 }}>{SKILL_COACHING[weakest]}</div>
        {strongest && strongestValue != null && (
          <div style={{ marginTop: 6, color: COLOR.inkMute }}>
            Strongest: {SKILL_LABELS[strongest]} ({Math.round(strongestValue)}) — {SKILL_HINTS[strongest]}.
          </div>
        )}
      </div>
    </div>
  );
}

function SkillsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading skills" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TileRow count={4}>
        {Array.from({ length: 4 }).map((_, i) => (
          <LoadingShimmer key={i} height={158} />
        ))}
      </TileRow>
      <SplitRow ratio="minmax(0, 1fr) minmax(0, 1fr)">
        <LoadingShimmer height={340} />
        <LoadingShimmer height={340} />
      </SplitRow>
      <LoadingShimmer height={360} />
      <SplitRow ratio="minmax(0, 1fr) minmax(0, 1fr)">
        <LoadingShimmer height={280} />
        <LoadingShimmer height={280} />
      </SplitRow>
    </div>
  );
}
