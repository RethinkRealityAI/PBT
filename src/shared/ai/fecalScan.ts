/**
 * Fecal Scan — the parts shared by the browser (types + result normaliser)
 * and the `ai-fecal-scan` Netlify Function (prompts + normaliser).
 *
 * A supportive stool-assessment aid, NOT a diagnostic: the tech photographs a
 * stool, the function OBSERVES it, RETRIEVES the matching Royal Canin chart
 * passages from the knowledge base, and SCORES it using only those passages.
 * The raw image is never persisted. No product recommendations.
 *
 * Types only live here for now; the prompt builders and
 * `normalizeFecalScanResult` are added alongside their tests
 * (`src/shared/ai/__tests__/fecalScan.test.ts`).
 */
import type {
  FecalBand,
  FecalBreedSize,
  FecalScore,
  FecalSpecies,
} from '../../data/knowledge/fecalCharts';

export type { FecalBand, FecalBreedSize, FecalScore, FecalSpecies };

/** Neutral visual observations — stage 1 output, also the retrieval query. */
export interface FecalObservations {
  /** Overall form: formed / partly formed / unformed / liquid, in words. */
  form: string;
  /** Dry / moist / wet / liquid, in words. */
  moisture: string;
  /** Cracks, smooth, glossy, pasty… */
  surface: string;
  /** Would it leave residue when picked up? */
  residue: string;
  /** Homogeneous, or mixed consistencies (chart rule: record the higher score). */
  homogeneity: string;
}

export interface FecalScanAlternate {
  score: FecalScore;
  /** 0–1 */
  confidence: number;
}

export interface FecalScanResult {
  /** False when the photo clearly isn't a stool sample — UI asks for a retry. */
  isStool: boolean;
  species: FecalSpecies;
  /** One of the scores the selected chart defines. */
  score: FecalScore;
  /** Derived from the chart (never trusted from the model). */
  band: FecalBand;
  /** 0–1 model confidence in `score`. */
  confidence: number;
  /** Why this score, in the chart's own wording. */
  rationale: string;
  observations: FecalObservations;
  /** Up to two neighbouring chart scores, most likely first. */
  alternates: FecalScanAlternate[];
  /** What a single photo cannot show (odour, volume, blood, mucus…). */
  notVisible: string[];
  /** One line on when to involve the veterinarian. Non-diagnostic. */
  caution: string;
}

export interface FecalScanRetrievedChunk {
  citation: string | null;
  /** Cosine similarity from pgvector; null for the bundled fallback. */
  similarity: number | null;
  /** The passage text the scorer was given (verbatim). */
  excerpt: string;
  /** Chart scores mentioned in the passage. */
  scores: FecalScore[];
}

export interface FecalScanRetrieval {
  /**
   * 'rag'     — passages came from `knowledge_chunks` via pgvector.
   * 'bundled' — retrieval returned nothing (corpus not seeded, embedder down)
   *             and the same chart text was supplied from the code module.
   */
  source: 'rag' | 'bundled';
  /** The observation text that was embedded and searched. */
  query: string;
  /** The knowledge documents the search was restricted to. */
  docSlugs: string[];
  chunks: FecalScanRetrievedChunk[];
}
