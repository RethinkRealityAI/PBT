import { useMemo, useState } from 'react';
import { Glass } from '../primitives/Glass';
import {
  Avatar,
  DriverChip,
  EmptyState,
  LoadingShimmer,
  ScoreBadge,
  Sparkline,
} from '../primitives';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import {
  useAdminSessions,
  useAdminUsers,
  useAnalyzerEvents,
  useUserScenarios,
} from '../data/queries';
import { COLOR, DRIVERS } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import { UserModal } from './UserModal';

export function UsersScreen({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  const users = useAdminUsers();
  const sessions = useAdminSessions('90d', 2000);
  const scenarios = useUserScenarios(500);
  const analyzerEvents = useAnalyzerEvents('90d', 2000);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const openUser = openUserId
    ? users.data.find((u) => u.user_id === openUserId) ?? null
    : null;

  const enriched = useMemo(() => {
    const byUser = new Map<string, typeof sessions.data>();
    for (const s of sessions.data) {
      const list = byUser.get(s.user_id) ?? [];
      list.push(s);
      byUser.set(s.user_id, list);
    }
    return users.data.map((u) => {
      const list = byUser.get(u.user_id) ?? [];
      const completed = list.filter((s) => s.completed);
      const avg = completed.length
        ? Math.round(
            completed.reduce((a, s) => a + (s.score_overall ?? 0), 0) /
              completed.length,
          )
        : null;
      const lastTs = list[0]
        ? new Date(list[0].created_at).getTime()
        : null;
      // 14-day daily activity buckets for the sparkline.
      const buckets = Array.from({ length: 14 }, () => 0);
      const now = Date.now();
      for (const s of list) {
        const d = Math.floor(
          (now - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (d >= 0 && d < 14) buckets[13 - d]++;
      }
      return {
        ...u,
        sessions: list.length,
        completed: completed.length,
        avg,
        lastTs,
        buckets,
      };
    });
  }, [users.data, sessions.data]);

  const filtered = enriched.filter((u) =>
    !query
      ? true
      : (u.display_name ?? '').toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <ContextBar
        title="Users"
        subtitle="Per-user activity & ECHO drivers"
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        {users.loading || sessions.loading ? (
          <LoadingShimmer height={400} />
        ) : (
          <Glass padding={0} radius={20}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1.6fr 1.4fr 110px 80px 80px 110px',
                padding: '14px 22px',
                gap: 14,
                background: 'rgba(255,255,255,0.5)',
                borderBottom: '0.5px solid rgba(60,20,15,0.06)',
              }}
            >
              <span />
              {['User', 'Driver', '14d activity', 'Sess.', 'Score', 'Last seen'].map(
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
            {filtered.map((u) => (
              <div
                key={u.user_id}
                role="button"
                tabIndex={0}
                onClick={() => setOpenUserId(u.user_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenUserId(u.user_id);
                  }
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '36px 1.6fr 1.4fr 110px 80px 80px 110px',
                  padding: '14px 22px',
                  gap: 14,
                  alignItems: 'center',
                  borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                  cursor: 'pointer',
                  transition: 'background 0.12s ease',
                }}
              >
                <Avatar
                  name={u.display_name}
                  driver={u.echo_primary}
                  size={32}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: COLOR.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {u.display_name ?? 'Anonymous'}
                    {u.is_admin && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: COLOR.brandSoft,
                          color: COLOR.brand,
                        }}
                      >
                        ADMIN
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                    {u.user_id.slice(0, 8)}
                  </div>
                </div>
                <DriverChip driver={u.echo_primary} />
                <Sparkline
                  data={u.buckets}
                  width={100}
                  height={22}
                  color={
                    u.echo_primary
                      ? DRIVERS[u.echo_primary].color
                      : COLOR.brand
                  }
                />
                <div
                  style={{
                    fontSize: 13,
                    color: COLOR.ink,
                    fontWeight: 700,
                  }}
                >
                  {u.sessions}
                  <span
                    style={{
                      color: COLOR.inkMute,
                      fontWeight: 500,
                      fontSize: 11,
                    }}
                  >
                    /{u.completed}
                  </span>
                </div>
                <ScoreBadge score={u.avg} />
                <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
                  {u.lastTs ? fmtAgo(u.lastTs) : '—'}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <EmptyState
                title="No users match"
                subtitle="Try clearing the search"
              />
            )}
          </Glass>
        )}
      </ScreenShell>

      <UserModal
        user={openUser}
        sessions={
          openUserId
            ? sessions.data.filter((s) => s.user_id === openUserId)
            : []
        }
        scenarios={
          openUserId
            ? scenarios.data.filter((s) => s.creator_id === openUserId)
            : []
        }
        analyzerEvents={
          openUserId
            ? analyzerEvents.data.filter((a) => a.user_id === openUserId)
            : []
        }
        onClose={() => setOpenUserId(null)}
      />
    </>
  );
}
