import { describe, it, expect } from 'vitest';
import { dailyPickIndex } from '../dailyPick';

describe('dailyPickIndex', () => {
  it('is deterministic for the same day + driver', () => {
    const d = new Date(2026, 6, 8);
    expect(dailyPickIndex(7, 'Activator', d)).toBe(dailyPickIndex(7, 'Activator', d));
  });

  it('always lands inside [0, total)', () => {
    for (let day = 1; day <= 28; day++) {
      const idx = dailyPickIndex(3, 'Harmonizer', new Date(2026, 3, day));
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(3);
    }
  });

  it('rotates across consecutive days', () => {
    const picks = new Set(
      Array.from({ length: 10 }, (_, i) =>
        dailyPickIndex(7, 'Analyzer', new Date(2026, 6, 1 + i)),
      ),
    );
    // Ten days over seven scenarios must not be stuck on one index.
    expect(picks.size).toBeGreaterThan(1);
  });

  it('varies by driver on the same day', () => {
    const d = new Date(2026, 6, 8);
    const byDriver = new Set(
      ['Activator', 'Energizer', 'Analyzer', 'Harmonizer'].map((k) =>
        dailyPickIndex(7, k, d),
      ),
    );
    expect(byDriver.size).toBeGreaterThan(1);
  });

  it('handles an empty library', () => {
    expect(dailyPickIndex(0, 'Activator')).toBe(0);
  });
});
