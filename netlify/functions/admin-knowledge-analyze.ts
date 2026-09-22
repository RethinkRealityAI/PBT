/**
 * Admin: the knowledge-base TAG ASSISTANT (POST only, `knowledge.write`).
 *
 *   KnowledgeAnalyzeRequest → KnowledgeAnalyzeResponse
 *   (contract: src/shared/knowledge/knowledgeAnalyze.ts)
 *
 * Exactly ONE of:
 *   { pdfBase64 }  — ≤ 4MB raw. `extractPdf` runs FIRST (markdown + citation),
 *                    the markdown is analysed, and BOTH come back as
 *                    `extractedMarkdown` / `extractedCitation` so the UI can
 *                    ingest as `text` without a second extraction.
 *   { text }       — ≤ 200k chars, analysed as-is.
 *   { slug }       — an existing document; its stored content is analysed
 *                    ("Suggest with AI"). 404 when missing.
 *   plus an optional `title` hint.
 *
 * Then ONE Gemini call (MODEL_TEXT, JSON mode) whose system prompt lists the
 * focus areas, tools and species WITH their descriptions. The answer is
 * normalised back into those vocabularies (`_shared/knowledgeAnalyze.ts`) —
 * the model can propose, it cannot widen the vocabulary. Content beyond
 * ~40k chars is cut for the model and flagged in `warnings`.
 *
 * Nothing is written: the admin confirms and the existing ingest / update ops
 * do the saving. No telemetry (mirrors `admin-scenario-ai`).
 *
 * Errors use the admin `{ error }` shape: 400 bad input, 404 missing slug,
 * 502 when Gemini (extraction or analysis) fails.
 */
import type { GoogleGenAI } from '@google/genai';
import { errorResponse, jsonResponse, requireAdmin } from './_shared/admin';
import { getGeminiClient } from './_shared/gemini';
import { MAX_PDF_BYTES, extractPdf } from './_shared/knowledgeIngest';
import {
  KNOWLEDGE_ANALYZE_SCHEMA,
  buildKnowledgeAnalyzeContents,
  buildKnowledgeAnalyzeSystemPrompt,
  normalizeKnowledgeAnalysis,
  prepareContentForModel,
} from './_shared/knowledgeAnalyze';
import { MODEL_TEXT } from '../../src/shared/ai/models';
import {
  MAX_ANALYZE_TEXT_CHARS,
  type KnowledgeAnalyzeResponse,
} from '../../src/shared/knowledge/knowledgeAnalyze';

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export default async (req: Request): Promise<Response> => {
  const ctx = await requireAdmin(req, 'knowledge.write');
  if (ctx instanceof Response) return ctx;
  if (req.method !== 'POST') return errorResponse(405, 'Method not allowed');

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'Invalid JSON');
  }
  if (!body || typeof body !== 'object') return errorResponse(400, 'Invalid JSON');

  const hasPdf = nonEmpty(body.pdfBase64);
  const hasText = nonEmpty(body.text);
  const hasSlug = nonEmpty(body.slug);
  const given = [hasPdf, hasText, hasSlug].filter(Boolean).length;
  if (given === 0) return errorResponse(400, 'One of pdfBase64, text or slug is required');
  if (given > 1) return errorResponse(400, 'Send exactly one of pdfBase64, text or slug');

  const titleHint = typeof body.title === 'string' ? body.title.trim() : '';

  // ── Resolve the content ─────────────────────────────────────────────
  let content: string;
  let citationHint = '';
  let fallbackTitle = titleHint;
  let extracted: { markdown: string; citation: string } | null = null;

  if (hasPdf) {
    const pdfBase64 = body.pdfBase64 as string;
    if (pdfBase64.length * 0.75 > MAX_PDF_BYTES) {
      return errorResponse(400, 'PDF exceeds the 4MB limit');
    }
    try {
      const ex = await extractPdf(pdfBase64);
      extracted = { markdown: ex.markdown, citation: ex.citation };
      content = ex.markdown;
      citationHint = ex.citation;
      fallbackTitle = titleHint || ex.title;
    } catch (err) {
      console.error('[admin-knowledge-analyze] extraction failed', err);
      return errorResponse(502, 'The document could not be read. Try again in a moment.');
    }
  } else if (hasText) {
    const text = body.text as string;
    if (text.length > MAX_ANALYZE_TEXT_CHARS) {
      return errorResponse(400, `text exceeds the ${MAX_ANALYZE_TEXT_CHARS / 1000}k character limit`);
    }
    content = text;
  } else {
    const slug = (body.slug as string).trim();
    const { data: doc, error } = await ctx.sb
      .from('knowledge_documents')
      .select('slug, title, content, metadata')
      .eq('slug', slug)
      .maybeSingle();
    if (error || !doc) return errorResponse(404, 'Document not found');
    content = String(doc.content ?? '');
    if (!content.trim()) return errorResponse(400, 'Document has no content to analyse');
    fallbackTitle = titleHint || String(doc.title ?? '');
    const meta = (doc.metadata ?? {}) as Record<string, unknown>;
    if (typeof meta.citation === 'string') citationHint = meta.citation;
  }

  // ── One model call ──────────────────────────────────────────────────
  let ai: GoogleGenAI;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[admin-knowledge-analyze]', err);
    return errorResponse(500, 'AI is not configured');
  }

  const prepared = prepareContentForModel(content);
  let raw: unknown;
  try {
    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: buildKnowledgeAnalyzeContents({
        content: prepared.text,
        titleHint: fallbackTitle,
        citationHint,
      }),
      config: {
        systemInstruction: buildKnowledgeAnalyzeSystemPrompt(),
        responseMimeType: 'application/json',
        responseSchema: KNOWLEDGE_ANALYZE_SCHEMA,
      },
    });
    const text = response.text ?? '';
    if (!text) throw new Error('Empty AI response');
    raw = JSON.parse(text);
  } catch (err) {
    console.error('[admin-knowledge-analyze] analysis failed', err);
    return errorResponse(502, 'The tag assistant could not be reached. Try again in a moment.');
  }

  const analysis = normalizeKnowledgeAnalysis(raw, {
    fallbackCitation: citationHint,
    fallbackTitle,
    truncated: prepared.truncated,
  });

  const payload: KnowledgeAnalyzeResponse = { analysis };
  if (extracted) {
    payload.extractedMarkdown = extracted.markdown;
    payload.extractedCitation = extracted.citation;
  }
  return jsonResponse(payload);
};
