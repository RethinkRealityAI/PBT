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

/** First defined env var wins. Returns empty string if all are missing. */
function envFirst(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return '';
}

export async function requireAdmin(req: Request): Promise<AdminCtx | Response> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return errorResponse(401, 'Missing bearer token');
  }
  const token = auth.slice('bearer '.length);

  // Accept the VITE_-prefixed names (default in our Netlify config) OR the
  // unprefixed Supabase-canonical names. Earlier code called envOrThrow on
  // the unprefixed name first, which threw before the fallback could run.
  const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const anonKey = envFirst(
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
  );
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !anonKey || !serviceKey) {
    const missing = [
      !url && 'SUPABASE_URL/VITE_SUPABASE_URL',
      !anonKey && 'SUPABASE_ANON_KEY/VITE_SUPABASE_PUBLISHABLE_KEY',
      !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ]
      .filter(Boolean)
      .join(', ');
    console.error('[admin] env missing:', missing);
    return errorResponse(500, `Server misconfigured: missing ${missing}`);
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

/**
 * Append a row to admin_audit_log. Best-effort — failures are logged but
 * don't block the calling function (the data write has already happened).
 */
export async function writeAuditLog(
  ctx: AdminCtx,
  entry: {
    entity_type: 'flag' | 'flag_rule' | 'scenario_override';
    entity_id: string;
    action: 'create' | 'update' | 'delete' | 'revert';
    before?: unknown;
    after?: unknown;
    note?: string;
  },
): Promise<void> {
  const { error } = await ctx.sb.from('admin_audit_log').insert({
    actor_id: ctx.user.id,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    note: entry.note ?? null,
  });
  if (error) console.error('[admin] audit log insert failed', error);
}

/**
 * Service-role Supabase client that does NOT require the caller to be an
 * admin. Used by the public `flags-resolve` endpoint, which serves resolved
 * flag values to anonymous + authed consumer-app sessions. Throws if the
 * required env vars are missing.
 */
export function getServiceClient(): SupabaseClient {
  const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceKey) {
    throw new Error('Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
