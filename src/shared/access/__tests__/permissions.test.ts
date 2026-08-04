import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  OWNER_ROLE,
  PERMISSIONS,
  PERMISSION_CATEGORIES,
  PERMISSION_META,
  SYSTEM_ROLES,
  hasPermission,
  isPermission,
  isSystemRole,
  resolveAccess,
  summarizePermissions,
  withImpliedPermissions,
  withoutDependents,
  type Permission,
} from '../permissions';

describe('permission catalog', () => {
  it('places every permission in exactly one category', () => {
    const listed = PERMISSION_CATEGORIES.flatMap((c) => c.permissions.map((p) => p.key));
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('only declares dependencies that are themselves real permissions', () => {
    for (const meta of Object.values(PERMISSION_META)) {
      for (const dep of meta.requires ?? []) {
        expect(isPermission(dep)).toBe(true);
      }
    }
  });

  it('has no dependency cycles', () => {
    // withImpliedPermissions recurses through `requires`; a cycle would hang
    // it. Expanding every permission proves the graph is acyclic.
    for (const key of ALL_PERMISSIONS) {
      expect(withImpliedPermissions([key]).length).toBeGreaterThan(0);
    }
  });
});

describe('system roles', () => {
  it('grants owner every permission', () => {
    const owner = SYSTEM_ROLES.find((r) => r.key === OWNER_ROLE)!;
    expect([...owner.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("withholds owners.manage from admin so admins can't demote an owner", () => {
    const admin = SYSTEM_ROLES.find((r) => r.key === 'admin')!;
    expect(admin.permissions).not.toContain('owners.manage');
    expect(admin.permissions).toContain('team.manage');
  });

  it('only references real permissions, with dependencies satisfied', () => {
    for (const role of SYSTEM_ROLES) {
      for (const p of role.permissions) {
        expect(isPermission(p)).toBe(true);
        for (const dep of PERMISSION_META[p].requires ?? []) {
          expect(role.permissions).toContain(dep);
        }
      }
    }
  });

  it('keeps narrow roles narrow', () => {
    const analyst = SYSTEM_ROLES.find((r) => r.key === 'analyst')!;
    expect(analyst.permissions).not.toContain('team.manage');
    expect(analyst.permissions).not.toContain('flags.write');
    expect(analyst.permissions).not.toContain('simulation.write');

    const comms = SYSTEM_ROLES.find((r) => r.key === 'comms_manager')!;
    expect(comms.permissions).toContain('email.settings.write');
    expect(comms.permissions).not.toContain('sessions.read');

    const clinical = SYSTEM_ROLES.find((r) => r.key === 'clinical_reviewer')!;
    expect(clinical.permissions).toContain('knowledge.write');
    expect(clinical.permissions).not.toContain('team.manage');
  });

  it('recognises its own keys as system roles', () => {
    for (const role of SYSTEM_ROLES) expect(isSystemRole(role.key)).toBe(true);
    expect(isSystemRole('regional_trainer')).toBe(false);
  });
});

describe('resolveAccess', () => {
  it('gives a role-less account nothing', () => {
    const access = resolveAccess({ role: null });
    expect(access.isAdmin).toBe(false);
    expect(access.permissions).toEqual([]);
    expect(hasPermission(access, 'overview.read')).toBe(false);
  });

  it('treats a pre-RBAC is_admin account as an admin', () => {
    const access = resolveAccess({ role: null, legacyIsAdmin: true });
    expect(access.role).toBe('admin');
    expect(hasPermission(access, 'team.manage')).toBe(true);
    expect(hasPermission(access, 'owners.manage')).toBe(false);
  });

  it('gives an owner every permission, including unknown future ones', () => {
    const access = resolveAccess({ role: OWNER_ROLE, roles: [{ key: 'owner', permissions: [] }] });
    expect(access.isOwner).toBe(true);
    // Even though the DB row above lists nothing, owner still holds it all.
    expect(access.permissions).toEqual(ALL_PERMISSIONS);
    expect(hasPermission(access, 'owners.manage')).toBe(true);
  });

  it('reads permissions from the DB role table over the code presets', () => {
    const access = resolveAccess({
      role: 'custom',
      roles: [{ key: 'custom', permissions: ['sessions.read', 'quality.read'] }],
    });
    expect(access.permissions).toEqual(['sessions.read', 'quality.read']);
  });

  it('drops permission strings it does not recognise', () => {
    const access = resolveAccess({
      role: 'custom',
      roles: [{ key: 'custom', permissions: ['sessions.read', 'not.a.permission'] }],
    });
    expect(access.permissions).toEqual(['sessions.read']);
  });

  it('applies grants on top of the role', () => {
    const access = resolveAccess({
      role: 'analyst',
      overrides: { grant: ['flags.write'] },
    });
    expect(hasPermission(access, 'flags.write')).toBe(true);
  });

  it('lets an explicit revoke beat both the role and an explicit grant', () => {
    const access = resolveAccess({
      role: 'admin',
      overrides: { grant: ['rag.export'], revoke: ['rag.export', 'team.manage'] },
    });
    expect(hasPermission(access, 'rag.export')).toBe(false);
    expect(hasPermission(access, 'team.manage')).toBe(false);
  });

  it('cannot revoke anything from an owner', () => {
    const access = resolveAccess({ role: OWNER_ROLE, overrides: { revoke: ['team.manage'] } });
    expect(hasPermission(access, 'team.manage')).toBe(true);
  });

  it('returns permissions in catalog order regardless of input order', () => {
    const access = resolveAccess({
      role: 'custom',
      roles: [{ key: 'custom', permissions: ['quality.read', 'team.read', 'sessions.read'] }],
    });
    const positions = access.permissions.map((p) => ALL_PERMISSIONS.indexOf(p));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('treats an unknown role key as an admin with no permissions', () => {
    const access = resolveAccess({ role: 'ghost', roles: [{ key: 'other', permissions: [] }] });
    expect(access.isAdmin).toBe(true);
    expect(access.permissions).toEqual([]);
  });
});

describe('dependency helpers', () => {
  it('adds the permissions a selection implies', () => {
    expect(withImpliedPermissions(['scenarios.write'])).toContain('scenarios.read');
    expect(withImpliedPermissions(['owners.manage'])).toEqual(
      expect.arrayContaining(['team.read', 'team.manage', 'owners.manage']),
    );
  });

  it('removes everything that depended on a cleared permission', () => {
    const start = withImpliedPermissions(['scenarios.write', 'quality.read']);
    const after = withoutDependents(start, 'scenarios.read');
    expect(after).not.toContain('scenarios.read');
    expect(after).not.toContain('scenarios.write');
    expect(after).toContain('quality.read');
  });

  it('cascades removal through a two-level chain', () => {
    const start = withImpliedPermissions(['owners.manage']);
    const after = withoutDependents(start, 'team.read');
    expect(after).not.toContain('team.manage');
    expect(after).not.toContain('owners.manage');
  });

  it('ignores unknown keys instead of throwing', () => {
    expect(withImpliedPermissions(['nope', 'team.read' as Permission])).toEqual(['team.read']);
  });
});

describe('summarizePermissions', () => {
  it('counts only real permissions and names the areas touched', () => {
    const summary = summarizePermissions(['team.read', 'email.read', 'bogus']);
    expect(summary.count).toBe(2);
    expect(summary.total).toBe(ALL_PERMISSIONS.length);
    expect(summary.areas).toEqual(['Team & access', 'Communications']);
  });
});
