/**
 * Royal Canin Fecal Scoring System — the canonical, typed transcription of
 * the three charts shipped with the Fecal Scan feature. This module is the
 * ONLY knowledge the feature is allowed to reason from:
 *
 *   • the UI reads it for reference images, labels and the full-chart sheet;
 *   • `admin-knowledge` seeds it into the RAG knowledge base as one
 *     `fecal:<species>` document per chart (one paragraph per score, so each
 *     score becomes its own retrievable chunk — see `buildFecalChartMarkdown`);
 *   • `ai-fecal-scan` ALWAYS hands the scorer the whole chart for the
 *     selected species: retrieved chunks verbatim where retrieval returned
 *     them, these paragraphs for every score it did not — so every chart
 *     score is always reachable and the model is never left to its priors.
 *
 * Text is verbatim from the charts (VGI/064/0324 dogs + cats, VGI/066/0324
 * puppies; © Royal Canin SAS 2024). Reference photos are the JPEGs embedded
 * in those PDFs, extracted to `public/fecal-scan/<species>/<score>.jpg`.
 * Keep this file dependency-free: it is imported by `src/**` AND by
 * `netlify/functions/**`.
 */

export type FecalSpecies = 'dog' | 'puppy' | 'cat';
export const FECAL_SPECIES: readonly FecalSpecies[] = ['dog', 'puppy', 'cat'] as const;

/** Every score that appears on any chart. Not every chart uses every score. */
export type FecalScore = 1 | 2 | 2.5 | 3 | 3.5 | 4 | 4.5 | 5;

/**
 * Chart bands. The adult charts use three (too hard / too soft · acceptable ·
 * optimal); the puppy chart uses two (too hard / too soft · normal).
 */
export type FecalBand = 'tooHard' | 'tooSoft' | 'acceptable' | 'optimal' | 'normal';

/** Puppy score 3 is banded by breed size on the chart. */
export type FecalBreedSize = 'small-medium' | 'large-giant';

export interface FecalChartEntry {
  score: FecalScore;
  /** Chart heading, e.g. "MOIST STOOL WITH NO CRACKS" (kept in chart case). */
  label: string;
  /** Chart body text (may be empty — some scores carry only a heading). */
  description: string;
  /** Band for this score; puppy score 3 uses `bandBySize` instead. */
  band?: FecalBand;
  bandBySize?: Record<FecalBreedSize, FecalBand>;
  /** Served path of the reference photo. */
  imagePath: string;
}

export interface FecalChart {
  species: FecalSpecies;
  /** e.g. "Fecal Scoring System for Dogs" */
  title: string;
  /** e.g. "Eight weeks of age and older" (puppies only). */
  subtitle?: string;
  /** Royal Canin document reference printed on the chart. */
  reference: string;
  /** "Directions for use" text, verbatim. */
  directions: string;
  /** The bands this chart uses, in the order the chart's legend shows them. */
  bands: readonly FecalBand[];
  entries: readonly FecalChartEntry[];
}

const img = (species: FecalSpecies, score: FecalScore): string =>
  `/fecal-scan/${species}/${score}.jpg`;

const DIRECTIONS =
  'Score stools individually from 1 (formed and dry) to 5 (liquid). ' +
  'When consistency of the stools is not homogenous, record the higher score.';

export const FECAL_CHARTS: Record<FecalSpecies, FecalChart> = {
  dog: {
    species: 'dog',
    title: 'Fecal Scoring System for Dogs',
    reference: 'VGI/064/0324',
    directions: DIRECTIONS,
    bands: ['tooHard', 'tooSoft', 'acceptable', 'optimal'],
    entries: [
      {
        score: 1,
        label: 'HARD, DRY CRUMBLY STOOL',
        description:
          'It tends to split apart rather than being crushed. Difficult for dogs to pass.',
        band: 'tooHard',
        imagePath: img('dog', 1),
      },
      {
        score: 2,
        label: 'DRY, VERY CLEARLY DEFINED CRACKS',
        description:
          'The outside is very dry and the inside is almost dry. Leaves no residue on the ground when picked up.',
        band: 'acceptable',
        imagePath: img('dog', 2),
      },
      {
        score: 2.5,
        label: 'CLEARLY DEFINED SHAPE WITH VISIBLE CRACKS',
        description: 'It leaves very little residue on the ground when picked up.',
        band: 'optimal',
        imagePath: img('dog', 2.5),
      },
      {
        score: 3,
        label: 'MOIST STOOL STARTING TO LOSE SHAPE AND CRACKS',
        description:
          'This stool’s “components” are less separate and the cracks are still visible.',
        band: 'acceptable',
        imagePath: img('dog', 3),
      },
      {
        score: 3.5,
        label: 'MOIST STOOL WITH NO CRACKS',
        description:
          'The stool has a distinct shape. This stool’s different “components” stick to one another.',
        band: 'tooSoft',
        imagePath: img('dog', 3.5),
      },
      {
        score: 4,
        label: 'MOIST STOOL WITH LITTLE CONSISTENCY AND NO REAL SHAPE',
        description: 'It holds water with no visible liquid.',
        band: 'tooSoft',
        imagePath: img('dog', 4),
      },
      {
        score: 4.5,
        label: 'LIQUID STOOL WITH MINIMAL CONSISTENCY',
        description: '',
        band: 'tooSoft',
        imagePath: img('dog', 4.5),
      },
      {
        score: 5,
        label: 'ENTIRELY LIQUID STOOL',
        description: 'No texture.',
        band: 'tooSoft',
        imagePath: img('dog', 5),
      },
    ],
  },

  cat: {
    species: 'cat',
    title: 'Fecal Scoring System for Cats',
    reference: 'VGI/064/0324',
    directions: DIRECTIONS,
    bands: ['tooHard', 'tooSoft', 'acceptable', 'optimal'],
    entries: [
      {
        score: 1,
        label: 'HARD, DRY CRUMBLY STOOL',
        description:
          'It tends to break apart rather than being crushed. Difficult for cats to pass.',
        band: 'tooHard',
        imagePath: img('cat', 1),
      },
      {
        score: 2,
        label: 'FORMED, HARD STOOL',
        description:
          'This stool has very clearly defined cracks. The outside is very dry and the inside is almost dry.',
        band: 'acceptable',
        imagePath: img('cat', 2),
      },
      {
        score: 2.5,
        label: 'FORMED, FIRM STOOL',
        description:
          'This stool has a clearly defined shape with visible cracks. Its surface may be slightly damp but is still well formed.',
        band: 'optimal',
        imagePath: img('cat', 2.5),
      },
      {
        score: 3,
        label: 'UNFORMED STOOL, SOFT BUT WITH SOME SHAPE',
        description: 'A moist stool with no cracks. It has a distinct shape.',
        band: 'acceptable',
        imagePath: img('cat', 3),
      },
      {
        score: 4,
        label: 'VERY SOFT STOOL',
        description: 'Very wet, but not liquid stool.',
        band: 'tooSoft',
        imagePath: img('cat', 4),
      },
      {
        score: 5,
        label: 'LIQUID STOOL',
        description:
          'Entirely liquid stool (no texture) or liquid stool with minimal consistency.',
        band: 'tooSoft',
        imagePath: img('cat', 5),
      },
    ],
  },

  puppy: {
    species: 'puppy',
    title: 'Fecal Scoring System for Puppies',
    subtitle: 'Eight weeks of age and older',
    reference: 'VGI/066/0324',
    directions: DIRECTIONS,
    bands: ['tooHard', 'tooSoft', 'normal'],
    entries: [
      {
        score: 1,
        label: 'FORMED, DRY AND HARD STOOL',
        description: 'Difficult for puppies to pass.',
        band: 'tooHard',
        imagePath: img('puppy', 1),
      },
      {
        score: 2,
        label: 'FORMED, DRY BUT NOT HARD STOOL',
        description: 'Cylindrical shape, dry appearance, separated in pellets.',
        band: 'tooHard',
        imagePath: img('puppy', 2),
      },
      {
        score: 2.5,
        label: 'SOFT FORMED STOOL',
        description:
          'Formed but soft. Cylindrical shape may be separated in pellets or whole, with or without visible cracks.',
        band: 'normal',
        imagePath: img('puppy', 2.5),
      },
      {
        score: 3,
        label: 'SOFT UNFORMED STOOL',
        description:
          'Mainly unformed with a small formed part or pasty unformed. In some cases a cylindrical shape is visible, but is not maintained due to the high humidity.',
        bandBySize: { 'small-medium': 'tooSoft', 'large-giant': 'normal' },
        imagePath: img('puppy', 3),
      },
      {
        score: 4,
        label: 'MOIST STOOL',
        description: 'Little consistency and no real shape. No visible liquid.',
        band: 'tooSoft',
        imagePath: img('puppy', 4),
      },
      {
        score: 4.5,
        label: 'LIQUID FECES ASSOCIATED WITH SOFT STOOL',
        description: 'The main part of the stool is soft or liquid.',
        band: 'tooSoft',
        imagePath: img('puppy', 4.5),
      },
      {
        score: 5,
        label: 'LIQUID STOOL',
        description: 'No texture.',
        band: 'tooSoft',
        imagePath: img('puppy', 5),
      },
    ],
  },
};

export function isFecalSpecies(value: unknown): value is FecalSpecies {
  return typeof value === 'string' && (FECAL_SPECIES as readonly string[]).includes(value);
}

export function isFecalBreedSize(value: unknown): value is FecalBreedSize {
  return value === 'small-medium' || value === 'large-giant';
}

/** The scores a chart defines, ascending. */
export function fecalChartScores(species: FecalSpecies): FecalScore[] {
  return FECAL_CHARTS[species].entries.map((e) => e.score);
}

export function fecalChartEntry(
  species: FecalSpecies,
  score: FecalScore,
): FecalChartEntry | undefined {
  return FECAL_CHARTS[species].entries.find((e) => e.score === score);
}

/**
 * The band the chart assigns to a score. Puppy score 3 depends on breed
 * size; when the size is unknown the chart's cautious reading (too soft, the
 * small/medium-breed band) is used so an unbanded result never reads as
 * "normal" by default.
 */
export function fecalBandFor(
  species: FecalSpecies,
  score: FecalScore,
  breedSize?: FecalBreedSize | null,
): FecalBand {
  const entry = fecalChartEntry(species, score);
  if (!entry) return 'tooSoft';
  if (entry.band) return entry.band;
  if (entry.bandBySize) return entry.bandBySize[breedSize ?? 'small-medium'];
  return 'tooSoft';
}

/** Snap an arbitrary number onto the nearest score the chart defines. */
export function nearestFecalScore(species: FecalSpecies, value: number): FecalScore {
  const scores = fecalChartScores(species);
  if (!Number.isFinite(value)) return scores[Math.floor(scores.length / 2)];
  let best = scores[0];
  for (const s of scores) if (Math.abs(s - value) < Math.abs(best - value)) best = s;
  return best;
}

/** Knowledge-base document slug for a chart (`knowledge_documents.slug`). */
export function fecalKnowledgeSlug(species: FecalSpecies): string {
  return `fecal:${species}`;
}

/**
 * The species a `fecal:<x>` knowledge-document slug belongs to — the raw `x`
 * (which may not be a valid species if an admin authored a stray slug), or
 * null for any slug that is not a chart slug at all (an admin supplement).
 */
export function fecalChartSlugSpecies(slug: string | null | undefined): string | null {
  if (typeof slug !== 'string') return null;
  const m = /^fecal:(.*)$/.exec(slug.trim());
  return m ? m[1] : null;
}

/**
 * The chart a passage of TEXT was cut from, by its printed title (every
 * seeded chunk repeats the chart header), or null when it names none. Used
 * only when a retrieved chunk carries no document slug (a pre-scopes RPC).
 */
export function fecalChartSpeciesInText(text: string): FecalSpecies | null {
  for (const species of FECAL_SPECIES) {
    if (text.includes(FECAL_CHARTS[species].title)) return species;
  }
  return null;
}

/** Human-readable citation for a chart, used on chunks and in the UI. */
export function fecalChartCitation(species: FecalSpecies): string {
  const c = FECAL_CHARTS[species];
  return `Royal Canin — ${c.title}, ${c.reference}`;
}

const BAND_TEXT: Record<FecalBand, string> = {
  tooHard: 'too hard',
  tooSoft: 'too soft',
  acceptable: 'acceptable',
  optimal: 'optimal',
  normal: 'normal',
};

/** One paragraph describing a chart score — the unit of retrieval. */
export function fecalEntryParagraph(species: FecalSpecies, entry: FecalChartEntry): string {
  const band = entry.band
    ? `Band: ${BAND_TEXT[entry.band]}.`
    : entry.bandBySize
      ? `Band: ${BAND_TEXT[entry.bandBySize['small-medium']]} for small and medium breeds; ${BAND_TEXT[entry.bandBySize['large-giant']]} for large and giant breeds.`
      : '';
  const chart = FECAL_CHARTS[species];
  const desc = entry.description ? ` ${entry.description}` : '';
  return `Score ${entry.score} (${chart.title}): ${entry.label}.${desc} ${band}`.trim();
}

/** One-line chart header, repeated inside every chunk so a hit stands alone. */
function fecalChartHeaderLine(species: FecalSpecies): string {
  const chart = FECAL_CHARTS[species];
  const title = `${chart.title}${chart.subtitle ? ` — ${chart.subtitle}` : ''}`;
  return `${title}. Directions: ${chart.directions}`;
}

/**
 * The EMBEDDING unit: one self-contained chunk per score.
 *
 * `chunkMarkdown` packs to ~800 tokens and a whole chart is only ~370, so
 * chunking the document body would produce ONE chunk per chart — every query
 * would retrieve the same passage at the same similarity and the per-score
 * ranking the Fecal Scan grounding panel shows would be meaningless. So the
 * seeders chunk with this instead: each score is embedded on its own, with
 * the chart header riding along so a retrieved chunk still carries its
 * provenance and the "record the higher score" rule.
 *
 * Note the header is deliberately safe for `scoresMentionedIn`: the
 * directions say "Score stools individually from 1 … to 5", which the
 * `Score <number>` pattern does not match, so a chunk only ever reports its
 * own score.
 */
export function fecalChartChunks(species: FecalSpecies): string[] {
  const header = fecalChartHeaderLine(species);
  return FECAL_CHARTS[species].entries.map(
    (entry) => `${header}\n\n${fecalEntryParagraph(species, entry)}`,
  );
}

/**
 * The knowledge-base DOCUMENT body for a chart. Paragraphs are separated by
 * blank lines, one per score (`fecalEntryParagraph` — the same paragraphs
 * `ai-fecal-scan` fills in for any score retrieval did not return). This is
 * the human-readable whole; for the embedding units see `fecalChartChunks`.
 */
export function buildFecalChartMarkdown(species: FecalSpecies): string {
  const chart = FECAL_CHARTS[species];
  const head = [`# ${chart.title}${chart.subtitle ? ` — ${chart.subtitle}` : ''}`];
  head.push(`Directions for use: ${chart.directions}`);
  head.push(`Bands used on this chart: ${chart.bands.map((b) => BAND_TEXT[b]).join(', ')}.`);
  const body = chart.entries.map((e) => fecalEntryParagraph(species, e));
  return [...head, ...body].join('\n\n');
}

/** Scores mentioned in a passage of chart text ("Score 3.5 …"). */
export function scoresMentionedIn(text: string, species: FecalSpecies): FecalScore[] {
  const valid = new Set<number>(fecalChartScores(species));
  const found = new Set<FecalScore>();
  const re = /\bScore\s+(\d(?:\.\d)?)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1]);
    if (valid.has(n)) found.add(n as FecalScore);
  }
  return [...found].sort((a, b) => a - b);
}
