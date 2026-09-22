/**
 * knowledge-sync — seed the built-in knowledge base from a terminal.
 *
 * The corpus is not something anyone should have to remember to press a
 * button for. Everything the app ships with (the ECHO driver personas, the
 * pushback taxonomy, the ACT guide, the clinical reference, the three Royal
 * Canin fecal charts, and the five bundled studies in `public/studies/`) is
 * seeded automatically by TWO triggers, both of which run the engine in
 * `netlify/functions/_shared/knowledgeSyncRun.ts`:
 *
 *   1. `netlify/functions/knowledge-sync-background.ts` — fired
 *      fire-and-forget from `flags-resolve` (every app boot) and from
 *      `admin-knowledge` GET. This is the one that works in production,
 *      where the service-role key only exists inside the runtime.
 *   2. `netlify/plugins/knowledge-sync` — the build plugin, belt and braces.
 *
 * This script is the third: the hands-on one, for a machine that HAS the
 * keys, plus the `--emit-sql` escape hatch for one that doesn't.
 *
 *   npm run knowledge:sync                    — write straight to Supabase
 *   npm run knowledge:sync -- --dry-run       — print the plan, write nothing
 *   npm run knowledge:sync -- --only fecal    — fecal | builtin | studies
 *   npm run knowledge:sync -- --emit-sql db/knowledge.sql --existing rows.json
 *
 * ── Idempotence ────────────────────────────────────────────────────────────
 * Every document stores `metadata.sync = { version, contentHash, sourceHash?,
 * syncedAt }`. A document whose body hashes the same AND still has chunks is
 * skipped — no embedding spend. A study PDF whose BYTES hash the same is not
 * even sent to Gemini for extraction. An admin's focus / citation / scope
 * edits are carried across, and a soft-deleted document stays deleted and
 * gets no chunks.
 *
 * ── Proof ──────────────────────────────────────────────────────────────────
 * After a direct-mode sync the script PROVES the loop works: it embeds a
 * query describing a score-3.5 stool and runs it twice through
 * `match_knowledge_chunks`, once scoped to dogs and once to cats. The dog run
 * must rank that passage first; the cat run must return cat chunks only. A
 * green run means retrieval AND the species boundary are live; a red one
 * means the corpus, the scope backfill or the RPC is wrong, and
 * `ai-fecal-scan` would silently fall back to its bundled chart.
 *
 * ── --emit-sql (environments without the service-role key) ─────────────────
 * Runs the SAME plan and the SAME embeddings, but writes idempotent SQL
 * instead of rows. It needs GEMINI_API_KEY and a JSON snapshot of the rows
 * that already exist, passed with `--existing <file>`. Produce that snapshot
 * in the Supabase SQL editor with exactly:
 *
 *     select coalesce(json_agg(t), '[]'::json) from (
 *       select d.slug,
 *              d.metadata,
 *              d.deleted_at,
 *              d.source,
 *              (select count(*) from public.knowledge_chunks k
 *                where k.doc_id = d.id) as chunk_count
 *       from public.knowledge_documents d
 *       order by d.slug
 *     ) t;
 *
 * Save the single returned value as `rows.json`. (An empty file or `[]` is
 * fine for a brand-new database — everything is then a create.) The output is
 * split into `<file>.001.sql`, `<file>.002.sql`, … of ~400 KB each; apply
 * them in order.
 *
 * Env (names only are ever printed, never values):
 *   direct:     SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
 *               GEMINI_API_KEY
 *   --emit-sql: GEMINI_API_KEY
 *
 * Paths are resolved from `process.cwd()`, which npm and the Netlify build
 * plugin both set to the repo root.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { embedTexts } from '../netlify/functions/_shared/gemini';
import {
  KNOWLEDGE_GROUPS,
  runKnowledgeSync,
  type KnowledgeGroup,
  type SyncLine,
} from '../netlify/functions/_shared/knowledgeSyncRun';
import type { ExistingKnowledgeRow } from '../netlify/functions/_shared/knowledgeSync';
import { emitKnowledgeSqlFiles } from '../netlify/functions/_shared/knowledgeSql';
import { toPgvectorLiteral } from '../src/services/ragShared';
import { fecalKnowledgeSlug } from '../src/data/knowledge/fecalCharts';

// ── CLI ────────────────────────────────────────────────────────────────────

interface Options {
  groups: KnowledgeGroup[];
  dryRun: boolean;
  emitSql: string | null;
  existing: string | null;
}

function parseArgs(argv: string[]): Options {
  const groups = new Set<KnowledgeGroup>();
  let dryRun = false;
  let emitSql: string | null = null;
  let existing: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    else if (arg === '--only') {
      const value = argv[++i] ?? '';
      for (const part of value.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (!KNOWLEDGE_GROUPS.includes(part as KnowledgeGroup)) {
          throw new Error(`--only expects ${KNOWLEDGE_GROUPS.join(' | ')}, got "${part}"`);
        }
        groups.add(part as KnowledgeGroup);
      }
    } else if (arg === '--emit-sql') {
      emitSql = argv[++i] ?? '';
      if (!emitSql) throw new Error('--emit-sql needs an output path');
    } else if (arg === '--existing') {
      existing = argv[++i] ?? '';
      if (!existing) throw new Error('--existing needs a file path');
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npm run knowledge:sync [-- --only fecal|builtin|studies] [--dry-run]\n' +
          '       npm run knowledge:sync -- --emit-sql <file> --existing <rows.json>',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return {
    groups: groups.size ? [...groups] : [...KNOWLEDGE_GROUPS],
    dryRun,
    emitSql,
    existing,
  };
}

function envFirst(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return '';
}

/** Study PDFs, from the working tree. (The function reads them over HTTP.) */
async function readStudyFromDisk(file: string): Promise<Uint8Array> {
  const full = path.resolve(process.cwd(), 'public', 'studies', file);
  if (!existsSync(full)) throw new Error(`Bundled study missing on disk: ${full}`);
  return readFileSync(full);
}

// ── Reporting ──────────────────────────────────────────────────────────────

function printTable(lines: SyncLine[]): void {
  const width = Math.max(4, ...lines.map((l) => l.slug.length));
  for (const line of lines) {
    console.log(
      `  ${line.slug.padEnd(width)}  ${line.action.padEnd(12)}  ` +
        `${line.chunks === null ? '—' : `${line.chunks} chunk${line.chunks === 1 ? '' : 's'}`}`,
    );
  }
}

// ── Existing rows ──────────────────────────────────────────────────────────

/**
 * Parse a `--existing` snapshot. Accepts the bare array, a `{ rows: [...] }`
 * wrapper, and the Supabase SQL-editor shape (one row, one column, holding
 * the json_agg array) — pasting the editor's result should just work.
 */
export function parseExistingRows(text: string): ExistingKnowledgeRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(trimmed);
  const unwrap = (value: unknown): unknown => {
    if (Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === 'object') {
      const keys = Object.keys(value[0] as Record<string, unknown>);
      if (keys.length === 1 && Array.isArray((value[0] as Record<string, unknown>)[keys[0]])) {
        return (value[0] as Record<string, unknown>)[keys[0]];
      }
    }
    if (value && typeof value === 'object' && Array.isArray((value as { rows?: unknown }).rows)) {
      return (value as { rows: unknown }).rows;
    }
    return value;
  };
  const rows = unwrap(parsed);
  if (!Array.isArray(rows)) throw new Error('--existing must hold a JSON array of rows');
  return rows.map((r) => {
    const row = (r ?? {}) as Record<string, unknown>;
    if (typeof row.slug !== 'string') throw new Error('--existing rows need a string `slug`');
    return {
      slug: row.slug,
      metadata: row.metadata,
      deleted_at: (row.deleted_at as string | null) ?? null,
      source: (row.source as string | null) ?? null,
      chunk_count: Number(row.chunk_count ?? 0),
    };
  });
}

// ── Retrieval proof ────────────────────────────────────────────────────────

/** The verification query — chart wording for dog score 3.5, paraphrased. */
const PROBE = 'moist stool with no cracks, distinct shape, components stick together';
const PROBE_EXPECT = 'Score 3.5';

type MatchRow = { content: string; similarity: number; doc_slug?: string };

/**
 * Structural, not `SupabaseClient`: the generated client type is generic over
 * a schema this script does not carry, and a nominal annotation here only
 * buys a cast.
 */
interface RpcClient {
  rpc: (fn: string, params: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
}

async function proveRetrieval(sb: RpcClient): Promise<void> {
  async function probe(species: 'dog' | 'cat'): Promise<MatchRow[]> {
    const [embedding] = await embedTexts([PROBE], 'RETRIEVAL_QUERY');
    const { data, error } = await sb.rpc('match_knowledge_chunks', {
      query_embedding: toPgvectorLiteral(embedding),
      match_count: 3,
      filter: { tools: ['fecal-scan'], species: [species] },
    });
    if (error) throw new Error(`match_knowledge_chunks (${species}) failed — ${error.message}`);
    const rows = (data ?? []) as MatchRow[];
    if (rows.length === 0) {
      throw new Error(
        `match_knowledge_chunks returned no rows for species "${species}" — is ` +
          '20260922000000_knowledge_scopes.sql applied? (unscoped chunks are invisible)',
      );
    }
    rows.forEach((r, i) => {
      // Every chunk opens with the same chart header, so print the first 72
      // chars of the SCORE paragraph — otherwise all three lines read alike.
      const body = r.content.split(/\n\s*\n/).pop() ?? r.content;
      console.log(
        `  ${i + 1}. ${r.similarity.toFixed(4)}  [${r.doc_slug ?? '?'}]  ` +
          body.replace(/\s+/g, ' ').slice(0, 72),
      );
    });
    return rows;
  }

  console.log('\nVerifying retrieval — scope { tools:[fecal-scan], species:[dog] }');
  console.log(`  query: "${PROBE}"`);
  const dogRows = await probe('dog');
  if (!dogRows[0].content.includes(PROBE_EXPECT)) {
    throw new Error(
      `Top match does not mention "${PROBE_EXPECT}" — the corpus or the embedding is wrong.`,
    );
  }
  const dogSlug = fecalKnowledgeSlug('dog');
  const strayDog = dogRows.find((r) => r.doc_slug && r.doc_slug !== dogSlug);
  if (strayDog) {
    throw new Error(`Dog scope leaked a chunk from ${strayDog.doc_slug} — the species tag is wrong.`);
  }

  console.log('\nVerifying isolation — scope { tools:[fecal-scan], species:[cat] }');
  const catRows = await probe('cat');
  const catSlug = fecalKnowledgeSlug('cat');
  const stray = catRows.find((r) => r.doc_slug && r.doc_slug !== catSlug);
  if (stray) {
    throw new Error(
      `Cat scope returned a chunk from ${stray.doc_slug} — species scoping is not being applied.`,
    );
  }

  console.log(
    `\nOK — top dog match is the ${PROBE_EXPECT} chunk, and the cat scope returns ` +
      `only ${catSlug} chunks.`,
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const emitting = opts.emitSql !== null;

  const missing = [!process.env.GEMINI_API_KEY && 'GEMINI_API_KEY'].filter(Boolean) as string[];
  const url = emitting ? '' : envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = emitting ? '' : (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '');
  if (!emitting) {
    if (!url) missing.push('SUPABASE_URL (or VITE_SUPABASE_URL)');
    if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  // Names only — never the values.
  if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}`);

  const sb = emitting
    ? null
    : createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

  let existingRows: ExistingKnowledgeRow[] | undefined;
  if (emitting) {
    if (!opts.existing) {
      throw new Error(
        '--emit-sql needs --existing <file> (see the SELECT in this file’s header). ' +
          'Use an empty [] for a brand-new database.',
      );
    }
    existingRows = parseExistingRows(
      readFileSync(path.resolve(process.cwd(), opts.existing), 'utf8'),
    );
  }

  const result = await runKnowledgeSync({
    // In --emit-sql mode nothing is read from or written to Supabase: the
    // rows come from the snapshot and the output is a file.
    sb: sb ?? ({ from: () => { throw new Error('no database in --emit-sql mode'); } } as never),
    readStudy: readStudyFromDisk,
    groups: opts.groups,
    existingRows,
    dryRun: opts.dryRun,
    collectSql: emitting,
    log: (line) => console.log(line),
  });

  console.log('');
  printTable(result.lines);

  if (opts.dryRun) {
    console.log(`\n${result.summary} (dry run — nothing was written)`);
    return;
  }

  if (emitting) {
    const files = emitKnowledgeSqlFiles(result.sqlDocs, opts.emitSql!);
    mkdirSync(path.dirname(path.resolve(process.cwd(), opts.emitSql!)), { recursive: true });
    for (const file of files) {
      writeFileSync(path.resolve(process.cwd(), file.name), file.body, 'utf8');
      console.log(`  wrote ${file.name} (${(Buffer.byteLength(file.body) / 1024).toFixed(0)} KB)`);
    }
    if (files.length === 0) console.log('  nothing to write — the corpus is already current');
    console.log(`\n${result.summary}`);
    console.log('Apply the SQL parts in order, then run `npm run knowledge:sync` to verify.');
    return;
  }

  console.log(`\n${result.summary}`);

  if (!opts.groups.includes('fecal')) {
    console.log('Retrieval proof skipped — it needs the fecal charts (`--only fecal`).');
    return;
  }
  await proveRetrieval(sb as unknown as RpcClient);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
