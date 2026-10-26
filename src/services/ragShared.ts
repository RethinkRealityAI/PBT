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
  /**
   * Provenance of the chunk (`knowledge_documents.slug` / `.title`). Present
   * once the `match_knowledge_chunks` RPC returns them (migration
   * 20260922000000_knowledge_scopes.sql); older deployments leave them out.
   */
  docSlug?: string | null;
  docTitle?: string | null;
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

/** One section-aware chunk: the section it came from + the embedded text. */
export interface SectionChunk {
  section: string;
  content: string;
}

/** Sections whose text is never embedded (kept in the stored document only). */
const UNEMBEDDED_SECTION = /^(references?|bibliography|further reading)$/i;

/**
 * Section-aware chunking for long articles (the Royal Canin Academy corpus).
 *
 * Retrieval hands a prompt only k = 3 passages, so each one has to stand on
 * its own: the body is split at `## ` headings, paragraphs inside a section
 * are packed greedily to ~targetTokens (never across a section boundary), and
 * every chunk opens with ONE header line — "<Title> — <Section>" — so a
 * passage read alone still says what it is about. Text before the first
 * heading (the stand-first) is the "Overview" section. A `### ` sub-heading
 * travels with the paragraph after it. The References section is not
 * embedded: citations would only crowd real passages out of the top 3.
 * A single unit longer than the target (a big table or box) is split at line
 * boundaries; nothing is ever split mid-line, and no text is dropped.
 */
export function chunkSectionedMarkdown(
  title: string,
  markdown: string,
  targetTokens = 500,
): SectionChunk[] {
  const sections: Array<{ name: string; lines: string[] }> = [{ name: 'Overview', lines: [] }];
  for (const line of markdown.split('\n')) {
    const h = /^## +(.+?)\s*$/.exec(line);
    if (h) sections.push({ name: h[1].trim(), lines: [] });
    else sections[sections.length - 1].lines.push(line);
  }

  const out: SectionChunk[] = [];
  for (const section of sections) {
    if (UNEMBEDDED_SECTION.test(section.name)) continue;
    const paragraphs = section.lines
      .join('\n')
      .split(/\n[ \t]*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    // Units: a sub-heading glued to what follows it; oversize units split by line.
    const units: string[] = [];
    let pendingHeading = '';
    for (const p of paragraphs) {
      if (/^#{3,6} /.test(p) && !p.includes('\n')) {
        pendingHeading = pendingHeading ? `${pendingHeading}\n\n${p}` : p;
        continue;
      }
      const unit = pendingHeading ? `${pendingHeading}\n\n${p}` : p;
      pendingHeading = '';
      if (estimateTokens(unit) <= targetTokens) {
        units.push(unit);
        continue;
      }
      let buf: string[] = [];
      let t = 0;
      for (const line of unit.split('\n')) {
        const lt = estimateTokens(line);
        if (t + lt > targetTokens && buf.length) {
          units.push(buf.join('\n'));
          buf = [];
          t = 0;
        }
        buf.push(line);
        t += lt;
      }
      if (buf.length) units.push(buf.join('\n'));
    }
    if (pendingHeading) units.push(pendingHeading);
    if (units.length === 0) continue;

    const header = `${title} — ${section.name}`;
    let current: string[] = [];
    let tokens = 0;
    const flush = () => {
      if (current.length === 0) return;
      out.push({ section: section.name, content: `${header}\n\n${current.join('\n\n')}` });
      current = [];
      tokens = 0;
    };
    for (const u of units) {
      const t = estimateTokens(u);
      if (tokens + t > targetTokens && current.length) flush();
      current.push(u);
      tokens += t;
    }
    flush();
  }
  return out;
}

/** A section chunk's citation: the document's, plus which section it is. */
export function sectionCitation(citation: string | null | undefined, section: string): string | null {
  if (!citation) return null;
  return `${citation} — "${section}"`;
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
