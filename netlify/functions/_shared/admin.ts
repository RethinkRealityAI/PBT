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
import {
  hasPermission,
  resolveAccess,
  type Permission,
  type ResolvedAccess,
} from '../../../src/shared/access/permissions';

export interface AdminCtx {
  user: User;
  sb: SupabaseClient;
  /** Effective role + permissions for this caller. */
  access: ResolvedAccess;
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

/**
 * Load every role definition. Small table (7 system roles + any custom ones),
 * read once per request. Falls back to the code presets if the table is
 * missing — a deploy that runs ahead of its migration degrades to the built-in
 * roles instead of locking every admin out.
 */
export async function loadRoles(
  sb: SupabaseClient,
): Promise<Array<{ key: string; permissions: string[] }>> {
  const { data, error } = await sb.from('admin_roles').select('key, permissions');
  if (error || !data) return [];
  return data as Array<{ key: string; permissions: string[] }>;
}

/**
 * Gate an endpoint on a specific permission.
 *
 * `requireAdmin(req)` alone still means "any admin", which is the right bar for
 * the whoami probe only; every data endpoint names the permission it needs so
 * that narrowing a role in the portal actually narrows what its holders can
 * call. The UI hiding a screen is a convenience — this is the control.
 */
export async function requireAdmin(
  req: Request,
  permission?: Permission,
): Promise<AdminCtx | Response> {
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

  // Check admin flag + disabled state. The Auth ban set by admin-user-actions
  // blocks NEW sign-ins/refreshes, but an already-issued access token stays
  // valid until expiry — so a freshly disabled admin must also be rejected
  // here, not just at the auth layer.
  // `admin_role`/`permission_overrides` may not exist yet on a database that
  // hasn't run the RBAC migration, so select them defensively and fall back to
  // the legacy is_admin flag.
  let profile: {
    is_admin?: boolean;
    disabled?: boolean;
    admin_role?: string | null;
    permission_overrides?: { grant?: string[]; revoke?: string[] } | null;
  } | null = null;
  const full = await sb
    .from('profiles')
    .select('is_admin, disabled, admin_role, permission_overrides')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (full.error) {
    const legacy = await sb
      .from('profiles')
      .select('is_admin, disabled')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (legacy.error) {
      console.error('[admin] profile lookup failed', legacy.error);
      return errorResponse(500, 'Profile lookup failed');
    }
    profile = legacy.data;
  } else {
    profile = full.data;
  }

  if (!profile?.is_admin && !profile?.admin_role) {
    return errorResponse(403, 'Not an admin');
  }
  if (profile.disabled) {
    return errorResponse(403, 'Account disabled');
  }

  const access = resolveAccess({
    role: profile.admin_role ?? null,
    roles: await loadRoles(sb),
    overrides: profile.permission_overrides ?? null,
    legacyIsAdmin: profile.is_admin === true,
  });

  if (permission && !hasPermission(access, permission)) {
    return errorResponse(403, `Missing permission: ${permission}`);
  }

  return { user: userData.user, sb, access };
}

/** Permission check for branches inside a handler that already has a ctx. */
export function can(ctx: AdminCtx, permission: Permission): boolean {
  return hasPermission(ctx.access, permission);
}

/**
 * Like `requireAdmin`, but only proves WHO the caller is — no `is_admin`
 * requirement. For endpoints where a signed-in user acts on their OWN account
 * (e.g. `account-delete`). The returned `sb` is still the service-role client,
 * because self-service deletion has to reach `auth.admin.*` and tables whose
 * RLS only grants `select`/`insert` to the owner — so every caller of this
 * helper MUST scope its writes to `ctx.user.id` itself.
 *
 * Disabled accounts are rejected here for the same reason as in requireAdmin:
 * an already-issued access token outlives the Auth ban.
 */
export async function requireUser(req: Request): Promise<AdminCtx | Response> {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return errorResponse(401, 'Missing bearer token');
  }
  const token = auth.slice('bearer '.length);

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
    console.error('[auth] env missing:', missing);
    return errorResponse(500, `Server misconfigured: missing ${missing}`);
  }

  const anon = createClient(url, anonKey);
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData.user) {
    return errorResponse(401, 'Invalid token');
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await sb
    .from('profiles')
    .select('disabled')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (profile?.disabled) return errorResponse(403, 'Account disabled');

  // Self-service callers act only on their own account, so an empty access set
  // is correct: nothing here should ever pass a permission check by accident.
  return { user: userData.user, sb, access: resolveAccess({ role: null }) };
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
    entity_type:
      | 'flag'
      | 'flag_rule'
      | 'scenario_override'
      | 'simulation_config'
      | 'user'
      | 'role'
      | 'invite'
      | 'email_settings'
      | 'email_template';
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
