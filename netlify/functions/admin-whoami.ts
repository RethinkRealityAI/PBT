/**
 * Lightweight gate check — returns 200 with the user's id when they're an
 * admin, 401/403 otherwise. The admin app calls this right after sign-in
 * to decide whether to show the dashboard or the not-authorised screen.
 */
import { jsonResponse, requireAdmin } from './_shared/admin';

export default async (req: Request) => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;
  return jsonResponse({ user_id: ctx.user.id, email: ctx.user.email ?? null });
};
