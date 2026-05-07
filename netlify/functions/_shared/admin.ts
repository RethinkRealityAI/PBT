/**
 * Shared admin-auth helper for Netlify Functions.
 *
 * Every admin-* endpoint goes through `requireAdmin()`:
 *   1. Reads the bearer JWT from Authorization header.
 *   2. Resolves the user via Supabase anon client (verifies the token).
 *   3. Checks `profiles.is_admin` via the service role.
 *   4. Returns either an HTTP error Response or { user, sb } where sb is a
 *      service-role client safe for cross-user reads.
 *
 * Service role key never reaches the client — it's only set in Netlify
 * env vars and read here at request time.
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export interface AdminCtx {
  user: User;
  sb: SupabaseClient;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

export function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...JSON_HEADERS, ...(init.headers ?? {}) },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, { status });
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export async function requireAdmin(req: Request): Promise<AdminCtx | Response> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return errorResponse(401, 'Missing bearer token');
  }
  const token = auth.slice('bearer '.length);

  let url: string;
  let anonKey: string;
  let serviceKey: string;
  try {
    url = envOrThrow('SUPABASE_URL') || envOrThrow('VITE_SUPABASE_URL');
    anonKey =
      process.env.SUPABASE_ANON_KEY ||
      envOrThrow('VITE_SUPABASE_PUBLISHABLE_KEY');
    serviceKey = envOrThrow('SUPABASE_SERVICE_ROLE_KEY');
  } catch (err) {
    console.error('[admin] env missing', err);
    return errorResponse(500, 'Server misconfigured');
  }

  // Anon client — used only to verify the caller's JWT.
  const anon = createClient(url, anonKey);
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData.user) {
    return errorResponse(401, 'Invalid token');
  }

  // Service role client — bypasses RLS for cross-user admin reads.
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Check admin flag.
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('is_admin')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (profileErr) {
    console.error('[admin] profile lookup failed', profileErr);
    return errorResponse(500, 'Profile lookup failed');
  }
  if (!profile?.is_admin) {
    return errorResponse(403, 'Not an admin');
  }

  return { user: userData.user, sb };
}

/** Helper to parse `?since=&limit=&completed=` from a Netlify Request. */
export function readRange(req: Request): { since: string; limit: number } {
  const params = new URL(req.url).searchParams;
  const days = Number(params.get('days') ?? 28);
  const since =
    params.get('since') ??
    new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const limit = Math.min(5000, Number(params.get('limit') ?? 1000));
  return { since, limit };
}
