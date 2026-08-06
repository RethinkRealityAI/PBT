import { errorResponse, jsonResponse, requireAdmin } from './_shared/admin';
import { emailsByUserId } from './_shared/users';

/**
 * Admin: list users (profiles) enriched with their auth email, role, and
 * disabled flag. Email lives in auth.users, not profiles, so we merge it from
 * the Auth admin API by id.
 */
export default async (req: Request) => {
  const ctx = await requireAdmin(req, 'team.read');
  if (ctx instanceof Response) return ctx;

  // `admin_role` may not exist yet on a database that hasn't run the RBAC
  // migration — fall back to the legacy shape rather than failing the screen.
  let rows: Array<Record<string, unknown>> = [];
  const full = await ctx.sb
    .from('profiles')
    .select(
      'user_id, display_name, echo_primary, echo_secondary, is_admin, disabled, admin_role, permission_overrides, created_at',
    )
    .order('created_at', { ascending: false });
  if (full.error) {
    const legacy = await ctx.sb
      .from('profiles')
      .select('user_id, display_name, echo_primary, echo_secondary, is_admin, disabled, created_at')
      .order('created_at', { ascending: false });
    if (legacy.error) return errorResponse(500, legacy.error.message);
    rows = (legacy.data ?? []).map((r) => ({ ...r, admin_role: r.is_admin ? 'admin' : null }));
  } else {
    rows = full.data ?? [];
  }

  // Best-effort — never fail the list just because the email lookup hiccups.
  let emails = new Map<string, string>();
  try {
    emails = await emailsByUserId(ctx.sb);
  } catch {
    // leave emails empty
  }

  return jsonResponse(
    rows.map((r) => ({
      ...r,
      permission_overrides: r.permission_overrides ?? {},
      email: emails.get(String(r.user_id)) ?? null,
    })),
  );
};
