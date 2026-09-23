/**
 * The fecal charts are the ONLY knowledge the Fecal Scan feature reasons
 * from, so this file guards the transcription itself rather than any code
 * path: the reference photos must exist on disk, every score must carry a
 * band, and the seed markdown must chunk into retrievable, score-labelled
 * paragraphs (otherwise the RAG loop silently grounds on nothing).
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  FECAL_CHARTS,
  FECAL_SPECIES,
  buildFecalChartMarkdown,
  fecalBandFor,
  fecalChartChunks,
  fecalChartCitation,
  fecalChartScores,
  fecalChartSlugSpecies,
  fecalChartSpeciesInText,
  nearestFecalScore,
  scoresMentionedIn,
} from '../fecalCharts';
import { chunkMarkdown } from '../../../services/ragShared';
import { estimateTokens } from '../../../shared/ai/telemetryHeuristics';

const PUBLIC_DIR = join(process.cwd(), 'public');

describe('FECAL_CHARTS transcription', () => {
  it.each(FECAL_SPECIES)('%s — every reference photo exists under public/', (species) => {
    for (const entry of FECAL_CHARTS[species].entries) {
      const rel = entry.imagePath.replace(/^\//, '');
      expect(
        existsSync(join(PUBLIC_DIR, rel)),
        `${species} score ${entry.score}: missing ${entry.imagePath}`,
      ).toBe(true);
    }
  });

  it.each(FECAL_SPECIES)('%s — scores are unique and ascending', (species) => {
    const scores = fecalChartScores(species);
    expect(scores.length).toBeGreaterThan(0);
    expect(new Set(scores).size).toBe(scores.length);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });

  it.each(FECAL_SPECIES)('%s — every entry has band xor bandBySize', (species) => {
    for (const entry of FECAL_CHARTS[species].entries) {
      const hasBand = entry.band !== undefined;
      const hasBySize = entry.bandBySize !== undefined;
      expect(hasBand !== hasBySize, `${species} score ${entry.score}`).toBe(true);
      if (hasBySize) {
        expect(Object.keys(entry.bandBySize!).sort()).toEqual(['large-giant', 'small-medium']);
      }
      expect(FECAL_CHARTS[species].bands).toContain(
        hasBand ? entry.band! : entry.bandBySize!['small-medium'],
      );
    }
  });

  it.each(FECAL_SPECIES)('%s — citation names the chart and its VGI reference', (species) => {
    const citation = fecalChartCitation(species);
    expect(citation).toContain('Royal Canin');
    expect(citation).toContain(FECAL_CHARTS[species].title);
    expect(citation).toContain(FECAL_CHARTS[species].reference);
    expect(citation).toMatch(/VGI\/\d{3}\/\d{4}/);
  });
});

describe('fecalBandFor', () => {
  it('splits puppy score 3 by breed size and defaults to the cautious band', () => {
    expect(fecalBandFor('puppy', 3, 'large-giant')).toBe('normal');
    expect(fecalBandFor('puppy', 3, 'small-medium')).toBe('tooSoft');
    expect(fecalBandFor('puppy', 3)).toBe('tooSoft');
    expect(fecalBandFor('puppy', 3, null)).toBe('tooSoft');
  });

  it('ignores breed size for fixed-band scores and falls back for off-chart scores', () => {
    expect(fecalBandFor('dog', 2.5, 'large-giant')).toBe('optimal');
    expect(fecalBandFor('cat', 1)).toBe('tooHard');
    // 3.5 is a dog-only score — the cat chart has no entry for it.
    expect(fecalBandFor('cat', 3.5)).toBe('tooSoft');
  });
});

describe('nearestFecalScore', () => {
  it('snaps onto the chart and never returns an off-chart score', () => {
    expect(nearestFecalScore('dog', 3.4)).toBe(3.5);
    expect(nearestFecalScore('cat', 3.4)).toBe(3);
    expect(nearestFecalScore('dog', 99)).toBe(5);
    expect(fecalChartScores('cat')).toContain(nearestFecalScore('cat', Number.NaN));
  });
});

describe('buildFecalChartMarkdown', () => {
  it.each(FECAL_SPECIES)('%s — one paragraph per score, labelled "Score <n>"', (species) => {
    const md = buildFecalChartMarkdown(species);
    const chart = FECAL_CHARTS[species];
    const paragraphs = md.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const scored = paragraphs.filter((p) => /^Score /.test(p));
    expect(scored).toHaveLength(chart.entries.length);
    for (const entry of chart.entries) {
      const para = scored.find((p) => p.startsWith(`Score ${entry.score} `));
      expect(para, `no paragraph for score ${entry.score}`).toBeTruthy();
      expect(para).toContain(entry.label);
    }
    expect(md).toContain(chart.directions);
  });

  it.each(FECAL_SPECIES)('%s — chunks keep every score retrievable', (species) => {
    const chunks = chunkMarkdown(buildFecalChartMarkdown(species));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    const found = new Set(chunks.flatMap((c) => scoresMentionedIn(c, species)));
    expect([...found].sort((a, b) => a - b)).toEqual(fecalChartScores(species));
  });
});

describe('fecalChartChunks', () => {
  /**
   * The whole point: a chart is ~370 tokens, so `chunkMarkdown`'s 800-token
   * packing collapses it into ONE chunk and every query retrieves the same
   * passage. Per-score chunks are what makes similarity ranking — and the
   * UI's grounding panel — mean anything.
   */
  it.each(FECAL_SPECIES)('%s — exactly one chunk per score, in chart order', (species) => {
    const chunks = fecalChartChunks(species);
    const entries = FECAL_CHARTS[species].entries;
    expect(chunks).toHaveLength(entries.length);
    entries.forEach((entry, i) => {
      expect(chunks[i]).toContain(`Score ${entry.score} `);
      expect(chunks[i]).toContain(entry.label);
    });
  });

  it.each(FECAL_SPECIES)('%s — every chunk mentions its own score and no other', (species) => {
    const entries = FECAL_CHARTS[species].entries;
    fecalChartChunks(species).forEach((chunk, i) => {
      // The chart header rides inside every chunk; "Score stools individually
      // from 1 … to 5" must NOT leak a score into the retrieval metadata.
      expect(scoresMentionedIn(chunk, species)).toEqual([entries[i].score]);
    });
  });

  it.each(FECAL_SPECIES)('%s — every chunk is self-contained and small', (species) => {
    const chart = FECAL_CHARTS[species];
    for (const chunk of fecalChartChunks(species)) {
      expect(chunk).toContain(chart.title);
      expect(chunk).toContain(chart.directions);
      if (chart.subtitle) expect(chunk).toContain(chart.subtitle);
      // Header line, blank line, one score paragraph — nothing else.
      expect(chunk.split(/\n\s*\n/)).toHaveLength(2);
      expect(estimateTokens(chunk)).toBeLessThanOrEqual(200);
    }
  });
});

describe('scoresMentionedIn', () => {
  it('only reports scores the chart defines', () => {
    expect(scoresMentionedIn('Score 3.5 (Fecal Scoring System for Dogs)', 'dog')).toEqual([3.5]);
    // 3.5 is not on the cat chart.
    expect(scoresMentionedIn('Score 3.5 and Score 3', 'cat')).toEqual([3]);
    expect(scoresMentionedIn('no scores here', 'dog')).toEqual([]);
  });
});

/**
 * `ai-fecal-scan` refuses a retrieved chunk from ANOTHER species' chart by
 * these two helpers (slug first, printed title when the RPC returned no
 * provenance) — tags are admin-editable, the slug and the chart text are not.
 */
describe('chart provenance helpers', () => {
  it('reads the species out of a fecal:<x> slug and nothing else', () => {
    expect(fecalChartSlugSpecies('fecal:dog')).toBe('dog');
    expect(fecalChartSlugSpecies('fecal:puppy')).toBe('puppy');
    expect(fecalChartSlugSpecies(' fecal:cat ')).toBe('cat');
    // A stray chart-like slug still reads as a chart — and never as THIS one.
    expect(fecalChartSlugSpecies('fecal:horse')).toBe('horse');
    expect(fecalChartSlugSpecies('custom:photo-tips')).toBeNull();
    expect(fecalChartSlugSpecies('')).toBeNull();
    expect(fecalChartSlugSpecies(null)).toBeNull();
    expect(fecalChartSlugSpecies(undefined)).toBeNull();
  });

  it.each(FECAL_SPECIES)('%s — every seeded chunk names its own chart and no other', (species) => {
    for (const chunk of fecalChartChunks(species)) {
      expect(fecalChartSpeciesInText(chunk)).toBe(species);
    }
    // Dogs vs Puppies must not be confused by a shared prefix.
    expect(FECAL_CHARTS.dog.title).not.toBe(FECAL_CHARTS.puppy.title);
  });

  it('finds no chart in text that does not print a chart title', () => {
    expect(fecalChartSpeciesInText('Photograph the sample in daylight.')).toBeNull();
  });
});
