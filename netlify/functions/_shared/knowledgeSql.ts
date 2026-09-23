/**
 * Emit the knowledge sync as idempotent SQL.
 *
 * `npm run knowledge:sync -- --emit-sql <file>` runs the SAME plan and the
 * SAME embeddings as the direct-to-Supabase mode, but writes `.sql` files
 * instead of rows — for environments where the service-role key isn't handed
 * to a build (or to a laptop), and the migration has to be pasted into the
 * Supabase SQL editor.
 *
 * Every statement is safe to run twice:
 *   • the document is an `insert … on conflict (slug) do update`;
 *   • the chunks are deleted and re-inserted wholesale.
 *
 * Strings are dollar-quoted with a tag chosen per value, so a body containing
 * `$q$`, ending in `$q`, or holding a quote, a backslash or a newline cannot
 * terminate its own literal.
 *
 * Pure module: values in, SQL text out. No I/O.
 */

export interface SqlChunkRow {
  chunk_idx: number;
  content: string;
  token_estimate: number;
  tags: Record<string, unknown>;
  citation: string | null;
  /** Already-normalised embedding vector. */
  embedding: number[];
}

export interface SqlDocument {
  slug: string;
  title: string;
  category: string;
  content: string;
  /** Final metadata (admin edits already merged in, `sync` already stamped). */
  metadata: Record<string, unknown>;
  /** Written as `source` — always 'code-seed' for built-in knowledge. */
  source?: string;
  /**
   * The chunks to (re)write. An EMPTY array still emits the delete — that is
   * how a soft-deleted document is refreshed without becoming retrievable.
   */
  chunks: SqlChunkRow[];
  /**
   * Skip the chunk delete + insert entirely (a soft-deleted document, whose
   * chunks the admin's delete already took out of retrieval and whose
   * embeddings we must not pay for again).
   */
  chunksUntouched?: boolean;
}

/**
 * Dollar-quote a string with a tag that cannot end the literal early.
 *
 * Postgres ends a dollar-quoted literal at the FIRST occurrence of the exact
 * delimiter after the opening tag, and that search runs over the body AND the
 * closing tag together. So "the body does not contain the tag" is not enough:
 * a body ending in `$q` followed by the closing `$q$` reads as `…$q$q$`, and
 * the literal closes one character early. The rule that is actually
 * sufficient: the first occurrence of `tag` in `text + tag` is the closing
 * tag itself. A lone `$`, a quote or a backslash are all ordinary characters
 * inside it.
 */
export function dollarQuote(text: string): string {
  const safe = (tag: string) => (text + tag).indexOf(tag) === text.length;
  let tag = '$q$';
  for (let i = 0; !safe(tag); i++) tag = `$q${i}$`;
  return `${tag}${text}${tag}`;
}

/** A pgvector literal. Rejects non-finite values rather than emitting `NaN`. */
export function vectorLiteral(vec: readonly number[]): string {
  for (const v of vec) {
    if (!Number.isFinite(v)) throw new Error('embedding contains a non-finite value');
  }
  return `'[${vec.join(',')}]'::vector`;
}

function jsonLiteral(value: unknown): string {
  return `${dollarQuote(JSON.stringify(value ?? {}))}::jsonb`;
}

function intLiteral(n: number): string {
  if (!Number.isInteger(n)) throw new Error(`expected an integer, got ${String(n)}`);
  return `${n}::int`;
}

/** Rows per chunk-insert statement — keeps a single statement pasteable. */
export const CHUNK_BATCH = 20;

/** The statements that (re)write one document. */
export function emitDocumentSql(doc: SqlDocument): string[] {
  const source = doc.source ?? 'code-seed';
  const statements: string[] = [];

  statements.push(
    [
      'insert into public.knowledge_documents (slug, title, category, content, metadata, source, updated_at)',
      'values (',
      `  ${dollarQuote(doc.slug)},`,
      `  ${dollarQuote(doc.title)},`,
      `  ${dollarQuote(doc.category)},`,
      `  ${dollarQuote(doc.content)},`,
      `  ${jsonLiteral(doc.metadata)},`,
      `  ${dollarQuote(source)},`,
      '  now()',
      ')',
      'on conflict (slug) do update set',
      '  content = excluded.content,',
      '  title = excluded.title,',
      '  category = excluded.category,',
      '  metadata = excluded.metadata,',
      `  source = ${dollarQuote(source)},`,
      '  updated_at = now();',
    ].join('\n'),
  );

  if (doc.chunksUntouched) return statements;

  statements.push(
    [
      'delete from public.knowledge_chunks',
      `where doc_id = (select id from public.knowledge_documents where slug = ${dollarQuote(doc.slug)});`,
    ].join('\n'),
  );

  for (let i = 0; i < doc.chunks.length; i += CHUNK_BATCH) {
    const batch = doc.chunks.slice(i, i + CHUNK_BATCH);
    const values = batch
      .map(
        (c) =>
          '  (' +
          [
            intLiteral(c.chunk_idx),
            `${dollarQuote(c.content)}::text`,
            intLiteral(c.token_estimate),
            jsonLiteral(c.tags),
            c.citation ? `${dollarQuote(c.citation)}::text` : 'null::text',
            vectorLiteral(c.embedding),
          ].join(', ') +
          ')',
      )
      .join(',\n');
    statements.push(
      [
        'insert into public.knowledge_chunks (doc_id, chunk_idx, content, token_estimate, tags, citation, embedding)',
        'select d.id, c.chunk_idx, c.content, c.token_estimate, c.tags, c.citation, c.embedding',
        'from public.knowledge_documents d',
        'cross join (values',
        values,
        ') as c(chunk_idx, content, token_estimate, tags, citation, embedding)',
        `where d.slug = ${dollarQuote(doc.slug)};`,
      ].join('\n'),
    );
  }

  return statements;
}

/**
 * Soft-delete a built-in document the code no longer defines. Guarded exactly
 * like the direct-write path: only a live `code-seed` row is ever touched.
 */
export function emitRetireSql(slug: string): string {
  return [
    'update public.knowledge_documents',
    '  set deleted_at = now(), updated_at = now()',
    `where slug = ${dollarQuote(slug)}`,
    `  and source = ${dollarQuote('code-seed')}`,
    '  and deleted_at is null;',
  ].join('\n');
}

/** Default part size. Small enough to paste into the Supabase SQL editor. */
export const MAX_SQL_FILE_BYTES = 400 * 1024;

/**
 * Pack statements into files of at most `maxBytes`, never splitting a
 * statement. A statement larger than the budget gets a file of its own rather
 * than being truncated.
 *
 * Parts are applied IN ORDER: one document's delete and insert can land in
 * different parts, so a half-applied run leaves that document chunk-less
 * (invisible to retrieval, fail-open) until the next part runs.
 */
export function splitSqlFiles(
  statements: readonly string[],
  maxBytes: number = MAX_SQL_FILE_BYTES,
): string[] {
  const files: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const statement of statements) {
    const cost = Buffer.byteLength(statement, 'utf8') + 2;
    if (current.length > 0 && size + cost > maxBytes) {
      files.push(current.join('\n\n'));
      current = [];
      size = 0;
    }
    current.push(statement);
    size += cost;
  }
  if (current.length > 0) files.push(current.join('\n\n'));
  return files;
}

export interface EmittedSqlFile {
  /** e.g. `knowledge.001.sql` when `--emit-sql knowledge.sql` was given. */
  name: string;
  body: string;
}

/**
 * Full emission: every document's statements, wrapped one transaction per
 * part, split into `<base>.NNN.sql` files.
 */
export function emitKnowledgeSqlFiles(
  docs: readonly SqlDocument[],
  outPath: string,
  maxBytes: number = MAX_SQL_FILE_BYTES,
  retireSlugs: readonly string[] = [],
): EmittedSqlFile[] {
  const statements = [
    ...docs.flatMap((d) => emitDocumentSql(d)),
    ...retireSlugs.map((slug) => emitRetireSql(slug)),
  ];
  const parts = splitSqlFiles(statements, maxBytes);
  const base = outPath.replace(/\.sql$/i, '');
  return parts.map((body, i) => ({
    name: `${base}.${String(i + 1).padStart(3, '0')}.sql`,
    body: [
      `-- knowledge sync — part ${i + 1} of ${parts.length}`,
      '-- Generated by `npm run knowledge:sync -- --emit-sql`. Idempotent: every',
      '-- statement may be run again. Apply the parts IN ORDER.',
      '',
      'begin;',
      '',
      body,
      '',
      'commit;',
      '',
    ].join('\n'),
  }));
}
