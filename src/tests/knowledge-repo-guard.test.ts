/**
 * The repository is PUBLIC. The external knowledge corpora (Royal Canin
 * Academy articles, Royal Canin feline assets) are © Royal Canin: their text
 * lives in the service-role table `knowledge_source_snapshots`, and git holds
 * only manifests and catalogues of METADATA (slugs, titles, scopes, hashes,
 * page numbers). This guard fails the build if prose-shaped fields creep
 * into `knowledge/`, if an article / asset body is committed there, or if a
 * Box share link or a Royal Canin e-mail address appears anywhere in the
 * repo (the share link grants anyone access to Royal Canin's folder; it
 * belongs in admin-only database metadata).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const KNOWLEDGE = path.join(ROOT, 'knowledge');

/** Keys that would carry the source's own prose. */
const PROSE_KEYS = new Set([
  'content',
  'body',
  'text',
  'markdown',
  'description',
  'abstract',
  'keywords',
  'authors',
  'authorBio',
  'bio',
  'lead',
  'quote',
  'quotes',
  'conflictOfInterest',
]);

function walk(dir: string, skip: Set<string>, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, skip, out);
    else out.push(full);
  }
  return out;
}

function proseKeys(value: unknown, at: string, found: string[]): void {
  if (Array.isArray(value)) value.forEach((v, i) => proseKeys(v, `${at}[${i}]`, found));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (PROSE_KEYS.has(k)) found.push(`${at}.${k}`);
      proseKeys(v, `${at}.${k}`, found);
    }
  }
}

describe('knowledge/ holds metadata only', () => {
  const files = walk(KNOWLEDGE, new Set());

  it('has only manifests, catalogues and READMEs — no article or asset bodies', () => {
    const rel = files.map((f) => path.relative(KNOWLEDGE, f).split(path.sep).join('/'));
    for (const f of rel) expect(f, f).toMatch(/^[a-z-]+\/(manifest\.json|catalogue\.json|README\.md)$/);
  });

  it('no JSON file under knowledge/ carries a prose field', () => {
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const found: string[] = [];
      proseKeys(JSON.parse(readFileSync(file, 'utf8')), path.relative(ROOT, file), found);
      expect(found, `${path.relative(ROOT, file)} has prose-shaped keys`).toEqual([]);
    }
  });

  it('every reason / note is a short line of our own, not a pasted passage', () => {
    const long: string[] = [];
    const visit = (v: unknown, at: string) => {
      if (Array.isArray(v)) v.forEach((x, i) => visit(x, `${at}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, `${at}.${k}`);
      else if (typeof v === 'string' && v.length > 300) long.push(at);
    };
    for (const file of files.filter((f) => f.endsWith('.json'))) visit(JSON.parse(readFileSync(file, 'utf8')), path.relative(ROOT, file));
    expect(long).toEqual([]);
  });
});

describe('no Royal Canin access links or addresses anywhere in the repo', () => {
  const SKIP = new Set(['node_modules', '.git', 'dist', '.cache', '.netlify', 'graphify-out', 'coverage', 'playwright-report']);
  const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|html|css|toml|sql|yml|yaml|txt|py|sh|svg)$/i;
  const files = walk(ROOT, SKIP).filter((f) => TEXT.test(f) && statSync(f).size < 5_000_000);
  // Built from parts so this file does not match itself.
  const BOX_SHARE = new RegExp(['box', '\\.com/s/[a-z0-9]{16,}'].join(''), 'i');
  const RC_EMAIL = new RegExp(['[a-z0-9._%+-]+@', 'royalcanin\\.com'].join(''), 'i');

  it('has no Box share link (it grants access to Royal Canin’s folder)', () => {
    const hits = files.filter((f) => BOX_SHARE.test(readFileSync(f, 'utf8'))).map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });

  it('has no @royalcanin.com address (form placeholders like name@… aside)', () => {
    const PLACEHOLDER = /^(name|you|your\.name|firstname\.lastname|example)@/i;
    const hits = files
      .filter((f) => {
        const text = readFileSync(f, 'utf8');
        const all = text.match(new RegExp(RC_EMAIL.source, 'gi')) ?? [];
        return all.some((m) => !PLACEHOLDER.test(m));
      })
      .map((f) => path.relative(ROOT, f));
    expect(hits).toEqual([]);
  });
});
