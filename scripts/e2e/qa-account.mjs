#!/usr/bin/env node
/**
 * Create the THROWAWAY account the Scenario Studio end-to-end check signs in
 * with. It uses the public sign-up endpoint — the same one a trainee's
 * "Save your progress" uses — so it needs only the PUBLISHABLE key, never
 * the service role. The project auto-confirms sign-ups, so no email is sent.
 *
 *   PBT_E2E_SUPABASE_URL=https://<ref>.supabase.co \
 *   PBT_E2E_SUPABASE_KEY=sb_publishable_… \
 *   node scripts/e2e/qa-account.mjs <out-dir>
 *
 * Writes <out-dir>/account.json = { email, userId } and <out-dir>/password
 * (mode 600; never printed). The account is NOT an admin yet: the test agent
 * grants it the Scenario Author role with SQL (see
 * .claude/agents/pbt-e2e-tester.md), and cleanup.sql deletes it at the end.
 */
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

const url = (process.env.PBT_E2E_SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.PBT_E2E_SUPABASE_KEY || '';
const out = process.argv[2];
if (!url || !key || !out) {
  console.error('Usage: PBT_E2E_SUPABASE_URL=… PBT_E2E_SUPABASE_KEY=… node scripts/e2e/qa-account.mjs <out-dir>');
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const email = `pbt-qa-e2e+${stamp}@example.com`;
const password = randomBytes(18).toString('base64url');

const res = await fetch(`${url}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: key, 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, data: { display_name: 'QA E2E bot (temporary)' } }),
});
const body = await res.json().catch(() => ({}));
const userId = body.user?.id ?? body.id;
if (!res.ok || !userId) {
  console.error('Sign-up failed:', res.status, body.msg || body.error_description || body.error || '');
  process.exit(1);
}
if (!body.access_token) {
  console.error('Signed up, but the project did not return a session — email confirmation is on. Confirm the address first.');
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'account.json'), JSON.stringify({ email, userId }, null, 2));
writeFileSync(join(out, 'password'), password);
chmodSync(join(out, 'password'), 0o600);
console.log(JSON.stringify({ email, userId }));
