/**
 * One trainee's profile (`#/analytics/trainees/<userId>`) — everything a
 * practice manager needs before a coaching conversation: who they are, how
 * they're doing against the team, what to work on (coaching notes, skills,
 * objections), their practice habit, and the sessions behind every number.
 *
 * The range scopes the headline tiles, the score chart and the skill
 * profile (each compared with the team over the same window); objections,
 * difficulty, practice style and the calendar describe the whole history —
 * every panel says which.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AnalyticsTabProps } from '../AnalyticsDestination';
import type { SessionSummary, TraineeDetail } from '../../../../src/shared/analytics/contract';
import { ContextBar, ScreenShell } from '../../primitives/Shell';
import { DriverChip, EmptyState, Eyebrow, LoadingShimmer, ScoreBadge } from '../../primitives';
import { Glass } from '../../primitives/Glass';
import { QueryBoundary } from '../../primitives/QueryBoundary';
import { AdminDifficultyMeter } from '../../primitives/DifficultyMeter';
import { useAccess } from '../../primitives/access';
import { COLOR, DRIVERS } from '../../lib/tokens';
import { fmtMoney, initialsOf } from '../../lib/format';
import {
  CALL_TYPE_LABELS,
  DEVICE_LABELS,
  INSTALL_LABELS,
  LOCALE_LABELS,
  MODE_LABELS,
  OS_LABELS,
  SCREEN_LABELS,
  humanize,
  labelOf,
  pushbackLabel,
} from '../../lib/labels';
import { useSessionSummaries, useTraineeDetail } from '../data';
import { BarList, CHART, GhostButton, Legend, Panel, ShareBar, StatTile } from '../ui';
import {
  compareWords,
  pctDelta,
  pointsDelta,
  rangeWords,
  splitByPeriod,
  windows,
  type Range,
} from '../lib/period';
import {
  SKILL_HINTS,
  SKILL_KEYS,
  SKILL_LABELS,
  extremeSkill,
  isScored,
  sessionStats,
  sessionTime,
  skillAverages,
} from '../lib/metrics';
import { NEW_DAYS, coachingNotes, displayName, streaks, traineeStatus, type CoachingNote } from '../lib/trainees';
import { DAY_MS } from '../lib/period';
import {
  actionCount,
  activityTimeline,
  clockTime,
  dayLabel,
  gettingStartedNote,
  difficultyBreakdown,
  objectionBreakdown,
  peakPractice,
  peakPracticeSentence,
  practiceCalendar,
  practiceStyle,
  practiceTime,
  relativeDay,
  scoreProgression,
  sessionLength,
  shortDate,
  untriedObjections,
} from '../lib/traineeProfile';
import { downloadCsv, toCsv } from '../lib/csv';
import { DisabledTag, Muted, NewTag, RoleTag, TraineeStatusPill, asDriver, tdStyle, thStyle } from './parts';
import { ProgressionLegend, ScoreProgression } from './ScoreProgression';
import { PracticeCalendar } from './PracticeCalendar';

type Props = AnalyticsTabProps & { userId: string };

const WITHHELD_LABELS: Record<TraineeDetail['withheld'][number], string> = {
  activity: 'App activity',
  feedback: 'Feedback they gave',
  scenarios: 'Scenarios they built',
  analyzer: 'Pet tools',
  reports: 'Problems they reported',
  ai_usage: 'AI usage',
};

/** Identity colour for spoken (voice) sessions, beside typed = CHART.primary. */
const SPOKEN = 'oklch(0.72 0.10 195)';

/** The AI owner's mood at the end — calm tones, always with the words. */
const MOOD_PARTS = [
  { key: 'green', label: 'Won over', color: 'oklch(0.72 0.11 155)' },
  { key: 'yellow', label: 'Undecided', color: 'oklch(0.84 0.10 85)' },
  { key: 'red', label: 'Still upset', color: 'oklch(0.70 0.12 25)' },
] as const;

export function TraineeProfile({ userId, range, onRange, onOpen, onNav }: Props) {
  const { can } = useAccess();
  const detail = useTraineeDetail(userId);
  const team = useSessionSummaries(range);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const d = detail.data;
  const notFound =
    !detail.loading && (detail.error ? /not found|404/i.test(detail.error) : d == null && detail.updatedAt != null);
  const name = d ? displayName(d.profile) : notFound ? 'Trainee not found' : 'Trainee';

  const copyLink = () => {
    const done = () => setCopied(true);
    try {
      void navigator.clipboard?.writeText(window.location.href).then(done, done);
    } catch {
      done();
    }
  };

  const exportSessions = () => {
    if (!d) return;
    const csv = sessionsCsv(d.sessions);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trainee';
    downloadCsv(`${slug}-sessions-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(csv.header, csv.rows));
  };

  return (
    <>
      <ContextBar
        title={name}
        subtitle="Trainee profile"
        range={range}
        onRange={onRange}
        actions={
          <>
            <GhostButton onClick={() => onOpen('trainees')}>
              <span aria-hidden="true">←</span> All trainees
            </GhostButton>
            {d && d.sessions.length > 0 && (
              <GhostButton onClick={exportSessions} title="Download every session they’ve done as a spreadsheet">
                <span aria-hidden="true">↓</span> Export sessions
              </GhostButton>
            )}
            {!notFound && (
              <GhostButton onClick={copyLink} title="Copy a link to this profile">
                <span aria-live="polite">{copied ? '✓ Copied' : 'Copy link'}</span>
              </GhostButton>
            )}
            {d && can('team.read') && (
              <GhostButton onClick={() => onNav('people', 'users')} title="Roles, access and account settings live in People">
                Manage account
              </GhostButton>
            )}
          </>
        }
      />
      <ScreenShell>
        {notFound ? (
          <Glass padding={8} radius={20}>
            <EmptyState
              title="We couldn’t find this trainee"
              subtitle="The account may have been deleted, or the link is incomplete."
              action={<GhostButton onClick={() => onOpen('trainees')}>← Back to all trainees</GhostButton>}
            />
          </Glass>
        ) : (
          <QueryBoundary queries={[detail]} title="Couldn’t load this trainee’s profile" showLoading={false}>
            {detail.loading || !d ? (
              <ProfileSkeleton />
            ) : (
              <ProfileBody
                detail={d}
                teamRows={team.data.rows}
                range={range}
                updatedAt={detail.updatedAt}
                onRange={onRange}
                onOpenSession={(id) => onOpen('sessions', id)}
              />
            )}
          </QueryBoundary>
        )}
      </ScreenShell>
    </>
  );
}

// ─── Body ──────────────────────────────────────────────────────────────

function ProfileBody({
  detail,
  teamRows,
  range,
  updatedAt,
  onRange,
  onOpenSession,
}: {
  detail: TraineeDetail;
  teamRows: SessionSummary[];
  range: Range;
  updatedAt: number | null;
  onRange: (r: Range) => void;
  onOpenSession: (id: string) => void;
}) {
  const now = useMemo(() => Date.now(), [updatedAt, range]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = useMemo(() => buildModel(detail, teamRows, range, now), [detail, teamRows, range, now]);
  const [chartView, setChartView] = useState<'chart' | 'table'>('chart');
  const [allSessions, setAllSessions] = useState(false);

  const hasSessions = detail.sessions.length > 0;
  const words = rangeWords(range);
  const compare = range === 'all' ? undefined : compareWords(range);
  const cmp = range !== 'all';

  return (
    <div className="pbt-tp">
      <div className="pbt-tp-split">
        <IdentityCard detail={detail} model={m} now={now} />
        <CoachingNotesPanel notes={m.notes} />
      </div>

      {hasSessions && cmp && m.cur.sessions === 0 && m.lastSessionAt != null && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 16px 12px 18px',
            borderRadius: 16,
            background: COLOR.warnSoft,
            border: '0.5px solid oklch(0.88 0.08 70)',
            fontSize: 13,
            color: 'oklch(0.38 0.08 60)',
          }}
        >
          <span>
            <strong>No sessions in the {words}.</strong> Their last was {relativeDay(m.lastSessionAt, now).toLowerCase()}, on{' '}
            {dayLabel(m.lastSessionAt, now)} — the score chart and skill profile below show all time instead.
          </span>
          <GhostButton onClick={() => onRange('all')}>Show all time</GhostButton>
        </div>
      )}

      {hasSessions && (
        <div className="pbt-tp-kpis">
          <StatTile
            label="Sessions"
            value={m.cur.sessions}
            delta={cmp ? pctDelta(m.cur.sessions, m.prev?.sessions) : undefined}
            compareLabel={compare}
            hint={`${m.cur.finished} finished · ${words}`}
          />
          <StatTile
            label="Average score"
            value={m.cur.avgScore == null ? '—' : Math.round(m.cur.avgScore)}
            delta={cmp && m.cur.avgScore != null ? pointsDelta(m.cur.avgScore, m.prev?.avgScore ?? null) : undefined}
            compareLabel={compare}
            hint={
              m.teamAvg != null
                ? `Team average ${Math.round(m.teamAvg)} · scored sessions only`
                : 'Scored sessions only'
            }
          />
          <StatTile
            label="Best score"
            value={m.best ? m.best.score : '—'}
            hint={m.best ? `All time · ${shortDate(m.best.at, now)}` : 'All time — nothing scored yet'}
          />
          <StatTile
            label="Practice time"
            value={practiceTime(m.cur.practiceSeconds)}
            delta={cmp ? pctDelta(m.cur.practiceSeconds, m.prev?.practiceSeconds) : undefined}
            compareLabel={compare}
            hint={`Time spent in sessions · ${words}`}
          />
          <StatTile
            label="Practice streak"
            value={m.streak.current}
            unit={m.streak.current === 1 ? 'day' : 'days'}
            hint={`Days in a row with a session · best ${m.streak.best} day${m.streak.best === 1 ? '' : 's'}`}
          />
          <StatTile
            label="Finish rate"
            value={m.cur.finishRate == null ? '—' : Math.round(m.cur.finishRate)}
            unit={m.cur.finishRate == null ? undefined : '%'}
            delta={cmp && m.cur.finishRate != null ? pointsDelta(m.cur.finishRate, m.prev?.finishRate ?? null) : undefined}
            compareLabel={compare}
            hint="Sessions finished rather than left early"
          />
        </div>
      )}

      {hasSessions ? (
        <>
          <div className="pbt-tp-split">
            <Panel
              title="Score progression"
              subtitle={
                m.progression.fellBack
                  ? `Nothing scored in the ${words} — showing every scored session`
                  : range === 'all'
                    ? 'Every scored session'
                    : `Every scored session in the ${words}`
              }
              actions={
                m.progression.points.length > 0 ? (
                  <ViewToggle value={chartView} onChange={setChartView} />
                ) : undefined
              }
              footnote={progressionFootnote(m, words)}
            >
              {m.progression.points.length === 0 ? (
                <EmptyState
                  title="No scored sessions yet"
                  subtitle="Scores appear once a session is finished and scored."
                />
              ) : (
                <>
                  {chartView === 'chart' && (
                    <div style={{ marginBottom: 12 }}>
                      <ProgressionLegend team={m.teamAvg != null} />
                    </div>
                  )}
                  <ScoreProgression
                    points={m.progression.points}
                    teamAvg={m.teamAvg}
                    onOpenSession={onOpenSession}
                    view={chartView}
                    now={now}
                  />
                </>
              )}
            </Panel>
            <SkillProfilePanel model={m} words={words} />
          </div>

          <div className="pbt-tp-cols">
            <div className="pbt-tp-stack">
              <ObjectionsPanel model={m} now={now} />
              <DifficultyPanel model={m} />
              <CalendarPanel model={m} now={now} showAppDays={detail.activity != null} />
              <RecentSessionsPanel
                sessions={m.sessions}
                now={now}
                all={allSessions}
                onToggle={() => setAllSessions((a) => !a)}
                onOpenSession={onOpenSession}
              />
            </div>
            <div className="pbt-tp-stack">
              <PracticeStylePanel model={m} />
              <OptionalPanels detail={detail} now={now} />
            </div>
          </div>
        </>
      ) : (
        <div className="pbt-tp-cols">
          <div className="pbt-tp-stack">
            <Glass padding={8} radius={20}>
              <EmptyState
                title="No practice sessions yet"
                subtitle={`Joined ${relativeDay(new Date(detail.profile.created_at).getTime(), now).toLowerCase()}. Scores, skills and their practice habit appear here after the first session.`}
              />
            </Glass>
            {detail.activity && detail.activity.active_days.length > 0 && <CalendarPanel model={m} now={now} showAppDays />}
          </div>
          <div className="pbt-tp-stack">
            <OptionalPanels detail={detail} now={now} />
          </div>
        </div>
      )}

      {detail.withheld.length > 0 && (
        <div style={{ fontSize: 11.5, color: COLOR.inkMute, padding: '0 4px' }}>
          Some sections are hidden for your role: {detail.withheld.map((w) => WITHHELD_LABELS[w]).join(', ')}.
        </div>
      )}
    </div>
  );
}

// ─── The numbers ───────────────────────────────────────────────────────

type Model = ReturnType<typeof buildModel>;

function buildModel(detail: TraineeDetail, teamRows: SessionSummary[], range: Range, now: number) {
  const sessions = detail.sessions.slice().sort((a, b) => sessionTime(b) - sessionTime(a));
  const { current } = windows(range, now);
  const split = splitByPeriod(sessions, range, now);
  const cur = sessionStats(split.current);
  const prev = range === 'all' ? null : sessionStats(split.previous);

  const teamCurrent = splitByPeriod(teamRows, range, now).current;
  const teamSkills = skillAverages(teamCurrent).avg;
  const teamAvg = sessionStats(teamCurrent).avgScore;

  const scored = sessions.filter(isScored);
  const bestSession = scored.reduce<SessionSummary | null>(
    (b, s) => (b == null || (s.score_overall as number) > (b.score_overall as number) ? s : b),
    null,
  );
  const lastSessionAt = sessions.length ? sessionTime(sessions[0]) : null;

  let progression = { ...scoreProgression(sessions, { from: current.start }), fellBack: false };
  if (progression.points.length === 0 && scored.length > 0 && range !== 'all') {
    progression = { ...scoreProgression(sessions, { from: 0 }), fellBack: true };
  }

  const windowSkills = skillAverages(split.current);
  const skillsFellBack = windowSkills.count === 0 && scored.length > 0 && range !== 'all';
  const skills = skillsFellBack ? skillAverages(sessions) : windowSkills;

  const lastSignals = [
    lastSessionAt,
    detail.activity?.last_seen ? new Date(detail.activity.last_seen).getTime() : null,
    detail.profile.last_sign_in_at ? new Date(detail.profile.last_sign_in_at).getTime() : null,
  ].filter((t): t is number => t != null && Number.isFinite(t));

  return {
    sessions,
    cur,
    prev,
    teamSkills,
    teamAvg,
    best: bestSession ? { score: bestSession.score_overall as number, at: sessionTime(bestSession) } : null,
    lastSessionAt,
    lastActiveAt: lastSignals.length ? Math.max(...lastSignals) : null,
    status: traineeStatus(lastSessionAt, now),
    isNew: now - new Date(detail.profile.created_at).getTime() <= NEW_DAYS * DAY_MS,
    streak: streaks(sessions.map(sessionTime), now),
    notes: [
      ...coachingNotes({ sessions, teamSkills, objectionLabel: (id) => pushbackLabel(id), now }),
      ...[
        gettingStartedNote({
          sessions: sessions.length,
          activity: detail.activity,
          joinedAt: new Date(detail.profile.created_at).getTime(),
          now,
        }),
      ].filter((n): n is NonNullable<typeof n> => n != null),
    ],
    progression,
    skills,
    skillsFellBack,
    weakest: extremeSkill(skills.avg, 'weakest'),
    objections: objectionBreakdown(sessions),
    untried: untriedObjections(sessions),
    difficulty: difficultyBreakdown(sessions),
    style: practiceStyle(sessions),
    calendar: practiceCalendar(sessions.map(sessionTime), detail.activity?.active_days ?? [], { now }),
    peak: peakPractice(sessions.map(sessionTime)),
  };
}

function progressionFootnote(m: Model, words: string): ReactNode {
  const parts: string[] = [];
  const { leftEarly, failed } = m.progression;
  if (leftEarly || failed) {
    const bits = [
      leftEarly ? `${leftEarly} session${leftEarly === 1 ? '' : 's'} left early` : null,
      failed ? `${failed} where scoring failed` : null,
    ].filter(Boolean);
    parts.push(`Not shown: ${bits.join(' and ')}.`);
  }
  parts.push('The line averages each session with the four before it.');
  if (m.teamAvg != null) parts.push(`Team average covers everyone’s scored sessions in the ${words}.`);
  return parts.join(' ');
}

// ─── Identity ──────────────────────────────────────────────────────────

function IdentityCard({ detail, model, now }: { detail: TraineeDetail; model: Model; now: number }) {
  const p = detail.profile;
  const name = displayName(p);
  const primary = asDriver(p.echo_primary);
  const secondary = asDriver(p.echo_secondary);
  const tint = primary ? DRIVERS[primary].color : COLOR.brand;
  const joined = new Date(p.created_at).getTime();
  const ctx = detail.activity?.last_context ?? null;
  const device = ctx
    ? [
        ctx.device ? labelOf(DEVICE_LABELS, ctx.device) : null,
        ctx.os ? labelOf(OS_LABELS, ctx.os) : null,
        ctx.installed != null ? labelOf(INSTALL_LABELS, String(ctx.installed)) : null,
      ].filter(Boolean)
    : [];
  const finished = model.sessions.filter((s) => s.completed).length;

  return (
    <Glass padding={0} radius={20} style={{ minWidth: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: 24,
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: 22,
          background: `radial-gradient(120% 90% at 0% 0%, color-mix(in oklab, ${tint} 15%, transparent) 0%, transparent 60%)`,
        }}
      >
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              flexShrink: 0,
              background: `linear-gradient(135deg, ${tint}, color-mix(in oklab, ${tint} 55%, white))`,
              color: '#fff',
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 10px 24px -10px color-mix(in oklab, ${tint} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.45)`,
              opacity: p.disabled ? 0.6 : 1,
            }}
          >
            {initialsOf(name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 800, color: COLOR.ink, letterSpacing: '-0.025em', lineHeight: 1.15 }}>{name}</div>
            <div style={{ fontSize: 13, color: COLOR.inkMute, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.email ?? 'Email hidden for your role'}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
              <TraineeStatusPill status={model.status} />
              {model.isNew && <NewTag />}
              {p.disabled && <DisabledTag />}
              <RoleTag role={p.admin_role} />
            </div>
          </div>
        </div>

        <div className="pbt-tp-facts">
          <MiniFact label="Communication style">
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
              {primary ? <DriverChip driver={primary} /> : <span style={{ color: COLOR.inkMute }}>Quiz not taken</span>}
              {secondary && secondary !== primary && (
                <span title="Secondary style" style={{ opacity: 0.75 }}>
                  <DriverChip driver={secondary} />
                </span>
              )}
            </span>
          </MiniFact>
          <MiniFact label="Joined" sub={relativeDay(joined, now)}>
            {shortDate(joined, now)}
          </MiniFact>
          <MiniFact
            label="Last active"
            sub={model.lastActiveAt ? `${dayLabel(model.lastActiveAt, now)}, ${clockTime(model.lastActiveAt)}` : undefined}
          >
            {relativeDay(model.lastActiveAt, now)}
          </MiniFact>
          <MiniFact label="Sessions, all time" sub={model.sessions.length ? `${finished} finished` : undefined}>
            {model.sessions.length}
          </MiniFact>
          <MiniFact label="Language">{p.locale ? labelOf(LOCALE_LABELS, p.locale) : 'Not set'}</MiniFact>
          {detail.activity && (
            <MiniFact label="Device" sub={device.length > 1 ? device.slice(1).join(' · ') : undefined}>
              {device.length ? device[0] : <span style={{ color: COLOR.inkMute }}>Not reported yet</span>}
            </MiniFact>
          )}
        </div>
      </div>
    </Glass>
  );
}

function MiniFact({ label, sub, children }: { label: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink, marginTop: 6, letterSpacing: '-0.01em' }}>{children}</div>
      {sub && <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Coaching notes ────────────────────────────────────────────────────

const NOTE_TONE: Record<CoachingNote['tone'], { glyph: string; word: string; bg: string; fg: string }> = {
  positive: { glyph: '✓', word: 'Going well', bg: COLOR.successSoft, fg: 'oklch(0.42 0.14 145)' },
  focus: { glyph: '◎', word: 'Focus', bg: COLOR.infoSoft, fg: 'oklch(0.42 0.14 250)' },
  watch: { glyph: '!', word: 'Watch', bg: COLOR.warnSoft, fg: 'oklch(0.47 0.14 65)' },
};

function CoachingNotesPanel({ notes }: { notes: CoachingNote[] }) {
  return (
    <Panel
      title="Coaching notes"
      subtitle="What to raise at their next check-in — each note is backed by a figure on this page"
      footnote={
        <span style={{ display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
          {(['positive', 'focus', 'watch'] as const).map((t) => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <NoteMarker tone={t} size={16} />
              {NOTE_TONE[t].word}
            </span>
          ))}
        </span>
      }
    >
      {notes.length === 0 ? (
        <div style={{ fontSize: 13, color: COLOR.inkMute, lineHeight: 1.55 }}>
          Nothing stands out — steady practice, no gaps against the team. Keep the habit going.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 13 }}>
          {notes.map((n, i) => (
            <li key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
              <NoteMarker tone={n.tone} />
              <span style={{ fontSize: 13.5, lineHeight: 1.5, color: COLOR.ink }}>
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                  {NOTE_TONE[n.tone].word}:{' '}
                </span>
                {n.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function NoteMarker({ tone, size = 22 }: { tone: CoachingNote['tone']; size?: number }) {
  const t = NOTE_TONE[tone];
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        background: t.bg,
        color: t.fg,
        fontSize: size * 0.56,
        fontWeight: 900,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: size === 22 ? 0 : 0,
        lineHeight: 1,
      }}
    >
      {t.glyph}
    </span>
  );
}

// ─── Skills ────────────────────────────────────────────────────────────

function SkillProfilePanel({ model: m, words }: { model: Model; words: string }) {
  const rows = SKILL_KEYS.filter((k) => m.skills.avg[k] != null).map((k) => {
    const v = m.skills.avg[k] as number;
    const team = m.teamSkills[k];
    const gap = team == null ? null : Math.round(v - team);
    return {
      key: k,
      label: SKILL_LABELS[k],
      value: v,
      display: Math.round(v),
      benchmark: team,
      sub:
        gap == null ? undefined : gap === 0 ? 'level with team' : gap > 0 ? `+${gap} vs team` : `−${Math.abs(gap)} vs team`,
    };
  });
  return (
    <Panel
      title="Skill profile"
      subtitle={
        m.skillsFellBack
          ? `Nothing scored in the ${words} — showing all time`
          : `Their average on each ACT skill, ${words === 'all time' ? 'all time' : words}`
      }
      footnote={
        m.skills.count > 0
          ? `From ${m.skills.count} scored session${m.skills.count === 1 ? '' : 's'}. The tick is the team’s average over the same window.`
          : undefined
      }
    >
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute, padding: '12px 0' }}>No skill scores yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Legend
            items={[
              { label: 'Their average', color: CHART.primary, shape: 'dot' },
              { label: 'Team average', color: CHART.benchmark, shape: 'tick' },
            ]}
          />
          <BarList rows={rows} max={100} barHeight={9} />
          {m.weakest && (
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.5,
                color: COLOR.inkSoft,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(60,20,15,0.035)',
              }}
            >
              <strong style={{ color: COLOR.ink }}>Weakest: {SKILL_LABELS[m.weakest]}</strong> — {SKILL_HINTS[m.weakest]}.
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

// ─── Objections ────────────────────────────────────────────────────────

function ObjectionsPanel({ model: m, now }: { model: Model; now: number }) {
  return (
    <Panel
      title="Objections"
      subtitle="Every objection they’ve practised, weakest first · all time"
      footnote={
        m.untried.length > 0 ? (
          <>
            <strong style={{ color: COLOR.inkSoft }}>Not tried yet:</strong> {m.untried.map((id) => pushbackLabel(id)).join(' · ')}
          </>
        ) : (
          'They’ve practised every built-in objection.'
        )
      }
    >
      {m.objections.length === 0 ? (
        <div style={{ fontSize: 12.5, color: COLOR.inkMute }}>No objections recorded on their sessions.</div>
      ) : (
        <div className="pbt-tq" style={{ overflowX: 'auto', margin: '0 -4px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 4 }}>Objection</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Avg</th>
                <th className="pbt-tq-hide-xs" style={{ ...thStyle, textAlign: 'right' }}>Best</th>
                <th className="pbt-tq-hide" style={{ ...thStyle, textAlign: 'right' }}>Finished</th>
                <th className="pbt-tq-hide" style={{ ...thStyle, textAlign: 'right', paddingRight: 4 }}>
                  Last practised
                </th>
              </tr>
            </thead>
            <tbody>
              {m.objections.map((o) => (
                <tr key={o.key}>
                  <td style={{ ...tdStyle, paddingLeft: 4, fontWeight: 650, color: COLOR.ink }}>{pushbackLabel(o.key)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{o.sessions}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <ScoreBadge score={o.avgScore == null ? null : Math.round(o.avgScore)} />
                  </td>
                  <td className="pbt-tq-hide-xs" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {o.best ?? '—'}
                  </td>
                  <td className="pbt-tq-hide" style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {o.finishRate == null ? '—' : `${Math.round(o.finishRate)}%`}
                  </td>
                  <td
                    className="pbt-tq-hide"
                    style={{ ...tdStyle, textAlign: 'right', paddingRight: 4, whiteSpace: 'nowrap' }}
                    title={dayLabel(o.lastAt, now)}
                  >
                    {relativeDay(o.lastAt, now)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ─── Difficulty ────────────────────────────────────────────────────────

function DifficultyPanel({ model: m }: { model: Model }) {
  const top = Math.max(1, ...m.difficulty.levels.map((l) => l.sessions));
  return (
    <Panel
      title="Difficulty"
      subtitle="How hard the owners they’ve faced were · all time"
      footnote="Every level is scored to the same standard — difficulty is context, not a handicap."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {m.difficulty.levels.map((l) => (
          <div key={l.level} style={{ display: 'grid', gridTemplateColumns: '128px minmax(0,1fr) 44px', alignItems: 'center', gap: 12 }}>
            <AdminDifficultyMeter level={l.level} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: CHART.track, minWidth: 30 }}>
                <div
                  style={{
                    width: `${(l.sessions / top) * 100}%`,
                    minWidth: l.sessions ? 3 : 0,
                    height: '100%',
                    borderRadius: 3,
                    background: CHART.muted,
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: COLOR.inkMute, fontVariantNumeric: 'tabular-nums', minWidth: 62, textAlign: 'right' }}>
                {l.sessions} session{l.sessions === 1 ? '' : 's'}
              </span>
            </div>
            <span style={{ textAlign: 'right' }}>
              <ScoreBadge score={l.avgScore == null ? null : Math.round(l.avgScore)} />
            </span>
          </div>
        ))}
        {m.difficulty.unknown > 0 && <Muted>{m.difficulty.unknown} older sessions didn’t record a level.</Muted>}
      </div>
    </Panel>
  );
}

// ─── Calendar ──────────────────────────────────────────────────────────

function CalendarPanel({ model: m, now, showAppDays }: { model: Model; now: number; showAppDays: boolean }) {
  const sentence = peakPracticeSentence(m.peak);
  return (
    <Panel title="Practice calendar" subtitle="Last 26 weeks · each square is a day" footnote={sentence ?? undefined}>
      <PracticeCalendar model={m.calendar} now={now} showAppDays={showAppDays} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '14px 20px',
          marginTop: 18,
          paddingTop: 16,
          borderTop: `1px solid ${COLOR.borderSoft}`,
        }}
      >
        <SmallStat label="Sessions" value={m.calendar.sessions} />
        <SmallStat label="Practice days" value={m.calendar.practiceDays} />
        <SmallStat label="Best streak" value={`${m.streak.best} day${m.streak.best === 1 ? '' : 's'}`} />
        {showAppDays && <SmallStat label="App-only days" value={m.calendar.appOnlyDays} />}
      </div>
    </Panel>
  );
}

function SmallStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontSize: 18, fontWeight: 750, color: COLOR.ink, marginTop: 4, letterSpacing: '-0.02em' }}>{value}</div>
    </div>
  );
}

// ─── Practice style ────────────────────────────────────────────────────

function PracticeStylePanel({ model: m }: { model: Model }) {
  const s = m.style;
  const moodTotal = s.moods.green + s.moods.yellow + s.moods.red;
  return (
    <Panel title="How they practise" subtitle="All time">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <Eyebrow style={{ marginBottom: 8 }}>Typed or spoken</Eyebrow>
          <ShareBar
            parts={[
              { key: 'text', label: MODE_LABELS.text, value: s.typed, color: CHART.primary },
              { key: 'voice', label: MODE_LABELS.voice, value: s.spoken, color: SPOKEN },
            ]}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px 16px' }}>
          <SmallFact label="Median length" value={s.medianSeconds == null ? '—' : sessionLength(s.medianSeconds)} />
          <SmallFact label="Words per reply" value={s.wordsPerReply == null ? '—' : Math.round(s.wordsPerReply)} />
          <SmallFact
            label="Time to reply"
            value={s.replySeconds == null ? '—' : `${Math.round(s.replySeconds)}s`}
            sub="median, typed sessions"
          />
          <SmallFact
            label="Coach hints"
            value={s.hintsPerTextSession == null ? '—' : s.hintsPerTextSession.toFixed(1)}
            sub="per typed session"
          />
        </div>
        <div>
          <Eyebrow style={{ marginBottom: 8 }}>How the owner felt at the end</Eyebrow>
          {moodTotal === 0 ? (
            <Muted>No finished sessions recorded the owner’s mood.</Muted>
          ) : (
            <ShareBar parts={MOOD_PARTS.map((p) => ({ key: p.key, label: p.label, value: s.moods[p.key], color: p.color }))} />
          )}
        </div>
      </div>
    </Panel>
  );
}

function SmallFact({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontSize: 18, fontWeight: 750, color: COLOR.ink, marginTop: 4, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ─── Recent sessions ───────────────────────────────────────────────────

function RecentSessionsPanel({
  sessions,
  now,
  all,
  onToggle,
  onOpenSession,
}: {
  sessions: SessionSummary[];
  now: number;
  all: boolean;
  onToggle: () => void;
  onOpenSession: (id: string) => void;
}) {
  const shown = all ? sessions : sessions.slice(0, 10);
  return (
    <Panel
      title="Recent sessions"
      subtitle={`${sessions.length} session${sessions.length === 1 ? '' : 's'}, newest first · select one to read the conversation`}
    >
      <div className="pbt-tq">
        <div
          aria-hidden="true"
          className="pbt-sess-grid"
          style={{
            display: 'grid',
            gap: 12,
            padding: '0 0 8px',
            borderBottom: `1px solid ${COLOR.border}`,
            marginBottom: 4,
          }}
        >
          {['Date', 'Session', 'Owner', 'Length', 'Score'].map((h, i) => (
            <span
              key={h}
              className={i === 2 || i === 3 ? 'pbt-tq-hide' : undefined}
              style={{ ...thStyle, padding: 0, border: 'none', textAlign: i === 4 ? 'right' : 'left' }}
            >
              {h}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {shown.map((s) => (
            <SessionRow key={s.id} s={s} now={now} onOpen={() => onOpenSession(s.id)} />
          ))}
        </div>
        {sessions.length > 10 && (
          <div style={{ marginTop: 12 }}>
            <button type="button" className="pbt-link" onClick={onToggle} style={{ fontSize: 12.5 }}>
              {all ? 'Show the latest 10' : `Show all ${sessions.length} sessions`}
            </button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function SessionRow({ s, now, onOpen }: { s: SessionSummary; now: number; onOpen: () => void }) {
  const t = sessionTime(s);
  const objection = pushbackLabel(s.pushback_id, [], 'Objection not recorded');
  const title = s.scenario_title && s.scenario_title !== objection ? s.scenario_title : objection;
  const pet = [s.species === 'cat' ? 'Cat' : 'Dog', s.breed].filter(Boolean).join(' · ');
  const sub = title !== objection ? `${objection} · ${pet}` : pet;
  return (
    <button
      type="button"
      className="pbt-session-row pbt-sess-grid"
      onClick={onOpen}
      aria-label={`${dayLabel(t, now)}: ${title}`}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft, whiteSpace: 'nowrap' }}>{dayLabel(t, now)}</span>
        <span style={{ display: 'block', fontSize: 11, color: COLOR.inkMute, marginTop: 1 }}>{clockTime(t)}</span>
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            fontSize: 13,
            fontWeight: 650,
            color: COLOR.ink,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: COLOR.inkMute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sub}
        </span>
      </span>
      <span className="pbt-tq-hide">
        {s.difficulty != null ? <AdminDifficultyMeter level={s.difficulty} /> : <Muted>—</Muted>}
      </span>
      <span className="pbt-tq-hide" style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 12, color: COLOR.inkSoft, fontVariantNumeric: 'tabular-nums' }}>
          {sessionLength(s.duration_seconds)}
        </span>
        <span style={{ display: 'block', fontSize: 11, color: COLOR.inkMute, marginTop: 1 }}>
          {s.mode ? labelOf(MODE_LABELS, s.mode) : ''}
        </span>
      </span>
      <span style={{ textAlign: 'right' }}>
        {isScored(s) ? (
          <ScoreBadge score={Math.round(s.score_overall as number)} />
        ) : s.completed ? (
          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'oklch(0.47 0.14 65)' }}>Scoring failed</span>
        ) : (
          <span style={{ fontSize: 11.5, fontWeight: 650, color: COLOR.inkMute }}>Left early</span>
        )}
      </span>
    </button>
  );
}

// ─── Optional sections (permission-gated, shown only when present) ─────

function OptionalPanels({ detail, now }: { detail: TraineeDetail; now: number }) {
  return (
    <>
      {detail.feedback && detail.feedback.length > 0 && <FeedbackPanel rows={detail.feedback} now={now} />}
      {detail.scenarios && detail.scenarios.length > 0 && <ScenariosPanel rows={detail.scenarios} now={now} />}
      {(detail.analyzer || detail.activity) && <PetToolsPanel detail={detail} now={now} />}
      {detail.activity && <ActivityPanel activity={detail.activity} now={now} />}
      {detail.reports && detail.reports.length > 0 && <ReportsPanel rows={detail.reports} now={now} />}
      {detail.ai_usage && detail.ai_usage.calls > 0 && <AiUsagePanel usage={detail.ai_usage} />}
    </>
  );
}

function avgOf(values: Array<number | null>): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function FeedbackPanel({ rows, now }: { rows: NonNullable<TraineeDetail['feedback']>; now: number }) {
  const comments = rows
    .filter((r) => r.comment && r.comment.trim())
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 3);
  const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(1));
  return (
    <Panel title="Feedback they gave" subtitle={`${rows.length} session rating${rows.length === 1 ? '' : 's'} · out of 5`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <SmallFact label="Realism" value={fmt(avgOf(rows.map((r) => r.realism)))} />
        <SmallFact label="AI quality" value={fmt(avgOf(rows.map((r) => r.ai_quality)))} />
        <SmallFact label="Comfort" value={fmt(avgOf(rows.map((r) => r.comfort)))} />
      </div>
      {comments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {comments.map((c) => (
            <figure key={c.id} style={{ margin: 0, padding: '10px 12px', borderRadius: 12, background: 'rgba(60,20,15,0.035)' }}>
              <blockquote style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: COLOR.inkSoft }}>“{c.comment}”</blockquote>
              <figcaption style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 4 }}>
                {relativeDay(new Date(c.created_at).getTime(), now)}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ScenariosPanel({ rows, now }: { rows: NonNullable<TraineeDetail['scenarios']>; now: number }) {
  return (
    <Panel title="Scenarios they built" subtitle={`${rows.length} on the Create screen`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.slice(0, 6).map((r) => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 650, color: COLOR.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.title}
              </div>
              <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 1 }}>
                {[pushbackLabel(r.pushback_id, [], ''), r.species ? humanize(r.species) : null, shortDate(new Date(r.created_at).getTime(), now)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            {r.difficulty != null && r.difficulty >= 1 && r.difficulty <= 4 && (
              <AdminDifficultyMeter level={r.difficulty as 1 | 2 | 3 | 4} showLabel={false} />
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function PetToolsPanel({ detail, now }: { detail: TraineeDetail; now: number }) {
  const photos = actionCount(detail.activity, 'vision_analyze');
  const scans = actionCount(detail.activity, 'fecal_scan');
  const saved = detail.analyzer ?? [];
  if (photos === 0 && scans === 0 && saved.length === 0) return null;
  return (
    <Panel title="Pet tools" subtitle="Pet Analyzer and Fecal Scan · all time">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {detail.activity && <SmallFact label="Photos analysed" value={photos} />}
        {detail.analyzer && <SmallFact label="Pets saved" value={saved.length} />}
        {detail.activity && <SmallFact label="Stool scans" value={scans} />}
      </div>
      {saved.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
          {saved.slice(0, 4).map((a) => (
            <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
              <span style={{ color: COLOR.inkSoft, fontWeight: 650, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.breed ?? 'Unknown breed'}
                {a.bcs != null && <span style={{ color: COLOR.inkMute, fontWeight: 500 }}> · body condition {a.bcs}/9</span>}
              </span>
              <Muted>{shortDate(new Date(a.created_at).getTime(), now)}</Muted>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function ActivityPanel({ activity, now }: { activity: NonNullable<TraineeDetail['activity']>; now: number }) {
  const screens = activity.screens
    .slice()
    .sort((a, b) => b.views - a.views)
    .slice(0, 6)
    .map((s) => ({
      key: s.screen,
      label: labelOf(SCREEN_LABELS, s.screen),
      value: s.views,
      display: s.views,
    }));
  const timeline = activityTimeline(activity.recent, 10);
  return (
    <Panel
      title="App activity"
      subtitle={`${activity.active_days.length} active day${activity.active_days.length === 1 ? '' : 's'} in the last year · ${practiceTime(activity.dwell_ms / 1000)} in the app`}
    >
      {screens.length === 0 && timeline.length === 0 ? (
        <Muted>No app activity recorded yet.</Muted>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {screens.length > 0 && (
            <div>
              <Eyebrow style={{ marginBottom: 10 }}>Screens they use most · views</Eyebrow>
              <BarList rows={screens} color={CHART.muted} barHeight={7} />
            </div>
          )}
          {timeline.length > 0 && (
            <div>
              <Eyebrow style={{ marginBottom: 10 }}>Latest activity</Eyebrow>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
                {timeline.map((e, i) => (
                  <li key={i} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0,1fr) auto', gap: 10, alignItems: 'baseline', padding: '5px 0' }}>
                    <span
                      aria-hidden="true"
                      style={{ width: 7, height: 7, borderRadius: '50%', background: i === 0 ? CHART.primary : CHART.muted, alignSelf: 'center', marginLeft: 3 }}
                    />
                    <span style={{ fontSize: 12.5, color: COLOR.inkSoft, minWidth: 0 }}>
                      {e.text}
                      {e.repeat > 1 && <span style={{ color: COLOR.inkMute }}> ×{e.repeat}</span>}
                    </span>
                    <span
                      style={{ fontSize: 11, color: COLOR.inkMute, whiteSpace: 'nowrap' }}
                      title={`${dayLabel(e.at, now)}, ${clockTime(e.at)}`}
                    >
                      {relativeDay(e.at, now) === 'Today' ? clockTime(e.at) : shortDate(e.at, now)}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function ReportsPanel({ rows, now }: { rows: NonNullable<TraineeDetail['reports']>; now: number }) {
  return (
    <Panel title="Problems they reported" subtitle={`${rows.length} report${rows.length === 1 ? '' : 's'}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.slice(0, 4).map((r) => (
          <div key={r.id} style={{ fontSize: 12.5, lineHeight: 1.5, color: COLOR.inkSoft }}>
            <div style={{ fontWeight: 650, color: COLOR.ink }}>
              {humanize(r.kind)} <Muted>· {humanize(r.status)} · {shortDate(new Date(r.created_at).getTime(), now)}</Muted>
            </div>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {r.message}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function AiUsagePanel({ usage }: { usage: NonNullable<TraineeDetail['ai_usage']> }) {
  const rows = usage.by_type
    .slice()
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .map((r) => ({
      key: r.call_type,
      label: labelOf(CALL_TYPE_LABELS, r.call_type),
      value: r.cost_usd,
      display: fmtMoney(r.cost_usd),
      sub: `${r.calls.toLocaleString('en-US')} call${r.calls === 1 ? '' : 's'}`,
    }));
  return (
    <Panel title="AI usage" subtitle={`${usage.calls.toLocaleString('en-US')} AI calls · ${fmtMoney(usage.cost_usd)} all time`}>
      <BarList rows={rows} color={CHART.muted} barHeight={7} />
    </Panel>
  );
}

// ─── Bits ──────────────────────────────────────────────────────────────

function ViewToggle({ value, onChange }: { value: 'chart' | 'table'; onChange: (v: 'chart' | 'table') => void }) {
  return (
    <div role="radiogroup" aria-label="Show as" style={{ display: 'inline-flex', padding: 2, borderRadius: 9, background: 'rgba(60,20,15,0.05)' }}>
      {(['chart', 'table'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className="pbt-btn"
          onClick={() => onChange(v)}
          style={{
            border: 'none',
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: 7,
            fontSize: 11.5,
            fontWeight: value === v ? 800 : 650,
            color: value === v ? COLOR.ink : COLOR.inkMute,
            background: value === v ? 'rgba(255,255,255,0.95)' : 'transparent',
            boxShadow: value === v ? '0 1px 4px -2px rgba(60,20,15,0.3)' : 'none',
            fontFamily: 'var(--pbt-font)',
          }}
        >
          {v === 'chart' ? 'Chart' : 'Table'}
        </button>
      ))}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="pbt-tp">
      <div className="pbt-tp-split">
        <LoadingShimmer height={230} />
        <LoadingShimmer height={230} />
      </div>
      <div className="pbt-tp-kpis">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <LoadingShimmer key={i} height={128} />
        ))}
      </div>
      <div className="pbt-tp-split">
        <LoadingShimmer height={360} />
        <LoadingShimmer height={360} />
      </div>
    </div>
  );
}

// ─── CSV ───────────────────────────────────────────────────────────────

function sessionsCsv(sessions: readonly SessionSummary[]) {
  const header = [
    'Date',
    'Objection',
    'Scenario',
    'Animal',
    'Breed',
    'Difficulty',
    'Mode',
    'Finished',
    'Length (minutes)',
    'Score',
    ...SKILL_KEYS.map((k) => SKILL_LABELS[k]),
    'Owner at the end',
    'Coach hints',
    'Scoring failed',
  ];
  const mood = (m: SessionSummary['owner_mood_end']) => MOOD_PARTS.find((p) => p.key === m)?.label ?? '';
  const rows = sessions.map((s) => [
    new Date(sessionTime(s)).toISOString().replace('T', ' ').slice(0, 16),
    pushbackLabel(s.pushback_id, [], ''),
    s.scenario_title ?? '',
    s.species === 'cat' ? 'Cat' : 'Dog',
    s.breed ?? '',
    s.difficulty != null ? `${s.difficulty} of 4` : '',
    s.mode ? labelOf(MODE_LABELS, s.mode) : '',
    s.completed ? 'Yes' : 'No',
    s.duration_seconds != null ? Math.round((s.duration_seconds / 60) * 10) / 10 : null,
    isScored(s) ? (s.score_overall as number) : null,
    ...SKILL_KEYS.map((k) => (isScored(s) && s.skills ? s.skills[k] : null)),
    mood(s.owner_mood_end),
    s.hints_used,
    s.completed && !isScored(s) ? 'Yes' : 'No',
  ]);
  return { header, rows };
}
