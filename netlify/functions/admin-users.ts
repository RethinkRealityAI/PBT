import { errorResponse, jsonResponse, requireAdmin } from './_shared/admin';

/**
 * Admin: list users (profiles) enriched with their auth email + disabled flag.
 * Email lives in auth.users, not profiles, so we merge it from the Auth admin
 * API by id. Capped at the first 1000 accounts (perPage max) — fine for the
 * current cohort size; paginate if the user base outgrows it.
 */
export default async (req: Request) => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  const { data, error } = await ctx.sb
    .from('profiles')
    .select(
      'user_id, display_name, echo_primary, echo_secondary, is_admin, disabled, created_at',
    )
    .order('created_at', { ascending: false });
  if (error) return errorResponse(500, error.message);

  // Merge in emails from the Auth admin API (best-effort — never fail the list
  // just because the email lookup hiccups).
  const emails = new Map<string, string>();
  try {
    const { data: authData } = await ctx.sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of authData?.users ?? []) {
      if (u.id && u.email) emails.set(u.id, u.email);
    }
  } catch {
    // leave emails empty
  }

  const rows = (data ?? []).map((r) => ({
    ...r,
    email: emails.get(r.user_id) ?? null,
  }));
  return jsonResponse(rows);
};
