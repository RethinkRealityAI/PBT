/**
 * Supabase auth-only client.
 *
 * The admin app does NOT read application data through this client — every
 * data query goes via Netlify Functions (`/.netlify/functions/admin-*`)
 * using the service role server-side. The client is only here to:
 *   1. Sign the admin in (email + password against Supabase Auth).
 *   2. Surface a JWT we forward as Bearer to the Netlify Functions.
 *
 * Reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`, set in the
 * Netlify environment alongside the consumer app.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Admin: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set.',
    );
  }
  cached = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'pbt:admin_session',
    },
  });
  return cached;
}

/** Returns the current bearer token, or null if not signed in. */
export async function getAccessToken(): Promise<string | null> {
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
