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

/**
 * Expected columns per relation, parsed from the migration files themselves.
 * This is the column-level counterpart of the relation probe: it catches a
 * migration that was applied *partially* or skipped after a later one ran —
 * exactly how prod ended up missing scenario_overrides.deleted_at while
 * carrying columns from a newer migration.
 *
 * The parser leans on the repo's consistent migration style:
 *   create table [if not exists] public.<name> ( <col> <type>..., ... );
 *   alter table public.<name> add column [if not exists] <col> <type>...;
 * Views are tracked so they're probed for existence only.
 */
function expectedSchemaFromMigrations() {
  const dir = join(ROOT, 'supabase', 'migrations');
  const columns = new Map(); // relation -> Set<column>
  const views = new Set();
  const addCols = (rel, col) => {
    if (!columns.has(rel)) columns.set(rel, new Set());
    columns.get(rel).add(col);
  };
  const CONSTRAINT_KEYWORDS = new Set([
    'constraint',
    'primary',
    'unique',
    'check',
    'foreign',
    'like',
  ]);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8')
      // Strip line comments so commented-out DDL never counts.
      .replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
      views.add(m[1].toLowerCase());
    }
    // create table bodies: capture up to the matching close by scanning parens.
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)\s*\(/gi)) {
      const rel = m[1].toLowerCase();
      let depth = 1;
      let i = m.index + m[0].length;
      const start = i;
      while (i < sql.length && depth > 0) {
        if (sql[i] === '(') depth++;
        else if (sql[i] === ')') depth--;
        i++;
      }
      const body = sql.slice(start, i - 1);
      // Split on top-level commas only.
      const parts = [];
      let buf = '';
      let d = 0;
      for (const ch of body) {
        if (ch === '(') d++;
        else if (ch === ')') d--;
        if (ch === ',' && d === 0) {
          parts.push(buf);
          buf = '';
        } else buf += ch;
      }
      parts.push(buf);
      for (const part of parts) {
        const cm = part.match(/^\s*([a-z_][a-z0-9_]*)\s/i);
        if (cm && !CONSTRAINT_KEYWORDS.has(cm[1].toLowerCase())) {
          addCols(rel, cm[1].toLowerCase());
        }
      }
    }
    // alter table ... add column [if not exists] <col>
    for (const m of sql.matchAll(/alter\s+table\s+(?:only\s+)?(?:public\.)?([a-z_][a-z0-9_]*)([\s\S]*?);/gi)) {
      const rel = m[1].toLowerCase();
      for (const am of m[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)/gi)) {
        addCols(rel, am[1].toLowerCase());
      }
    }
  }
  return { columns, views };
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

/**
 * Column probe: a GET selecting the exact column list 400s (PGRST204 /
 * 42703) when any column is missing. On failure we re-probe per column so
 * the report names every gap, not just the first.
 */
async function missingColumns(name, cols) {
  const probe = async (select) => {
    const url = `${base}/rest/v1/${encodeURIComponent(name)}?select=${select}&limit=0`;
    const res = await fetch(url, { headers });
    if (res.ok) return true;
    if (res.status === 400 || res.status === 404) return false;
    throw new Error(`Unexpected ${res.status} probing "${name}" columns`);
  };
  if (await probe(cols.join(','))) return [];
  const gaps = [];
  for (const col of cols) {
    if (!(await probe(col))) gaps.push(col);
  }
  // The bulk probe failed but no single column did — surface it anyway.
  return gaps.length ? gaps : ['<bulk column probe failed>'];
}

const relations = referencedRelations();
const { columns: expectedCols, views } = expectedSchemaFromMigrations();

// Debug aid: print what the migration parser expects, then exit.
if (process.argv.includes('--expected')) {
  for (const name of relations) {
    if (views.has(name)) console.log(`${name}\t<view>`);
    else if (expectedCols.has(name))
      console.log(`${name}\t${[...expectedCols.get(name)].sort().join(',')}`);
    else console.log(`${name}\t<no columns parsed>`);
  }
  process.exit(0);
}

console.log(
  `verify-db-schema: checking ${relations.length} relations (+ columns) against ${base}`,
);

const missing = [];
const columnGaps = []; // "relation.column"
const errored = [];
for (const name of relations) {
  try {
    if (!(await relationExists(name))) {
      missing.push(name);
      continue;
    }
    // Column-level check for tables the migrations define (views: existence only).
    if (!views.has(name) && expectedCols.has(name)) {
      const cols = [...expectedCols.get(name)].sort();
      for (const col of await missingColumns(name, cols)) {
        columnGaps.push(`${name}.${col}`);
      }
    }
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
if (columnGaps.length) {
  console.error(
    '\nverify-db-schema: FAIL — columns the migrations define are missing ' +
      'from the database (a migration was skipped or partially applied). ' +
      'Apply the migration that adds each column before deploying:',
  );
  for (const c of columnGaps) console.error(`  • ${c}`);
}

if (missing.length || columnGaps.length || errored.length) process.exit(1);
console.log(
  `verify-db-schema: OK — all expected relations present, ` +
    `${[...expectedCols.values()].reduce((n, s) => n + s.size, 0)} columns verified.`,
);
