/**
 * Writers for `knowledge_source_snapshots` — the private home of the external
 * corpora's text (Royal Canin Academy articles, Royal Canin feline assets).
 * Shared by `academy:snapshot` and `feline:snapshot`.
 *
 *   --upload          upsert the rows with the service-role key
 *                     (SUPABASE_URL or VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
 *   --emit-sql <file> write idempotent SQL parts `<file>.001.sql`, … (~400 KB
 *                     each) for an environment without the key; apply them
 *                     in order (SQL editor / MCP). Keep the files out of git.
 *
 * Uploading a row never makes it retrievable: only the knowledge sync, with
 * the corpus's publish gate open and the row matching the manifest's sha256
 * pin, writes knowledge_documents / knowledge_chunks.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface SnapshotUploadRow {
  corpus: 'academy' | 'feline';
  slug: string;
  content: string;
  content_hash: string;
  source_hash: string | null;
  meta: Record<string, unknown>;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** Refuse a row whose hash isn't the hash of its content — the sync would refuse it anyway. */
export function assertRow(row: SnapshotUploadRow): void {
  if (!/^[a-z0-9][a-z0-9-]{0,199}$/.test(row.slug)) throw new Error(`bad slug ${row.slug}`);
  if (sha256(row.content) !== row.content_hash) throw new Error(`${row.slug}: content_hash is not sha256(content)`);
}

/** A dollar-quote tag that does not occur in `text` ($pbt$, $pbt1$, …). */
export function dollarTag(text: string, base = 'pbt'): string {
  for (let i = 0; ; i++) {
    const tag = `$${base}${i || ''}$`;
    if (!text.includes(tag)) return tag;
  }
}

const q = (text: string) => {
  const tag = dollarTag(text);
  return `${tag}${text}${tag}`;
};

/** One idempotent upsert statement for a row. */
export function upsertSql(row: SnapshotUploadRow): string {
  assertRow(row);
  return (
    'insert into public.knowledge_source_snapshots (corpus, slug, content, content_hash, source_hash, meta, updated_at)\n' +
    `values (${q(row.corpus)}, ${q(row.slug)}, ${q(row.content)}, ${q(row.content_hash)}, ` +
    `${row.source_hash ? q(row.source_hash) : 'null'}, ${q(JSON.stringify(row.meta))}::jsonb, now())\n` +
    'on conflict (corpus, slug) do update set content = excluded.content, content_hash = excluded.content_hash, ' +
    'source_hash = excluded.source_hash, meta = excluded.meta, updated_at = now()\n' +
    // An unchanged row is not rewritten.
    'where knowledge_source_snapshots.content_hash is distinct from excluded.content_hash\n' +
    '   or knowledge_source_snapshots.meta is distinct from excluded.meta;\n'
  );
}

/** Split the upserts into parts of ~maxBytes; returns [name, body][]. */
export function snapshotSqlParts(rows: SnapshotUploadRow[], file: string, maxBytes = 400_000): Array<[string, string]> {
  const parts: string[][] = [[]];
  let size = 0;
  for (const row of rows) {
    const stmt = upsertSql(row);
    const n = Buffer.byteLength(stmt);
    if (size + n > maxBytes && parts[parts.length - 1].length) {
      parts.push([]);
      size = 0;
    }
    parts[parts.length - 1].push(stmt);
    size += n;
  }
  const base = file.replace(/\.sql$/, '');
  return parts
    .filter((p) => p.length)
    .map((p, i) => [`${base}.${String(i + 1).padStart(3, '0')}.sql`, `begin;\n${p.join('\n')}commit;\n`]);
}

export function emitSnapshotSql(rows: SnapshotUploadRow[], file: string): string[] {
  const parts = snapshotSqlParts(rows, file);
  for (const [name, body] of parts) {
    const abs = path.resolve(process.cwd(), name);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, body, 'utf8');
    console.log(`  wrote ${name} (${(Buffer.byteLength(body) / 1024).toFixed(0)} KB)`);
  }
  return parts.map(([n]) => n);
}

/** Upsert with the service role, 20 rows per request. Env names only are ever printed. */
export async function uploadSnapshots(rows: SnapshotUploadRow[]): Promise<number> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const missing = [!url && 'SUPABASE_URL (or VITE_SUPABASE_URL)', !key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
  if (missing.length) throw new Error(`--upload needs ${missing.join(', ')} (or use --emit-sql)`);
  rows.forEach(assertRow);
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let done = 0;
  for (let i = 0; i < rows.length; i += 20) {
    const batch = rows.slice(i, i + 20).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await sb.from('knowledge_source_snapshots').upsert(batch, { onConflict: 'corpus,slug' });
    if (error) throw new Error(`upload failed at row ${i}: ${error.message}`);
    done += batch.length;
  }
  console.log(`  uploaded ${done} row(s) to knowledge_source_snapshots`);
  return done;
}

/** `--upload` / `--emit-sql <file>` from argv, applied to `rows`. */
export async function publishSnapshotRows(argv: string[], rows: SnapshotUploadRow[]): Promise<void> {
  const emitIdx = argv.indexOf('--emit-sql');
  if (emitIdx >= 0) {
    const file = argv[emitIdx + 1];
    if (!file) throw new Error('--emit-sql needs an output path');
    emitSnapshotSql(rows, file);
  }
  if (argv.includes('--upload')) await uploadSnapshots(rows);
}
