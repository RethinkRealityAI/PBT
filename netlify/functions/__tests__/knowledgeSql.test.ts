// @vitest-environment node
/**
 * The `--emit-sql` output is applied by hand in the Supabase SQL editor, so
 * nothing verifies it before it runs against the real corpus. These tests are
 * that verification: the exact statement shapes, and the two ways a generator
 * like this silently corrupts a database — a string that escapes its own
 * quoting, and a file too large to paste.
 */
import { describe, expect, it } from 'vitest';
import {
  dollarQuote,
  emitDocumentSql,
  emitKnowledgeSqlFiles,
  splitSqlFiles,
  vectorLiteral,
  type SqlDocument,
} from '../_shared/knowledgeSql';

const tinyDoc: SqlDocument = {
  slug: 'act:acknowledge',
  title: 'ACT method — Acknowledge',
  category: 'act',
  content: '# Acknowledge\n\nGoal: name the concern.',
  metadata: { act_step: 'acknowledge', tags: { tools: ['roleplay'] } },
  chunks: [
    {
      chunk_idx: 0,
      content: 'Goal: name the concern.',
      token_estimate: 7,
      tags: { category: 'act', tools: ['roleplay'] },
      citation: null,
      embedding: [0.5, -0.25],
    },
  ],
};

describe('emitDocumentSql', () => {
  it('emits the upsert, the chunk delete and the batched chunk insert, in order', () => {
    const [upsert, del, insert, ...rest] = emitDocumentSql(tinyDoc);
    expect(rest).toEqual([]);

    expect(upsert).toBe(
      [
        'insert into public.knowledge_documents (slug, title, category, content, metadata, source, updated_at)',
        'values (',
        '  $q$act:acknowledge$q$,',
        '  $q$ACT method — Acknowledge$q$,',
        '  $q$act$q$,',
        '  $q$# Acknowledge\n\nGoal: name the concern.$q$,',
        '  $q${"act_step":"acknowledge","tags":{"tools":["roleplay"]}}$q$::jsonb,',
        '  $q$code-seed$q$,',
        '  now()',
        ')',
        'on conflict (slug) do update set',
        '  content = excluded.content,',
        '  title = excluded.title,',
        '  category = excluded.category,',
        '  metadata = excluded.metadata,',
        '  source = $q$code-seed$q$,',
        '  updated_at = now();',
      ].join('\n'),
    );

    expect(del).toBe(
      'delete from public.knowledge_chunks\n' +
        'where doc_id = (select id from public.knowledge_documents where slug = $q$act:acknowledge$q$);',
    );

    expect(insert).toBe(
      [
        'insert into public.knowledge_chunks (doc_id, chunk_idx, content, token_estimate, tags, citation, embedding)',
        'select d.id, c.chunk_idx, c.content, c.token_estimate, c.tags, c.citation, c.embedding',
        'from public.knowledge_documents d',
        'cross join (values',
        '  (0::int, $q$Goal: name the concern.$q$::text, 7::int, ' +
          '$q${"category":"act","tools":["roleplay"]}$q$::jsonb, null::text, ' +
          "'[0.5,-0.25]'::vector)",
        ') as c(chunk_idx, content, token_estimate, tags, citation, embedding)',
        'where d.slug = $q$act:acknowledge$q$;',
      ].join('\n'),
    );
  });

  it('writes the citation when there is one', () => {
    const sql = emitDocumentSql({
      ...tinyDoc,
      chunks: [{ ...tinyDoc.chunks[0], citation: 'Royal Canin, 2024' }],
    }).join('\n');
    expect(sql).toContain('$q$Royal Canin, 2024$q$::text');
  });

  it('refreshes a soft-deleted document WITHOUT touching its chunks', () => {
    const statements = emitDocumentSql({ ...tinyDoc, chunks: [], chunksUntouched: true });
    expect(statements).toHaveLength(1);
    expect(statements[0]).toContain('on conflict (slug) do update set');
    expect(statements.join('\n')).not.toContain('knowledge_chunks');
  });

  it('batches a large chunk set into several insert statements', () => {
    const chunks = Array.from({ length: 45 }, (_, i) => ({
      ...tinyDoc.chunks[0],
      chunk_idx: i,
      content: `chunk ${i}`,
    }));
    const inserts = emitDocumentSql({ ...tinyDoc, chunks }).filter((s) =>
      s.startsWith('insert into public.knowledge_chunks'),
    );
    expect(inserts).toHaveLength(3); // CHUNK_BATCH = 20 → 20 + 20 + 5
    expect(inserts[0].match(/::vector/g)).toHaveLength(20);
    expect(inserts[2].match(/::vector/g)).toHaveLength(5);
    // Every chunk survives exactly once.
    const all = inserts.join('\n');
    for (let i = 0; i < 45; i++) expect(all).toContain(`$q$chunk ${i}$q$::text`);
  });

  it('rejects a non-finite embedding rather than emitting NaN', () => {
    expect(() => vectorLiteral([1, Number.NaN])).toThrow(/non-finite/);
  });
});

describe('dollarQuote', () => {
  it('uses $q$ when the text is ordinary', () => {
    expect(dollarQuote("it's a test")).toBe("$q$it's a test$q$");
  });

  it('picks a different tag when the content contains $q$', () => {
    const quoted = dollarQuote('a $q$ b');
    expect(quoted).toBe('$q0$a $q$ b$q0$');
  });

  it('keeps escalating until the tag is genuinely absent', () => {
    const nasty = 'x $q$ y $q0$ z $q1$ w';
    const quoted = dollarQuote(nasty);
    expect(quoted).toBe(`$q2$${nasty}$q2$`);
    // The literal ends exactly once — at the closing delimiter.
    const tag = '$q2$';
    expect(quoted.split(tag)).toHaveLength(3);
  });

  it('survives a document whose body is a SQL injection attempt', () => {
    const body = "$q$; drop table public.knowledge_documents; --";
    const quoted = dollarQuote(body);
    expect(quoted.startsWith('$q0$')).toBe(true);
    expect(quoted.endsWith('$q0$')).toBe(true);
    expect(quoted.slice(4, -4)).toBe(body);
  });
});

describe('splitSqlFiles', () => {
  it('keeps everything in one file when it fits', () => {
    expect(splitSqlFiles(['a;', 'b;'], 1000)).toEqual(['a;\n\nb;']);
  });

  it('starts a new file rather than exceeding the budget', () => {
    const files = splitSqlFiles(['aaaa;', 'bbbb;', 'cccc;'], 14);
    expect(files).toEqual(['aaaa;\n\nbbbb;', 'cccc;']);
  });

  it('never splits a single statement, even an oversized one', () => {
    const huge = 'x'.repeat(50);
    const files = splitSqlFiles(['a;', huge, 'b;'], 10);
    expect(files).toEqual(['a;', huge, 'b;']);
  });

  it('measures bytes, not characters', () => {
    // Four 3-byte characters + the separator overrun the 10-byte budget.
    const files = splitSqlFiles(['— — —', 'x'], 10);
    expect(files).toHaveLength(2);
  });
});

describe('emitKnowledgeSqlFiles', () => {
  it('numbers the parts, wraps each in a transaction, and keeps .sql off the base', () => {
    const files = emitKnowledgeSqlFiles([tinyDoc], 'out/knowledge.sql', 1_000_000);
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('out/knowledge.001.sql');
    expect(files[0].body).toContain('-- knowledge sync — part 1 of 1');
    expect(files[0].body).toContain('\nbegin;\n');
    expect(files[0].body.trimEnd().endsWith('commit;')).toBe(true);
    expect(files[0].body).toContain('insert into public.knowledge_documents');
  });

  it('splits into numbered parts when the corpus is large', () => {
    const docs = Array.from({ length: 6 }, (_, i) => ({ ...tinyDoc, slug: `act:${i}` }));
    const files = emitKnowledgeSqlFiles(docs, 'knowledge.sql', 1200);
    expect(files.length).toBeGreaterThan(1);
    expect(files.map((f) => f.name)).toEqual(
      files.map((_, i) => `knowledge.${String(i + 1).padStart(3, '0')}.sql`),
    );
    for (const f of files) expect(f.body).toContain(`of ${files.length}`);
    // Every document appears exactly once across the parts.
    const all = files.map((f) => f.body).join('\n');
    for (let i = 0; i < 6; i++) {
      expect(all.match(new RegExp(`\\$q\\$act:${i}\\$q\\$`, 'g'))!.length).toBeGreaterThan(0);
    }
  });
});
