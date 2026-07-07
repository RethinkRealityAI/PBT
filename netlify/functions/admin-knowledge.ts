/**
 * Admin: RAG knowledge base (knowledge_documents).
 *
 *   GET  /admin-knowledge                 → { documents: [...] }
 *   POST /admin-knowledge { op: 'seed' }  → ingest the code knowledge modules
 *        (driver personas, pushback taxonomy, ACT guide, clinical reference)
 *        as 'code-seed' documents, upserted by slug — re-running refreshes
 *        them after a code change without duplicating.
 *   POST { op: 'upsert', doc: { slug?, title, category, content, metadata? } }
 *   POST { op: 'delete', slug }
 *
 * This is the SOW "ingestion of the current working knowledge base": one row
 * per document with structured metadata, ready to feed an embedder in Phase 3.
 */
import { errorResponse, jsonResponse, requireAdmin, type AdminCtx } from './_shared/admin';
import { DRIVER_KNOWLEDGE } from '../../src/data/knowledge/driverProfiles';
import { PUSHBACK_KNOWLEDGE } from '../../src/data/knowledge/pushbackTaxonomy';
import { ACT_STEPS } from '../../src/data/knowledge/actGuide';
import {
  BCS_BLURB,
  CALORIE_FORMULA_BLURB,
  MCS_BLURB,
  NON_SHAMING_FRAMING,
  PRODUCT_ANCHORS,
} from '../../src/data/knowledge/clinicalReference';

interface SeedDoc {
  slug: string;
  title: string;
  category: 'driver' | 'pushback' | 'act' | 'clinical';
  content: string;
  metadata: Record<string, unknown>;
}

/** Serialise the code knowledge modules into embedder-ready documents. */
function buildSeedDocs(): SeedDoc[] {
  const docs: SeedDoc[] = [];

  for (const [key, d] of Object.entries(DRIVER_KNOWLEDGE)) {
    docs.push({
      slug: `driver:${key}`,
      title: `ECHO driver — ${key}`,
      category: 'driver',
      content: [
        `# ${key}`,
        `Motivation: ${d.motivation}`,
        `Communication style:\n${d.communicationStyle.map((s) => `- ${s}`).join('\n')}`,
        `Strengths:\n${d.strengths.map((s) => `- ${s}`).join('\n')}`,
        `Under stress: ${d.stressSignature}`,
        `Recognition cues:\n${d.recognitionCues.map((s) => `- ${s}`).join('\n')}`,
        `Flexing tips:\n${d.flexingTips.map((s) => `- ${s}`).join('\n')}`,
        `Sample customer phrasings:\n${d.customerSamplePhrasings.map((s) => `- ${s}`).join('\n')}`,
      ].join('\n\n'),
      metadata: { driver: key },
    });
  }

  for (const [id, p] of Object.entries(PUSHBACK_KNOWLEDGE)) {
    docs.push({
      slug: `pushback:${id}`,
      title: `Pushback — ${p.title}`,
      category: 'pushback',
      content: [
        `# ${p.title}`,
        `Examples:\n${p.examples.map((s) => `- ${s}`).join('\n')}`,
        `Root concerns:\n${p.rootConcerns.map((s) => `- ${s}`).join('\n')}`,
        `Acknowledge patterns:\n${p.acknowledgePatterns.map((s) => `- ${s}`).join('\n')}`,
        `Clarify questions:\n${p.clarifyQuestions.map((s) => `- ${s}`).join('\n')}`,
        `Take-action patterns:\n${p.takeActionPatterns.map((s) => `- ${s}`).join('\n')}`,
        `Watch-outs:\n${p.watchOuts.map((s) => `- ${s}`).join('\n')}`,
      ].join('\n\n'),
      metadata: { pushback_id: id },
    });
  }

  for (const step of ACT_STEPS) {
    docs.push({
      slug: `act:${step.key}`,
      title: `ACT method — ${step.label}`,
      category: 'act',
      content: [
        `# ${step.label}`,
        `Goal: ${step.goal}`,
        `Techniques:\n${step.techniques.map((s) => `- ${s}`).join('\n')}`,
        `Do:\n${step.doExamples.map((s) => `- ${s}`).join('\n')}`,
        `Don't:\n${step.dontExamples.map((s) => `- ${s}`).join('\n')}`,
      ].join('\n\n'),
      metadata: { act_step: step.key },
    });
  }

  docs.push({
    slug: 'clinical:reference',
    title: 'Clinical reference — BCS / MCS / calories / product anchors',
    category: 'clinical',
    content: [
      `BCS: ${BCS_BLURB}`,
      `MCS: ${MCS_BLURB}`,
      `Calories: ${CALORIE_FORMULA_BLURB}`,
      `Framing: ${NON_SHAMING_FRAMING}`,
      `Product anchors: ${PRODUCT_ANCHORS.satietySupport.name} — ${PRODUCT_ANCHORS.satietySupport.keyClaims.join('; ')}`,
    ].join('\n\n'),
    metadata: { anchors: Object.keys(PRODUCT_ANCHORS) },
  });

  return docs;
}

async function seed(ctx: AdminCtx): Promise<Response> {
  const docs = buildSeedDocs();
  const { error } = await ctx.sb.from('knowledge_documents').upsert(
    docs.map((d) => ({
      slug: d.slug,
      title: d.title,
      category: d.category,
      content: d.content,
      metadata: d.metadata,
      source: 'code-seed',
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'slug' },
  );
  if (error) return errorResponse(500, error.message);
  return jsonResponse({ ok: true, seeded: docs.length });
}

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req);
  if (ctx instanceof Response) return ctx;

  if (req.method === 'GET') {
    const { data, error } = await ctx.sb
      .from('knowledge_documents')
      .select('id, slug, title, category, source, metadata, content, updated_at, created_at')
      .order('category')
      .order('slug');
    if (error) return errorResponse(500, error.message);
    return jsonResponse({ documents: data ?? [] });
  }

  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }

  if (body.op === 'seed') return seed(ctx);

  if (body.op === 'upsert') {
    const doc = (body.doc ?? {}) as Record<string, unknown>;
    const title = String(doc.title ?? '').trim();
    const content = String(doc.content ?? '').trim();
    const category = String(doc.category ?? 'custom');
    if (!title || !content) return errorResponse(400, 'title and content required');
    if (!['driver', 'pushback', 'act', 'clinical', 'custom'].includes(category)) {
      return errorResponse(400, 'invalid category');
    }
    const slug = String(doc.slug ?? '').trim() || `custom:${crypto.randomUUID()}`;
    const { data, error } = await ctx.sb
      .from('knowledge_documents')
      .upsert(
        {
          slug,
          title,
          category,
          content,
          metadata: (doc.metadata as Record<string, unknown>) ?? null,
          source: 'admin',
          updated_by: ctx.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'slug' },
      )
      .select('slug')
      .maybeSingle();
    if (error) return errorResponse(500, error.message);
    return jsonResponse({ ok: true, slug: data?.slug ?? slug });
  }

  if (body.op === 'delete') {
    const slug = String(body.slug ?? '');
    if (!slug) return errorResponse(400, 'slug required');
    const { error } = await ctx.sb.from('knowledge_documents').delete().eq('slug', slug);
    if (error) return errorResponse(500, error.message);
    return jsonResponse({ ok: true });
  }

  return errorResponse(400, `Unknown op: ${String(body.op)}`);
};
