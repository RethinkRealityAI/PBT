/**
 * Feline asset extraction, step 3 of 3:
 *   npm run feline:snapshot [-- --only slug,slug] [--upload] [--emit-sql <file>]
 *
 * Reads the rows `feline:build` wrote to `.cache/feline/build/<slug>.json`
 * (gitignored — the text is © Royal Canin and the repository is public),
 * checks each one against its pin in `knowledge/feline/manifest.json`
 * (sha256 of the content = `contentHash`, source file sha256 = `sourceHash`)
 * and sends them to `knowledge_source_snapshots`: `--upload` with the
 * service-role key, `--emit-sql <file>` as SQL parts (keep them out of git).
 * Every document is uploaded, approved or held: a held document (open
 * fidelity review notes) is stored so the reviewer can read it, but the sync
 * only ever reads APPROVED documents, and only while the gate is open.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { validateFelineManifest, type FelineManifest } from '../../netlify/functions/_shared/knowledgeFeline';
import { publishSnapshotRows, type SnapshotUploadRow } from '../knowledgeSnapshots';

const ROOT = process.cwd();
export const MANIFEST_PATH = path.join(ROOT, 'knowledge/feline/manifest.json');
export const BUILD_DIR = path.join(ROOT, '.cache/feline/build');

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

/** The pinned rows for `slugs` (all documents when empty); throws on any mismatch. */
export function loadPinnedRows(manifest: FelineManifest, buildDir: string, only?: Set<string>): SnapshotUploadRow[] {
  const rows: SnapshotUploadRow[] = [];
  for (const d of manifest.documents) {
    if (only && !only.has(d.slug)) continue;
    const file = path.join(buildDir, `${d.slug}.json`);
    if (!existsSync(file)) throw new Error(`${d.slug}: no build output — run \`npm run feline:build\``);
    const row = JSON.parse(readFileSync(file, 'utf8')) as SnapshotUploadRow;
    if (row.corpus !== 'feline' || row.slug !== d.slug) throw new Error(`${d.slug}: build output is for ${row.corpus}:${row.slug}`);
    if (sha256(row.content) !== d.contentHash) {
      throw new Error(`${d.slug}: content does not match the manifest pin — re-run \`npm run feline:build\``);
    }
    if (row.source_hash !== d.sourceHash) throw new Error(`${d.slug}: source file changed since the pin`);
    rows.push({ ...row, content_hash: d.contentHash! });
  }
  return rows;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set((args[onlyIdx + 1] ?? '').split(',').filter(Boolean)) : undefined;
  const manifest = validateFelineManifest(JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')));
  const rows = loadPinnedRows(manifest, BUILD_DIR, only);
  const held = manifest.documents.filter((d) => !d.approved).map((d) => d.slug);
  console.log(`feline: ${rows.length} row(s) pinned and verified (${held.length} held for review: ${held.join(', ') || 'none'})`);
  if (!rows.some((r) => typeof r.meta.sourceUrl === 'string')) {
    console.log('  note: no meta.sourceUrl — pass --box-share (or FELINE_BOX_SHARE) to feline:build for the admin "Open source" link');
  }
  if (!args.includes('--upload') && !args.includes('--emit-sql')) {
    console.log('Nothing sent: pass --upload (service role) or --emit-sql <file>.');
    return;
  }
  await publishSnapshotRows(args, rows);
}

if (process.argv[1]?.includes('feline-snapshot')) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
