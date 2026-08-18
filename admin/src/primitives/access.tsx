/**
 * Signed-in admin's effective permissions, in context.
 *
 * `admin-whoami` already returns them at the top of App.tsx; before this they
 * were prop-drilled as `myPermissions` into the two screens that happened to
 * need them, so the other eight either hid nothing or hid things by guessing.
 *
 * This is a PRESENTATION control, not a security control. Every admin Function
 * re-checks the same permission server-side (`requireAdmin(req, '<key>')`).
 * What `useCan` buys is honesty in the UI: showing a Save button that is going
 * to 403 teaches people the portal is broken.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Permission } from '../../../src/shared/access/permissions';
import { InlineAlert } from './form';

export interface AccessValue {
  permissions: ReadonlySet<string>;
  isOwner: boolean;
  can: (permission: Permission | string) => boolean;
}

const AccessContext = createContext<AccessValue | null>(null);

export function AccessProvider({
  permissions,
  isOwner = false,
  children,
}: {
  permissions: readonly string[];
  isOwner?: boolean;
  children: ReactNode;
}) {
  const key = permissions.join('|');
  const value = useMemo<AccessValue>(() => {
    const set = new Set(permissions);
    return {
      permissions: set,
      isOwner,
      // Owner is absolute — it holds permissions that don't exist yet, so it
      // must not be resolved by set membership.
      can: (permission) => isOwner || set.has(permission as string),
    };
    // `key` stands in for the array identity, which changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, isOwner]);

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

/** Full access record. Prefer `useCan()` unless you need `isOwner`. */
export function useAccess(): AccessValue {
  const ctx = useContext(AccessContext);
  return (
    ctx ?? {
      permissions: EMPTY,
      isOwner: false,
      // No provider means no proof of permission. Denying is the safe default:
      // the server would refuse anyway, and a hidden control is a smaller
      // failure than a control that always errors.
      can: () => false,
    }
  );
}

const EMPTY: ReadonlySet<string> = new Set<string>();

/** `const can = useCan(); can('scenarios.write')` */
export function useCan(): (permission: Permission | string) => boolean {
  return useAccess().can;
}

/**
 * Drop at the top of a screen whose write controls are disabled. Renders
 * nothing when the reader actually holds the permission, so screens can mount
 * it unconditionally.
 *
 * The copy names the permission on purpose — "ask an owner for access" sends
 * someone into a conversation neither party can resolve.
 */
export function ReadOnlyBanner({
  permission,
  children,
}: {
  permission: Permission | string;
  children?: ReactNode;
}) {
  const can = useCan();
  if (can(permission)) return null;
  return (
    <InlineAlert tone="info">
      {children ?? (
        <>
          You have view-only access here — ask an owner for{' '}
          <code style={{ fontFamily: 'var(--pbt-mono)', fontWeight: 700 }}>
            {permission}
          </code>{' '}
          to make changes.
        </>
      )}
    </InlineAlert>
  );
}
