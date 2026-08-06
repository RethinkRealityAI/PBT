/**
 * Lightweight gate check — returns 200 with the user's id, role, and effective
 * permissions when they're an admin, 401/403 otherwise. The admin app calls
 * this right after sign-in to decide whether to show the dashboard or the
 * not-authorised screen, and uses the permission list to decide which nav
 * entries exist. The server re-checks every call regardless.
 */
import { jsonResponse, requireAdmin } from './_shared/admin';

export default async (req: Request) => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const { data: profile } = await ctx.sb
    .from('profiles')
    .select('display_name')
    .eq('user_id', ctx.user.id)
    .maybeSingle();

  const { data: role } = ctx.access.role
    ? await ctx.sb.from('admin_roles').select('key, name').eq('key', ctx.access.role).maybeSingle()
    : { data: null };

  return jsonResponse({
    user_id: ctx.user.id,
    email: ctx.user.email ?? null,
    display_name: profile?.display_name ?? null,
    role: ctx.access.role,
    role_name: role?.name ?? ctx.access.role,
    is_owner: ctx.access.isOwner,
    permissions: ctx.access.permissions,
  });
};
