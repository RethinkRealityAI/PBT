// @vitest-environment node
/**
 * Audit → Revert of a scenario must not restore it onto a deleted objection.
 * A scenario is only ever SAVED on an objection that exists; without this
 * guard, reverting a scenario's delete (after its objection was deleted)
 * brought back a live scenario nothing can resolve, and trainees silently
 * lost it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest, makeFakeSupabase, setFunctionEnv, type FakeSupabase, type SbCall } from './fakeSupabase';

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler from '../admin-audit-log';

let sb: FakeSupabase;
const auth = { authorization: 'Bearer admin' };
const revert = (id: string) =>
  handler(jsonRequest('admin-audit-log?op=revert', { id }, { headers: auth }));

const ENTRY = {
  id: 'audit-1',
  entity_type: 'scenario_override',
  entity_id: 'admin:probiotics-1',
  action: 'delete',
  before: {
    scenario_id: 'admin:probiotics-1',
    visible: true,
    breed: 'Beagle',
    life_stage: 'Adult (3-7)',
    pushback_id: 'team:probiotics',
    suggested_driver: 'Energizer',
  },
  after: null,
};

function auditTable(entry: Record<string, unknown>) {
  return (call: SbCall) =>
    call.ops.some((o) => o.op === 'maybeSingle')
      ? { data: entry, error: null }
      : { data: null, error: null };
}

beforeEach(() => {
  setFunctionEnv();
  sb = makeFakeSupabase();
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation(() => sb.client);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sb.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } }, error: null });
  sb.setHandler('profiles', () => ({
    data: { is_admin: true, disabled: false, admin_role: null, permission_overrides: null },
    error: null,
  }));
  sb.setHandler('admin_roles', () => ({ data: [], error: null }));
  sb.setHandler('admin_audit_log', auditTable(ENTRY));
  sb.setHandler('scenario_overrides', () => ({ data: null, error: null }));
});

const upserts = () =>
  sb.callsFor('scenario_overrides').filter((c) => c.ops.some((o) => o.op === 'upsert'));

describe('admin-audit-log revert — team objections', () => {
  it('refuses to restore a scenario onto a deleted objection, and writes nothing', async () => {
    sb.setHandler('scenario_objections', () => ({
      data: { id: 'team:probiotics', deleted_at: '2026-10-12T11:00:00Z' },
      error: null,
    }));
    const res = await revert('audit-1');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/Restore the objection first/);
    expect(upserts()).toHaveLength(0);
  });

  it('refuses while the objections table does not exist (no team id can resolve)', async () => {
    sb.setHandler('scenario_objections', () => ({
      data: null,
      error: { code: 'PGRST205', message: "Could not find the table 'public.scenario_objections' in the schema cache" },
    }));
    expect((await revert('audit-1')).status).toBe(409);
    expect(upserts()).toHaveLength(0);
  });

  it('restores normally when the objection still exists', async () => {
    sb.setHandler('scenario_objections', () => ({
      data: { id: 'team:probiotics', deleted_at: null },
      error: null,
    }));
    const res = await revert('audit-1');
    expect(res.status).toBe(200);
    expect(upserts()).toHaveLength(1);
  });

  it('does not consult objections for a built-in pushback', async () => {
    sb.setHandler('admin_audit_log', auditTable({ ...ENTRY, before: { ...ENTRY.before, pushback_id: 'cost' } }));
    const res = await revert('audit-1');
    expect(res.status).toBe(200);
    expect(sb.callsFor('scenario_objections')).toHaveLength(0);
  });
});
