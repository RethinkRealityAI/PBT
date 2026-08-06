/**
 * Admin: invitations to the admin portal.
 *
 *   GET                        → pending + recent invitations
 *   POST { op: 'create', … }   → mint a token, store its hash, send the email
 *   POST { op: 'resend', id }  → rotate the token and send again
 *   POST { op: 'revoke', id }  → kill a pending invitation
 *
 * The plaintext token exists only in the email. We store SHA-256 of it, so a
 * database leak can't be replayed into an admin account, and rotating on
 * resend means an intercepted first email stops working the moment you resend.
 */
import {
  OWNER_ROLE,
  isPermission,
  type Permission,
} from '../../src/shared/access/permissions';
import {
  can,
  errorResponse,
  jsonResponse,
  requireAdmin,
  writeAuditLog,
  type AdminCtx,
} from './_shared/admin';
import { generateToken, hashToken } from './_shared/secretbox';
import { loadEmailSettings, sendTemplateEmail } from './_shared/mailer';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 30;

interface InviteRow {
  id: string;
  email: string;
  role_key: string;
  display_name: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  send_count: number;
  last_sent_at: string;
  created_by: string | null;
  created_at: string;
}

export function inviteStatus(row: {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}): 'accepted' | 'revoked' | 'expired' | 'pending' {
  if (row.accepted_at) return 'accepted';
  if (row.revoked_at) return 'revoked';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'expired';
  return 'pending';
}

/** Base URL for links in the email — settings first, request origin as backup. */
function baseUrl(req: Request, configured: string): string {
  if (configured) return configured.replace(/\/+$/, '');
  try {
    return new URL(req.url).origin;
  } catch {
    return '';
  }
}

/** Guard: you can only hand out access you hold yourself. */
async function checkRoleGrantable(
  ctx: AdminCtx,
  roleKey: string,
): Promise<Response | { permissions: Permission[]; name: string; description: string }> {
  const { data } = await ctx.sb
    .from('admin_roles')
    .select('key, name, description, permissions')
    .eq('key', roleKey)
    .maybeSingle();
  if (!data) return errorResponse(400, 'Unknown role');
  if (roleKey === OWNER_ROLE && !can(ctx, 'owners.manage')) {
    return errorResponse(403, 'Only an owner can invite another owner.');
  }
  const permissions = ((data.permissions ?? []) as string[]).filter(isPermission);
  if (!ctx.access.isOwner) {
    const denied = permissions.filter((p) => !ctx.access.permissions.includes(p));
    if (denied.length) {
      return errorResponse(403, `That role includes permissions you don't hold: ${denied.join(', ')}`);
    }
  }
  return { permissions, name: String(data.name), description: String(data.description ?? '') };
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'team.read');
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const { data, error } = await ctx.sb
      .from('admin_invites')
      .select(
        'id, email, role_key, display_name, expires_at, accepted_at, revoked_at, send_count, last_sent_at, created_by, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return errorResponse(500, error.message);

    const rows = (data ?? []) as InviteRow[];
    // Resolve inviter display names in one pass rather than N lookups.
    const inviterIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
    const names = new Map<string, string>();
    if (inviterIds.length) {
      const { data: profiles } = await ctx.sb
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', inviterIds);
      for (const p of (profiles ?? []) as Array<{ user_id: string; display_name: string | null }>) {
        if (p.display_name) names.set(p.user_id, p.display_name);
      }
    }

    return jsonResponse({
      invites: rows.map((r) => ({
        ...r,
        status: inviteStatus(r),
        invited_by_name: r.created_by ? (names.get(r.created_by) ?? null) : null,
      })),
      canManage: can(ctx, 'invites.manage'),
    });
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');
  if (!can(ctx, 'invites.manage')) return errorResponse(403, 'Missing permission: invites.manage');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }
  const op = String(body.op ?? '');
  const settings = await loadEmailSettings(ctx.sb);
  const base = baseUrl(req, settings.appBaseUrl);

  // ── create ────────────────────────────────────────────────
  if (op === 'create') {
    const email = String(body.email ?? '').trim().toLowerCase();
    const roleKey = String(body.roleKey ?? '').trim();
    const displayName = body.displayName ? String(body.displayName).trim() : null;
    if (!EMAIL_RE.test(email)) return errorResponse(400, 'Valid email required');
    if (!roleKey) return errorResponse(400, 'Role required');

    const role = await checkRoleGrantable(ctx, roleKey);
    if (role instanceof Response) return role;

    const ttlDays = Math.min(MAX_TTL_DAYS, Math.max(1, Number(body.expiresInDays ?? DEFAULT_TTL_DAYS)));
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    // Supersede any live invitation for the same address — two valid tokens
    // for one person is a footgun, not a feature.
    await ctx.sb
      .from('admin_invites')
      .update({ revoked_at: new Date().toISOString(), revoked_by: ctx.user.id })
      .ilike('email', email)
      .is('accepted_at', null)
      .is('revoked_at', null);

    const token = generateToken();
    const { data: inserted, error } = await ctx.sb
      .from('admin_invites')
      .insert({
        email,
        role_key: roleKey,
        display_name: displayName,
        permission_overrides: sanitizeOverrides(body.permissionOverrides),
        token_hash: hashToken(token),
        expires_at: expiresAt.toISOString(),
        created_by: ctx.user.id,
      })
      .select('id')
      .single();
    if (error) return errorResponse(500, error.message);

    const send = await sendTemplateEmail({
      sb: ctx.sb,
      templateKey: 'admin_invite',
      to: email,
      settings,
      meta: { invite_id: inserted.id, role: roleKey, actor: ctx.user.id },
      vars: {
        name: displayName || email.split('@')[0],
        inviterName: await actorName(ctx),
        roleName: role.name,
        roleSummary: role.description,
        acceptUrl: `${base}/admin/invite?token=${token}`,
        expiresIn: `${ttlDays} day${ttlDays === 1 ? '' : 's'}`,
      },
    });

    await writeAuditLog(ctx, {
      entity_type: 'invite',
      entity_id: inserted.id,
      action: 'create',
      after: { email, role: roleKey, expires_at: expiresAt.toISOString(), delivery: send.status },
    });

    return jsonResponse({
      ok: true,
      id: inserted.id,
      delivery: send,
      // Returned so an admin can hand the link over directly when email
      // delivery isn't configured yet. Shown once, never stored.
      acceptUrl: send.status === 'sent' ? undefined : `${base}/admin/invite?token=${token}`,
    });
  }

  const id = String(body.id ?? '');
  if (!id) return errorResponse(400, 'id required');
  const { data: invite } = await ctx.sb
    .from('admin_invites')
    .select('id, email, role_key, display_name, expires_at, accepted_at, revoked_at, send_count')
    .eq('id', id)
    .maybeSingle();
  if (!invite) return errorResponse(404, 'Invitation not found');

  // ── resend ────────────────────────────────────────────────
  if (op === 'resend') {
    if (invite.accepted_at) return errorResponse(400, 'That invitation has already been accepted.');
    if (invite.revoked_at) return errorResponse(400, 'That invitation was revoked.');

    const role = await checkRoleGrantable(ctx, invite.role_key);
    if (role instanceof Response) return role;

    const ttlDays = DEFAULT_TTL_DAYS;
    const token = generateToken();
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const { error } = await ctx.sb
      .from('admin_invites')
      .update({
        token_hash: hashToken(token),
        expires_at: expiresAt.toISOString(),
        send_count: (invite.send_count ?? 1) + 1,
        last_sent_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) return errorResponse(500, error.message);

    const send = await sendTemplateEmail({
      sb: ctx.sb,
      templateKey: 'admin_invite',
      to: invite.email,
      settings,
      meta: { invite_id: id, resend: true, actor: ctx.user.id },
      vars: {
        name: invite.display_name || invite.email.split('@')[0],
        inviterName: await actorName(ctx),
        roleName: role.name,
        roleSummary: role.description,
        acceptUrl: `${base}/admin/invite?token=${token}`,
        expiresIn: `${ttlDays} days`,
      },
    });
    await writeAuditLog(ctx, {
      entity_type: 'invite',
      entity_id: id,
      action: 'update',
      after: { resent: true, delivery: send.status },
    });
    return jsonResponse({
      ok: true,
      delivery: send,
      acceptUrl: send.status === 'sent' ? undefined : `${base}/admin/invite?token=${token}`,
    });
  }

  // ── revoke ────────────────────────────────────────────────
  if (op === 'revoke') {
    if (invite.accepted_at) return errorResponse(400, 'That invitation has already been accepted.');
    const { error } = await ctx.sb
      .from('admin_invites')
      .update({ revoked_at: new Date().toISOString(), revoked_by: ctx.user.id })
      .eq('id', id);
    if (error) return errorResponse(500, error.message);
    await writeAuditLog(ctx, { entity_type: 'invite', entity_id: id, action: 'delete', before: invite });
    return jsonResponse({ ok: true });
  }

  return errorResponse(400, `Unknown op: ${op}`);
};

function sanitizeOverrides(raw: unknown): { grant: string[]; revoke: string[] } {
  const obj = (raw ?? {}) as { grant?: unknown; revoke?: unknown };
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(isPermission) : []);
  return { grant: list(obj.grant), revoke: list(obj.revoke) };
}

async function actorName(ctx: AdminCtx): Promise<string> {
  const { data } = await ctx.sb
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  return data?.display_name || ctx.user.email || 'A teammate';
}
