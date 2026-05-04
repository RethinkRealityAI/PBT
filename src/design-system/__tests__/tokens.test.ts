import { describe, expect, it } from 'vitest';
import {
  COLORS,
  DRIVER_COLORS,
  DRIVER_KEYS,
  scoreBand,
  scoreBandColor,
} from '../tokens';

describe('tokens', () => {
  it('exposes all four ECHO drivers', () => {
    expect(DRIVER_KEYS).toEqual([
      'Activator',
      'Energizer',
      'Analyzer',
      'Harmonizer',
    ]);
  });

  it('every driver has primary/accent/soft/wave colors', () => {
    for (const key of DRIVER_KEYS) {
      const colors = DRIVER_COLORS[key];
      expect(colors.primary).toMatch(/^oklch\(/);
      expect(colors.accent).toMatch(/^oklch\(/);
      expect(colors.soft).toMatch(/^oklch\(/);
      expect(colors.wave).toMatch(/^oklch\(/);
    }
  });

  it.each([
    [85, 'good'],
    [99, 'good'],
    [84, 'ok'],
    [70, 'ok'],
    [69, 'poor'],
    [0, 'poor'],
  ] as const)('scoreBand(%i) === %s', (score, expected) => {
    expect(scoreBand(score)).toBe(expected);
  });

  it('scoreBandColor uses the band tokens', () => {
    expect(scoreBandColor(90)).toBe(COLORS.score.good);
    expect(scoreBandColor(75)).toBe(COLORS.score.ok);
    expect(scoreBandColor(40)).toBe(COLORS.score.poor);
  });
});
