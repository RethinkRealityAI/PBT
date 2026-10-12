// @vitest-environment node
/**
 * `admin-user-actions` — `set_password`: the TEMPORARY password an admin hands
 * to a user. Pins: the `team.manage` gate, the self / owner / escalation
 * guards, the length bounds (chars AND bcrypt bytes), the 404s, that the
 * user's existing metadata survives with `must_change_password: true` added,
 * the audit row, and that the password is never logged, audited or returned.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase, type SbCall } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler, {
  SELF_PASSWORD_MESSAGE,
  TEMP_PASSWORD_LENGTH_MESSAGE,
  tempPasswordProblem,
} from '../admin-user-actions';

type Bag = Record<string, unknown>;

const PASSWORD = 'Temporary-Pass-2026';
const auth = { authorization: 'Bearer admin' };

let sb: FakeSupabase;
let profiles: Record<string, Bag>;
let getUserById: ReturnType<typeof vi.fn>;
let updateUserById: ReturnType<typeof vi.fn>;
let logged: string[];

/** profiles by user_id — the caller (requireAdmin) and the target (getProfile) alike. */
function profilesTable(call: SbCall) {
  const eq = call.ops.find((o) => o.op === 'eq' && o.args[0] === 'user_id');
  const row = eq ? profiles[String(eq.args[1])] : undefined;
  return { data: row ? { user_id: eq?.args[1], ...row } : null, error: null };
}

function caller(profile: Bag) {
  profiles['admin-1'] = { is_admin: false, disabled: false, display_name: 'Ada', permission_overrides: null, ...profile };
}

function auditRows(): Bag[] {
  return sb
    .callsFor('admin_audit_log')
    .flatMap((c) => c.ops.filter((o) => o.op === 'insert').map((o) => o.args[0] as Bag));
}

const setPassword = (body: Bag = {}) =>
  handler(jsonRequest('admin-user-actions', { op: 'set_password', userId: 'user-2', password: PASSWORD, ...body }, { headers: auth }));

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  logged = [];
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'ada@example.com' } }, error: null });
  profiles = {
    'user-2': { is_admin: false, disabled: false, display_name: 'Sam', admin_role: null, permission_overrides: null },
  };
  caller({ admin_role: 'admin' });
  sb.setHandler('profiles', profilesTable);
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  sb.setHandler('admin_audit_log', () => ({ data: null, error: null }));
  getUserById = vi.fn(async () => ({
    data: { user: { id: 'user-2', email: 'sam@example.com', user_metadata: { display_name: 'Sam', locale: 'fr' } } },
    error: null,
  }));
  updateUserById = vi.fn(async () => ({ data: { user: { id: 'user-2' } }, error: null }));
  (sb.client.auth as Record<string, unknown>).admin = { getUserById, updateUserById };
});

describe('admin-user-actions — set_password', () => {
  it('sets a temporary password, keeps the existing metadata, flags must_change_password, and audits it', async () => {
    const res = await setPassword();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ ok: true });

    expect(getUserById).toHaveBeenCalledWith('user-2');
    expect(updateUserById).toHaveBeenCalledTimes(1);
    expect(updateUserById).toHaveBeenCalledWith('user-2', {
      password: PASSWORD,
      user_metadata: { display_name: 'Sam', locale: 'fr', must_change_password: true },
    });
    expect(auditRows()).toEqual([
      expect.objectContaining({
        actor_id: 'admin-1',
        entity_type: 'user',
        entity_id: 'user-2',
        action: 'update',
        note: 'Temporary password set',
      }),
    ]);
    // The password never leaves the request: not in the response, the audit
    // trail or any log line.
    expect(text).not.toContain(PASSWORD);
    expect(JSON.stringify(auditRows())).not.toContain(PASSWORD);
    expect(logged.join('\n')).not.toContain(PASSWORD);
  });

  it('works for a user whose metadata is empty', async () => {
    getUserById.mockResolvedValueOnce({ data: { user: { id: 'user-2', user_metadata: null } }, error: null });
    expect((await setPassword()).status).toBe(200);
    expect(updateUserById.mock.calls[0][1]).toEqual({ password: PASSWORD, user_metadata: { must_change_password: true } });
  });

  it('refuses the caller’s own account (400) — they use “Change password”', async () => {
    const res = await setPassword({ userId: 'admin-1' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: SELF_PASSWORD_MESSAGE });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('only an owner may set an owner’s password (403); an owner may', async () => {
    profiles['user-2'].admin_role = 'owner';
    let res = await setPassword();
    expect(res.status).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();

    caller({ admin_role: 'owner' });
    res = await setPassword();
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledTimes(1);
  });

  it('a non-owner cannot take over an account holding permissions they lack (403)', async () => {
    // Support holds team.manage but not, say, scenarios.write — an admin does.
    caller({ admin_role: 'support' });
    profiles['user-2'].admin_role = 'admin';
    let res = await setPassword();
    expect(res.status).toBe(403);
    expect(((await res.json()) as Bag).error).toMatch(/permissions you don't/);
    expect(updateUserById).not.toHaveBeenCalled();

    // A trainee (no admin permissions) is fine for the same caller.
    profiles['user-2'].admin_role = null;
    res = await setPassword();
    expect(res.status).toBe(200);
  });

  it('fails CLOSED when the roles can’t be read (503), never treating a custom role as empty', async () => {
    caller({ admin_role: 'support' });
    profiles['user-2'].admin_role = 'admin';
    sb.setHandler('admin_roles', () => ({ data: null, error: { message: 'connection reset' } }));
    const res = await setPassword();
    expect(res.status).toBe(503);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('needs team.manage', async () => {
    caller({ admin_role: 'analyst' });
    const res = await setPassword();
    expect(res.status).toBe(403);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('a temporary password is 12–72 characters (and at most 72 bytes)', async () => {
    for (const password of ['short-pass1', 'x'.repeat(73), 'é'.repeat(40), 42, null, undefined]) {
      const res = await setPassword({ password });
      expect(res.status, String(password)).toBe(400);
      expect(await res.json()).toEqual({ error: TEMP_PASSWORD_LENGTH_MESSAGE });
    }
    expect(updateUserById).not.toHaveBeenCalled();
    expect((await setPassword({ password: 'x'.repeat(72) })).status).toBe(200);
    expect((await setPassword({ password: 'x'.repeat(12) })).status).toBe(200);
  });

  it('404 for an unknown user — no profile, or no auth user', async () => {
    let res = await setPassword({ userId: 'nobody' });
    expect(res.status).toBe(404);
    getUserById.mockResolvedValueOnce({ data: { user: null }, error: { message: 'User not found', status: 404 } });
    res = await setPassword();
    expect(res.status).toBe(404);
    expect(updateUserById).not.toHaveBeenCalled();
    expect(auditRows()).toHaveLength(0);
  });

  it('Auth refusing the password is a 400 the admin can fix; anything else a 500 — never audited', async () => {
    updateUserById.mockResolvedValueOnce({ data: null, error: { message: 'Password is known to be weak', status: 422 } });
    let res = await setPassword();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Password is known to be weak' });
    updateUserById.mockResolvedValueOnce({ data: null, error: { message: 'upstream down', status: 503 } });
    res = await setPassword();
    expect(res.status).toBe(500);
    expect(auditRows()).toHaveLength(0);
  });
});

describe('tempPasswordProblem', () => {
  it('counts characters and UTF-8 bytes', () => {
    expect(tempPasswordProblem('a'.repeat(12))).toBeNull();
    expect(tempPasswordProblem('a'.repeat(11))).toBe(TEMP_PASSWORD_LENGTH_MESSAGE);
    expect(tempPasswordProblem('a'.repeat(72))).toBeNull();
    expect(tempPasswordProblem('é'.repeat(36))).toBeNull(); // 72 bytes
    expect(tempPasswordProblem('é'.repeat(37))).toBe(TEMP_PASSWORD_LENGTH_MESSAGE); // 74 bytes
    expect(tempPasswordProblem(undefined)).toBe(TEMP_PASSWORD_LENGTH_MESSAGE);
  });
});
