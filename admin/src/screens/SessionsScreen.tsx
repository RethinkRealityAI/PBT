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
import {
  downloadRagExport,
  useAdminSessions,
  useAdminUsers,
} from '../data/queries';
import { COLOR } from '../lib/tokens';
import { fmtAgo, fmtDuration } from '../lib/format';
import type { AdminSession } from '../data/types';
import { SessionModal } from './SessionModal';

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
    void downloadRagExport({
      since: new Date(
        Date.now() -
          ({ '24h': 1, '7d': 7, '28d': 28, '90d': 90 }[range] ?? 28) *
            24 *
            60 *
            60 *
            1000,
      ).toISOString(),
      completedOnly: filter === 'completed',
      limit: 5000,
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Export failed';
      alert(msg);
    });
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

        <SessionModal
          session={open ? sessions.data.find((s) => s.id === open) ?? null : null}
          user={
            open
              ? users.data.find(
                  (u) =>
                    u.user_id ===
                    sessions.data.find((s) => s.id === open)?.user_id,
                ) ?? null
              : null
          }
          onClose={() => setOpen(null)}
        />
      </ScreenShell>
    </>
  );
}

