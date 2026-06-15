import { describe, expect, it } from 'vitest';
import {
  DIMENSIONS,
  bandFor,
  dimensionWeights,
  normalizeDimensions,
  weightedOverall,
} from '../scoringRubric';

describe('scoringRubric', () => {
  it('has 5 ACT-first dimensions', () => {
    expect(DIMENSIONS).toHaveLength(5);
    expect(DIMENSIONS.map((d) => d.key)).toEqual([
      'acknowledge',
      'clarify',
      'transform',
      'empathy',
      'rapport',
    ]);
  });

  it('weights sum to 1.0 (within rounding)', () => {
    const sum = DIMENSIONS.reduce((s, d) => s + d.weight, 0);
    expect(sum).toBeCloseTo(1, 2);
  });

  it('weightedOverall computes a clamped average', () => {
    const all100 = DIMENSIONS.reduce(
      (acc, d) => ({ ...acc, [d.key]: 100 }),
      {} as Record<string, number>,
    );
    expect(weightedOverall(all100 as never)).toBe(100);

    const all50 = DIMENSIONS.reduce(
      (acc, d) => ({ ...acc, [d.key]: 50 }),
      {} as Record<string, number>,
    );
    expect(weightedOverall(all50 as never)).toBe(50);
  });

  it('weightedOverall handles partial input by defaulting to 0', () => {
    const partial = { acknowledge: 100 } as never;
    const overall = weightedOverall(partial);
    expect(overall).toBe(Math.round(0.24 * 100));
  });

  it('dimensionWeights mirrors DIMENSIONS', () => {
    const w = dimensionWeights();
    DIMENSIONS.forEach((d) => expect(w[d.key]).toBe(d.weight));
  });

  describe('normalizeDimensions', () => {
    it('passes through new ACT-first records unchanged', () => {
      const dims = normalizeDimensions({
        acknowledge: 90,
        clarify: 80,
        transform: 70,
        empathy: 60,
        rapport: 50,
      });
      expect(dims).toEqual({
        acknowledge: 90,
        clarify: 80,
        transform: 70,
        empathy: 60,
        rapport: 50,
      });
    });

    it('backfills from legacy 1–10 ACT subscores (scaled ×10)', () => {
      const dims = normalizeDimensions({
        acknowledgeScore: 8,
        clarifyScore: 7,
        takeActionScore: 9,
        empathyTone: 75,
        pacing: 60,
      });
      expect(dims.acknowledge).toBe(80);
      expect(dims.clarify).toBe(70);
      expect(dims.transform).toBe(90);
      expect(dims.empathy).toBe(75);
      expect(dims.rapport).toBe(60);
    });

    it('falls back to closest legacy 0–100 dimension, then 0', () => {
      const dims = normalizeDimensions({
        empathyTone: 88,
        activeListening: 66,
        objectionHandling: 44,
      });
      expect(dims.acknowledge).toBe(88); // empathyTone
      expect(dims.clarify).toBe(66); // activeListening
      expect(dims.transform).toBe(44); // objectionHandling
      expect(dims.rapport).toBe(0); // nothing to map → 0
    });
  });

  it.each([
    [100, 'good'],
    [85, 'good'],
    [84, 'ok'],
    [70, 'ok'],
    [69, 'poor'],
    [0, 'poor'],
  ] as const)('bandFor(%i) === %s', (score, expected) => {
    expect(bandFor(score)).toBe(expected);
  });
});
