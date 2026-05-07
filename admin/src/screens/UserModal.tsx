/**
 * UserModal — tabbed admin view of a single user.
 *
 * Tabs:
 *   - Overview: KPIs (sessions, completion, avg score, streak), 28-day
 *     activity sparkline, behaviour signals.
 *   - Sessions: chronological list of this user's training sessions, each
 *     clickable to open the SessionModal (one detail layer at a time).
 *   - Scenarios: scenarios this user has built, with the same look as the
 *     Scenarios screen rows.
 *   - Analyzer: every Pet Analyzer event this user generated.
 *   - AI signals: aggregated AI telemetry — latency / tokens / cost / hint
 *     accuracy / corrections.
 *
 * Modal is fixed-dimension (1080 × 82vh capped at 760) — body scrolls
 * within each tab. Driver tint flows through from --pbt-driver-primary
 * (set on document root by the consumer app, defaulted by the admin shell).
 */
import { useMemo, useState } from 'react';
import {
  DriverChip,
  EmptyState,
  Eyebrow,
  Modal,
  ModalCloseButton,
  ScoreBadge,
  Sparkline,
  StatusPill,
} from '../primitives';
import { COLOR, DRIVERS } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import type { AdminSession, AdminUser, AnalyzerEvent, UserScenario } from '../data/types';
import { SessionModal } from './SessionModal';

type TabKey = 'overview' | 'sessions' | 'scenarios' | 'analyzer' | 'ai';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'scenarios', label: 'Scenarios' },
  { key: 'analyzer', label: 'Analyzer' },
  { key: 'ai', label: 'AI signals' },
];

export function UserModal({
  user,
  sessions,
  scenarios,
  analyzerEvents,
  onClose,
}: {
  user: AdminUser | null;
  /** Sessions belonging to THIS user. Filter at the call site. */
  sessions: AdminSession[];
  /** Scenarios authored by THIS user. */
  scenarios: UserScenario[];
  /** Analyzer events authored by THIS user. */
  analyzerEvents: AnalyzerEvent[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('overview');
  // Drilldown: clicking a session inside the user modal opens a session
  // modal on top. Closing it returns to the user modal — no state lost.
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  if (!user) return null;
  const driverColor = user.echo_primary
    ? DRIVERS[user.echo_primary].color
    : COLOR.brand;

  return (
    <>
      <Modal
        open={openSessionId === null}
        onClose={onClose}
        width={1080}
        ariaLabel={user.display_name ?? user.user_id}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '82vh', maxHeight: 760 }}>
          <UserHeader user={user} onClose={onClose} driverColor={driverColor} sessions={sessions} />
          <TabBar value={tab} onChange={setTab} />
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              padding: 24,
            }}
          >
            {tab === 'overview' && <OverviewTab user={user} sessions={sessions} />}
            {tab === 'sessions' && (
              <SessionsTab sessions={sessions} onOpen={(id) => setOpenSessionId(id)} />
            )}
            {tab === 'scenarios' && <ScenariosTab scenarios={scenarios} />}
            {tab === 'analyzer' && <AnalyzerTab events={analyzerEvents} />}
            {tab === 'ai' && <AISignalsTab sessions={sessions} />}
          </div>
        </div>
      </Modal>

      {/* Stacked modal: opens on top of the user modal when a session row is
          clicked. Closing returns the user modal underneath. */}
      <SessionModal
        session={
          openSessionId
            ? sessions.find((s) => s.id === openSessionId) ?? null
            : null
        }
        user={user}
        onClose={() => setOpenSessionId(null)}
      />
    </>
  );
}

// ─── Header ─────────────────────────────────────────────────
function UserHeader({
  user,
  onClose,
  driverColor,
  sessions,
}: {
  user: AdminUser;
  onClose: () => void;
  driverColor: string;
  sessions: AdminSession[];
}) {
  const lastSession = sessions[0];
  return (
    <div
      style={{
        padding: '20px 24px 16px',
        background: `linear-gradient(180deg, color-mix(in oklab, ${driverColor} 14%, white), transparent)`,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          flexShrink: 0,
          background: `linear-gradient(135deg, ${driverColor}, color-mix(in oklab, ${driverColor} 55%, white))`,
          color: '#fff',
          fontSize: 26,
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 6px -2px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.45)',
          letterSpacing: '-0.02em',
        }}
      >
        {(user.display_name ?? user.user_id ?? '??').slice(0, 2).toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--pbt-mono)',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: COLOR.inkMute,
          }}
        >
          {user.user_id.slice(0, 12)}
        </div>
        <h2
          style={{
            margin: '4px 0 2px',
            fontSize: 24,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: COLOR.ink,
          }}
        >
          {user.display_name ?? 'Anonymous user'}
        </h2>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {user.echo_primary && <DriverChip driver={user.echo_primary} />}
          {user.echo_secondary && <DriverChip driver={user.echo_secondary} />}
          {user.is_admin && (
            <StatusPill tone="warn" dot={false}>
              Admin
            </StatusPill>
          )}
          <StatusPill tone="neutral" dot={false}>
            Joined {fmtAgo(new Date(user.created_at).getTime())}
          </StatusPill>
          {lastSession && (
            <StatusPill tone="neutral" dot={false}>
              Last session {fmtAgo(new Date(lastSession.created_at).getTime())}
            </StatusPill>
          )}
        </div>
      </div>
      <ModalCloseButton onClose={onClose} />
    </div>
  );
}

function TabBar({
  value,
  onChange,
}: {
  value: TabKey;
  onChange: (v: TabKey) => void;
}) {
  return (
    <div
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
              borderBottom: active
                ? `2px solid ${COLOR.brand}`
                : '2px solid transparent',
              marginBottom: -1,
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
  user,
  sessions,
}: {
  user: AdminUser;
  sessions: AdminSession[];
}) {
  const completed = sessions.filter((s) => s.completed);
  const avg = completed.length
    ? Math.round(
        completed.reduce((a, s) => a + (s.score_overall ?? 0), 0) /
          completed.length,
      )
    : null;
  // 28-day activity buckets
  const buckets = useMemo(() => {
    const out = Array.from({ length: 28 }, () => 0);
    const now = Date.now();
    for (const s of sessions) {
      const d = Math.floor(
        (now - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (d >= 0 && d < 28) out[27 - d]++;
    }
    return out;
  }, [sessions]);
  const driverColor = user.echo_primary
    ? DRIVERS[user.echo_primary].color
    : COLOR.brand;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <MiniStat label="Sessions" value={sessions.length} />
        <MiniStat label="Completed" value={completed.length} />
        <MiniStat label="Avg score" value={avg ?? '—'} />
        <MiniStat
          label="Completion rate"
          value={
            sessions.length
              ? `${Math.round((completed.length / sessions.length) * 100)}%`
              : '—'
          }
        />
      </div>
      <Glass>
        <Eyebrow>28-day session activity</Eyebrow>
        <div style={{ marginTop: 8 }}>
          <Sparkline data={buckets} width={1000} height={56} color={driverColor} />
        </div>
      </Glass>
      <Glass>
        <Eyebrow>Behaviour signals</Eyebrow>
        <RailRow
          label="Voice mode sessions"
          value={String(sessions.filter((s) => s.mode === 'voice').length)}
        />
        <RailRow
          label="Flagged"
          value={String(sessions.filter((s) => s.flagged).length)}
        />
        <RailRow
          label="Total turns"
          value={String(
            sessions.reduce((a, s) => a + (s.turns ?? 0), 0),
          )}
        />
      </Glass>
    </div>
  );
}

// ─── Sessions tab ───────────────────────────────────────────
function SessionsTab({
  sessions,
  onOpen,
}: {
  sessions: AdminSession[];
  onOpen: (id: string) => void;
}) {
  if (!sessions.length) return <EmptyState title="No sessions yet" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => onOpen(s.id)}
          style={{
            textAlign: 'left',
            padding: '14px 16px',
            border: '0.5px solid rgba(255,255,255,0.9)',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.6)',
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr 100px 80px 80px',
            gap: 12,
            alignItems: 'center',
            cursor: 'pointer',
            fontFamily: 'var(--pbt-font)',
            transition: 'background 0.12s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.85)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.6)';
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
              {s.scenario_summary ?? s.pushback_id ?? '—'}
            </div>
            <div style={{ fontSize: 11, color: COLOR.inkMute }}>
              {s.driver ?? '—'} · {s.mode ?? '—'}
            </div>
          </div>
          <div>
            {s.flagged ? (
              <StatusPill tone="warn">{s.flag_reason ?? 'Flagged'}</StatusPill>
            ) : s.completed ? (
              <StatusPill tone="success">Completed</StatusPill>
            ) : (
              <StatusPill tone="neutral">{s.ended_reason ?? 'Abandoned'}</StatusPill>
            )}
          </div>
          <div style={{ fontSize: 12, color: COLOR.inkSoft, fontFamily: 'var(--pbt-mono)' }}>
            {s.turns ?? '—'} turns
          </div>
          <ScoreBadge score={s.score_overall} />
          <div style={{ fontSize: 11, color: COLOR.inkMute, textAlign: 'right' }}>
            {fmtAgo(new Date(s.created_at).getTime())}
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Scenarios tab ──────────────────────────────────────────
function ScenariosTab({ scenarios }: { scenarios: UserScenario[] }) {
  if (!scenarios.length)
    return <EmptyState title="No scenarios built" subtitle="This user hasn't created their own scenario yet." />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
      {scenarios.map((s) => (
        <div
          key={s.id}
          style={{
            padding: 14,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.6)',
            border: '0.5px solid rgba(255,255,255,0.9)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLOR.ink, minWidth: 0 }}>
              {s.title}
            </div>
            <ScoreBadge score={s.avg_score} />
          </div>
          <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 2 }}>
            {s.breed ?? '—'} · {s.life_stage ?? '—'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <StatusPill tone="info" dot={false}>
              {s.plays} plays
            </StatusPill>
            {s.is_public && (
              <StatusPill tone="success" dot={false}>
                Public
              </StatusPill>
            )}
            <StatusPill tone="neutral" dot={false}>
              {fmtAgo(new Date(s.created_at).getTime())}
            </StatusPill>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Analyzer tab ───────────────────────────────────────────
function AnalyzerTab({ events }: { events: AnalyzerEvent[] }) {
  if (!events.length)
    return <EmptyState title="Analyzer not used" subtitle="Encourage this user to try the Pet Analyzer." />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {events.map((a) => (
        <div
          key={a.id}
          style={{
            padding: '12px 16px',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.6)',
            border: '0.5px solid rgba(255,255,255,0.9)',
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 80px 80px 90px 110px 80px',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
            {a.breed ?? '—'}
          </div>
          <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
            {a.activity ?? '—'}
          </div>
          <div style={{ fontSize: 12, color: COLOR.ink, fontFamily: 'var(--pbt-mono)' }}>
            BCS {a.bcs ?? '—'}/9
          </div>
          <div style={{ fontSize: 12, color: COLOR.inkSoft, fontFamily: 'var(--pbt-mono)' }}>
            MCS {a.mcs ?? '—'}
          </div>
          <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
            {a.weight_kg != null ? `${a.weight_kg} kg` : '—'}
          </div>
          <StatusPill tone={verdictTone(a.verdict)}>{a.verdict ?? '—'}</StatusPill>
          <div style={{ fontSize: 11, color: COLOR.inkMute, textAlign: 'right' }}>
            {fmtAgo(new Date(a.created_at).getTime())}
          </div>
        </div>
      ))}
    </div>
  );
}

function verdictTone(v: string | null | undefined): 'success' | 'warn' | 'danger' | 'neutral' {
  switch (v) {
    case 'on_track':
      return 'success';
    case 'watch':
      return 'warn';
    case 'adjust':
      return 'warn';
    case 'concern':
      return 'danger';
    default:
      return 'neutral';
  }
}

// ─── AI signals tab ─────────────────────────────────────────
function AISignalsTab({ sessions }: { sessions: AdminSession[] }) {
  // Per-call telemetry isn't passed in here; aggregate what's on the
  // session rows themselves: turns, model coverage, flags, completion.
  const totalTurns = sessions.reduce((a, s) => a + (s.turns ?? 0), 0);
  const flagged = sessions.filter((s) => s.flagged);
  const refusals = flagged.filter((s) => s.flag_reason === 'AI refusal mid-turn');
  const offTopic = flagged.filter((s) => s.flag_reason === 'Off-topic drift');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <MiniStat label="Total turns" value={totalTurns} />
        <MiniStat label="Flagged sessions" value={flagged.length} />
        <MiniStat label="Refusals" value={refusals.length} />
        <MiniStat label="Off-topic" value={offTopic.length} />
      </div>
      <Glass>
        <Eyebrow>Per-call telemetry</Eyebrow>
        <div style={{ marginTop: 6, fontSize: 12, color: COLOR.inkMute, lineHeight: 1.55 }}>
          Per-call latency, tokens, and cost live in the AI Quality screen
          aggregated across users. A future iteration will surface this
          user's slice here directly.
        </div>
      </Glass>
    </div>
  );
}

// ─── Atoms ──────────────────────────────────────────────────
function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.85), rgba(255,255,255,0.65))',
        border: '0.5px solid rgba(255,255,255,0.95)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset',
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: COLOR.ink,
          letterSpacing: '-0.025em',
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Glass({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.55)',
        border: '0.5px solid rgba(255,255,255,0.9)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset',
      }}
    >
      {children}
    </div>
  );
}

function RailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 12,
        padding: '5px 0',
        color: COLOR.inkSoft,
      }}
    >
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: COLOR.ink, fontFamily: 'var(--pbt-mono)' }}>
        {value}
      </span>
    </div>
  );
}
