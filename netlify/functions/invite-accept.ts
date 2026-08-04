/**
 * Public: accept an admin invitation.
 *
 *   GET  ?token=…                       → { email, roleName, needsPassword }
 *   POST { token, password, displayName } → creates (or upgrades) the account
 *
 * Deliberately NOT behind requireAdmin — the whole point is that the invitee
 * has no account yet. Authorisation comes from the token: single-use, hashed
 * at rest, expiring, and revocable.
 *
 * If the address already has an account, the invitation grants the role but
 * never touches the password. Possession of a forwarded link should not be
 * enough to take over an existing account; that person signs in as they
 * already do, or uses password recovery.
 */
import { getServiceClient, errorResponse, jsonResponse } from './_shared/admin';
import { hashToken } from './_shared/secretbox';
import { findUserByEmail } from './_shared/users';
import { loadEmailSettings, sendTemplateEmail } from './_shared/mailer';

const MIN_PASSWORD = 10;

interface InviteRow {
  id: string;
  email: string;
  role_key: string;
  display_name: string | null;
  permission_overrides: { grant?: string[]; revoke?: string[] } | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

export default async (req: Request): Promise<Response> => {
  const sb = getServiceClient();

  const url = new URL(req.url);
  const token =
    url.searchParams.get('token') ??
    (req.method === 'POST' ? await peekTokenFromBody(req) : null);

  if (!token) return errorResponse(400, 'Missing invitation token');

  const { data, error } = await sb
    .from('admin_invites')
    .select(
      'id, email, role_key, display_name, permission_overrides, expires_at, accepted_at, revoked_at',
    )
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (error) return errorResponse(500, 'Could not read the invitation');

  const invite = data as InviteRow | null;
  // One message for every failure mode — a probe shouldn't learn whether a
  // token existed, was used, or simply expired.
  const invalid = () => errorResponse(410, 'This invitation link is no longer valid.');
  if (!invite) return invalid();
  if (invite.accepted_at || invite.revoked_at) return invalid();
  if (new Date(invite.expires_at).getTime() < Date.now()) return invalid();

  const { data: role } = await sb
    .from('admin_roles')
    .select('key, name, description')
    .eq('key', invite.role_key)
    .maybeSingle();

  const existing = await findUserByEmail(sb, invite.email);

  if (req.method === 'GET') {
    return jsonResponse({
      email: invite.email,
      displayName: invite.display_name,
      roleKey: invite.role_key,
      roleName: role?.name ?? invite.role_key,
      roleDescription: role?.description ?? '',
      expiresAt: invite.expires_at,
      // false → the address already has an account; they sign in instead.
      needsPassword: !existing,
    });
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  const body = (await readJson(req)) ?? {};
  const displayName =
    (typeof body.displayName === 'string' && body.displayName.trim()) ||
    invite.display_name ||
    null;

  let userId: string;

  if (existing) {
    userId = existing.id;
  } else {
    const password = String(body.password ?? '');
    if (password.length < MIN_PASSWORD) {
      return errorResponse(400, `Choose a password of at least ${MIN_PASSWORD} characters.`);
    }
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
      user_metadata: displayName ? { display_name: displayName } : {},
    });
    if (createErr || !created?.user) {
      return errorResponse(400, createErr?.message ?? 'Could not create the account');
    }
    userId = created.user.id;
  }

  const { error: profileErr } = await sb.from('profiles').upsert(
    {
      user_id: userId,
      ...(displayName ? { display_name: displayName } : {}),
      admin_role: invite.role_key,
      permission_overrides: invite.permission_overrides ?? {},
      disabled: false,
    },
    { onConflict: 'user_id' },
  );
  if (profileErr) return errorResponse(500, `Could not grant access: ${profileErr.message}`);

  // Mark accepted last: if anything above failed the link still works, and the
  // conditional guards against two tabs racing the same token.
  const { data: claimed } = await sb
    .from('admin_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_user_id: userId })
    .eq('id', invite.id)
    .is('accepted_at', null)
    .select('id');
  if (!claimed?.length) return invalid();

  await sb.from('admin_audit_log').insert({
    actor_id: userId,
    entity_type: 'invite',
    entity_id: invite.id,
    action: 'update',
    after: { accepted: true, role: invite.role_key, user_id: userId },
    note: 'Invitation accepted',
  });

  // Welcome mail is a courtesy; a delivery failure must not fail acceptance.
  const settings = await loadEmailSettings(sb);
  void sendTemplateEmail({
    sb,
    templateKey: 'role_changed',
    to: invite.email,
    settings,
    meta: { invite_id: invite.id, reason: 'invite_accepted' },
    vars: {
      name: displayName || invite.email.split('@')[0],
      roleName: role?.name ?? invite.role_key,
      roleSummary: role?.description ?? '',
      actorName: 'your team',
      adminUrl: `${settings.appBaseUrl || new URL(req.url).origin}/admin`,
    },
  }).catch(() => {});

  return jsonResponse({ ok: true, email: invite.email, existingAccount: Boolean(existing) });
};

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** POST bodies carry the token too, so GET-style query params stay optional. */
async function peekTokenFromBody(req: Request): Promise<string | null> {
  const body = await readJson(req.clone());
  const t = body?.token;
  return typeof t === 'string' && t ? t : null;
}
