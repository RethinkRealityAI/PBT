import { describe, expect, it } from 'vitest';
import { normalizeScoreReport } from '../types';
import type { ScoreReport } from '../types';
import { bandFor, weightedOverall } from '../../data/knowledge/scoringRubric';

describe('normalizeScoreReport', () => {
  it('passes a current ACT-first record through unchanged (idempotent overall)', () => {
    const dims = { acknowledge: 90, clarify: 80, transform: 70, empathy: 60, rapport: 50 };
    const report: ScoreReport = {
      ...dims,
      overall: weightedOverall(dims),
      band: bandFor(weightedOverall(dims)),
      critique: 'x',
      betterAlternative: 'y',
      perDimensionNotes: {
        acknowledge: 'a',
        clarify: 'c',
        transform: 't',
        empathy: 'e',
        rapport: 'r',
      },
      keyMoments: [],
    };
    const out = normalizeScoreReport(report);
    expect(out.acknowledge).toBe(90);
    expect(out.overall).toBe(report.overall);
    expect(out.band).toBe(report.band);
    expect(out.perDimensionNotes.acknowledge).toBe('a');
    // Idempotent
    expect(normalizeScoreReport(out)).toEqual(out);
  });

  it('recomputes overall/band for a legacy record so the ring matches the bars', () => {
    // Old-shape record: 7 sales dims + 1–10 ACT subscores, and a stale overall
    // computed from the OLD weighting. Cast through unknown — the legacy shape
    // is intentionally not part of the current ScoreReport.
    const legacy = {
      empathyTone: 40,
      activeListening: 30,
      productKnowledge: 95,
      objectionHandling: 35,
      confidence: 90,
      closingEffectiveness: 92,
      pacing: 30,
      acknowledgeScore: 4,
      clarifyScore: 3,
      takeActionScore: 3,
      overall: 88, // stale, from old sales weighting
      band: 'good' as const,
      critique: 'legacy',
      betterAlternative: '-',
      perDimensionNotes: {
        empathyTone: 'warm',
        activeListening: 'ok',
        objectionHandling: 'defensive',
      },
      keyMoments: [],
    } as unknown as ScoreReport;

    const out = normalizeScoreReport(legacy);
    // Dimensions backfilled from the ACT subscores (×10) / closest legacy dim.
    expect(out.acknowledge).toBe(40); // acknowledgeScore 4 → 40
    expect(out.clarify).toBe(30); // clarifyScore 3 → 30
    expect(out.transform).toBe(30); // takeActionScore 3 → 30
    expect(out.empathy).toBe(40); // empathyTone
    expect(out.rapport).toBe(30); // pacing

    // Overall + band are now recomputed from those dimensions — NOT the stale 88.
    const expectedOverall = weightedOverall({
      acknowledge: 40,
      clarify: 30,
      transform: 30,
      empathy: 40,
      rapport: 30,
    });
    expect(out.overall).toBe(expectedOverall);
    expect(out.band).toBe(bandFor(expectedOverall));
    expect(out.overall).not.toBe(88);
    // Notes mapped from the closest legacy note.
    expect(out.perDimensionNotes.acknowledge).toBe('warm');
    expect(out.perDimensionNotes.transform).toBe('defensive');
  });
});
