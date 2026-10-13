import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FLAG_DEFAULTS, type FlagKey } from '../services/flagsClient';
import { SCREEN_FLAGS } from '../app/screenFlags';

/**
 * Feature-switch parity guard.
 *
 * Every switch an admin can flip in Admin → Flags is a row seeded by a
 * migration. A row the app never reads is a lie on the admin screen: for
 * months *Voice mode in chat* sat there, documented as the fastest way to cut
 * AI spend, and switching it off did nothing. This test fails the build when:
 *
 *   1. a seeded switch has no `FlagKey` / default in `flagsClient.ts`;
 *   2. a `FlagKey` has no seeding migration (admins could never flip it);
 *   3. a switch is declared but never READ by app code (`src/`, outside the
 *      flag client itself) — i.e. flipping it would change nothing.
 */

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const SRC_DIR = join(ROOT, 'src');

function walk(dir: string, exts: string[]): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'tests') continue;
      out = out.concat(walk(full, exts));
    } else if (exts.some((e) => full.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

/** Keys inserted into public.flags by any migration. */
function seededFlagKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const inserts = sql.split(/insert\s+into\s+public\.flags\s*\(/i).slice(1);
    for (const chunk of inserts) {
      const body = chunk.split(/;\s*(?:\n|$)/)[0];
      for (const m of body.matchAll(/\(\s*'([a-z][\w.]*)'\s*,\s*'(screen|nav|scenario|component|field|ai)'/g)) {
        keys.add(m[1]);
      }
    }
  }
  return keys;
}

const DECLARED = Object.keys(FLAG_DEFAULTS) as FlagKey[];
const SEEDED = seededFlagKeys();

/** App source that READS flags — the client file only declares them. */
const READERS = walk(SRC_DIR, ['.ts', '.tsx'])
  .filter((f) => !f.endsWith(join('services', 'flagsClient.ts')))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

describe('feature switches: seeded ↔ declared ↔ read', () => {
  it('finds the seeded switches (sanity)', () => {
    expect(SEEDED.size).toBeGreaterThanOrEqual(24);
    expect(SEEDED.has('screen.voice.enabled')).toBe(true);
  });

  it('every seeded switch is declared with a default in flagsClient', () => {
    const undeclared = [...SEEDED].filter((k) => !(k in FLAG_DEFAULTS));
    expect(undeclared).toEqual([]);
  });

  it('every declared switch is seeded by a migration', () => {
    const unseeded = DECLARED.filter((k) => !SEEDED.has(k));
    expect(unseeded).toEqual([]);
  });

  it('every declared switch is read somewhere in the app', () => {
    // Single quotes in code, double quotes in JSX (`<IfFlag flag="…">`).
    const unread = DECLARED.filter((k) => !READERS.includes(`'${k}'`) && !READERS.includes(`"${k}"`));
    expect(unread).toEqual([]);
  });

  it('every screen switch the route guard uses is a declared key', () => {
    for (const key of Object.values(SCREEN_FLAGS)) {
      expect(key && key in FLAG_DEFAULTS).toBe(true);
    }
  });
});
