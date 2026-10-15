/**
 * Anonymous training sessions — the server-side writes.
 *
 * A trainee without an account still produces a `training_sessions` row, owned
 * by the random per-device id the app keeps in `pbt:session_id` (column
 * `anon_session_id`) instead of a user id. Browsers can never read or write
 * such a row (RLS is `auth.uid() = user_id`, never true for a NULL owner), so
 * every write goes through the service role here, and every write is scoped:
 *
 *   • a row owned by an account is never touched by an anonymous request;
 *   • an anonymous row is only touched by a request carrying the SAME device
 *     id (an unguessable UUID only that device and the admins ever see);
 *   • nothing is written with `allowTelemetry: false` or in a preview — the
 *     callers check that before they get here.
 *
 * Writers: `session-save` (the conversation, when it ends or is left) and
 * `ai-evaluate` (the score). Migration `20261015000000_anonymous_sessions.sql`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type SessionOwner = { userId: string } | { anonId: string };

export type OwnerCheck = 'ok' | 'not_owner' | 'error';

/**
 * May a request acting as `owner` write row `sessionId`? A missing row is
 * fine (the write creates it).
 */
export async function checkSessionOwner(
  sb: SupabaseClient,
  sessionId: string,
  owner: SessionOwner,
): Promise<OwnerCheck> {
  const { data, error } = await sb
    .from('training_sessions')
    .select('user_id, anon_session_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) {
    console.warn('[sessions] ownership lookup failed', error.message);
    return 'error';
  }
  if (!data) return 'ok';
  const row = data as { user_id?: string | null; anon_session_id?: string | null };
  if ('userId' in owner) return row.user_id === owner.userId ? 'ok' : 'not_owner';
  return row.user_id == null && row.anon_session_id === owner.anonId ? 'ok' : 'not_owner';
}

/** The owner columns of a row written for `owner`. */
export function ownerColumns(owner: SessionOwner): { user_id: string | null; anon_session_id?: string } {
  return 'userId' in owner
    ? { user_id: owner.userId }
    : { user_id: null, anon_session_id: owner.anonId };
}
