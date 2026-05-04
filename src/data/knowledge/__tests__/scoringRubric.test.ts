import { describe, expect, it } from 'vitest';
import {
  DIMENSIONS,
  bandFor,
  dimensionWeights,
  weightedOverall,
} from '../scoringRubric';

describe('scoringRubric', () => {
  it('has 7 dimensions', () => {
    expect(DIMENSIONS).toHaveLength(7);
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
    const partial = { empathyTone: 100 } as never;
    const overall = weightedOverall(partial);
    expect(overall).toBe(Math.round(0.18 * 100));
  });

  it('dimensionWeights mirrors DIMENSIONS', () => {
    const w = dimensionWeights();
    DIMENSIONS.forEach((d) => expect(w[d.key]).toBe(d.weight));
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
