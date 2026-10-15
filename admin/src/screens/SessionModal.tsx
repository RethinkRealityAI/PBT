/**
 * SessionModal — tabbed admin view of a single training session.
 *
 *   - Centered modal at fixed dimensions; tabs (Overview / Transcript /
 *     Scoring) break the long read into discrete views.
 *   - Side rail (every tab): the owner's sentiment sparkline + quick stats.
 *   - Overview groups the session's facts the way a manager asks about them:
 *     how it went, how the trainee practised, and what the scenario was —
 *     including the derived facts (coach hints, reply time, words per reply,
 *     how the owner ended, where the scenario came from).
 *
 * Callers:
 *   - Analytics → Sessions opens it on `#/analytics/sessions/<id>`, passing a
 *     directory entry as `user`, the list's `summary` row (the only place
 *     coach hints come from), `loading` / `error` while the full session is
 *     fetched, and `onViewTrainee` for the profile link.
 *   - People → user modal stacks it over a user, passing a full `AdminUser`.
 *     Every new prop is optional, so that call site is unchanged.
 *
 * Sentiment is read from `score_report.turnSentiment` populated by the
 * scorer model. Older sessions saved before that field was added show a
 * neutral fallback chart. A failed scoring attempt is NEVER shown as a 0.
 */
import { useMemo, useState, type ReactNode } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Avatar,
  EmptyState,
  Eyebrow,
  LoadingShimmer,
  Modal,
  ModalCloseButton,
  ScoreBadge,
  Sparkline,
  StatusPill,
} from '../primitives';
import { ErrorState } from '../primitives/QueryBoundary';
import { COLOR, DRIVER_KEYS, type DriverKey } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import { ENDED_REASON_LABELS, MODE_LABELS, humanize, labelOf, pushbackLabel } from '../lib/labels';
import type { AdminSession } from '../data/types';
import { difficultyLabel, sessionDifficulty } from '../lib/difficulty';
import { AdminDifficultyMeter } from '../primitives/DifficultyMeter';
import type { SessionSummary } from '../../../src/shared/analytics/contract';
import { toSessionSummary, type SessionRowLike } from '../../../src/shared/analytics/sessionSummary';

type TabKey = 'overview' | 'transcript' | 'scoring';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'transcript', label: 'Transcript' },
  { key: 'scoring', label: 'Scoring' },
];

/**
 * Who the session belongs to. A full `AdminUser` satisfies it, and so does a
 * trainee-directory entry (Analytics reads names with `sessions.read`, not
 * `team.read`).
 */
export interface SessionModalUser {
  user_id: string;
  display_name: string | null;
  echo_primary?: string | null;
  email?: string | null;
}

interface TurnSentimentEntry {
  idx: number;
  speaker: 'staff' | 'customer';
  sentiment: number;
}

/** Read the optional turnSentiment array off score_report safely. */
function readTurnSentiment(report: AdminSession['score_report']): TurnSentimentEntry[] {
  if (!report || typeof report !== 'object') return [];
  const arr = (report as { turnSentiment?: unknown }).turnSentiment;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const idx = typeof r.idx === 'number' ? r.idx : null;
      const sentiment = typeof r.sentiment === 'number' ? r.sentiment : null;
      const speaker = r.speaker === 'staff' || r.speaker === 'customer' ? r.speaker : null;
      if (idx == null || sentiment == null || speaker == null) return null;
      return {
        idx,
        speaker,
        sentiment: Math.max(-1, Math.min(1, sentiment)),
      } satisfies TurnSentimentEntry;
    })
    .filter((x): x is TurnSentimentEntry => x !== null);
}

/** Read scoring breakdown safely (tolerates older sessions). */
function readScoreReport(report: AdminSession['score_report']) {
  if (!report || typeof report !== 'object') return null;
  const r = report as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  // ACT-first dimensions (Phase 2). Older session rows carry the previous
  // 7 sales dimensions + 1–10 ACT subscores; fall back to those so historic
  // sessions still show a breakdown instead of blanks.
  const scale10 = (v: unknown) => (typeof v === 'number' ? Math.round(v * 10) : null);
  const pick = (...vals: Array<number | null>) => vals.find((v) => v != null) ?? null;
  return {
    overall: num(r.overall),
    band: str(r.band),
    acknowledge: pick(num(r.acknowledge), scale10(r.acknowledgeScore), num(r.empathyTone)),
    clarify: pick(num(r.clarify), scale10(r.clarifyScore), num(r.activeListening)),
    transform: pick(num(r.transform), scale10(r.takeActionScore), num(r.objectionHandling)),
    empathy: pick(num(r.empathy), num(r.empathyTone)),
    rapport: pick(num(r.rapport), num(r.pacing)),
    critique: str(r.critique),
    betterAlternative: str(r.betterAlternative),
    perDimensionNotes: (r.perDimensionNotes ?? {}) as Record<string, string>,
    keyMoments: Array.isArray(r.keyMoments) ? (r.keyMoments as Array<Record<string, unknown>>) : [],
  };
}

type Scoring = ReturnType<typeof readScoreReport>;

// ─── Words ──────────────────────────────────────────────────

const OWNER_ENDING: Record<string, { word: string; color: string; help: string }> = {
  green: { word: 'Won over', color: COLOR.success, help: 'The owner ended the conversation convinced' },
  yellow: { word: 'Undecided', color: COLOR.warn, help: 'The owner ended receptive but not yet convinced' },
  red: { word: 'Still upset', color: COLOR.danger, help: 'The owner ended the conversation defensive' },
};

const SOURCE_WORDS: Record<string, string> = {
  library: 'Built-in library',
  studio: 'Scenario Studio',
  'self-built': 'Built by the trainee',
  unknown: 'Not recorded',
};

function scoreWord(score: number): string {
  return score >= 85 ? 'Strong' : score >= 70 ? 'Solid' : score >= 55 ? 'Developing' : 'Needs work';
}

function scoreTone(score: number): 'success' | 'info' | 'warn' | 'danger' {
  return score >= 85 ? 'success' : score >= 70 ? 'info' : score >= 55 ? 'warn' : 'danger';
}

function fmtLen(seconds: number | null | undefined): string {
  if (seconds == null || !(seconds > 0)) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  return s % 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 60)}m`;
}

function asDriver(v: string | null | undefined): DriverKey | null {
  return v && (DRIVER_KEYS as string[]).includes(v) ? (v as DriverKey) : null;
}

/** A real score: finished, scored, not a scoring-failure placeholder. */
function realScore(session: AdminSession): number | null {
  if (!session.completed || session.score_unavailable) return null;
  return typeof session.score_overall === 'number' && Number.isFinite(session.score_overall)
    ? session.score_overall
    : null;
}

function outcomeOf(session: AdminSession): { word: string; tone: 'success' | 'neutral' | 'warn' | 'danger' } {
  if (session.completed) return { word: 'Finished', tone: 'success' };
  const reason = session.ended_reason && session.ended_reason !== 'completed' ? session.ended_reason : null;
  return {
    word: labelOf(ENDED_REASON_LABELS, reason, 'Left early'),
    tone: reason === 'error' ? 'danger' : 'neutral',
  };
}

export function SessionModal({
  session,
  user,
  onClose,
  summary,
  loading = false,
  error = null,
  onRetry,
  onViewTrainee,
}: {
  session: AdminSession | null;
  user: SessionModalUser | null;
  onClose: () => void;
  /**
   * The session's summary row from a list, when the caller has one — the only
   * source of coach-hint counts. Without it the derived facts are read from
   * the session itself (hints then show as not available).
   */
  summary?: SessionSummary | null;
  /** Open the modal on a skeleton while the session is fetched. */
  loading?: boolean;
  /** A load failure to show inside the modal (with `onRetry`). */
  error?: string | null;
  onRetry?: () => void;
  /** Adds "View trainee profile →" to the header. */
  onViewTrainee?: (userId: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>('overview');
  const facts = useMemo<SessionSummary | null>(() => {
    if (summary && (!session || summary.id === session.id)) return summary;
    if (!session) return null;
    try {
      return toSessionSummary(session as unknown as SessionRowLike);
    } catch {
      return null;
    }
  }, [summary, session]);

  if (!session) {
    if (!loading && !error) return null;
    return (
      <Modal open={true} onClose={onClose} width={1080} ariaLabel={loading ? 'Loading session' : 'Session could not load'}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '82vh', maxHeight: 760 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px 16px', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading ? (
                <>
                  <div style={{ width: 160 }}>
                    <LoadingShimmer height={12} />
                  </div>
                  <div style={{ width: '55%' }}>
                    <LoadingShimmer height={26} />
                  </div>
                  <div style={{ width: '35%' }}>
                    <LoadingShimmer height={14} />
                  </div>
                </>
              ) : (
                <Eyebrow>Session</Eyebrow>
              )}
            </div>
            <ModalCloseButton onClose={onClose} />
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {loading ? (
              <>
                <span role="status" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
                  Loading the session…
                </span>
                <LoadingShimmer height={40} />
                <LoadingShimmer height={180} />
                <LoadingShimmer height={180} />
              </>
            ) : (
              <ErrorState title="Couldn't load this session" detail={error} onRetry={onRetry} />
            )}
          </div>
        </div>
      </Modal>
    );
  }

  const scoring = readScoreReport(session.score_report);
  const turnSentiment = readTurnSentiment(session.score_report);

  // ── Sparkline data: -1..1 → 0..100 so Sparkline can render it. ──
  const sparkData = turnSentiment.length ? turnSentiment.map((t) => Math.round((t.sentiment + 1) * 50)) : [];

  return (
    <Modal open={true} onClose={onClose} width={1080} ariaLabel={`Session ${session.id.slice(0, 8)}`}>
      {/* Fixed-dimension shell — header + tabs + body. Body is the only
          scrollable area when needed. */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '82vh', maxHeight: 760 }}>
        <SessionHeader
          session={session}
          facts={facts}
          user={user}
          onClose={onClose}
          onViewTrainee={onViewTrainee}
        />
        <TabBar value={tab} onChange={setTab} />
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'auto',
              padding: 24,
            }}
          >
            {tab === 'overview' && <OverviewTab session={session} facts={facts} scoring={scoring} />}
            {tab === 'transcript' && <TranscriptTab session={session} turnSentiment={turnSentiment} />}
            {tab === 'scoring' && <ScoringTab session={session} scoring={scoring} />}
          </div>
          <SideRail session={session} sparkData={sparkData} hasSentiment={turnSentiment.length > 0} />
        </div>
      </div>
    </Modal>
  );
}

// ─── Header ─────────────────────────────────────────────────
function SessionHeader({
  session,
  facts,
  user,
  onClose,
  onViewTrainee,
}: {
  session: AdminSession;
  facts: SessionSummary | null;
  user: SessionModalUser | null;
  onClose: () => void;
  onViewTrainee?: (userId: string) => void;
}) {
  const score = realScore(session);
  const outcome = outcomeOf(session);
  const name = user?.display_name?.trim() || (user ? 'Unnamed trainee' : 'Unknown trainee');
  const title =
    facts?.scenario_title?.trim() ||
    session.scenario_summary ||
    (session.pushback_id ? pushbackLabel(session.pushback_id) : 'Practice session');
  const when = new Date(session.created_at);
  const meta = [
    session.driver ? `${humanize(session.driver)} owner` : null,
    session.mode ? labelOf(MODE_LABELS, session.mode) : null,
    session.duration_seconds ? fmtLen(session.duration_seconds) : null,
  ].filter(Boolean);
  return (
    <div
      style={{
        padding: '20px 24px 0',
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--pbt-driver-primary, oklch(0.62 0.22 22)) 10%, white), transparent)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            title={when.toLocaleString()}
            style={{
              fontFamily: 'var(--pbt-mono)',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: COLOR.inkMute,
            }}
          >
            {session.id.slice(0, 8)} · {fmtAgo(when.getTime())}
          </div>
          <h2
            style={{
              margin: '4px 0 6px',
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: '-0.025em',
              color: COLOR.ink,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: COLOR.inkSoft }}>
            <Avatar name={user?.display_name ?? null} driver={asDriver(user?.echo_primary)} size={22} />
            <span style={{ fontWeight: 700, color: COLOR.ink }}>{name}</span>
            {meta.length > 0 && <span style={{ color: COLOR.inkMute }}>· {meta.join(' · ')}</span>}
            {onViewTrainee && user && (
              <button
                type="button"
                className="pbt-link"
                onClick={() => onViewTrainee(user.user_id)}
                style={{ fontSize: 12.5, marginLeft: 4 }}
              >
                View trainee profile →
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <StatusPill tone={outcome.tone}>{outcome.word}</StatusPill>
            {session.completed && session.score_unavailable && <StatusPill tone="warn">Scoring failed</StatusPill>}
            {score != null && (
              <StatusPill tone={scoreTone(score)} dot={false}>
                {scoreWord(score)}
              </StatusPill>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* The level beside the score it qualifies (same scoring standard
              at every level). Not beside a scoring-failure placeholder. */}
          {!session.score_unavailable && <AdminDifficultyMeter level={sessionDifficulty(session)} />}
          <ScoreBadge score={score} size="lg" />
          <ModalCloseButton onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

// ─── Tab bar ────────────────────────────────────────────────
function TabBar({ value, onChange }: { value: TabKey; onChange: (v: TabKey) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Session views"
      style={{
        display: 'flex',
        gap: 2,
        padding: '14px 24px 0',
        borderBottom: '0.5px solid rgba(60,20,15,0.08)',
        flexShrink: 0,
      }}
    >
      {TABS.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            className="pbt-focusable"
            onClick={() => onChange(t.key)}
            style={{
              padding: '10px 14px',
              borderRadius: '10px 10px 0 0',
              border: 'none',
              cursor: 'pointer',
              background: active ? 'rgba(255,255,255,0.7)' : 'transparent',
              color: active ? COLOR.brand : COLOR.inkSoft,
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--pbt-font)',
              borderBottom: active ? `2px solid ${COLOR.brand}` : '2px solid transparent',
              marginBottom: -1,
              transition: 'all 0.12s ease',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Overview tab ───────────────────────────────────────────
function OverviewTab({
  session,
  facts,
  scoring,
}: {
  session: AdminSession;
  facts: SessionSummary | null;
  scoring: Scoring;
}) {
  const level = sessionDifficulty(session);
  const score = realScore(session);
  const outcome = outcomeOf(session);
  const ending = facts?.owner_mood_end ? OWNER_ENDING[facts.owner_mood_end] : null;
  const messages = session.turns ?? session.transcript?.length ?? null;
  const voice = session.mode === 'voice';

  const hints =
    facts?.hints_used == null
      ? { value: '—', sub: 'Not available in this view' }
      : facts.hints_used === 0
        ? { value: 'None', sub: voice ? 'Hints are for typed sessions' : 'Practised without help' }
        : { value: `${facts.hints_used} ${facts.hints_used === 1 ? 'hint' : 'hints'}`, sub: 'Asked the coach' };
  const reply =
    facts?.reply_seconds_median != null
      ? { value: fmtLen(facts.reply_seconds_median), sub: 'Median time to answer the owner' }
      : { value: '—', sub: voice ? 'Not measured in spoken sessions' : 'Not enough replies to measure' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FactGroup title="How it went">
        <FactCell label="Outcome" value={outcome.word} sub={session.completed ? 'Reached the end of the conversation' : 'Before the scorer ran'} />
        <FactCell
          label="Score"
          value={
            score != null ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <ScoreBadge score={score} /> {scoreWord(score)}
              </span>
            ) : session.completed && session.score_unavailable ? (
              'Scoring failed'
            ) : (
              'Not scored'
            )
          }
          sub={
            session.score_unavailable
              ? 'Left out of every average'
              : score == null
                ? 'Only finished sessions are scored'
                : undefined
          }
        />
        <FactCell
          label="Owner by the end"
          value={
            ending ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: ending.color }} />
                {ending.word}
              </span>
            ) : (
              'Not recorded'
            )
          }
          sub={ending?.help}
        />
        {facts && (facts.key_wins > 0 || facts.key_misses > 0) && (
          <FactCell
            label="Key moments"
            value={`${facts.key_wins} ${facts.key_wins === 1 ? 'win' : 'wins'} · ${facts.key_misses} ${facts.key_misses === 1 ? 'miss' : 'misses'}`}
            sub="Called out by the scorer"
          />
        )}
      </FactGroup>

      <FactGroup title="How they practised">
        <FactCell label="Mode" value={labelOf(MODE_LABELS, session.mode, 'Not recorded')} />
        <FactCell label="Length" value={fmtLen(session.duration_seconds)} />
        <FactCell
          label="Messages"
          value={messages ?? '—'}
          sub={facts && facts.staff_messages > 0 ? `${facts.staff_messages} from the trainee` : undefined}
        />
        <FactCell
          label="Words per reply"
          value={facts?.staff_words_avg != null ? Math.round(facts.staff_words_avg) : '—'}
          sub={facts?.staff_words_avg != null ? 'Average trainee message' : 'No trainee messages'}
        />
        <FactCell label="Reply time" value={reply.value} sub={reply.sub} />
        <FactCell label="Coach hints" value={hints.value} sub={hints.sub} />
      </FactGroup>

      <FactGroup title="The scenario">
        <FactCell label="Objection" value={session.pushback_id ? pushbackLabel(session.pushback_id) : 'Not recorded'} />
        <FactCell
          label="Animal"
          value={[facts?.species === 'cat' ? 'Cat' : 'Dog', facts?.breed].filter(Boolean).join(' · ')}
        />
        <FactCell
          label="Owner"
          value={facts?.persona ? `${facts.persona} owner` : 'Not recorded'}
          sub={session.driver ? `${humanize(session.driver)} communication style` : undefined}
        />
        <FactCell
          label="Difficulty"
          value={
            level != null ? (
              <AdminDifficultyMeter level={level} size="md" style={{ fontSize: 15, fontWeight: 700, color: COLOR.ink }} />
            ) : (
              'Not recorded'
            )
          }
          sub={level != null ? 'Scored to the same standard at every level' : undefined}
        />
        <FactCell label="Source" value={SOURCE_WORDS[facts?.scenario_source ?? 'unknown']} />
      </FactGroup>

      {scoring?.critique && !session.score_unavailable && <Block label="Coach critique">{scoring.critique}</Block>}
      {scoring?.betterAlternative && !session.score_unavailable && (
        <Block label="Better alternative" italic>
          {scoring.betterAlternative}
        </Block>
      )}
    </div>
  );
}

function FactGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <Eyebrow>{title}</Eyebrow>
      <div
        style={{
          marginTop: 8,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
          borderRadius: 14,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.88)',
          border: '0.5px solid rgba(60,20,15,0.09)',
        }}
      >
        {children}
      </div>
    </section>
  );
}

function FactCell({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        minWidth: 0,
        // Hairlines to the right and below every cell; the container clips the
        // outer ones, so a part-filled last row reads as white space, not a gap.
        boxShadow: '1px 0 0 rgba(60,20,15,0.07), 0 1px 0 rgba(60,20,15,0.07)',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 650, color: COLOR.inkMute }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 750, color: COLOR.ink, letterSpacing: '-0.01em' }}>{value}</div>
      {sub && <div style={{ marginTop: 3, fontSize: 11, color: COLOR.inkMute, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// ─── Transcript tab — bubbles + Recharts sentiment chart ────
function TranscriptTab({ session, turnSentiment }: { session: AdminSession; turnSentiment: TurnSentimentEntry[] }) {
  const transcript = session.transcript ?? [];
  // Build one row per transcript entry; align sentiment by idx.
  const sentimentByIdx = useMemo(() => {
    const map = new Map<number, TurnSentimentEntry>();
    for (const t of turnSentiment) map.set(t.idx, t);
    return map;
  }, [turnSentiment]);

  const chartData = transcript.map((t, i) => ({
    turn: i + 1,
    sentiment: sentimentByIdx.get(i)?.sentiment ?? 0,
    speaker: t.role === 'user' ? 'staff' : 'customer',
    text: t.text.length > 60 ? `${t.text.slice(0, 60)}…` : t.text,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Sentiment chart — Recharts line + colored dots */}
      <div>
        <Eyebrow>Sentiment arc</Eyebrow>
        {turnSentiment.length === 0 ? (
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: 'rgba(60,20,15,0.04)',
              border: '0.5px dashed rgba(60,20,15,0.12)',
              fontSize: 12,
              color: COLOR.inkMute,
              textAlign: 'center',
              marginTop: 6,
            }}
          >
            Sentiment wasn’t captured for this session. Sessions scored from now on include it, turn by turn.
          </div>
        ) : (
          <div
            style={{
              height: 220,
              padding: '10px 6px 6px',
              marginTop: 6,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.55)',
              border: '0.5px solid rgba(255,255,255,0.9)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset',
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="rgba(60,20,15,0.06)" vertical={false} />
                <XAxis dataKey="turn" stroke={COLOR.inkMute} fontSize={10} tickLine={false} />
                <YAxis
                  domain={[-1, 1]}
                  ticks={[-1, -0.5, 0, 0.5, 1]}
                  stroke={COLOR.inkMute}
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v: number) => (v === 1 ? 'warm' : v === -1 ? 'hostile' : v === 0 ? 'neutral' : '')}
                  width={56}
                />
                <ReferenceLine y={0} stroke="rgba(60,20,15,0.18)" strokeDasharray="3 3" />
                <Tooltip
                  cursor={{ stroke: 'rgba(60,20,15,0.12)' }}
                  contentStyle={{
                    background: 'rgba(255,255,255,0.95)',
                    border: '0.5px solid rgba(60,20,15,0.12)',
                    borderRadius: 10,
                    fontSize: 12,
                    boxShadow: '0 8px 20px -8px rgba(60,20,15,0.18)',
                  }}
                  formatter={(value: number, _name, ctx) => {
                    const payload = ctx?.payload as { speaker: string; text: string } | undefined;
                    const who = payload?.speaker === 'staff' ? 'Trainee' : 'Owner';
                    return [`${value.toFixed(2)} (${who})`, `“${payload?.text ?? ''}”`];
                  }}
                  labelFormatter={(v) => `Turn ${v}`}
                />
                <Line
                  type="monotone"
                  dataKey="sentiment"
                  stroke={COLOR.brand}
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props as {
                      cx: number;
                      cy: number;
                      payload: { speaker: string; turn: number };
                    };
                    const fill = payload.speaker === 'staff' ? COLOR.brand : COLOR.warn;
                    return (
                      <circle key={`dot-${payload.turn}`} cx={cx} cy={cy} r={3.5} fill={fill} stroke="white" strokeWidth={1.5} />
                    );
                  }}
                  activeDot={{ r: 5 }}
                  animationDuration={500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Transcript bubbles */}
      <div>
        <Eyebrow>Transcript ({transcript.length} messages)</Eyebrow>
        {transcript.length === 0 ? (
          <EmptyState title="No transcript" subtitle="The session ended before anyone spoke." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {transcript.map((t, i) => {
              const isStaff = t.role === 'user';
              const sent = sentimentByIdx.get(i)?.sentiment ?? 0;
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: isStaff ? 'row-reverse' : 'row',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: isStaff ? COLOR.brandSoft : 'oklch(0.92 0.06 30)',
                      color: isStaff ? COLOR.brand : 'oklch(0.40 0.14 30)',
                      fontSize: 11,
                      fontWeight: 800,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isStaff ? 'TX' : 'OW'}
                  </div>
                  <div style={{ maxWidth: '78%' }}>
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 14,
                        background: isStaff ? COLOR.brand : 'rgba(255,255,255,0.85)',
                        color: isStaff ? '#fff' : COLOR.ink,
                        fontSize: 13,
                        lineHeight: 1.5,
                        boxShadow: isStaff
                          ? '0 4px 10px -4px oklch(0.55 0.22 22 / 0.5)'
                          : '0 1px 2px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(60,20,15,0.08)',
                      }}
                    >
                      {t.text}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: COLOR.inkMute,
                        marginTop: 4,
                        textAlign: isStaff ? 'right' : 'left',
                        display: 'flex',
                        gap: 6,
                        flexDirection: isStaff ? 'row-reverse' : 'row',
                      }}
                    >
                      <span>
                        {i + 1} · {isStaff ? 'Trainee' : 'Pet owner'}
                      </span>
                      {sent !== 0 && (
                        <span
                          style={{
                            color: sent > 0 ? COLOR.success : COLOR.warn,
                            fontWeight: 700,
                            fontFamily: 'var(--pbt-mono)',
                          }}
                        >
                          {sent > 0 ? '+' : ''}
                          {sent.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Scoring tab — dimension breakdown + key moments ────────
function ScoringTab({ session, scoring }: { session: AdminSession; scoring: Scoring }) {
  if (session.completed && session.score_unavailable) {
    return (
      <EmptyState
        title="Scoring failed for this session"
        subtitle="The scorer didn’t return a result, so there are no skill scores. The trainee can retry scoring from their scorecard; until then the session is left out of every average."
      />
    );
  }
  if (!scoring) {
    return (
      <EmptyState
        title="No scorecard"
        subtitle={session.completed ? 'This session wasn’t scored.' : 'The trainee left before the end, so the session wasn’t scored.'}
      />
    );
  }
  const dims: Array<[string, number | null]> = [
    ['Acknowledge', scoring.acknowledge],
    ['Clarify', scoring.clarify],
    ['Transform', scoring.transform],
    ['Empathy & warmth', scoring.empathy],
    ['Rapport & pacing', scoring.rapport],
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {dims.map(([label, score]) => (
          <DimensionBar key={label} label={label} score={score} />
        ))}
      </div>
      {scoring.keyMoments.length > 0 && (
        <div>
          <Eyebrow>Key moments</Eyebrow>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {scoring.keyMoments.map((m, i) => {
              const win = m.type === 'win';
              return (
                <div
                  key={i}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.6)',
                    borderLeft: `3px solid ${win ? COLOR.success : COLOR.warn}`,
                    fontSize: 13,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--pbt-mono)',
                      fontSize: 10,
                      letterSpacing: '0.10em',
                      textTransform: 'uppercase',
                      color: COLOR.inkMute,
                      marginBottom: 4,
                    }}
                  >
                    {win ? 'Win' : 'Miss'}
                    {m.label ? ` · ${String(m.label)}` : ''}
                  </div>
                  <div style={{ fontStyle: 'italic', color: COLOR.ink }}>“{String(m.quote ?? '')}”</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DimensionBar({ label, score }: { label: string; score: number | null }) {
  const value = score ?? 0;
  const color = value >= 85 ? COLOR.success : value >= 70 ? COLOR.info : value >= 55 ? COLOR.warn : COLOR.danger;
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.6)',
        border: '0.5px solid rgba(255,255,255,0.9)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: COLOR.ink }}>{label}</span>
        <span style={{ fontFamily: 'var(--pbt-mono)', fontSize: 14, fontWeight: 700, color: COLOR.ink }}>{score ?? '—'}</span>
      </div>
      <div
        style={{
          marginTop: 6,
          height: 5,
          borderRadius: 9999,
          background: 'rgba(60,20,15,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: '100%',
            background: color,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

// ─── Side rail (always visible) ─────────────────────────────
function SideRail({
  session,
  sparkData,
  hasSentiment,
}: {
  session: AdminSession;
  sparkData: number[];
  hasSentiment: boolean;
}) {
  const level = sessionDifficulty(session);
  const score = realScore(session);
  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        borderLeft: '0.5px solid rgba(60,20,15,0.08)',
        background: 'rgba(255,255,255,0.4)',
        padding: 18,
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
      }}
    >
      <div>
        <Eyebrow>Owner sentiment</Eyebrow>
        {hasSentiment ? (
          <div style={{ marginTop: 6, height: 44 }}>
            <Sparkline data={sparkData} width={220} height={44} color={COLOR.brand} />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 6 }}>Not captured</div>
        )}
      </div>
      <div>
        <Eyebrow>Quick stats</Eyebrow>
        <RailRow
          label="Score"
          value={score != null ? String(score) : session.completed && session.score_unavailable ? 'Failed' : '—'}
        />
        <RailRow label="Outcome" value={outcomeOf(session).word} />
        <RailRow label="Difficulty" value={level != null ? `${difficultyLabel(level)} · ${level}/4` : '—'} />
        <RailRow label="Messages" value={String(session.turns ?? session.transcript?.length ?? '—')} />
        <RailRow label="Length" value={fmtLen(session.duration_seconds)} />
        <RailRow label="Mode" value={labelOf(MODE_LABELS, session.mode, '—')} />
        {session.model_id && <RailRow label="AI model" value={session.model_id} small />}
      </div>
    </div>
  );
}

// ─── Reusable atoms ─────────────────────────────────────────
function Block({ label, children, italic }: { label: string; children: ReactNode; italic?: boolean }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          marginTop: 6,
          padding: 14,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.6)',
          border: '0.5px solid rgba(255,255,255,0.9)',
          fontSize: 14,
          lineHeight: 1.55,
          color: COLOR.ink,
          fontStyle: italic ? 'italic' : 'normal',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {italic ? `“${children}”` : children}
      </div>
    </div>
  );
}

function RailRow({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        fontSize: 12,
        padding: '5px 0',
        color: COLOR.inkSoft,
      }}
    >
      <span style={{ flexShrink: 0 }}>{label}</span>
      <span
        title={value}
        style={{
          fontWeight: 700,
          color: COLOR.ink,
          fontFamily: 'var(--pbt-mono)',
          fontSize: small ? 10.5 : 12,
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {value}
      </span>
    </div>
  );
}
