#!/usr/bin/env node
/**
 * Bundle gate — two checks on the production build:
 *
 *  1. SIZE (spec §13.9): the consumer PWA's main entry chunk must stay under
 *     500 kB gzipped.
 *  2. SECRETS: no Google API key may appear in ANY emitted JS. The Gemini key
 *     is held only by the Netlify Functions (`netlify/functions/ai-*`) and is
 *     no longer needed — or read — at build time; this scan is the CI proof
 *     that it stayed out of the bundle.
 *
 * Run AFTER a production build; this script only reads `dist/`:
 *
 *   npm run build
 *   npm run check:bundle
 *
 * Deliberately NOT chained into `npm run build` — Netlify's build should stay
 * a pure build. Wire `npm run check:bundle` as its own CI step after the build
 * step so a regression fails the pipeline without breaking deploys locally.
 *
 * Notes on what is measured:
 *  - The *entry* chunk is resolved from `dist/index.html` (the `<script
 *    type="module">` src), not guessed by size — `admin.html` has its own
 *    entry and must not be confused for it.
 *  - "Initial payload" = entry + every chunk Vite emits a `modulepreload` for,
 *    i.e. the entry's static import graph. The gate is on the entry chunk (per
 *    spec) but the payload total is printed too, so moving code into a vendor
 *    chunk can't quietly pass the gate while the user still downloads it.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const ASSETS = join(DIST, 'assets');

/** kB here means 1000 bytes, to line up with Vite's own build report. */
const KB = 1000;
const LIMIT_BYTES = 500 * KB;

/**
 * Shape of a Google API key (`AIza` + 35 URL-safe chars). Anchored on the
 * prefix so ordinary base64/hashes in a bundle don't false-positive.
 */
const GOOGLE_API_KEY_RX = /AIza[0-9A-Za-z_-]{30,}/;

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/** Every `*.js` under `dir`, recursively. */
function walkJs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkJs(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function fmt(bytes) {
  return (bytes / KB).toFixed(2).padStart(9) + ' kB';
}

if (!existsSync(ASSETS)) {
  fail(`No build found at ${DIST}. Run \`npm run build\` first.`);
}

// ── Resolve the consumer entry + its static import graph from index.html ────
const indexHtml = join(DIST, 'index.html');
if (!existsSync(indexHtml)) fail(`Missing ${indexHtml}. Run \`npm run build\` first.`);
const html = readFileSync(indexHtml, 'utf8');

const entryMatch = html.match(
  /<script[^>]*type="module"[^>]*src="([^"]+\.js)"/,
);
if (!entryMatch) fail('Could not find the module <script> entry in dist/index.html.');
const entry = basename(entryMatch[1]);

// Vite emits a modulepreload link for every chunk in the entry's *static*
// import graph. Dynamic (lazy) chunks are not preloaded, which is exactly the
// distinction we want.
const preloaded = new Set(
  [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+\.js)"/g)].map(
    (m) => basename(m[1]),
  ),
);
const initial = new Set([entry, ...preloaded]);

// The admin dashboard is a second entry served at /admin — reported, not gated.
const adminHtmlPath = join(DIST, 'admin.html');
const adminInitial = new Set();
if (existsSync(adminHtmlPath)) {
  const adminHtml = readFileSync(adminHtmlPath, 'utf8');
  const m = adminHtml.match(/<script[^>]*type="module"[^>]*src="([^"]+\.js)"/);
  if (m) adminInitial.add(basename(m[1]));
  for (const l of adminHtml.matchAll(
    /<link[^>]*rel="modulepreload"[^>]*href="([^"]+\.js)"/g,
  )) {
    adminInitial.add(basename(l[1]));
  }
}

// ── Measure every emitted JS chunk ─────────────────────────────────────────
const chunks = readdirSync(ASSETS)
  .filter((f) => f.endsWith('.js'))
  .map((file) => {
    const buf = readFileSync(join(ASSETS, file));
    return {
      file,
      raw: buf.byteLength,
      gzip: gzipSync(buf, { level: 9 }).byteLength,
    };
  })
  .sort((a, b) => b.gzip - a.gzip);

function role(file) {
  if (file === entry) return 'entry';
  if (initial.has(file)) return 'initial';
  if (adminInitial.has(file)) return 'admin';
  return 'lazy';
}

console.log('\nBundle report — dist/assets/*.js (gzip level 9)\n');
console.log(
  '  ' +
    'chunk'.padEnd(42) +
    'raw'.padStart(12) +
    'gzip'.padStart(12) +
    '  role',
);
console.log('  ' + '─'.repeat(80));
for (const c of chunks) {
  console.log(
    '  ' + c.file.padEnd(42) + fmt(c.raw).padStart(12) + fmt(c.gzip).padStart(12) + '  ' + role(c.file),
  );
}

const initialChunks = chunks.filter((c) => initial.has(c.file));
const initialGzip = initialChunks.reduce((n, c) => n + c.gzip, 0);
const lazyGzip = chunks
  .filter((c) => role(c.file) === 'lazy')
  .reduce((n, c) => n + c.gzip, 0);

const main = chunks.find((c) => c.file === entry);
console.log('  ' + '─'.repeat(80));
console.log(`  main entry chunk         ${entry}`);
console.log(`  main entry gzip          ${fmt(main.gzip)}   (limit ${fmt(LIMIT_BYTES)})`);
console.log(
  `  initial payload gzip     ${fmt(initialGzip)}   (${initialChunks.length} chunks: entry + modulepreload)`,
);
console.log(`  deferred (lazy) gzip     ${fmt(lazyGzip)}`);

// A build without VITE_SUPABASE_* tree-shakes @supabase/supabase-js out
// entirely (getSupabase() short-circuits on the missing env), so the numbers
// would under-report what production actually ships.
const hasSupabase = chunks.some((c) => c.file.startsWith('vendor-supabase') && c.raw > 0);
if (!hasSupabase) {
  console.log(
    '\n  ! This build has no Supabase chunk — VITE_SUPABASE_URL /' +
      '\n    VITE_SUPABASE_PUBLISHABLE_KEY were unset, so @supabase/supabase-js was' +
      '\n    tree-shaken. The initial-payload figure under-reports production by' +
      '\n    roughly 50 kB gzip. Set both to reproduce a production build.',
  );
}

console.log('');

// ── Secret scan: the Gemini key must not be in any emitted JS ──────────────
const allJs = walkJs(DIST);
const leaks = allJs.filter((file) => GOOGLE_API_KEY_RX.test(readFileSync(file, 'utf8')));
if (leaks.length > 0) {
  fail(
    'A Google API key–shaped string (AIza…) was found in the build output:\n' +
      leaks.map((f) => `  - ${relative(ROOT, f)}`).join('\n') +
      '\n  The Gemini key must only be read by the Netlify Functions at runtime.\n' +
      '  Check for a `define` in vite.config.ts, a `VITE_*` env var holding the key,\n' +
      '  or a hardcoded key in src/ or admin/src/.',
  );
}
console.log(`✔ No Google API key–shaped string in ${allJs.length} emitted JS file(s).`);

if (main.gzip > LIMIT_BYTES) {
  fail(
    `Main entry chunk is over budget: ${fmt(main.gzip)} gzip > ${fmt(LIMIT_BYTES)} (spec §13.9).\n` +
      `  Chunk: dist/assets/${entry}\n` +
      `  Fix by moving screen/feature code behind React.lazy in src/app/App.tsx,\n` +
      `  or by giving a large third-party dependency its own manualChunk in vite.config.ts.`,
  );
}

console.log(
  `✔ Main entry chunk ${fmt(main.gzip)} gzip is within the ${fmt(LIMIT_BYTES)} budget (spec §13.9).\n`,
);
