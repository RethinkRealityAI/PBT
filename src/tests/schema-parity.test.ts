import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Schema parity guard.
 *
 * Every Supabase relation the app talks to (`sb.from('<name>')`) MUST be
 * declared by a migration in `supabase/migrations/`. This is the static half
 * of our "DB is aligned with the code" requirement — it runs in `npm test`
 * with no database connection and fails the build if code references a table
 * or view that no migration creates.
 *
 * It does NOT prove the migration was applied to a given environment — that is
 * a deploy-time concern handled by `scripts/verify-db-schema.mjs`
 * (`npm run verify:db`). See the "Database migrations" section in CLAUDE.md.
 */

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const CODE_DIRS = [join(ROOT, 'src'), join(ROOT, 'netlify')];

/** Relations Supabase manages outside our migrations (auth schema, etc.). */
const EXTERNAL_RELATIONS = new Set<string>([]);

function walk(dir: string, exts: string[]): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      out = out.concat(walk(full, exts));
    } else if (exts.some((e) => full.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

/** Relation names declared by `create table|view` statements in migrations. */
function declaredRelations(): Set<string> {
  const declared = new Set<string>();
  const re =
    /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi;
  for (const file of walk(MIGRATIONS_DIR, ['.sql'])) {
    const sql = readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) declared.add(m[1].toLowerCase());
  }
  return declared;
}

/** Relations referenced in code via `.from('<name>')`. Maps name -> files. */
function referencedRelations(): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const re = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/gi;
  for (const file of [
    ...walk(CODE_DIRS[0], ['.ts', '.tsx']),
    ...walk(CODE_DIRS[1], ['.ts', '.tsx']),
  ]) {
    const src = readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const name = m[1].toLowerCase();
      const list = refs.get(name) ?? [];
      list.push(file.replace(ROOT + '/', ''));
      refs.set(name, list);
    }
  }
  return refs;
}

describe('schema parity (code ↔ migrations)', () => {
  it('every relation the app queries is declared by a migration', () => {
    const declared = declaredRelations();
    const referenced = referencedRelations();

    // Sanity: we actually found migrations and queries to compare.
    expect(declared.size).toBeGreaterThan(0);
    expect(referenced.size).toBeGreaterThan(0);

    const missing: string[] = [];
    for (const [name, files] of referenced) {
      if (declared.has(name) || EXTERNAL_RELATIONS.has(name)) continue;
      missing.push(`  • "${name}" — referenced in ${files.join(', ')}`);
    }

    expect(
      missing.length,
      `Code references Supabase relations that no migration in ` +
        `supabase/migrations/ creates. Add a migration (and apply it to the ` +
        `target Supabase project before deploy — see CLAUDE.md):\n${missing.join('\n')}`,
    ).toBe(0);
  });
});
