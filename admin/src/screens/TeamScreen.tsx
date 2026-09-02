/**
 * Team & roles.
 *
 * Three tabs over one idea — who can get in, and what they can do:
 *   Members  — accounts that currently hold a role
 *   Invites  — outstanding and historical invitations
 *   Roles    — the permission bundles themselves, editable as a matrix
 *
 * Everything here is advisory UI: the server re-checks each permission on
 * every call, so hiding a control is convenience, never the control itself.
 */
import { useMemo, useState } from 'react';
import { Glass } from '../primitives/Glass';
import { Avatar, EmptyState, LoadingShimmer, Modal, ModalCloseButton } from '../primitives';
import { ContextBar, ScreenShell } from '../primitives/Shell';
import { COLOR } from '../lib/tokens';
import { fmtAgo } from '../lib/format';
import { useAdminUsers, runUserAction } from '../data/queries';
import {
  useInvites,
  useRoles,
  writeInvite,
  writeRole,
  type AdminInvite,
  type AdminRole,
  type InviteStatus,
} from '../data/access';
import type { AdminUser } from '../data/types';
import { Field, btnPrimary, btnSecondary, inputStyle } from './FlagsScreen';
import {
  PERMISSION_CATEGORIES,
  summarizePermissions,
  withImpliedPermissions,
  withoutDependents,
  type Permission,
} from '../../../src/shared/access/permissions';

export type TeamTab = 'members' | 'invites' | 'roles';

export function TeamScreen({
  query,
  onQuery,
  meUserId,
  myPermissions,
  tab,
  onTab,
}: {
  query: string;
  onQuery: (q: string) => void;
  meUserId?: string;
  myPermissions: string[];
  /** Controlled by the People destination's section tabs. */
  tab: TeamTab;
  onTab: (t: TeamTab) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const users = useAdminUsers(refreshKey);
  const roles = useRoles(refreshKey);
  const invites = useInvites(refreshKey);
  const [inviting, setInviting] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const can = (p: string) => myPermissions.includes(p);
  const roleList = roles.data?.roles ?? [];
  const roleByKey = useMemo(
    () => new Map(roleList.map((r) => [r.key, r] as const)),
    [roleList],
  );

  const members = useMemo(
    () =>
      users.data
        .filter((u) => Boolean(u.admin_role))
        .filter((u) =>
          !query
            ? true
            : `${u.display_name ?? ''} ${u.email ?? ''} ${u.admin_role ?? ''}`
                .toLowerCase()
                .includes(query.toLowerCase()),
        ),
    [users.data, query],
  );

  const pendingCount = (invites.data?.invites ?? []).filter((i) => i.status === 'pending').length;

  // Everyone who could be promoted: an existing account with no role yet.
  // Promotion needs no email at all, which matters a great deal before a mail
  // provider is configured — and stays the quickest path afterwards.
  const promotable = useMemo(
    () => users.data.filter((u) => !u.admin_role),
    [users.data],
  );

  return (
    <>
      <ContextBar
        title="Team & roles"
        subtitle="Who can reach the admin portal, and exactly what they can do there"
        query={query}
        onQuery={onQuery}
      />
      <ScreenShell>
        {/* Counts belong next to the thing they count — the tab strip above is
            shared with the Users tab and stays static. */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tally label={tab === 'roles' ? 'Roles' : tab === 'invites' ? 'Pending invites' : 'Admins'}
                 value={tab === 'roles' ? roleList.length : tab === 'invites' ? pendingCount : members.length} />
          <div style={{ flex: 1 }} />
          {can('team.manage') && (
            <button style={btnSecondary} onClick={() => setPromoting(true)}>
              Add existing user
            </button>
          )}
          {can('invites.manage') && (
            <button style={btnPrimary} onClick={() => setInviting(true)}>
              + Invite teammate
            </button>
          )}
        </div>

        {roles.error && <ErrorNote>{roles.error}</ErrorNote>}

        {tab === 'members' &&
          (users.loading || roles.loading ? (
            <LoadingShimmer height={320} />
          ) : (
            <MembersTable
              members={members}
              roleByKey={roleByKey}
              roles={roleList}
              meUserId={meUserId}
              canManage={can('team.manage')}
              onAddExisting={can('team.manage') ? () => setPromoting(true) : undefined}
              onChanged={refresh}
            />
          ))}

        {tab === 'invites' &&
          (invites.loading ? (
            <LoadingShimmer height={280} />
          ) : (
            <InvitesTable
              invites={invites.data?.invites ?? []}
              roleByKey={roleByKey}
              canManage={can('invites.manage')}
              onChanged={refresh}
            />
          ))}

        {tab === 'roles' &&
          (roles.loading ? (
            <LoadingShimmer height={320} />
          ) : (
            <RolesGrid
              roles={roleList}
              counts={roles.data?.memberCounts ?? {}}
              canManage={Boolean(roles.data?.canManage)}
              isOwner={Boolean(roles.data?.isOwner)}
              myPermissions={myPermissions}
              onChanged={refresh}
            />
          ))}
      </ScreenShell>

      <InviteModal
        open={inviting}
        roles={roleList}
        onClose={() => setInviting(false)}
        onSent={() => {
          setInviting(false);
          onTab('invites');
          refresh();
        }}
      />

      <AddExistingModal
        open={promoting}
        candidates={promotable}
        roles={roleList}
        loading={users.loading}
        onClose={() => setPromoting(false)}
        onAdded={() => {
          setPromoting(false);
          onTab('members');
          refresh();
        }}
      />
    </>
  );
}

// ── Promote an existing account ────────────────────────────────────────

/**
 * Grant a role to somebody who already has an account.
 *
 * The invitation flow assumes working email; this one assumes nothing. Anyone
 * who has signed in to the trainer already exists in `profiles`, so making
 * them an admin is a single role assignment — no message to deliver, no
 * password to hand over, no link to expire.
 */
function AddExistingModal({
  open,
  candidates,
  roles,
  loading,
  onClose,
  onAdded,
}: {
  open: boolean;
  candidates: AdminUser[];
  roles: AdminRole[];
  loading: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [roleKey, setRoleKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignable = roles
    .filter((r) => r.key !== 'owner')
    .concat(roles.filter((r) => r.key === 'owner'));
  const chosenRole = roles.find((r) => r.key === roleKey);
  const summary = summarizePermissions(chosenRole?.permissions ?? []);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? candidates.filter((u) =>
          `${u.display_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q),
        )
      : candidates;
    // A picker is for picking, not for scrolling — searching narrows it.
    return list.slice(0, 40);
  }, [candidates, search]);

  const selected = candidates.find((u) => u.user_id === userId) ?? null;

  function close() {
    setSearch('');
    setUserId(null);
    setRoleKey('');
    setError(null);
    onClose();
  }

  async function submit() {
    if (!userId || !roleKey) return;
    setBusy(true);
    setError(null);
    try {
      await runUserAction({ op: 'set_role', userId, roleKey });
      setSearch('');
      setUserId(null);
      setRoleKey('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not grant the role');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} width={560} ariaLabel="Add an existing user as an admin">
      <div style={{ padding: 26, overflowY: 'auto' }}>
        <ModalHeader title="Add an existing user" onClose={close} />
        <Callout>
          Grants portal access to somebody who already has an account. They keep
          the password they already use — nothing is emailed.
        </Callout>

        <div style={{ display: 'grid', gap: 13 }}>
          <Field label="Who" help="Accounts that don’t hold a role yet.">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              style={inputStyle}
              aria-label="Search accounts"
            />
          </Field>

          <div
            style={{
              maxHeight: 232,
              overflowY: 'auto',
              borderRadius: 12,
              border: '0.5px solid rgba(60,20,15,0.1)',
              background: 'rgba(255,255,255,0.5)',
            }}
          >
            {loading ? (
              <div style={{ padding: 16 }}>
                <LoadingShimmer height={80} />
              </div>
            ) : matches.length === 0 ? (
              <div style={{ padding: '18px 16px', fontSize: 12.5, color: COLOR.inkMute }}>
                {candidates.length === 0
                  ? 'Every account already holds a role.'
                  : 'Nobody matches that search.'}
              </div>
            ) : (
              matches.map((u) => {
                const active = u.user_id === userId;
                return (
                  <button
                    key={u.user_id}
                    onClick={() => setUserId(u.user_id)}
                    aria-pressed={active}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      width: '100%',
                      textAlign: 'left',
                      padding: '9px 13px',
                      border: 'none',
                      cursor: 'pointer',
                      background: active ? COLOR.brandSoft : 'transparent',
                      borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                    }}
                  >
                    <Avatar name={u.display_name} driver={u.echo_primary} size={28} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 13,
                          fontWeight: 700,
                          color: COLOR.ink,
                        }}
                      >
                        {u.display_name ?? 'Unnamed'}
                        {u.disabled && <SoftTag tone="warn">DISABLED</SoftTag>}
                      </span>
                      <span style={{ ...ellipsis, display: 'block' }}>
                        {u.email ?? u.user_id.slice(0, 8)}
                      </span>
                    </span>
                    {active && (
                      <span style={{ fontSize: 12, fontWeight: 800, color: COLOR.brand }}>✓</span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          <Field label="Role">
            <select value={roleKey} onChange={(e) => setRoleKey(e.target.value)} style={inputStyle}>
              <option value="">Choose a role…</option>
              {assignable.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          {chosenRole && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.6)',
                border: '0.5px solid rgba(60,20,15,0.07)',
              }}
            >
              <div style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.55 }}>
                {chosenRole.description}
              </div>
              <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 6 }}>
                {chosenRole.key === 'owner'
                  ? 'Every permission, present and future.'
                  : `${summary.count} of ${summary.total} permissions · ${summary.areas.join(' · ') || 'no areas'}`}
              </div>
            </div>
          )}

          {selected?.disabled && (
            <Callout tone="warn">
              This account is disabled and can’t sign in. Enable it from Users →
              Manage before granting a role.
            </Callout>
          )}
          {error && <ErrorNote>{error}</ErrorNote>}

          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <button
              style={{ ...btnPrimary, opacity: userId && roleKey && !busy ? 1 : 0.5 }}
              disabled={!userId || !roleKey || busy}
              onClick={() => void submit()}
            >
              {busy ? 'Granting…' : 'Grant access'}
            </button>
            <button style={btnSecondary} onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Members ────────────────────────────────────────────────────────────

const GRID = '34px 1.6fr 150px 1fr 110px 150px';

function MembersTable({
  members,
  roles,
  roleByKey,
  meUserId,
  canManage,
  onAddExisting,
  onChanged,
}: {
  members: AdminUser[];
  roles: AdminRole[];
  roleByKey: Map<string, AdminRole>;
  meUserId?: string;
  canManage: boolean;
  /** Undefined when the viewer can't manage the team — hides the CTA. */
  onAddExisting?: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function change(userId: string, roleKey: string | null) {
    setBusy(userId);
    setError(null);
    try {
      await runUserAction({ op: 'set_role', userId, roleKey });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the role');
    } finally {
      setBusy(null);
    }
  }

  if (!members.length) {
    return (
      <Glass padding={0} radius={20}>
        <EmptyState
          title="No admins yet"
          subtitle={
            onAddExisting
              ? 'Invite a teammate, or give portal access to someone who already has an account — that route needs no email at all.'
              : 'Invite a teammate to give them portal access'
          }
        />
        {onAddExisting && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 24 }}>
            <button style={btnSecondary} onClick={onAddExisting}>
              Add existing user
            </button>
          </div>
        )}
      </Glass>
    );
  }

  return (
    <>
      {error && <ErrorNote>{error}</ErrorNote>}
      <Glass padding={0} radius={20}>
        <HeaderRow columns={['', 'Member', 'Role', 'Access', 'Status', '']} grid={GRID} />
        {members.map((m) => {
          const role = m.admin_role ? roleByKey.get(m.admin_role) : undefined;
          const summary = summarizePermissions(role?.permissions ?? []);
          const isSelf = m.user_id === meUserId;
          return (
            <div
              key={m.user_id}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 14,
                padding: '13px 22px',
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                opacity: m.disabled ? 0.55 : 1,
              }}
            >
              <Avatar name={m.display_name} driver={m.echo_primary} size={30} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: COLOR.ink }}>
                  {m.display_name ?? 'Unnamed'}
                  {isSelf && <SoftTag>YOU</SoftTag>}
                </div>
                <div style={ellipsis}>{m.email ?? m.user_id.slice(0, 8)}</div>
              </div>
              <RolePill role={role} fallback={m.admin_role} />
              <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
                {role ? `${summary.count}/${summary.total} permissions` : '—'}
                {role?.key === 'owner' && ' · everything'}
                {(m.permission_overrides?.grant?.length || m.permission_overrides?.revoke?.length) && (
                  <span style={{ color: COLOR.warn, fontWeight: 700 }}> · customised</span>
                )}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: m.disabled ? COLOR.danger : COLOR.success }}>
                {m.disabled ? 'Disabled' : 'Active'}
              </div>
              <div>
                {canManage ? (
                  <select
                    value={m.admin_role ?? ''}
                    disabled={busy === m.user_id}
                    onChange={(e) => void change(m.user_id, e.target.value || null)}
                    style={{ ...inputStyle, padding: '6px 8px', fontSize: 12.5 }}
                    aria-label={`Role for ${m.display_name ?? m.email ?? 'member'}`}
                  >
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.name}
                      </option>
                    ))}
                    <option value="">Remove access</option>
                  </select>
                ) : (
                  <span style={{ fontSize: 12, color: COLOR.inkMute }}>{role?.name ?? '—'}</span>
                )}
              </div>
            </div>
          );
        })}
      </Glass>
    </>
  );
}

// ── Invites ────────────────────────────────────────────────────────────

const INVITE_GRID = '1.6fr 140px 130px 1fr 190px';

const STATUS_TONE: Record<InviteStatus, { bg: string; fg: string; label: string }> = {
  pending: { bg: COLOR.infoSoft, fg: COLOR.info, label: 'PENDING' },
  accepted: { bg: COLOR.successSoft, fg: COLOR.success, label: 'ACCEPTED' },
  revoked: { bg: 'rgba(60,20,15,0.06)', fg: COLOR.inkMute, label: 'REVOKED' },
  expired: { bg: COLOR.warnSoft, fg: COLOR.warn, label: 'EXPIRED' },
};

function InvitesTable({
  invites,
  roleByKey,
  canManage,
  onChanged,
}: {
  invites: AdminInvite[];
  roleByKey: Map<string, AdminRole>;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  async function act(id: string, op: 'resend' | 'revoke') {
    setBusy(id);
    setError(null);
    setManualLink(null);
    try {
      const res = await writeInvite({ op, id });
      if (res.acceptUrl) setManualLink(res.acceptUrl);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  if (!invites.length) {
    return (
      <Glass padding={0} radius={20}>
        <EmptyState title="No invitations yet" subtitle="Invite a teammate to get started" />
      </Glass>
    );
  }

  return (
    <>
      {error && <ErrorNote>{error}</ErrorNote>}
      {manualLink && <ManualLinkNote url={manualLink} onDismiss={() => setManualLink(null)} />}
      <Glass padding={0} radius={20}>
        <HeaderRow
          columns={['Invitee', 'Role', 'Status', 'Sent', 'Actions']}
          grid={INVITE_GRID}
        />
        {invites.map((inv) => {
          const tone = STATUS_TONE[inv.status];
          const role = roleByKey.get(inv.role_key);
          return (
            <div
              key={inv.id}
              style={{
                display: 'grid',
                gridTemplateColumns: INVITE_GRID,
                gap: 14,
                padding: '13px 22px',
                alignItems: 'center',
                borderBottom: '0.5px solid rgba(60,20,15,0.04)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: COLOR.ink }}>
                  {inv.display_name || inv.email.split('@')[0]}
                </div>
                <div style={ellipsis}>{inv.email}</div>
              </div>
              <RolePill role={role} fallback={inv.role_key} />
              <span
                style={{
                  justifySelf: 'start',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: tone.bg,
                  color: tone.fg,
                }}
              >
                {tone.label}
              </span>
              <div style={{ fontSize: 12, color: COLOR.inkSoft }}>
                {fmtAgo(new Date(inv.last_sent_at).getTime())}
                {inv.send_count > 1 && ` · ${inv.send_count}×`}
                {inv.invited_by_name && ` · by ${inv.invited_by_name}`}
                {inv.status === 'pending' && (
                  <div style={{ fontSize: 11, color: COLOR.inkMute }}>
                    expires {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {canManage && (inv.status === 'pending' || inv.status === 'expired') && (
                  <>
                    <button
                      style={{ ...btnSecondary, padding: '6px 10px', fontSize: 12 }}
                      disabled={busy === inv.id}
                      onClick={() => void act(inv.id, 'resend')}
                    >
                      {busy === inv.id ? '…' : 'Resend'}
                    </button>
                    <button
                      style={{
                        ...btnSecondary,
                        padding: '6px 10px',
                        fontSize: 12,
                        color: COLOR.danger,
                      }}
                      disabled={busy === inv.id}
                      onClick={() => void act(inv.id, 'revoke')}
                    >
                      Revoke
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </Glass>
    </>
  );
}

function InviteModal({
  open,
  roles,
  onClose,
  onSent,
}: {
  open: boolean;
  roles: AdminRole[];
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; url?: string } | null>(null);

  // Owner last, and nothing preselected: an invitation should never default to
  // the most powerful role someone forgot to change.
  const assignable = roles.filter((r) => r.key !== 'owner').concat(roles.filter((r) => r.key === 'owner'));
  const chosen = roles.find((r) => r.key === roleKey);
  const summary = summarizePermissions(chosen?.permissions ?? []);
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && Boolean(roleKey);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await writeInvite({
        op: 'create',
        email: email.trim(),
        roleKey,
        displayName: displayName.trim() || undefined,
        expiresInDays,
      });
      if (res.acceptUrl) {
        // Email didn't go out — show the link so the invite still works.
        setResult({ status: res.delivery?.error ?? 'Email not sent', url: res.acceptUrl });
      } else {
        setEmail('');
        setDisplayName('');
        onSent();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invitation');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} width={560} ariaLabel="Invite teammate">
      <div style={{ padding: 26, overflowY: 'auto' }}>
        <ModalHeader title="Invite a teammate" onClose={onClose} />
        {result ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ fontSize: 13, color: COLOR.ink, lineHeight: 1.55 }}>
              The invitation was created, but the email couldn’t be delivered
              ({result.status}). Send them this single-use link yourself — it’s
              shown once and never stored in the clear.
            </div>
            <code style={codeBox}>{result.url}</code>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                style={btnPrimary}
                onClick={() => void navigator.clipboard?.writeText(result.url ?? '')}
              >
                Copy link
              </button>
              <button
                style={btnSecondary}
                onClick={() => {
                  setResult(null);
                  onSent();
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 13 }}>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@clinic.com"
                style={inputStyle}
              />
            </Field>
            <Field label="Name (optional)">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={inputStyle}
                placeholder="How they should be greeted"
              />
            </Field>
            <Field label="Role">
              <select
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
                style={inputStyle}
              >
                <option value="">Choose a role…</option>
                {assignable.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </Field>
            {chosen && (
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.6)',
                  border: '0.5px solid rgba(60,20,15,0.07)',
                }}
              >
                <div style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.55 }}>
                  {chosen.description}
                </div>
                <div style={{ fontSize: 11.5, color: COLOR.inkMute, marginTop: 6 }}>
                  {chosen.key === 'owner'
                    ? 'Every permission, present and future.'
                    : `${summary.count} of ${summary.total} permissions · ${summary.areas.join(' · ') || 'no areas'}`}
                </div>
              </div>
            )}
            <Field label="Link expires in" help="Between 1 and 30 days. Resending issues a fresh link.">
              <select
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                style={inputStyle}
              >
                {[1, 3, 7, 14, 30].map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
              <button
                style={{ ...btnPrimary, opacity: valid && !busy ? 1 : 0.5 }}
                disabled={!valid || busy}
                onClick={() => void submit()}
              >
                {busy ? 'Sending…' : 'Send invitation'}
              </button>
              <button style={btnSecondary} onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Roles ──────────────────────────────────────────────────────────────

function RolesGrid({
  roles,
  counts,
  canManage,
  isOwner,
  myPermissions,
  onChanged,
}: {
  roles: AdminRole[];
  counts: Record<string, number>;
  canManage: boolean;
  isOwner: boolean;
  myPermissions: string[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AdminRole | 'new' | null>(null);

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 14,
        }}
      >
        {roles.map((role) => {
          const summary = summarizePermissions(role.permissions);
          const members = counts[role.key] ?? 0;
          return (
            <Glass key={role.key} padding={18} radius={18}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800, color: COLOR.ink }}>{role.name}</div>
                {role.is_system && <SoftTag>BUILT-IN</SoftTag>}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: COLOR.inkSoft,
                  lineHeight: 1.55,
                  marginTop: 6,
                  minHeight: 56,
                }}
              >
                {role.description}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginTop: 10,
                }}
              >
                {(role.key === 'owner' ? ['Everything'] : summary.areas).map((area) => (
                  <span key={area} style={areaChip}>
                    {area}
                  </span>
                ))}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: '0.5px solid rgba(60,20,15,0.07)',
                }}
              >
                <div style={{ fontSize: 11.5, color: COLOR.inkMute, fontFamily: 'var(--pbt-mono)' }}>
                  {role.key === 'owner' ? 'ALL' : `${summary.count}/${summary.total}`} ·{' '}
                  {members} member{members === 1 ? '' : 's'}
                </div>
                <button
                  style={{ ...btnSecondary, padding: '6px 12px', fontSize: 12 }}
                  onClick={() => setEditing(role)}
                >
                  {canManage && role.key !== 'owner' ? 'Edit' : 'View'}
                </button>
              </div>
            </Glass>
          );
        })}

        {canManage && (
          <Glass padding={18} radius={18}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: COLOR.ink }}>Custom role</div>
            <div style={{ fontSize: 12.5, color: COLOR.inkSoft, lineHeight: 1.55, marginTop: 6, minHeight: 56 }}>
              Build a role from any mix of permissions — useful for contractors,
              auditors, or a team that should see analytics but touch nothing.
            </div>
            <button style={{ ...btnPrimary, marginTop: 12 }} onClick={() => setEditing('new')}>
              + New role
            </button>
          </Glass>
        )}
      </div>

      {editing && (
        <RoleEditor
          role={editing === 'new' ? null : editing}
          canManage={canManage}
          isOwner={isOwner}
          myPermissions={myPermissions}
          memberCount={editing === 'new' ? 0 : (counts[editing.key] ?? 0)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function RoleEditor({
  role,
  canManage,
  isOwner,
  myPermissions,
  memberCount,
  onClose,
  onSaved,
}: {
  role: AdminRole | null;
  canManage: boolean;
  isOwner: boolean;
  myPermissions: string[];
  memberCount: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const readOnly = !canManage || role?.key === 'owner';
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isOwnerRole = role?.key === 'owner';
  const summary = summarizePermissions(selected);

  function toggle(key: Permission, on: boolean) {
    setSelected((prev) =>
      on ? withImpliedPermissions([...prev, key]) : withoutDependents(prev, key),
    );
  }

  function toggleCategory(keys: Permission[], on: boolean) {
    setSelected((prev) => {
      if (on) return withImpliedPermissions([...prev, ...keys.filter((k) => grantable(k))]);
      let next = prev;
      for (const k of keys) next = withoutDependents(next, k);
      return next;
    });
  }

  /** Can the current admin hand this permission out at all? */
  const grantable = (key: string) => isOwner || myPermissions.includes(key);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await writeRole(
        role
          ? { op: 'update', key: role.key, name, description, permissions: selected }
          : { op: 'create', name, description, permissions: selected },
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the role');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await writeRole({ op: 'delete', key: role!.key });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the role');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} width={860} ariaLabel={role ? `Edit ${role.name}` : 'New role'}>
      <div style={{ padding: 26, overflowY: 'auto' }}>
        <ModalHeader title={role ? role.name : 'New role'} onClose={onClose} />

        {isOwnerRole && (
          <Callout tone="info">
            The Owner role always holds every permission, including any added in
            future releases. That’s what makes it safe as the last line of
            recovery — so it can’t be edited.
          </Callout>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 6 }}>
          <Field label="Role name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
              disabled={readOnly}
              placeholder="e.g. Regional Trainer"
            />
          </Field>
          <Field label="Members" help={role?.is_system ? 'Built-in role' : 'Custom role'}>
            <div style={{ ...inputStyle, background: 'transparent', border: 'none', paddingLeft: 0 }}>
              {memberCount} account{memberCount === 1 ? '' : 's'}
            </div>
          </Field>
        </div>
        <Field label="Description" help="Shown wherever this role is offered.">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: 58, resize: 'vertical' }}
            disabled={readOnly}
          />
        </Field>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            margin: '18px 0 10px',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, color: COLOR.ink }}>Permissions</div>
          <div style={{ fontSize: 11.5, color: COLOR.inkMute, fontFamily: 'var(--pbt-mono)' }}>
            {isOwnerRole ? 'ALL' : `${summary.count} / ${summary.total}`}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {PERMISSION_CATEGORIES.map((cat) => {
            const keys = cat.permissions.map((p) => p.key);
            const allOn = isOwnerRole || keys.every((k) => selected.includes(k));
            return (
              <div
                key={cat.key}
                style={{
                  borderRadius: 14,
                  border: '0.5px solid rgba(60,20,15,0.08)',
                  background: 'rgba(255,255,255,0.55)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 15px',
                    background: 'rgba(255,255,255,0.6)',
                    borderBottom: '0.5px solid rgba(60,20,15,0.06)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: COLOR.ink }}>{cat.label}</div>
                    <div style={{ fontSize: 11.5, color: COLOR.inkMute }}>{cat.description}</div>
                  </div>
                  {!readOnly && (
                    <button
                      style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11.5 }}
                      onClick={() => toggleCategory(keys, !allOn)}
                    >
                      {allOn ? 'Clear' : 'Select all'}
                    </button>
                  )}
                </div>
                <div style={{ padding: '6px 15px 12px' }}>
                  {cat.permissions.map((p) => {
                    const on = isOwnerRole || selected.includes(p.key);
                    const locked = readOnly || !grantable(p.key);
                    return (
                      <label
                        key={p.key}
                        style={{
                          display: 'flex',
                          gap: 10,
                          alignItems: 'flex-start',
                          padding: '8px 0',
                          cursor: locked ? 'default' : 'pointer',
                          opacity: locked && !on ? 0.45 : 1,
                          borderBottom: '0.5px solid rgba(60,20,15,0.04)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={locked}
                          onChange={(e) => toggle(p.key, e.target.checked)}
                          style={{ marginTop: 3 }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink }}>
                            {p.label}
                            {p.sensitive && <SoftTag tone="warn">SENSITIVE</SoftTag>}
                            {!grantable(p.key) && !readOnly && <SoftTag>NOT YOURS TO GRANT</SoftTag>}
                          </span>
                          <span
                            style={{
                              display: 'block',
                              fontSize: 11.5,
                              color: COLOR.inkMute,
                              lineHeight: 1.5,
                            }}
                          >
                            {p.description}
                            {p.requires?.length ? ` Requires: ${p.requires.join(', ')}.` : ''}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        {!readOnly && (
          <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
            <button
              style={{ ...btnPrimary, opacity: name.trim() && !busy ? 1 : 0.5 }}
              disabled={!name.trim() || busy}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : role ? 'Save changes' : 'Create role'}
            </button>
            <button style={btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <div style={{ flex: 1 }} />
            {role && !role.is_system && (
              confirmDelete ? (
                <>
                  <button
                    style={{ ...btnSecondary, color: COLOR.danger }}
                    disabled={busy}
                    onClick={() => void remove()}
                  >
                    Confirm delete
                  </button>
                  <button style={btnSecondary} onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <button
                  style={{ ...btnSecondary, color: COLOR.danger }}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete role
                </button>
              )
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Small shared bits ──────────────────────────────────────────────────

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
      <span style={{ fontSize: 20, fontWeight: 800, color: COLOR.ink, letterSpacing: '-0.02em' }}>
        {value}
      </span>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: COLOR.inkMute,
          fontFamily: 'var(--pbt-mono)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function HeaderRow({ columns, grid }: { columns: string[]; grid: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: grid,
        gap: 14,
        padding: '13px 22px',
        background: 'rgba(255,255,255,0.5)',
        borderBottom: '0.5px solid rgba(60,20,15,0.06)',
      }}
    >
      {columns.map((c, i) => (
        <div
          key={`${c}-${i}`}
          style={{
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            color: COLOR.inkMute,
          }}
        >
          {c}
        </div>
      ))}
    </div>
  );
}

function RolePill({ role, fallback }: { role?: AdminRole; fallback: string | null }) {
  const owner = role?.key === 'owner';
  return (
    <span
      style={{
        justifySelf: 'start',
        fontSize: 11,
        fontWeight: 800,
        padding: '4px 9px',
        borderRadius: 7,
        background: owner ? COLOR.brandSoft : 'rgba(60,20,15,0.06)',
        color: owner ? COLOR.brand : COLOR.inkSoft,
        whiteSpace: 'nowrap',
      }}
    >
      {role?.name ?? fallback ?? '—'}
    </span>
  );
}

function SoftTag({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <span
      style={{
        marginLeft: 7,
        fontSize: 9,
        fontWeight: 800,
        letterSpacing: '0.09em',
        padding: '2px 5px',
        borderRadius: 4,
        background: tone === 'warn' ? COLOR.warnSoft : 'rgba(60,20,15,0.07)',
        color: tone === 'warn' ? COLOR.warn : COLOR.inkMute,
        verticalAlign: 'middle',
      }}
    >
      {children}
    </span>
  );
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: COLOR.ink }}>{title}</h2>
      <ModalCloseButton onClose={onClose} />
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        color: COLOR.danger,
        background: COLOR.dangerSoft,
        padding: '9px 12px',
        borderRadius: 10,
        marginTop: 10,
      }}
    >
      {children}
    </div>
  );
}

export function Callout({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'warn' | 'success' }) {
  const map = {
    info: { bg: COLOR.infoSoft, fg: COLOR.info },
    warn: { bg: COLOR.warnSoft, fg: COLOR.warn },
    success: { bg: COLOR.successSoft, fg: COLOR.success },
  }[tone];
  return (
    <div
      style={{
        fontSize: 12.5,
        lineHeight: 1.55,
        color: map.fg,
        background: map.bg,
        padding: '11px 14px',
        borderRadius: 12,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function ManualLinkNote({ url, onDismiss }: { url: string; onDismiss: () => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 14px',
        borderRadius: 12,
        background: COLOR.warnSoft,
        color: COLOR.warn,
        fontSize: 12.5,
      }}
    >
      <span style={{ fontWeight: 700 }}>Email not delivered — share this link:</span>
      <code style={{ ...codeBox, flex: 1, margin: 0 }}>{url}</code>
      <button style={{ ...btnSecondary, padding: '5px 10px' }} onClick={() => void navigator.clipboard?.writeText(url)}>
        Copy
      </button>
      <button style={{ ...btnSecondary, padding: '5px 10px' }} onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

const ellipsis: React.CSSProperties = {
  fontSize: 11.5,
  color: COLOR.inkMute,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const areaChip: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(60,20,15,0.05)',
  color: COLOR.inkSoft,
};

const codeBox: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--pbt-mono)',
  fontSize: 11.5,
  padding: '10px 12px',
  borderRadius: 10,
  background: 'rgba(60,20,15,0.05)',
  color: COLOR.ink,
  wordBreak: 'break-all',
};
