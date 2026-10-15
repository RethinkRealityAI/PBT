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
 *     id (an unguessable UUID only that device and the admins ever see), and
 *     only while it is still anonymous (`writeAnonymousSession`);
 *   • one device creates at most `ANON_DAILY_CAP` rows a day;
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

/**
 * New anonymous rows one device may create per 24 hours. A real trainee —
 * even a shared clinic tablet on a training day — plays far fewer; the cap
 * only stops a script from filling the table under one device id.
 */
export const ANON_DAILY_CAP = 100;

export type AnonWrite = 'ok' | 'not_owner' | 'limit' | 'error';

/**
 * Write `fields` into the anonymous row `sessionId` owned by device `anonId`,
 * creating it when absent. Every step is guarded IN the statement, never by an
 * earlier read, so a sign-in claim committing mid-write can't be undone (the
 * old check-then-upsert sent `user_id: null` and could hand a just-claimed
 * session back to the device):
 *
 *   1. update the row WHERE it is still anonymous and this device's;
 *   2. none → the per-device daily cap, then insert-if-absent;
 *   3. lost the insert race → the guarded update once more; still nothing
 *      means the row belongs to an account or another device.
 *
 * `fields` must not carry the owner columns.
 */
export async function writeAnonymousSession(
  sb: SupabaseClient,
  sessionId: string,
  anonId: string,
  fields: Record<string, unknown>,
): Promise<AnonWrite> {
  const guardedUpdate = () =>
    sb
      .from('training_sessions')
      .update(fields)
      .eq('id', sessionId)
      .is('user_id', null)
      .eq('anon_session_id', anonId)
      .select('id');
  const wrote = (data: unknown) => Array.isArray(data) && data.length > 0;
  const fail = (step: string, message: string): AnonWrite => {
    console.warn(`[sessions] anonymous ${step} failed`, message);
    return 'error';
  };

  const updated = await guardedUpdate();
  if (updated.error) return fail('update', updated.error.message);
  if (wrote(updated.data)) return 'ok';

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await sb
    .from('training_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('anon_session_id', anonId)
    .gte('created_at', since);
  if (recent.error) return fail('cap lookup', recent.error.message);
  if ((recent.count ?? 0) >= ANON_DAILY_CAP) return 'limit';

  const inserted = await sb
    .from('training_sessions')
    .upsert({ id: sessionId, ...fields, user_id: null, anon_session_id: anonId }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (inserted.error) return fail('insert', inserted.error.message);
  if (wrote(inserted.data)) return 'ok';

  const retried = await guardedUpdate();
  if (retried.error) return fail('update', retried.error.message);
  return wrote(retried.data) ? 'ok' : 'not_owner';
}
