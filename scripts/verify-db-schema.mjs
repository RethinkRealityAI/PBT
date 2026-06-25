#!/usr/bin/env node
/**
 * verify-db-schema — deploy-time guard that the target Supabase project has
 * every relation the app code expects.
 *
 * The static test (`src/tests/schema-parity.test.ts`) proves the *migrations*
 * declare every relation the code uses. This script proves those migrations
 * were actually *applied* to a live project — the gap that let the "report a
 * problem" tool ship against a database missing the `platform_reports` table.
 *
 * Run before deploying (or in CI against staging/prod):
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run verify:db
 *
 * Exits non-zero (failing the deploy) if any expected relation is missing.
 * Uses the service-role key so RLS never hides a present-but-empty table.
 * Reads only relation existence + row counts; it never writes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const URL_ENV = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY_ENV =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!URL_ENV || !KEY_ENV) {
  console.error(
    'verify-db-schema: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run.\n' +
      'Skipping is not allowed in CI/deploy — these env vars must be present.',
  );
  process.exit(2);
}

/** Collect relations referenced in code via `.from('<name>')`. */
function referencedRelations() {
  const refs = new Set();
  const re = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/gi;
  const walk = (dir) => {
    let files = [];
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return files;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) files = files.concat(walk(full));
      else if (/\.tsx?$/.test(e.name)) files.push(full);
    }
    return files;
  };
  for (const dir of [join(ROOT, 'src'), join(ROOT, 'netlify')]) {
    for (const file of walk(dir)) {
      const src = readFileSync(file, 'utf8');
      let m;
      while ((m = re.exec(src)) !== null) refs.add(m[1].toLowerCase());
    }
  }
  return [...refs].sort();
}

const base = URL_ENV.replace(/\/$/, '');
const headers = { apikey: KEY_ENV, Authorization: `Bearer ${KEY_ENV}` };

/** A relation "exists" if a HEAD select doesn't 404 with a relation error. */
async function relationExists(name) {
  const url = `${base}/rest/v1/${encodeURIComponent(name)}?select=*&limit=0`;
  const res = await fetch(url, { method: 'HEAD', headers });
  // 200/206 = exists. 404 with PGRST205 (or table-not-found) = missing.
  if (res.ok) return true;
  if (res.status === 404) return false;
  // Other statuses (401/403/5xx) are environment problems, not missing tables.
  throw new Error(`Unexpected ${res.status} probing "${name}"`);
}

const relations = referencedRelations();
console.log(
  `verify-db-schema: checking ${relations.length} relations against ${base}`,
);

const missing = [];
const errored = [];
for (const name of relations) {
  try {
    if (!(await relationExists(name))) missing.push(name);
  } catch (err) {
    errored.push(`${name}: ${err.message}`);
  }
}

if (errored.length) {
  console.error('\nverify-db-schema: probe errors (treat as failure):');
  for (const e of errored) console.error(`  • ${e}`);
}
if (missing.length) {
  console.error(
    '\nverify-db-schema: FAIL — relations referenced by code are missing ' +
      'from the database. Apply the migration(s) in supabase/migrations/ ' +
      'before deploying:',
  );
  for (const m of missing) console.error(`  • ${m}`);
}

if (missing.length || errored.length) process.exit(1);
console.log('verify-db-schema: OK — all expected relations present.');
