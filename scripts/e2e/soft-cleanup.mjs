#!/usr/bin/env node
/**
 * First half of the end-to-end check's cleanup: soft-delete everything the
 * QA account created, through the admin's OWN endpoints (the calls its
 * Delete buttons make), in dependency order — scenarios, then objections,
 * then categories, then knowledge documents.
 *
 * Soft-deleted rows are invisible everywhere the product reads (pickers, the
 * public snapshot, AI retrieval), so this takes the fictional QA documents
 * out of production retrieval at once, with no SQL and no confirmation.
 * `cleanup.sql` then removes the rows for good (and the account).
 *
 *   PBT_E2E_BASE_URL=… PBT_E2E_SUPABASE_URL=… PBT_E2E_SUPABASE_KEY=… \
 *   node scripts/e2e/soft-cleanup.mjs <out-dir>
 *
 * Exit code 1 if anything was left live.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const BASE = (process.env.PBT_E2E_BASE_URL || '').replace(/\/$/, '');
const SB = (process.env.PBT_E2E_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.PBT_E2E_SUPABASE_KEY || '';
if (!dir || !BASE || !SB || !KEY) {
  console.error('Usage: PBT_E2E_BASE_URL=… PBT_E2E_SUPABASE_URL=… PBT_E2E_SUPABASE_KEY=… node scripts/e2e/soft-cleanup.mjs <out-dir>');
  process.exit(2);
}
const { email } = JSON.parse(readFileSync(join(dir, 'account.json'), 'utf8'));
const password = readFileSync(join(dir, 'password'), 'utf8').trim();

const auth = await (
  await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
).json();
if (!auth.access_token) {
  console.error('Could not sign in as the QA account (already deleted?).');
  process.exit(1);
}
const me = auth.user?.id;
const fn = `${BASE}/.netlify/functions`;
async function call(name, { method = 'POST', body, query = '' } = {}) {
  const res = await fetch(`${fn}/${name}${query}`, {
    method,
    headers: { authorization: `Bearer ${auth.access_token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
let leftLive = 0;
const report = (what, id, status) => {
  console.log(`${status === 200 ? 'deleted ' : `FAILED ${status}`}  ${what} ${id}`);
  if (status !== 200) leftLive += 1;
};

// 1. Scenarios — `op` rides the query string on this endpoint.
const overrides = (await call('admin-scenario-overrides', { method: 'GET' })).json;
const scenarios = (Array.isArray(overrides) ? overrides : []).filter(
  (r) => r.created_by === me || String(r.pushback_id || '').startsWith('team:qa-e2e'),
);
for (const r of scenarios) {
  report('scenario', r.scenario_id, (await call('admin-scenario-overrides', { query: '?op=delete', body: { scenario_id: r.scenario_id } })).status);
}

// 2. Objections, then 3. categories (each refused while something still uses it).
const catalogue = (await call('admin-objections', { method: 'GET' })).json;
for (const o of (catalogue.objections ?? []).filter((o) => o.id.startsWith('team:qa-e2e') && !o.deletedAt)) {
  report('objection', o.id, (await call('admin-objections', { body: { op: 'delete', id: o.id } })).status);
}
for (const c of (catalogue.categories ?? []).filter((c) => c.id.startsWith('category:qa-e2e') && !c.deletedAt)) {
  report('category', c.id, (await call('admin-objections', { body: { op: 'delete-category', id: c.id } })).status);
}

// 4. Knowledge documents.
const docs = (await call('admin-knowledge', { method: 'GET' })).json.documents ?? [];
for (const d of docs.filter((d) => String(d.title || '').startsWith('QA E2E ·'))) {
  report('document', d.slug, (await call('admin-knowledge', { body: { op: 'delete', slug: d.slug } })).status);
}

console.log(leftLive ? `\n${leftLive} item(s) could not be soft-deleted.` : '\nNothing from the run is live any more. Now run cleanup.sql.');
process.exit(leftLive ? 1 : 0);
