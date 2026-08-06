/**
 * Admin: roles & permissions.
 *
 *   GET                          → { roles, permissionCatalog, memberCounts }
 *   POST { op: 'create', ... }   → new custom role
 *   POST { op: 'update', ... }   → rename / re-describe / re-permission a role
 *   POST { op: 'delete', key }   → delete a custom role (must have no members)
 *
 * Reading needs `team.read`; writing needs `roles.manage`. Two rules keep the
 * portal from being locked out or quietly escalated:
 *   • The `owner` role is immutable — it is defined as "everything".
 *   • You cannot grant a role a permission you do not hold yourself, so a
 *     non-owner admin can't mint an owners.manage role and self-promote.
 */
import {
  ALL_PERMISSIONS,
  PERMISSION_CATEGORIES,
  SYSTEM_ROLES,
  isPermission,
  isSystemRole,
  withImpliedPermissions,
  type Permission,
} from '../../src/shared/access/permissions';
import { can, errorResponse, jsonResponse, requireAdmin, writeAuditLog, type AdminCtx } from './_shared/admin';

interface RoleRow {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  rank: number;
  updated_at?: string;
}

/**
 * Make sure every system preset exists. A release that adds a role should not
 * need a migration run before the portal can assign it; existing rows are
 * never overwritten, so admin edits to a preset survive.
 */
async function ensureSystemRoles(ctx: AdminCtx): Promise<void> {
  const { data } = await ctx.sb.from('admin_roles').select('key');
  const have = new Set((data ?? []).map((r: { key: string }) => r.key));
  const missing = SYSTEM_ROLES.filter((r) => !have.has(r.key));
  if (!missing.length) return;
  await ctx.sb.from('admin_roles').insert(
    missing.map((r) => ({
      key: r.key,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      is_system: true,
      rank: r.rank,
    })),
  );
}

async function listRoles(ctx: AdminCtx): Promise<RoleRow[]> {
  const { data } = await ctx.sb
    .from('admin_roles')
    .select('key, name, description, permissions, is_system, rank, updated_at')
    .order('rank', { ascending: true });
  return (data ?? []) as RoleRow[];
}

async function memberCounts(ctx: AdminCtx): Promise<Record<string, number>> {
  const { data } = await ctx.sb
    .from('profiles')
    .select('admin_role')
    .not('admin_role', 'is', null);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ admin_role: string }>) {
    counts[row.admin_role] = (counts[row.admin_role] ?? 0) + 1;
  }
  return counts;
}

/** Reject permissions the caller doesn't hold — no privilege escalation. */
function unauthorizedGrants(ctx: AdminCtx, permissions: Permission[]): Permission[] {
  if (ctx.access.isOwner) return [];
  return permissions.filter((p) => !ctx.access.permissions.includes(p));
}

function sanitizePermissions(raw: unknown): Permission[] {
  const list = Array.isArray(raw) ? raw.filter(isPermission) : [];
  return withImpliedPermissions(list);
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'team.read');
  if (ctx instanceof Response) return ctx;

  await ensureSystemRoles(ctx);

  if (req.method === 'GET') {
    const [roles, counts] = await Promise.all([listRoles(ctx), memberCounts(ctx)]);
    return jsonResponse({
      roles,
      memberCounts: counts,
      permissionCatalog: PERMISSION_CATEGORIES,
      allPermissions: ALL_PERMISSIONS,
      canManage: can(ctx, 'roles.manage'),
      isOwner: ctx.access.isOwner,
      myPermissions: ctx.access.permissions,
    });
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');
  if (!can(ctx, 'roles.manage')) return errorResponse(403, 'Missing permission: roles.manage');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  const op = String(body.op ?? '');

  if (op === 'create') {
    const name = String(body.name ?? '').trim();
    if (!name) return errorResponse(400, 'Role name required');
    const key =
      String(body.key ?? '').trim() ||
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) {
      return errorResponse(400, 'Role key must be lowercase letters, numbers, and underscores');
    }
    if (isSystemRole(key)) return errorResponse(400, 'That key belongs to a built-in role');

    const permissions = sanitizePermissions(body.permissions);
    const denied = unauthorizedGrants(ctx, permissions);
    if (denied.length) {
      return errorResponse(403, `You can't grant permissions you don't hold: ${denied.join(', ')}`);
    }

    const { error } = await ctx.sb.from('admin_roles').insert({
      key,
      name,
      description: String(body.description ?? '').trim(),
      permissions,
      is_system: false,
      rank: Number(body.rank ?? 100),
      updated_by: ctx.user.id,
    });
    if (error) {
      return errorResponse(error.code === '23505' ? 409 : 500, error.message);
    }
    await writeAuditLog(ctx, {
      entity_type: 'role',
      entity_id: key,
      action: 'create',
      after: { name, permissions },
    });
    return jsonResponse({ ok: true, key });
  }

  if (op === 'update') {
    const key = String(body.key ?? '');
    if (!key) return errorResponse(400, 'key required');
    if (key === 'owner') {
      return errorResponse(400, 'The Owner role always holds every permission and can’t be edited.');
    }
    const { data: before } = await ctx.sb
      .from('admin_roles')
      .select('key, name, description, permissions, is_system')
      .eq('key', key)
      .maybeSingle();
    if (!before) return errorResponse(404, 'Role not found');

    const patch: Record<string, unknown> = { updated_by: ctx.user.id, updated_at: new Date().toISOString() };
    if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.description === 'string') patch.description = body.description.trim();
    if (body.permissions !== undefined) {
      const permissions = sanitizePermissions(body.permissions);
      const denied = unauthorizedGrants(ctx, permissions);
      if (denied.length) {
        return errorResponse(403, `You can't grant permissions you don't hold: ${denied.join(', ')}`);
      }
      patch.permissions = permissions;
    }
    if (body.rank !== undefined) patch.rank = Number(body.rank);

    const { error } = await ctx.sb.from('admin_roles').update(patch).eq('key', key);
    if (error) return errorResponse(500, error.message);

    await writeAuditLog(ctx, {
      entity_type: 'role',
      entity_id: key,
      action: 'update',
      before,
      after: patch,
    });
    return jsonResponse({ ok: true });
  }

  if (op === 'delete') {
    const key = String(body.key ?? '');
    if (!key) return errorResponse(400, 'key required');
    if (isSystemRole(key)) return errorResponse(400, 'Built-in roles can’t be deleted.');

    const counts = await memberCounts(ctx);
    if (counts[key]) {
      return errorResponse(
        400,
        `${counts[key]} account${counts[key] === 1 ? '' : 's'} still use this role. Reassign them first.`,
      );
    }
    const { data: before } = await ctx.sb.from('admin_roles').select('*').eq('key', key).maybeSingle();
    const { error } = await ctx.sb.from('admin_roles').delete().eq('key', key);
    if (error) return errorResponse(500, error.message);
    await writeAuditLog(ctx, { entity_type: 'role', entity_id: key, action: 'delete', before });
    return jsonResponse({ ok: true });
  }

  return errorResponse(400, `Unknown op: ${op}`);
};
