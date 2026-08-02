/**
 * Self-service account deletion (spec §9.11). POST only.
 *
 * The caller deletes THEIR OWN account — there is no `userId` in the body and
 * none is accepted; the target is always `ctx.user.id` resolved from the
 * verified JWT. (Admin-initiated deletion of *other* users lives in
 * `admin-user-actions` with op='delete'.)
 *
 * Guard: an admin who is the last ACTIVE admin cannot delete themselves, or
 * the platform would be left with no one who can administer it. Mirrors the
 * `wouldOrphanAdmins` check in admin-user-actions, including its compensating
 * post-check for the concurrent check-then-act race.
 *
 * ── Deletion order + cascade audit ────────────────────────────────────────
 * `auth.admin.deleteUser` only removes rows whose FK to `auth.users` is
 * `on delete cascade`. Everything declared `on delete set null` SURVIVES with
 * a null user_id, which is anonymisation, not deletion — so we delete those
 * explicitly first.
 *
 *   Cascades from auth.users (no action needed):
 *     profiles.user_id, training_sessions.user_id, pet_records.user_id,
 *     user_scenarios.creator_id
 *   Cascades transitively from training_sessions (no action needed, but we
 *   delete by user_id first anyway so an auth failure can't strand them):
 *     ai_call_telemetry.session_id, ai_turn_telemetry.session_id,
 *     rag_documents.session_id, rag_chunks.session_id
 *   `on delete set null` — MUST be deleted explicitly:
 *     nav_events.user_id, analyzer_events.user_id, session_feedback.user_id,
 *     platform_reports.user_id, and any ai_call_telemetry row with a null
 *     session_id (e.g. Pet Vision calls made outside a training session).
 *
 * Intentionally NOT deleted: `admin_audit_log.actor_id` (set null) — the audit
 * trail of admin actions must survive the actor, and it is anonymised by the
 * FK. Same for the `updated_by` columns on shared/global content
 * (scenario_overrides, simulation_config, knowledge_documents).
 */
import { errorResponse, jsonResponse, requireUser, type AdminCtx } from './_shared/admin';

/** Tables holding caller-owned rows that do NOT vanish with the auth user. */
const USER_OWNED_TABLES = [
  'nav_events',
  'analyzer_events',
  'session_feedback',
  'platform_reports',
  'ai_turn_telemetry',
  'ai_call_telemetry',
  'rag_chunks',
  'rag_documents',
] as const;

/** Number of admins who can still act (admin + not disabled). */
async function countActiveAdmins(ctx: AdminCtx): Promise<number> {
  const { count } = await ctx.sb
    .from('profiles')
    .select('user_id', { count: 'exact', head: true })
    .eq('is_admin', true)
    .eq('disabled', false);
  return count ?? 0;
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireUser(req);
  if (ctx instanceof Response) return ctx;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  const userId = ctx.user.id;

  try {
    const { data: profile } = await ctx.sb
      .from('profiles')
      .select('is_admin, disabled')
      .eq('user_id', userId)
      .maybeSingle();
    const isActiveAdmin = profile?.is_admin === true && profile?.disabled !== true;

    if (isActiveAdmin) {
      if ((await countActiveAdmins(ctx)) <= 1) {
        return errorResponse(
          400,
          "You're the last active admin — hand over admin access before deleting your account.",
        );
      }
      // Deleting an admin is irreversible, so route it through a demote first
      // and re-count: if a concurrent change landed in between, restore the
      // flag and abort rather than leave the platform admin-less.
      await ctx.sb.from('profiles').update({ is_admin: false }).eq('user_id', userId);
      if ((await countActiveAdmins(ctx)) === 0) {
        await ctx.sb.from('profiles').update({ is_admin: true }).eq('user_id', userId);
        return errorResponse(
          409,
          'A concurrent change would have removed the last active admin — aborted.',
        );
      }
    }

    // Explicit deletes for every `on delete set null` relation (see header).
    // A missing relation (partially-synced project) must not block deletion of
    // the account itself, so failures are logged and skipped.
    for (const table of USER_OWNED_TABLES) {
      const { error } = await ctx.sb.from(table).delete().eq('user_id', userId);
      if (error) console.warn(`[account-delete] ${table} cleanup failed`, error.message);
    }

    const { error: delErr } = await ctx.sb.auth.admin.deleteUser(userId);
    if (delErr) {
      // Restore the admin flag we stripped above — a transient auth failure
      // must not silently demote a still-existing admin.
      if (isActiveAdmin) {
        await ctx.sb.from('profiles').update({ is_admin: true }).eq('user_id', userId);
      }
      return errorResponse(500, delErr.message);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return errorResponse(500, err instanceof Error ? err.message : 'Account deletion failed');
  }
};
