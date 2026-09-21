/**
 * One-off seeder for the Royal Canin fecal charts.
 *
 * `admin-knowledge { op: 'seed' }` already emits the same three documents,
 * but it needs an admin JWT and a running deploy. This script goes straight
 * at the database with the service role so the corpus can exist for a demo
 * (or a fresh environment) before anyone logs into the admin dashboard.
 *
 * It writes exactly what the admin seeder writes — same slugs, same content,
 * same citation + scope tags — then PROVES the loop works: it embeds a query
 * describing a score-3.5 stool and runs it twice through
 * `match_knowledge_chunks`, once scoped to dogs and once to cats. The dog run
 * must rank that passage first; the cat run must return cat chunks only. A
 * green run means retrieval AND the species boundary are live; a red one means
 * the corpus, the scope backfill or the RPC is wrong, and `ai-fecal-scan`
 * would silently fall back to its bundled chart.
 *
 *   npm run seed:fecal
 *
 * Env (never printed): SUPABASE_URL (or VITE_SUPABASE_URL),
 * SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY.
 */
import { createClient } from '@supabase/supabase-js';
import { embedTexts } from '../netlify/functions/_shared/gemini';
import { toPgvectorLiteral } from '../src/services/ragShared';
import { estimateTokens } from '../src/shared/ai/telemetryHeuristics';
import {
  FECAL_CHARTS,
  FECAL_SPECIES,
  buildFecalChartMarkdown,
  fecalChartChunks,
  fecalChartCitation,
  fecalKnowledgeSlug,
} from '../src/data/knowledge/fecalCharts';

/** The verification query — chart wording for dog score 3.5, paraphrased. */
const PROBE = 'moist stool with no cracks, distinct shape, components stick together';
const PROBE_EXPECT = 'Score 3.5';

function envFirst(...names: string[]): string {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return '';
}

function requireEnv(): { url: string; serviceKey: string } {
  const url = envFirst('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const missing = [
    !url && 'SUPABASE_URL (or VITE_SUPABASE_URL)',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
    !process.env.GEMINI_API_KEY && 'GEMINI_API_KEY',
  ].filter(Boolean);
  if (missing.length) {
    // Names only — never the values.
    throw new Error(`Missing env: ${missing.join(', ')}`);
  }
  return { url, serviceKey };
}

async function main(): Promise<void> {
  const { url, serviceKey } = requireEnv();
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Seeding ${FECAL_SPECIES.length} fecal charts…`);

  for (const species of FECAL_SPECIES) {
    const slug = fecalKnowledgeSlug(species);
    const content = buildFecalChartMarkdown(species);
    const citation = fecalChartCitation(species);

    const { error: docErr } = await sb.from('knowledge_documents').upsert(
      {
        slug,
        title: FECAL_CHARTS[species].title,
        category: 'clinical',
        content,
        // Scoped to the Fecal Scan and this chart's species — HARD filters at
        // retrieval time, so a cat chunk can never ground a dog scan and no
        // chart can ever surface in a roleplay.
        metadata: {
          citation,
          tags: {
            focus: 'gi',
            topic: 'fecal-scoring',
            tools: ['fecal-scan'],
            species: [species],
          },
        },
        source: 'code-seed',
        updated_by: null,
        deleted_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slug' },
    );
    if (docErr) throw new Error(`${slug}: document upsert failed — ${docErr.message}`);

    const { data: row, error: readErr } = await sb
      .from('knowledge_documents')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    if (readErr) throw new Error(`${slug}: id lookup failed — ${readErr.message}`);
    if (!row) throw new Error(`${slug}: document missing after upsert`);

    // ONE chunk per score — not chunkMarkdown(content), which would pack the
    // whole ~370-token chart into a single chunk and flatten the ranking.
    const chunks = fecalChartChunks(species);
    const embeddings = await embedTexts(chunks, 'RETRIEVAL_DOCUMENT');

    const { error: delErr } = await sb.from('knowledge_chunks').delete().eq('doc_id', row.id);
    if (delErr) throw new Error(`${slug}: chunk delete failed — ${delErr.message}`);

    const { error: insErr } = await sb.from('knowledge_chunks').insert(
      chunks.map((text, i) => ({
        doc_id: row.id,
        chunk_idx: i,
        content: text,
        token_estimate: estimateTokens(text),
        tags: {
          category: 'clinical',
          focus: 'gi',
          topic: 'fecal-scoring',
          tools: ['fecal-scan'],
          species: [species],
        },
        citation,
        embedding: toPgvectorLiteral(embeddings[i]),
      })),
    );
    if (insErr) throw new Error(`${slug}: chunk insert failed — ${insErr.message}`);

    console.log(
      `  ${slug} — ${chunks.length} chunk(s), one per score ` +
        `(${FECAL_CHARTS[species].entries.map((e) => e.score).join(', ')})`,
    );
  }

  // ── Verification: does the RAG loop actually answer, IN SCOPE? ─────────
  //
  // The search is targeted the way `ai-fecal-scan` targets it: by SCOPE
  // (tools + species), not by document slug. That makes this a test of the
  // isolation as well as the ranking — the dog probe must return only dog
  // chunks even though the cat and puppy charts sit in the same table, which
  // is exactly what the `20260922000000_knowledge_scopes.sql` backfill
  // guarantees.
  type Row = { content: string; similarity: number; doc_slug?: string };

  async function probe(species: 'dog' | 'cat'): Promise<Row[]> {
    const [embedding] = await embedTexts([PROBE], 'RETRIEVAL_QUERY');
    const { data, error } = await sb.rpc('match_knowledge_chunks', {
      query_embedding: toPgvectorLiteral(embedding),
      match_count: 3,
      filter: { tools: ['fecal-scan'], species: [species] },
    });
    if (error) throw new Error(`match_knowledge_chunks (${species}) failed — ${error.message}`);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) {
      throw new Error(
        `match_knowledge_chunks returned no rows for species "${species}" — is ` +
          '20260922000000_knowledge_scopes.sql applied? (unscoped chunks are invisible)',
      );
    }
    rows.forEach((r, i) => {
      // Every chunk opens with the same chart header, so print the first 80
      // chars of the SCORE paragraph — otherwise all three lines read alike.
      const body = r.content.split(/\n\s*\n/).pop() ?? r.content;
      console.log(
        `  ${i + 1}. ${r.similarity.toFixed(4)}  [${r.doc_slug ?? '?'}]  ` +
          body.replace(/\s+/g, ' ').slice(0, 72),
      );
    });
    return rows;
  }

  console.log(`\nVerifying retrieval — scope { tools:[fecal-scan], species:[dog] }`);
  console.log(`  query: "${PROBE}"`);
  const dogRows = await probe('dog');

  // All three rows are printed, not just the winner: with one chunk per score
  // the RANKING is the evidence that retrieval is doing real work. If the top
  // three came back at identical similarity, the corpus was chunked wrong.
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

  console.log(`\nVerifying isolation — scope { tools:[fecal-scan], species:[cat] }`);
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

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
