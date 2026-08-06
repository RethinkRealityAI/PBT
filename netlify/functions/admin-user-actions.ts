/**
 * Admin: user & admin account management (write ops). POST only.
 *
 * Body: { op, ... }
 *   { op: 'set_role',      userId, roleKey|null }   — assign / clear a role
 *   { op: 'set_overrides', userId, grant[], revoke[] } — per-user exceptions
 *   { op: 'set_disabled',  userId, value: boolean } — disable / enable (Auth ban)
 *   { op: 'create',        email, password, displayName?, roleKey? }
 *   { op: 'delete',        userId }
 *   { op: 'set_admin',     userId, value }          — legacy alias for set_role
 *
 * Guardrails (return 4xx rather than lock the platform out):
 *   - You cannot demote, disable, or delete YOUR OWN account.
 *   - You cannot leave the platform with zero active owners.
 *   - Only an owner may act on another owner, or grant the owner role.
 *   - You cannot grant a role holding permissions you don't hold yourself.
 *
 * Every action is mirrored to admin_audit_log (entity_type 'user').
 * Disable is mirrored to a Supabase Auth ban so the user can't sign in.
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
import { loadEmailSettings, sendTemplateEmail } from './_shared/mailer';

const BAN_FOREVER = '876000h'; // ~100 years

interface ProfileRow {
  user_id: string;
  is_admin: boolean;
  disabled: boolean;
  display_name: string | null;
  admin_role: string | null;
  permission_overrides: { grant?: string[]; revoke?: string[] } | null;
}

async function getProfile(ctx: AdminCtx, userId: string): Promise<ProfileRow | null> {
  const { data } = await ctx.sb
    .from('profiles')
    .select('user_id, is_admin, disabled, display_name, admin_role, permission_overrides')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/** Owners who can still act (owner role + not disabled). */
async function countActiveOwners(ctx: AdminCtx): Promise<number> {
  const { count } = await ctx.sb
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('admin_role', OWNER_ROLE)
    .eq('disabled', false);
  return count ?? 0;
}

/** True if removing/demoting/disabling `target` would drop active owners to 0. */
function wouldOrphanOwners(target: ProfileRow, activeOwners: number): boolean {
  return target.admin_role === OWNER_ROLE && !target.disabled && activeOwners <= 1;
}

/** Only an owner may touch an owner — otherwise an admin could demote you. */
function blockedByOwnership(ctx: AdminCtx, target: ProfileRow): Response | null {
  if (target.admin_role === OWNER_ROLE && !ctx.access.isOwner) {
    return errorResponse(403, 'Only an owner can change another owner’s account.');
  }
  return null;
}

async function roleOrError(
  ctx: AdminCtx,
  roleKey: string,
): Promise<Response | { key: string; name: string; description: string; permissions: Permission[] }> {
  const { data } = await ctx.sb
    .from('admin_roles')
    .select('key, name, description, permissions')
    .eq('key', roleKey)
    .maybeSingle();
  if (!data) return errorResponse(400, 'Unknown role');
  if (roleKey === OWNER_ROLE && !can(ctx, 'owners.manage')) {
    return errorResponse(403, 'Only an owner can grant the Owner role.');
  }
  const permissions = ((data.permissions ?? []) as string[]).filter(isPermission);
  if (!ctx.access.isOwner) {
    const denied = permissions.filter((p) => !ctx.access.permissions.includes(p));
    if (denied.length) {
      return errorResponse(403, `That role includes permissions you don't hold: ${denied.join(', ')}`);
    }
  }
  return { key: roleKey, name: String(data.name), description: String(data.description ?? ''), permissions };
}

async function actorName(ctx: AdminCtx): Promise<string> {
  const { data } = await ctx.sb
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.user.id)
    .maybeSingle();
  return data?.display_name || ctx.user.email || 'An administrator';
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'team.read');
  if (ctx instanceof Response) return ctx;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  const rawOp = String(body.op ?? '');
  // Legacy alias: the old boolean promote/demote maps onto the role model.
  const op = rawOp === 'set_admin' ? 'set_role' : rawOp;
  const roleKeyFromLegacy = rawOp === 'set_admin' ? (body.value === true ? 'admin' : null) : undefined;
  const actingId = ctx.user.id;

  if (!can(ctx, 'team.manage') && op !== 'set_overrides') {
    return errorResponse(403, 'Missing permission: team.manage');
  }

  try {
    // ── Create ────────────────────────────────────────────────
    if (op === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const displayName = body.displayName ? String(body.displayName).trim() : null;
      const roleKey = body.roleKey
        ? String(body.roleKey)
        : body.isAdmin === true
          ? 'admin'
          : null;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errorResponse(400, 'Valid email required');
      if (password.length < 8) return errorResponse(400, 'Password must be at least 8 characters');

      if (roleKey) {
        const role = await roleOrError(ctx, roleKey);
        if (role instanceof Response) return role;
      }

      const { data: created, error: createErr } = await ctx.sb.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: displayName ? { display_name: displayName } : {},
      });
      if (createErr || !created.user) {
        return errorResponse(400, createErr?.message ?? 'Could not create user');
      }
      const newId = created.user.id;
      const { error: profErr } = await ctx.sb.from('profiles').upsert({
        user_id: newId,
        display_name: displayName,
        admin_role: roleKey,
      });
      if (profErr) {
        // Roll back the auth user so we don't leave an orphan without a profile.
        await ctx.sb.auth.admin.deleteUser(newId).catch(() => {});
        return errorResponse(500, `Profile create failed: ${profErr.message}`);
      }
      await writeAuditLog(ctx, {
        entity_type: 'user',
        entity_id: newId,
        action: 'create',
        after: { email, display_name: displayName, admin_role: roleKey },
      });
      return jsonResponse({ ok: true, user_id: newId });
    }

    const userId = String(body.userId ?? '');
    if (!userId) return errorResponse(400, 'userId required');
    const target = await getProfile(ctx, userId);
    if (!target) return errorResponse(404, 'User not found');

    const ownershipBlock = blockedByOwnership(ctx, target);
    if (ownershipBlock) return ownershipBlock;

    // ── Assign / clear role ────────────────────────────────────
    if (op === 'set_role') {
      const nextKeyRaw =
        roleKeyFromLegacy !== undefined
          ? roleKeyFromLegacy
          : body.roleKey === null || body.roleKey === ''
            ? null
            : String(body.roleKey ?? '');
      const nextKey = nextKeyRaw || null;

      if (nextKey) {
        const role = await roleOrError(ctx, nextKey);
        if (role instanceof Response) return role;
        if (target.disabled) {
          // A disabled admin can't sign in and doesn't count toward the active
          // pool — granting the role would be phantom coverage.
          return errorResponse(400, 'Enable the account before granting admin access.');
        }
      }

      const losingOwnership = target.admin_role === OWNER_ROLE && nextKey !== OWNER_ROLE;
      if (losingOwnership) {
        if (userId === actingId) return errorResponse(400, "You can't remove your own owner access.");
        if (wouldOrphanOwners(target, await countActiveOwners(ctx))) {
          return errorResponse(400, "Can't demote the last active owner.");
        }
      }
      if (!nextKey && userId === actingId) {
        return errorResponse(400, "You can't remove your own admin access.");
      }

      const { error } = await ctx.sb
        .from('profiles')
        .update({ admin_role: nextKey })
        .eq('user_id', userId);
      if (error) return errorResponse(500, error.message);

      if (losingOwnership && (await countActiveOwners(ctx)) === 0) {
        // Compensate the check-then-act race: two owners demoting each other
        // concurrently can both pass the pre-check. Whoever lands second (or
        // both) reverts, failing safe toward "still an owner".
        await ctx.sb.from('profiles').update({ admin_role: OWNER_ROLE }).eq('user_id', userId);
        return errorResponse(409, 'Concurrent change would have removed the last active owner — reverted.');
      }

      await writeAuditLog(ctx, {
        entity_type: 'user',
        entity_id: userId,
        action: 'update',
        before: { admin_role: target.admin_role },
        after: { admin_role: nextKey },
      });

      // Tell them their access changed — silent permission changes are how
      // people end up confused about what they can see.
      if (nextKey && nextKey !== target.admin_role) {
        void notifyRoleChange(ctx, userId, nextKey).catch(() => {});
      }
      return jsonResponse({ ok: true });
    }

    // ── Per-user permission exceptions ─────────────────────────
    if (op === 'set_overrides') {
      if (!can(ctx, 'roles.manage')) return errorResponse(403, 'Missing permission: roles.manage');
      const grant = asPermissions(body.grant);
      const revoke = asPermissions(body.revoke);
      if (!ctx.access.isOwner) {
        const denied = grant.filter((p) => !ctx.access.permissions.includes(p));
        if (denied.length) {
          return errorResponse(403, `You can't grant permissions you don't hold: ${denied.join(', ')}`);
        }
      }
      const { error } = await ctx.sb
        .from('profiles')
        .update({ permission_overrides: { grant, revoke } })
        .eq('user_id', userId);
      if (error) return errorResponse(500, error.message);
      await writeAuditLog(ctx, {
        entity_type: 'user',
        entity_id: userId,
        action: 'update',
        before: { permission_overrides: target.permission_overrides },
        after: { permission_overrides: { grant, revoke } },
      });
      return jsonResponse({ ok: true });
    }

    // ── Disable / enable (Auth ban mirror) ─────────────────────
    if (op === 'set_disabled') {
      const value = body.value === true;
      if (value) {
        if (userId === actingId) return errorResponse(400, "You can't disable your own account.");
        if (wouldOrphanOwners(target, await countActiveOwners(ctx))) {
          return errorResponse(400, "Can't disable the last active owner.");
        }
      }
      const { error: banErr } = await ctx.sb.auth.admin.updateUserById(userId, {
        ban_duration: value ? BAN_FOREVER : 'none',
      });
      if (banErr) return errorResponse(500, banErr.message);
      const { error } = await ctx.sb.from('profiles').update({ disabled: value }).eq('user_id', userId);
      if (error) return errorResponse(500, error.message);
      if (value && target.admin_role === OWNER_ROLE && (await countActiveOwners(ctx)) === 0) {
        // Same compensating post-check as set_role: concurrent mutual disables
        // both pass the pre-check; revert (profile + ban) and 409.
        await ctx.sb.from('profiles').update({ disabled: false }).eq('user_id', userId);
        await ctx.sb.auth.admin.updateUserById(userId, { ban_duration: 'none' }).catch(() => {});
        return errorResponse(409, 'Concurrent change would have disabled the last active owner — reverted.');
      }
      await writeAuditLog(ctx, {
        entity_type: 'user',
        entity_id: userId,
        action: 'update',
        before: { disabled: target.disabled },
        after: { disabled: value },
      });
      if (value) void notifyDisabled(ctx, userId, target.display_name).catch(() => {});
      return jsonResponse({ ok: true });
    }

    // ── Delete ─────────────────────────────────────────────────
    if (op === 'delete') {
      if (userId === actingId) return errorResponse(400, "You can't delete your own account.");
      if (wouldOrphanOwners(target, await countActiveOwners(ctx))) {
        return errorResponse(400, "Can't delete the last active owner.");
      }
      if (target.admin_role === OWNER_ROLE && !target.disabled) {
        // Deleting an active owner can't be reverted, so route it through the
        // race-compensated demote first: clear the role, re-count, and abort
        // (restoring it) if that would leave zero active owners.
        await ctx.sb.from('profiles').update({ admin_role: null }).eq('user_id', userId);
        if ((await countActiveOwners(ctx)) === 0) {
          await ctx.sb.from('profiles').update({ admin_role: OWNER_ROLE }).eq('user_id', userId);
          return errorResponse(409, 'Concurrent change would have deleted the last active owner — aborted.');
        }
      }
      const { error } = await ctx.sb.auth.admin.deleteUser(userId);
      if (error) {
        // Deletion failed after the demote step — restore the role so a
        // transient auth error doesn't silently strip access.
        if (target.admin_role === OWNER_ROLE && !target.disabled) {
          await ctx.sb
            .from('profiles')
            .update({ admin_role: OWNER_ROLE })
            .eq('user_id', userId)
            .then(
              () => {},
              () => {},
            );
        }
        return errorResponse(500, error.message);
      }
      await writeAuditLog(ctx, {
        entity_type: 'user',
        entity_id: userId,
        action: 'delete',
        before: { display_name: target.display_name, admin_role: target.admin_role },
      });
      return jsonResponse({ ok: true });
    }

    return errorResponse(400, `Unknown op: ${String(rawOp)}`);
  } catch (err) {
    return errorResponse(500, err instanceof Error ? err.message : 'User action failed');
  }
};

function asPermissions(raw: unknown): Permission[] {
  return Array.isArray(raw) ? raw.filter(isPermission) : [];
}

async function notifyRoleChange(ctx: AdminCtx, userId: string, roleKey: string): Promise<void> {
  const [{ data: role }, { data: profile }] = await Promise.all([
    ctx.sb.from('admin_roles').select('name, description').eq('key', roleKey).maybeSingle(),
    ctx.sb.from('profiles').select('display_name').eq('user_id', userId).maybeSingle(),
  ]);
  const email = await emailFor(ctx, userId);
  if (!email) return;
  const settings = await loadEmailSettings(ctx.sb);
  await sendTemplateEmail({
    sb: ctx.sb,
    templateKey: 'role_changed',
    to: email,
    settings,
    meta: { user_id: userId, role: roleKey, actor: ctx.user.id },
    vars: {
      name: profile?.display_name || email.split('@')[0],
      roleName: role?.name ?? roleKey,
      roleSummary: role?.description ?? '',
      actorName: await actorName(ctx),
      adminUrl: `${settings.appBaseUrl}/admin`,
    },
  });
}

async function notifyDisabled(ctx: AdminCtx, userId: string, displayName: string | null): Promise<void> {
  const email = await emailFor(ctx, userId);
  if (!email) return;
  await sendTemplateEmail({
    sb: ctx.sb,
    templateKey: 'account_disabled',
    to: email,
    meta: { user_id: userId, actor: ctx.user.id },
    vars: { name: displayName || email.split('@')[0] },
  });
}

async function emailFor(ctx: AdminCtx, userId: string): Promise<string | null> {
  const { data } = await ctx.sb.auth.admin.getUserById(userId);
  if (data?.user?.email) return data.user.email;
  return null;
}
