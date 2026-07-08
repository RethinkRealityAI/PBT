/**
 * Server-side Gemini helpers for Netlify functions.
 *
 * Unlike the consumer app (which inlines the key at build), functions read
 * GEMINI_API_KEY from the runtime environment.
 */
import { GoogleGenAI } from '@google/genai';
import { normalize } from '../../../src/services/ragShared';

export const EMBEDDING_MODEL = 'gemini-embedding-001';
export const EMBEDDING_DIM = 768;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY ?? '';
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
  return new GoogleGenAI({ apiKey });
}

/**
 * Embed texts with gemini-embedding-001, MRL-truncated to 768 dims and
 * L2-normalised (required for cosine ranking at <3072 dims).
 */
export async function embedTexts(
  texts: string[],
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ai = getGeminiClient();
  const res = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { taskType, outputDimensionality: EMBEDDING_DIM },
  });
  const embeddings = res.embeddings ?? [];
  if (embeddings.length !== texts.length) {
    throw new Error(`Expected ${texts.length} embeddings, got ${embeddings.length}`);
  }
  return embeddings.map((e) => normalize(e.values ?? []));
}
