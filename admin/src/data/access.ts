/**
 * Admin data hooks for roles, invitations, and the signed-in admin's own
 * effective permissions. Mirrors the `queries.ts` pattern: every read goes
 * through a Netlify Function that re-checks permissions server-side.
 */
import { useEffect, useState } from 'react';
import { apiFetch, postJson } from '../lib/api';
import type { PermissionCategory } from '../../../src/shared/access/permissions';

export interface AdminRole {
  key: string;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  rank: number;
  updated_at?: string | null;
}

export interface RolesPayload {
  roles: AdminRole[];
  memberCounts: Record<string, number>;
  permissionCatalog: PermissionCategory[];
  allPermissions: string[];
  canManage: boolean;
  isOwner: boolean;
  myPermissions: string[];
}

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface AdminInvite {
  id: string;
  email: string;
  role_key: string;
  display_name: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  send_count: number;
  last_sent_at: string;
  created_at: string;
  status: InviteStatus;
  invited_by_name: string | null;
}

export interface InvitesPayload {
  invites: AdminInvite[];
  canManage: boolean;
}

export interface Whoami {
  user_id: string;
  email: string | null;
  display_name: string | null;
  role: string | null;
  role_name: string | null;
  is_owner: boolean;
  permissions: string[];
}

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useResource<T>(path: string, refreshKey: number): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>({ data: null, loading: true, error: null });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch<T>(path)
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Request failed',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path, refreshKey]);
  return state;
}

export const useRoles = (refreshKey = 0) => useResource<RolesPayload>('admin-roles', refreshKey);
export const useInvites = (refreshKey = 0) => useResource<InvitesPayload>('admin-invites', refreshKey);

export interface RoleWrite {
  op: 'create' | 'update' | 'delete';
  key?: string;
  name?: string;
  description?: string;
  permissions?: string[];
  rank?: number;
}

export const writeRole = (body: RoleWrite) => postJson<{ ok: true; key?: string }>('admin-roles', body);

export interface InviteWrite {
  op: 'create' | 'resend' | 'revoke';
  id?: string;
  email?: string;
  roleKey?: string;
  displayName?: string;
  expiresInDays?: number;
}

export interface InviteResult {
  ok: true;
  id?: string;
  delivery?: { ok: boolean; status: 'sent' | 'failed' | 'skipped'; error?: string };
  /** Present only when the email couldn't be delivered — hand it over manually. */
  acceptUrl?: string;
}

export const writeInvite = (body: InviteWrite) => postJson<InviteResult>('admin-invites', body);
