import { useMemo, useState } from 'react';
import { Glass } from '../primitives/Glass';
import {
  Avatar,
  EmptyState,
  LoadingShimmer,
  ScoreBadge,
  StatusPill,
} from '../primitives';
import {
  ContextBar,
  ScreenShell,
  type Range,
} from '../primitives/Shell';
import { useAdminSessions, useAdminUsers } from '../data/queries';
import { COLOR } from '../lib/tokens';
import { fmtAgo, fmtDuration } from '../lib/format';
import type { AdminSession } from '../data/types';

export function SessionsScreen({
  range,
  onRange,
  query,
  onQuery,
}: {
  range: Range;
  onRange: (r: Range) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const sessions = useAdminSessions(range, 1000);
  const users = useAdminUsers();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'completed' | 'abandoned' | 'flagged'>('all');

  const userById = useMemo(
    () => new Map(users.data.map((u) => [u.user_id, u])),
    [users.data],
  );

  const filtered = sessions.data.filter((s) => {
    if (filter === 'completed' && !s.completed) return false;
    if (filter === 'abandoned' && s.completed) return false;
    if (filter === 'flagged' && !s.flagged) return false;
    if (query) {
      const u = userById.get(s.user_id);
      const hay = `${u?.display_name ?? ''} ${s.scenario_summary ?? ''} ${s.pushback_id ?? ''}`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const header = [
      'id',
      'user_id',
      'scenario',
      'pushback',
      'driver',
      'completed',
      'ended_reason',
      'score',
      'turns',
      'duration_s',
      'created_at',
    ];
    const rows = filtered.map((s) => [
      s.id,
      s.user_id,
      s.scenario_summary ?? '',
      s.pushback_id ?? '',
      s.driver ?? '',
      s.completed,
      s.ended_reason ?? '',
      s.score_overall ?? '',
      s.turns ?? '',
      s.duration_seconds ?? '',
      s.created_at,
    ]);
    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
          .join(','),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pbt-sessions-${range}.csv`;
    a.click();
  };

  return (
    <>
      <ContextBar
        title="Sessions"
        subtitle="Transcripts & AI telemetry"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
        onExport={exportCSV}
      />
      <ScreenShell>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {(['all', 'completed', 'abandoned', 'flagged'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                background:
                  filter === f
                    ? COLOR.brandSoft
                    : 'rgba(255,255,255,0.6)',
                color: filter === f ? COLOR.brand : COLOR.inkSoft,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'var(--pbt-font)',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 12,
              color: COLOR.inkMute,
            }}
          >
            <strong style={{ color: COLOR.ink }}>{filtered.length}</strong>{' '}
            sessions
          </span>
        </div>

        {sessions.loading ? (
          <LoadingShimmer height={400} />
        ) : (
          <Glass padding={0} radius={20}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '32px 1.4fr 1.6fr 0.8fr 60px 80px 80px 80px',
                padding: '14px 22px',
                gap: 12,
                background: 'rgba(255,255,255,0.5)',
                borderBottom: '0.5px solid rgba(60,20,15,0.06)',
              }}
            >
              <span />
              {['User', 'Scenario', 'Status', 'Turns', 'Latency', 'Score', 'Time'].map(
                (h) => (
                  <div
                    key={h}
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.10em',
                      color: COLOR.inkMute,
                    }}
                  >
                    {h}
                  </div>
                ),
              )}
            </div>
            {filtered.slice(0, 200).map((s) => {
              const u = userById.get(s.user_id);
              return (
                <div
                  key={s.id}
                  onClick={() => setOpen(s.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '32px 1.4fr 1.6fr 0.8fr 60px 80px 80px 80px',
                    padding: '12px 22px',
                    gap: 12,
                    alignItems: 'center',
                    borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                    cursor: 'pointer',
                  }}
                >
                  <Avatar
                    name={u?.display_name ?? null}
                    driver={u?.echo_primary ?? s.driver}
                    size={26}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: COLOR.ink,
                      }}
                    >
                      {u?.display_name ?? 'Anonymous'}
                    </div>
                    <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                      {s.user_id.slice(0, 8)}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        color: COLOR.inkSoft,
                        fontWeight: 600,
                      }}
                    >
                      {s.scenario_summary ?? s.pushback_id ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                      {s.driver ?? '—'} · {s.mode ?? '—'}
                    </div>
                  </div>
                  <div>
                    {s.flagged ? (
                      <StatusPill tone="warn">
                        {s.flag_reason ?? 'Flagged'}
                      </StatusPill>
                    ) : s.completed ? (
                      <StatusPill tone="success">Completed</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">
                        {s.ended_reason ?? 'Abandoned'}
                      </StatusPill>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: COLOR.inkSoft,
                      fontWeight: 700,
                    }}
                  >
                    {s.turns ?? '—'}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: COLOR.inkSoft,
                      fontFamily: 'var(--pbt-mono)',
                    }}
                  >
                    {fmtDuration(s.duration_seconds ?? 0)}
                  </div>
                  <ScoreBadge score={s.score_overall} />
                  <div
                    style={{
                      fontSize: 11,
                      color: COLOR.inkMute,
                    }}
                  >
                    {fmtAgo(new Date(s.created_at).getTime())}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <EmptyState
                title="No sessions"
                subtitle="Try a wider time window or different filter"
              />
            )}
          </Glass>
        )}

        {open && (
          <SessionDrawer
            sessionId={open}
            onClose={() => setOpen(null)}
            sessions={sessions.data}
          />
        )}
      </ScreenShell>
    </>
  );
}

function SessionDrawer({
  sessionId,
  onClose,
  sessions,
}: {
  sessionId: string;
  onClose: () => void;
  sessions: AdminSession[];
}) {
  const s = sessions.find((x) => x.id === sessionId);
  if (!s) return null;
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(20,5,8,0.32)',
          backdropFilter: 'blur(2px)',
          zIndex: 50,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(900px, 95vw)',
          zIndex: 51,
          background: '#fcf9f7',
          boxShadow: '-12px 0 40px -8px rgba(60,20,15,0.18)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: 20,
            borderBottom: '0.5px solid rgba(60,20,15,0.08)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: COLOR.inkMute,
                fontFamily: 'var(--pbt-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.10em',
              }}
            >
              {s.id}
            </div>
            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: COLOR.ink,
                marginTop: 2,
              }}
            >
              {s.scenario_summary ?? s.pushback_id ?? 'Session'}
            </div>
            <div style={{ fontSize: 12, color: COLOR.inkMute, marginTop: 4 }}>
              {s.driver ?? '—'} · {s.mode ?? '—'} ·{' '}
              {fmtDuration(s.duration_seconds ?? 0)} · {s.turns ?? 0} turns
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {s.completed ? (
                <StatusPill tone="success">Completed</StatusPill>
              ) : (
                <StatusPill tone="neutral">{s.ended_reason ?? 'Abandoned'}</StatusPill>
              )}
              {s.flagged && <StatusPill tone="warn">{s.flag_reason ?? 'Flagged'}</StatusPill>}
              {s.model_id && (
                <StatusPill tone="info" dot={false}>
                  {s.model_id}
                </StatusPill>
              )}
            </div>
          </div>
          <ScoreBadge score={s.score_overall} size="lg" />
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'rgba(255,255,255,0.7)',
              borderRadius: 8,
              width: 32,
              height: 32,
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {(s.transcript ?? []).map((t, i) => {
            const isStaff = t.role === 'user';
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
                    background: isStaff
                      ? COLOR.brandSoft
                      : 'oklch(0.92 0.06 30)',
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
                      background: isStaff ? COLOR.brand : '#fff',
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
                    }}
                  >
                    Turn {i + 1} · {isStaff ? 'Staff' : 'Pet owner'}
                  </div>
                </div>
              </div>
            );
          })}
          {(!s.transcript || s.transcript.length === 0) && (
            <EmptyState
              title="No transcript"
              subtitle="Session abandoned before any turns"
            />
          )}
        </div>
      </div>
    </>
  );
}
