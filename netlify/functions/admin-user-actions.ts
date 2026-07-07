/**
 * Admin: user & admin account management (write ops). POST only.
 *
 * Body: { op, ... }
 *   { op: 'set_admin',    userId, value: boolean }   — promote / demote admin
 *   { op: 'set_disabled', userId, value: boolean }   — disable / enable (Auth ban)
 *   { op: 'create',       email, password, displayName?, isAdmin? }
 *   { op: 'delete',       userId }
 *
 * Guardrails (return 400 rather than lock the platform out):
 *   - You cannot demote, disable, or delete YOUR OWN account.
 *   - You cannot demote/disable/delete the LAST active admin.
 *
 * Every action is mirrored to admin_audit_log (entity_type 'user').
 * Disable is mirrored to a Supabase Auth ban so the user can't sign in.
 */
import {
  errorResponse,
  jsonResponse,
  requireAdmin,
  writeAuditLog,
  type AdminCtx,
} from './_shared/admin';

const BAN_FOREVER = '876000h'; // ~100 years

interface ProfileRow {
  user_id: string;
  is_admin: boolean;
  disabled: boolean;
  display_name: string | null;
}

async function getProfile(ctx: AdminCtx, userId: string): Promise<ProfileRow | null> {
  const { data } = await ctx.sb
    .from('profiles')
    .select('user_id, is_admin, disabled, display_name')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as ProfileRow | null) ?? null;
}

/** Number of admins who can still act (admin + not disabled). */
async function countActiveAdmins(ctx: AdminCtx): Promise<number> {
  const { count } = await ctx.sb
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_admin', true)
    .eq('disabled', false);
  return count ?? 0;
}

/** True if removing/demoting/disabling `target` would drop active admins to 0. */
function wouldOrphanAdmins(target: ProfileRow, activeAdmins: number): boolean {
  return target.is_admin && !target.disabled && activeAdmins <= 1;
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  const op = body.op;
  const actingId = ctx.user.id;

  try {
    // ── Create ────────────────────────────────────────────────
    if (op === 'create') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const displayName = body.displayName ? String(body.displayName).trim() : null;
      const isAdmin = body.isAdmin === true;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return errorResponse(400, 'Valid email required');
      if (password.length < 8) return errorResponse(400, 'Password must be at least 8 characters');

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
        is_admin: isAdmin,
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
        after: { email, display_name: displayName, is_admin: isAdmin },
      });
      return jsonResponse({ ok: true, user_id: newId });
    }

    const userId = String(body.userId ?? '');
    if (!userId) return errorResponse(400, 'userId required');
    const target = await getProfile(ctx, userId);
    if (!target) return errorResponse(404, 'User not found');

    // ── Promote / demote admin ─────────────────────────────────
    if (op === 'set_admin') {
      const value = body.value === true;
      if (!value) {
        if (userId === actingId) return errorResponse(400, "You can't remove your own admin access.");
        if (wouldOrphanAdmins(target, await countActiveAdmins(ctx))) {
          return errorResponse(400, "Can't demote the last active admin.");
        }
      }
      const { error } = await ctx.sb.from('profiles').update({ is_admin: value }).eq('user_id', userId);
      if (error) return errorResponse(500, error.message);
      await writeAuditLog(ctx, {
        entity_type: 'user',
        entity_id: userId,
        action: 'update',
        before: { is_admin: target.is_admin },
        after: { is_admin: value },
      });
      return jsonResponse({ ok: true });
    }

    // ── Disable / enable (Auth ban mirror) ─────────────────────
    if (op === 'set_disabled') {
      const value = body.value === true;
      if (value) {
        if (userId === actingId) return errorResponse(400, "You can't disable your own account.");
        if (wouldOrphanAdmins(target, await countActiveAdmins(ctx))) {
          return errorResponse(400, "Can't disable the last active admin.");
        }
      }
      const { error: banErr } = await ctx.sb.auth.admin.updateUserById(userId, {
        ban_duration: value ? BAN_FOREVER : 'none',
      });
      if (banErr) return errorResponse(500, banErr.message);
      const { error } = await ctx.sb.from('profiles').update({ disabled: value }).eq('user_id', userId);
      if (error) return errorResponse(500, error.message);
      await writeAuditLog(ctx, {
        entity_type: 'user',
        entity_id: userId,
        action: 'update',
        before: { disabled: target.disabled },
        after: { disabled: value },
      });
      return jsonResponse({ ok: true });
    }

    // ── Delete ─────────────────────────────────────────────────
    if (op === 'delete') {
      if (userId === actingId) return errorResponse(400, "You can't delete your own account.");
      if (wouldOrphanAdmins(target, await countActiveAdmins(ctx))) {
        return errorResponse(400, "Can't delete the last active admin.");
      }
      const { error } = await ctx.sb.auth.admin.deleteUser(userId);
      if (error) return errorResponse(500, error.message);
      await writeAuditLog(ctx, {
        entity_type: 'user',
        entity_id: userId,
        action: 'delete',
        before: { display_name: target.display_name, is_admin: target.is_admin },
      });
      return jsonResponse({ ok: true });
    }

    return errorResponse(400, `Unknown op: ${String(op)}`);
  } catch (err) {
    return errorResponse(500, err instanceof Error ? err.message : 'User action failed');
  }
};
