import { useMemo, useState } from 'react';
import { Glass } from '../primitives/Glass';
import {
  Avatar,
  EmptyState,
  LoadingShimmer,
  ScoreBadge,
  StatusPill,
} from '../primitives';
import { QueryBoundary } from '../primitives/QueryBoundary';
import {
  ContextBar,
  ScreenShell,
  type Range,
} from '../primitives/Shell';
import {
  downloadRagExport,
  rangeToSince,
  useAdminSessions,
  useAdminUsers,
} from '../data/queries';
import { COLOR } from '../lib/tokens';
import { fmtAgo, fmtDuration } from '../lib/format';
import {
  ENDED_REASON_LABELS,
  MODE_LABELS,
  PUSHBACK_LABELS,
  humanize,
  labelOf,
} from '../lib/labels';
import type { AdminSession } from '../data/types';
import { SessionModal } from './SessionModal';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'completed', label: 'Finished' },
  { key: 'abandoned', label: 'Left early' },
  { key: 'flagged', label: 'Flagged' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

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
  const [filter, setFilter] = useState<FilterKey>('all');

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
      // Search the label the row actually shows, not just the stored slug —
      // "obesity denial" has to find a `weight-denial` session.
      const hay = `${u?.display_name ?? ''} ${s.scenario_summary ?? ''} ${s.pushback_id ?? ''} ${
        s.pushback_id ? labelOf(PUSHBACK_LABELS, s.pushback_id) : ''
      }`.toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  const exportTranscripts = () => {
    void downloadRagExport({
      since: rangeToSince(range),
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
        subtitle="Every roleplay conversation, with its transcript and score"
        range={range}
        onRange={onRange}
        query={query}
        onQuery={onQuery}
        actions={
          <button
            onClick={exportTranscripts}
            title="Downloads one JSONL line per session — full transcripts, scores and scenario details — for use in another tool."
            style={{
              height: 40,
              padding: '0 14px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.72)',
              backdropFilter: 'blur(20px) saturate(180%)',
              border: '0.5px solid rgba(255,255,255,0.9)',
              color: COLOR.inkSoft,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'var(--pbt-font)',
            }}
          >
            ↓ Download transcripts (.jsonl)
          </button>
        }
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
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: 'none',
                background:
                  filter === f.key
                    ? COLOR.brandSoft
                    : 'rgba(255,255,255,0.6)',
                color: filter === f.key ? COLOR.brand : COLOR.inkSoft,
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'var(--pbt-font)',
              }}
            >
              {f.label}
            </button>
          ))}
          {sessions.error == null && (
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
          )}
        </div>

        <QueryBoundary
          queries={[sessions, users]}
          title="Couldn't load the session list"
          showLoading={false}
        >
          {sessions.loading ? (
            <LoadingShimmer height={400} />
          ) : (
            <Glass padding={0} radius={20}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    '32px 1.4fr 1.6fr 0.8fr 60px 80px 96px 80px',
                  padding: '14px 22px',
                  gap: 12,
                  background: 'rgba(255,255,255,0.5)',
                  borderBottom: '0.5px solid rgba(60,20,15,0.06)',
                }}
              >
                <span />
                {['User', 'Scenario', 'Status', 'Turns', 'Length', 'Score', 'Time'].map(
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
                        '32px 1.4fr 1.6fr 0.8fr 60px 80px 96px 80px',
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
                        {s.scenario_summary ??
                          (s.pushback_id ? labelOf(PUSHBACK_LABELS, s.pushback_id) : '—')}
                      </div>
                      <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                        {s.driver ? humanize(s.driver) : '—'} ·{' '}
                        {labelOf(MODE_LABELS, s.mode, '—')}
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
                          {labelOf(ENDED_REASON_LABELS, s.ended_reason, 'Left early')}
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
                    {/* A failed score is stored as 0; showing that badge would
                        read as a genuinely terrible session. */}
                    {s.score_unavailable ? (
                      <div>
                        <span style={{ color: COLOR.inkMute, fontWeight: 600, fontSize: 13 }}>
                          —
                        </span>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: COLOR.warn }}>
                          Scoring failed
                        </div>
                      </div>
                    ) : (
                      <ScoreBadge score={s.score_overall} />
                    )}
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
              {filtered.length > 200 && (
                <div
                  style={{
                    padding: '12px 22px',
                    fontSize: 12,
                    color: COLOR.inkMute,
                  }}
                >
                  Showing the 200 most recent of {filtered.length} sessions. Narrow
                  the time window or search to see the rest.
                </div>
              )}
              {filtered.length === 0 && (
                <EmptyState
                  title="No sessions"
                  subtitle="Try a wider time window or different filter"
                />
              )}
            </Glass>
          )}
        </QueryBoundary>

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

