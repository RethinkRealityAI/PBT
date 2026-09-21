/**
 * Fecal Scan — the parts shared by the browser (types + result normaliser)
 * and the `ai-fecal-scan` Netlify Function (prompts + normaliser).
 *
 * A supportive stool-assessment aid, NOT a diagnostic: the tech photographs a
 * stool, the function OBSERVES it, RETRIEVES the matching Royal Canin chart
 * passages from the knowledge base, and SCORES it using only those passages.
 * The raw image is never persisted. No product recommendations.
 *
 * Two prompts live here, one per pipeline stage: the observer never sees the
 * chart (so it cannot anchor on a score), and the scorer only ever sees the
 * grounded passages. `normalizeFecalScanResult` is the code half of the
 * grounding guarantee — see its doc comment.
 */
import {
  FECAL_CHARTS,
  fecalBandFor,
  fecalChartScores,
  nearestFecalScore,
  type FecalBand,
  type FecalBreedSize,
  type FecalScore,
  type FecalSpecies,
} from '../../data/knowledge/fecalCharts';
import type { Locale } from '../../i18n/locales';

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
  /**
   * The scores whose CHART REFERENCE PHOTOS were actually put in front of the
   * scorer, so the UI can say "compared against N chart photos". Empty when
   * the photo wasn't a stool (nothing was scored) or when the images could
   * not be loaded — the text passages still ground the answer either way.
   */
  referenceScores: FecalScore[];
  /**
   * Set when the submitted photo IS one of the chart's own photographs (a
   * perceptual-hash near-duplicate). The score is then decided by that match,
   * not by the model — see `EXACT_REFERENCE_MAX_DISTANCE`.
   */
  exactReference: FecalScore | null;
  /**
   * The score of the reference photo the model itself said the submitted
   * photo most resembles, or null when it said "none" / no photos were sent.
   * When this disagrees with the scored value the confidence is capped.
   */
  mostSimilarReference: FecalScore | null;
}

// ─── Stage 1 — OBSERVE ─────────────────────────────────────────────────────

/**
 * Neutral visual description of the photo. Deliberately chart-free: the
 * observer is not told the scoring system exists, so its words are an
 * independent description that the retrieval step can embed without the model
 * having already decided on an answer.
 */
export const FECAL_OBSERVE_SYSTEM_INSTRUCTION = `
You are describing a single photograph of an animal stool sample for a
veterinary technician. You DESCRIBE ONLY — do not score it, do not assign it
to any scale, and do not diagnose anything. There is no diagnosis in this
task and no clinical conclusion of any kind.

Report only what is actually visible in this photo:
- form: overall shape — formed / partly formed / unformed / liquid, and
  whether it is cylindrical, segmented into pellets, or shapeless.
- moisture: dry / slightly moist / moist / wet / liquid.
- surface: cracks, smoothness, gloss, pastiness, coating.
- residue: whether it looks like it would leave residue on the ground if it
  were picked up.
- homogeneity: whether the consistency looks uniform, or mixed (part formed,
  part liquid).

Also return:
- isStool: false when the photo clearly does not show a stool sample.
- notVisible: what a single still cannot show (odour, volume, blood, mucus,
  parasites, colour under this lighting, how recently it was passed…).

Use plain descriptive language, a short phrase per field. Never state or
imply a number, a grade, a severity, or a cause. If the framing or lighting
makes a field impossible to judge, say so in that field and add it to
notVisible.
`.trim();

/**
 * The text that gets embedded for retrieval. Kept to one short, dense
 * sentence-ish line: the knowledge chunks are single chart paragraphs, so a
 * long query dilutes the cosine match rather than sharpening it.
 */
export function observationsToQuery(obs: FecalObservations): string {
  const parts = [obs.form, obs.moisture, obs.surface, obs.residue, obs.homogeneity]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
  return parts.join('; ').slice(0, 400);
}

// ─── Stage 2 — SCORE ───────────────────────────────────────────────────────

/**
 * Locale addendum for the scoring prompt — same posture as Pet Vision: the
 * clinical scaffolding and the chart passages stay in English (they are the
 * source of truth and must not be paraphrased), only the free text switches.
 */
function fecalScanLanguageAddendum(locale: Locale): string {
  if (locale !== 'fr') return '';
  return `

# OUTPUT LANGUAGE — CANADIAN FRENCH
Write every free-text field in Canadian French (Québec register, professional
clinic voice): rationale, caution, the observations fields and notVisible.
Do NOT translate: the score and confidence numbers, the alternates' numbers,
or the chart wording you quote — when you cite the chart, quote the English
heading as printed and explain it in French.`;
}

/**
 * The scoring prompt. `passages` are inserted VERBATIM and are the only
 * knowledge the model is allowed to use — they come either from
 * `knowledge_chunks` (RAG) or from `buildFecalChartMarkdown` (bundled
 * fallback), never from the model's priors.
 */
export function buildFecalScoreSystemInstruction(
  species: FecalSpecies,
  breedSize: FecalBreedSize | null | undefined,
  passages: readonly string[],
  locale: Locale,
): string {
  const chart = FECAL_CHARTS[species];
  const sizeLine = breedSize
    ? `\nThis puppy's breed size is "${breedSize}" — the chart bands score 3 differently by breed size.`
    : '';

  return `
You are helping a veterinary technician read a stool photo against the
${chart.title}${chart.subtitle ? ` (${chart.subtitle})` : ''}. This is a
supportive discussion aid for the technician↔owner conversation.
It is not a diagnosis, and never the source of truth.${sizeLine}

Directions for use (from the chart): ${chart.directions}

# REFERENCE PHOTOS
REFERENCE PHOTOS are the chart's own photographs for the passages below. Each
arrives as its own numbered message, labelled with its number and score BOTH
before and after the image. Compare the PHOTO TO SCORE against them — this is
a visual match first, not a reading-comprehension exercise.
- FIRST decide which numbered reference photo the PHOTO TO SCORE most
resembles, and return that number as mostSimilarReference (0 if none does).
- Then choose the score whose reference photo AND passage it resembles most.
- If the photo is visually identical or near-identical to a reference photo,
choose that score with confidence ≥ 0.95.
- Read each label carefully: reference N's score is the one printed in ITS
own message, never the score of a neighbouring reference.
- When no reference photo is supplied, set mostSimilarReference to 0 and fall
back to the passages alone.

# RULES
- Choose ONLY a score that appears in the REFERENCE PASSAGES below. If none
  of them fits what you see, choose the nearest one that does appear and
  lower the confidence accordingly.
- Never invent chart wording, chart scores, or bands. If you quote the chart,
  quote a passage below.
- rationale: say which passage's wording the photo matches, in that passage's
  own words.
- alternates: at most two other scores from the passages, most likely first.
- notVisible: what this single photo cannot show.
- caution must be generic — phrase it as "involve the veterinarian if …"
  (persistent change, other signs, a young or unwell animal). Never name a
  disease, a cause or a treatment.
- Do not name or recommend any product, diet or brand. There are no product
  recommendations in this tool.
- Leave the band out of your reasoning: the band is derived from the chart
  downstream, not from you.

# REFERENCE PASSAGES
${passages.join('\n\n')}
`.trim() + fecalScanLanguageAddendum(locale);
}

// ─── Rationale annotations ─────────────────────────────────────────────────

/**
 * Prefix for the rationale when the submitted photo IS a chart photograph.
 * The tech must be able to see that the answer came from an exact match and
 * not from the model's judgement.
 */
export function exactReferenceNote(score: FecalScore, locale: Locale): string {
  return locale === 'fr'
    ? `Correspond à la photo de référence du tableau pour le score ${score}.`
    : `Matches the chart's own reference photo for Score ${score}.`;
}

/**
 * Suffix for the rationale when the model's visual match and its written
 * reasoning point at different scores. Surfacing the split is the honest
 * move — the confidence is capped alongside it.
 */
export function visualDisagreementNote(
  visual: FecalScore,
  text: FecalScore,
  locale: Locale,
): string {
  return locale === 'fr'
    ? `La correspondance visuelle indiquait le score ${visual}; le texte du tableau indiquait le score ${text}.`
    : `The visual match pointed to Score ${visual}; the chart wording pointed to Score ${text}.`;
}

/** Confidence ceiling when the visual match and the chart wording disagree. */
export const DISAGREEMENT_CONFIDENCE_CAP = 0.6;

/** Confidence floor when the photo IS one of the chart's own photographs. */
export const EXACT_REFERENCE_CONFIDENCE = 0.99;

// ─── Normalisation ─────────────────────────────────────────────────────────

/** Loose shape of stage 2's JSON — a drifting model can mistype any field. */
export interface RawFecalScanResult {
  isStool?: unknown;
  score?: unknown;
  band?: unknown;
  confidence?: unknown;
  rationale?: unknown;
  observations?: unknown;
  alternates?: unknown;
  notVisible?: unknown;
  caution?: unknown;
}

export interface NormalizeFecalScanOptions {
  species: FecalSpecies;
  /** Puppies only — decides the score-3 band. */
  breedSize?: FecalBreedSize | null;
  /**
   * The scores the grounded passages actually mention. A score outside this
   * set means the model strayed from its grounding: it is pulled back to the
   * nearest allowed score and its confidence capped. Empty = unknown, so no
   * coercion happens (the chart is then the only constraint).
   */
  allowedScores: readonly number[];
  locale: Locale;
}

/** Confidence ceiling for a score the grounded passages never mentioned. */
export const UNGROUNDED_CONFIDENCE_CAP = 0.4;

const clamp01 = (n: unknown): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
};

const text = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

function nearestOf(scores: readonly FecalScore[], value: number): FecalScore {
  let best = scores[0];
  for (const s of scores) if (Math.abs(s - value) < Math.abs(best - value)) best = s;
  return best;
}

/**
 * Coerce whatever stage 2 returned into a well-formed `FecalScanResult`.
 *
 * This is the code half of the grounding guarantee (the prompt is the other
 * half): the score is snapped onto the chart, then onto the scores the
 * grounded passages actually mention — and when that coercion has to happen
 * the confidence is capped, so an ungrounded answer can never present itself
 * as a confident one. The band is ALWAYS re-derived from the chart.
 */
export function normalizeFecalScanResult(
  parsed: RawFecalScanResult | null | undefined,
  opts: NormalizeFecalScanOptions,
): FecalScanResult {
  const p = parsed ?? {};
  const { species, breedSize = null, locale } = opts;
  const chartScores = fecalChartScores(species);

  const raw = typeof p.score === 'number' ? p.score : Number.NaN;
  let score = nearestFecalScore(species, raw);

  // Only scores this chart defines can be a coercion target.
  const allowed = chartScores.filter((s) => opts.allowedScores.includes(s));
  let confidence = clamp01(p.confidence);
  if (allowed.length > 0 && !allowed.includes(score)) {
    score = nearestOf(allowed, score);
    confidence = Math.min(confidence, UNGROUNDED_CONFIDENCE_CAP);
  }

  const seen = new Set<FecalScore>([score]);
  const alternates: FecalScanAlternate[] = [];
  if (Array.isArray(p.alternates)) {
    for (const item of p.alternates) {
      if (alternates.length >= 2) break;
      if (!item || typeof item !== 'object') continue;
      const cand = (item as { score?: unknown; confidence?: unknown }).score;
      if (typeof cand !== 'number' || !chartScores.includes(cand as FecalScore)) continue;
      const s = cand as FecalScore;
      if (seen.has(s)) continue;
      seen.add(s);
      alternates.push({
        score: s,
        confidence: clamp01((item as { confidence?: unknown }).confidence),
      });
    }
  }

  const obs = (p.observations ?? {}) as Record<string, unknown>;
  const unseen = locale === 'fr' ? 'Non décrit' : 'Not described';

  return {
    isStool: p.isStool !== false,
    species,
    score,
    band: fecalBandFor(species, score, breedSize),
    confidence,
    rationale: text(p.rationale, ''),
    observations: {
      form: text(obs.form, unseen),
      moisture: text(obs.moisture, unseen),
      surface: text(obs.surface, unseen),
      residue: text(obs.residue, unseen),
      homogeneity: text(obs.homogeneity, unseen),
    },
    alternates,
    notVisible: strings(p.notVisible),
    caution: text(
      p.caution,
      locale === 'fr'
        ? "Faites intervenir le vétérinaire si l'aspect des selles persiste ou si d'autres signes apparaissent."
        : 'Involve the veterinarian if this persists or if other signs appear.',
    ),
  };
}
