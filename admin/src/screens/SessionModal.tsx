/**
 * SessionModal — tabbed admin view of a single training session.
 *
 * Replaces SessionDrawer (right-side slide-in panel). Per design:
 *   - Centered modal that fills ~70% of the viewport at fixed dimensions.
 *   - Tabs (Overview / Transcript / AI signals / Scoring) so the long
 *     drawer-scroll is broken into discrete views.
 *   - Sparkline of sentiment in the side rail (every tab).
 *   - Full Recharts chart on the Transcript tab (per-turn sentiment with
 *     speaker-coloured dots and hover tooltips).
 *
 * Sentiment is read from `score_report.turnSentiment` populated by the
 * scorer model. Older sessions saved before that field was added show a
 * neutral fallback chart.
 */
import { useMemo, useState } from 'react';
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
  EmptyState,
  Eyebrow,
  Modal,
  ModalCloseButton,
  ScoreBadge,
  Sparkline,
  StatusPill,
} from '../primitives';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import type { AdminSession, AdminUser } from '../data/types';

type TabKey = 'overview' | 'transcript' | 'ai' | 'scoring';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'transcript', label: 'Transcript' },
  { key: 'ai', label: 'AI signals' },
  { key: 'scoring', label: 'Scoring' },
];

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
      const speaker =
        r.speaker === 'staff' || r.speaker === 'customer' ? r.speaker : null;
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
  return {
    overall: num(r.overall),
    band: str(r.band),
    empathyTone: num(r.empathyTone),
    activeListening: num(r.activeListening),
    productKnowledge: num(r.productKnowledge),
    objectionHandling: num(r.objectionHandling),
    confidence: num(r.confidence),
    closingEffectiveness: num(r.closingEffectiveness),
    pacing: num(r.pacing),
    critique: str(r.critique),
    betterAlternative: str(r.betterAlternative),
    perDimensionNotes: (r.perDimensionNotes ?? {}) as Record<string, string>,
    keyMoments: Array.isArray(r.keyMoments) ? (r.keyMoments as Array<Record<string, unknown>>) : [],
  };
}

export function SessionModal({
  session,
  user,
  onClose,
}: {
  session: AdminSession | null;
  user: AdminUser | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('overview');

  if (!session) return null;
  const scoring = readScoreReport(session.score_report);
  const turnSentiment = readTurnSentiment(session.score_report);

  // ── Sparkline data: -1..1 → 0..100 so Sparkline can render it. ──
  const sparkData = turnSentiment.length
    ? turnSentiment.map((t) => Math.round((t.sentiment + 1) * 50))
    : [];

  return (
    <Modal open={true} onClose={onClose} width={1080} ariaLabel={`Session ${session.id}`}>
      {/* Fixed-dimension shell — header + tabs + body. Body is the only
          scrollable area when needed. */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '82vh', maxHeight: 760 }}>
        <SessionHeader session={session} user={user} scoring={scoring} onClose={onClose} />
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
            {tab === 'overview' && <OverviewTab session={session} scoring={scoring} />}
            {tab === 'transcript' && (
              <TranscriptTab session={session} turnSentiment={turnSentiment} />
            )}
            {tab === 'ai' && <AISignalsTab session={session} />}
            {tab === 'scoring' && <ScoringTab scoring={scoring} />}
          </div>
          <SideRail
            session={session}
            scoring={scoring}
            sparkData={sparkData}
            hasSentiment={turnSentiment.length > 0}
          />
        </div>
      </div>
    </Modal>
  );
}

// ─── Header ─────────────────────────────────────────────────
function SessionHeader({
  session,
  user,
  scoring,
  onClose,
}: {
  session: AdminSession;
  user: AdminUser | null;
  scoring: ReturnType<typeof readScoreReport>;
  onClose: () => void;
}) {
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
            style={{
              fontFamily: 'var(--pbt-mono)',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: COLOR.inkMute,
            }}
          >
            {session.id.slice(0, 8)} · {fmtAgo(new Date(session.created_at).getTime())}
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
            {session.scenario_summary ?? session.pushback_id ?? 'Session'}
          </h2>
          <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
            {user?.display_name ?? 'Anonymous'}
            {session.driver ? ` · ${session.driver}` : ''}
            {session.mode ? ` · ${session.mode}` : ''}
            {session.duration_seconds
              ? ` · ${Math.floor(session.duration_seconds / 60)}m ${session.duration_seconds % 60}s`
              : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {session.completed ? (
              <StatusPill tone="success">Completed</StatusPill>
            ) : (
              <StatusPill tone="neutral">Abandoned</StatusPill>
            )}
            {session.flagged && (
              <StatusPill tone="warn">{session.flag_reason ?? 'Flagged'}</StatusPill>
            )}
            {scoring?.band && (
              <StatusPill
                tone={
                  scoring.band === 'good'
                    ? 'success'
                    : scoring.band === 'ok'
                      ? 'info'
                      : 'warn'
                }
                dot={false}
              >
                {scoring.band}
              </StatusPill>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ScoreBadge score={session.score_overall} size="lg" />
          <ModalCloseButton onClose={onClose} />
        </div>
      </div>
    </div>
  );
}

// ─── Tab bar ────────────────────────────────────────────────
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
  scoring,
}: {
  session: AdminSession;
  scoring: ReturnType<typeof readScoreReport>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Stat label="Overall score" value={session.score_overall ?? '—'} />
      <Stat label="Turns" value={session.turns ?? session.transcript?.length ?? '—'} />
      <Stat
        label="Mode"
        value={session.mode ?? '—'}
      />
      <Stat
        label="Completion"
        value={session.completed ? `Completed (${session.ended_reason ?? 'completed'})` : `Abandoned (${session.ended_reason ?? 'unknown'})`}
      />
      {scoring?.critique && (
        <Block label="Coach critique">{scoring.critique}</Block>
      )}
      {scoring?.betterAlternative && (
        <Block label="Better alternative" italic>
          {scoring.betterAlternative}
        </Block>
      )}
    </div>
  );
}

// ─── Transcript tab — bubbles + Recharts sentiment chart ────
function TranscriptTab({
  session,
  turnSentiment,
}: {
  session: AdminSession;
  turnSentiment: TurnSentimentEntry[];
}) {
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
            }}
          >
            Sentiment data wasn't captured for this session. New sessions will
            include per-turn sentiment from the scorer.
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
                <XAxis
                  dataKey="turn"
                  stroke={COLOR.inkMute}
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis
                  domain={[-1, 1]}
                  ticks={[-1, -0.5, 0, 0.5, 1]}
                  stroke={COLOR.inkMute}
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v === 1 ? 'warm' : v === -1 ? 'hostile' : v === 0 ? 'neutral' : ''
                  }
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
                    const payload = ctx?.payload as
                      | { speaker: string; text: string }
                      | undefined;
                    return [
                      `${value.toFixed(2)} (${payload?.speaker ?? '?'})`,
                      `“${payload?.text ?? ''}”`,
                    ];
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
                    const fill =
                      payload.speaker === 'staff' ? COLOR.brand : COLOR.warn;
                    return (
                      <circle
                        key={`dot-${payload.turn}`}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill={fill}
                        stroke="white"
                        strokeWidth={1.5}
                      />
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
        <Eyebrow>Transcript ({transcript.length} turns)</Eyebrow>
        {transcript.length === 0 ? (
          <EmptyState title="No transcript" subtitle="Session abandoned before any turns" />
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
                        Turn {i + 1} · {isStaff ? 'Staff' : 'Pet owner'}
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

// ─── AI signals tab ─────────────────────────────────────────
function AISignalsTab({ session }: { session: AdminSession }) {
  const ai = (session.score_report as Record<string, unknown> | null)?.ai_signals;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Stat label="Model" value={session.model_id ?? '—'} />
      <Stat label="Mode" value={session.mode ?? '—'} />
      <Stat label="Turns" value={session.turns ?? session.transcript?.length ?? '—'} />
      <Stat label="Ended reason" value={session.ended_reason ?? '—'} />
      {!ai && (
        <Block label="AI telemetry">
          Per-call telemetry (latency, tokens, cost) lives in the AI Quality
          screen aggregated across sessions. This view will surface the
          per-call rows for this session in a future update.
        </Block>
      )}
    </div>
  );
}

// ─── Scoring tab — dimension breakdown + key moments ────────
function ScoringTab({ scoring }: { scoring: ReturnType<typeof readScoreReport> }) {
  if (!scoring) {
    return <EmptyState title="No scorecard" subtitle="This session wasn't scored." />;
  }
  const dims: Array<[string, number | null]> = [
    ['Empathy & tone', scoring.empathyTone],
    ['Active listening', scoring.activeListening],
    ['Product knowledge', scoring.productKnowledge],
    ['Objection handling', scoring.objectionHandling],
    ['Confidence', scoring.confidence],
    ['Closing', scoring.closingEffectiveness],
    ['Pacing', scoring.pacing],
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
                    {String(m.ts ?? '')} · {String(m.label ?? '')}
                  </div>
                  <div style={{ fontStyle: 'italic', color: COLOR.ink }}>
                    “{String(m.quote ?? '')}”
                  </div>
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
  const color =
    value >= 85 ? COLOR.success : value >= 70 ? COLOR.info : value >= 55 ? COLOR.warn : COLOR.danger;
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
        <span
          style={{
            fontFamily: 'var(--pbt-mono)',
            fontSize: 14,
            fontWeight: 700,
            color,
          }}
        >
          {score ?? '—'}
        </span>
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
  scoring,
  sparkData,
  hasSentiment,
}: {
  session: AdminSession;
  scoring: ReturnType<typeof readScoreReport>;
  sparkData: number[];
  hasSentiment: boolean;
}) {
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
        <Eyebrow>Sentiment</Eyebrow>
        {hasSentiment ? (
          <div style={{ marginTop: 6, height: 44 }}>
            <Sparkline data={sparkData} width={220} height={44} color={COLOR.brand} />
          </div>
        ) : (
          <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 6 }}>
            Not captured
          </div>
        )}
      </div>
      <div>
        <Eyebrow>Quick stats</Eyebrow>
        <RailRow label="Score" value={String(session.score_overall ?? '—')} />
        <RailRow label="Band" value={scoring?.band ?? '—'} />
        <RailRow label="Turns" value={String(session.turns ?? session.transcript?.length ?? '—')} />
        <RailRow
          label="Duration"
          value={
            session.duration_seconds
              ? `${Math.floor(session.duration_seconds / 60)}m ${session.duration_seconds % 60}s`
              : '—'
          }
        />
        <RailRow label="Mode" value={session.mode ?? '—'} />
      </div>
    </div>
  );
}

// ─── Reusable atoms ─────────────────────────────────────────
function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 14,
        background: 'rgba(255,255,255,0.6)',
        border: '0.5px solid rgba(255,255,255,0.9)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset',
      }}
    >
      <Eyebrow>{label}</Eyebrow>
      <div
        style={{
          marginTop: 4,
          fontSize: 16,
          fontWeight: 700,
          color: COLOR.ink,
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Block({ label, children, italic }: { label: string; children: React.ReactNode; italic?: boolean }) {
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
      <span style={{ fontWeight: 700, color: COLOR.ink, fontFamily: 'var(--pbt-mono)' }}>{value}</span>
    </div>
  );
}
