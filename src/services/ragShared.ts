/**
 * Pure RAG helpers shared by the consumer app and the Netlify functions
 * (both bundle this module directly). No I/O here — keep it unit-testable.
 */
import { estimateTokens } from './aiTelemetry';

/** One retrieved knowledge slice, as returned by rag-retrieve. */
export interface RetrievedChunk {
  content: string;
  /** Human-readable citation, e.g. "Davies et al., 2024 — Vet Rec". */
  citation: string | null;
  tags: Record<string, unknown> | null;
  similarity: number;
}

/**
 * L2-normalise an embedding vector. REQUIRED for gemini-embedding-001 with
 * outputDimensionality < 3072: MRL-truncated vectors are not unit-length, and
 * cosine ranking degrades without normalisation.
 */
export function normalize(vec: number[]): number[] {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0) return vec.map(() => 0);
  return vec.map((v) => v / norm);
}

/**
 * Serialise a vector for a supabase-js RPC param of Postgres type `vector` —
 * pgvector expects the '[0.1,0.2,...]' string literal, not a JS array.
 */
export function toPgvectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/**
 * Paragraph-boundary greedy chunking for markdown/plain text.
 *
 * Packs consecutive paragraphs until ~targetTokens, then starts the next
 * chunk seeded with the tail paragraphs of the previous one (~overlapTokens)
 * so no idea is split across an un-retrievable boundary. A single paragraph
 * longer than targetTokens becomes its own chunk (never split mid-paragraph).
 */
export function chunkMarkdown(
  text: string,
  targetTokens = 800,
  overlapTokens = 100,
): string[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push(current.join('\n\n'));
    // Seed the next chunk with trailing paragraphs up to overlapTokens.
    const overlap: string[] = [];
    let t = 0;
    for (let i = current.length - 1; i >= 0 && t < overlapTokens; i--) {
      overlap.unshift(current[i]);
      t += estimateTokens(current[i]);
    }
    current = overlap;
    currentTokens = t;
  };

  for (const p of paragraphs) {
    const t = estimateTokens(p);
    if (currentTokens + t > targetTokens && currentTokens > 0) flush();
    current.push(p);
    currentTokens += t;
  }
  // Final flush without overlap seeding.
  if (current.length > 0) {
    const tail = current.join('\n\n');
    // Avoid emitting a pure-overlap duplicate of the previous chunk.
    if (chunks.length === 0 || !chunks[chunks.length - 1].endsWith(tail)) {
      chunks.push(tail);
    }
  }
  return chunks;
}
