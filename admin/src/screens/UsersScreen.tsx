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
  runUserAction,
  useAdminSessions,
  useAdminUsers,
  useAnalyzerEvents,
  useUserScenarios,
} from '../data/queries';
import { COLOR, DRIVERS } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import { UserModal } from './UserModal';
import { Field, inputStyle, btnPrimary, btnSecondary } from './FlagsScreen';
import { Modal, ModalCloseButton } from '../primitives';

export function UsersScreen({
  query,
  onQuery,
  meUserId,
}: {
  query: string;
  onQuery: (q: string) => void;
  meUserId?: string;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const users = useAdminUsers(refreshKey);
  const sessions = useAdminSessions('90d', 2000);
  const scenarios = useUserScenarios(500);
  const analyzerEvents = useAnalyzerEvents('90d', 2000);
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const refresh = () => setRefreshKey((k) => k + 1);

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
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={btnPrimary} onClick={() => setCreating(true)}>
            + New user
          </button>
        </div>
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
                  opacity: u.disabled ? 0.55 : 1,
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
                    {u.disabled && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: COLOR.dangerSoft,
                          color: COLOR.danger,
                        }}
                      >
                        DISABLED
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                    {u.email ?? u.user_id.slice(0, 8)}
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
        meUserId={meUserId}
        onChanged={refresh}
      />

      <CreateUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          refresh();
        }}
      />
    </>
  );
}

function CreateUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && password.length >= 8 && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await runUserAction({
        op: 'create',
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
        isAdmin,
      });
      setEmail('');
      setPassword('');
      setDisplayName('');
      setIsAdmin(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} width={460} ariaLabel="Create user">
      <div style={{ padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: COLOR.ink }}>New user</h2>
          <ModalCloseButton onClose={onClose} />
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="name@clinic.com" />
          </Field>
          <Field label="Temporary password" help="At least 8 characters. The user can change it later.">
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Display name (optional)">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLOR.ink, cursor: 'pointer' }}>
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Grant admin access
          </label>
          {error && <div style={{ fontSize: 12.5, color: COLOR.danger, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.5 }} disabled={!canSubmit} onClick={submit}>
              {busy ? 'Creating…' : 'Create user'}
            </button>
            <button style={btnSecondary} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
