import { describe, it, expect } from 'vitest';
import { dailyPickIndex, resolveDailyPickBase, type DailyPickBase } from '../dailyPick';

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

describe('resolveDailyPickBase', () => {
  const date = new Date(2026, 6, 8);
  const args = (total: number, resolved: boolean) => ({
    total,
    driverSeed: 'Activator',
    resolved,
    date,
  });

  it('tracks the library while it is still provisional', () => {
    const first = resolveDailyPickBase(null, args(7, false));
    expect(first).toEqual({
      key: expect.any(String),
      base: dailyPickIndex(7, 'Activator', date),
      frozen: false,
    });
    // Admin snapshot lands and hides two scenarios — still unresolved, so the
    // base follows the new total.
    const second = resolveDailyPickBase(first, args(5, false));
    expect(second?.base).toBe(dailyPickIndex(5, 'Activator', date));
  });

  it('stops moving once the library has resolved', () => {
    const resolvedBase = resolveDailyPickBase(null, args(5, true));
    expect(resolvedBase?.frozen).toBe(true);
    // A later refresh changes the visible count — the displayed pick must not
    // swap under the user.
    const afterRefresh = resolveDailyPickBase(resolvedBase, args(4, true));
    expect(afterRefresh).toBe(resolvedBase);
    // …not even back to the original total.
    expect(resolveDailyPickBase(afterRefresh, args(7, true))).toBe(resolvedBase);
  });

  it('unlocks for a new day or a new driver', () => {
    const frozen = resolveDailyPickBase(null, args(7, true)) as DailyPickBase;
    const nextDay = resolveDailyPickBase(frozen, {
      total: 7,
      driverSeed: 'Activator',
      resolved: true,
      date: new Date(2026, 6, 9),
    });
    expect(nextDay).not.toBe(frozen);
    expect(nextDay?.base).toBe(dailyPickIndex(7, 'Activator', new Date(2026, 6, 9)));

    const otherDriver = resolveDailyPickBase(frozen, {
      total: 7,
      driverSeed: 'Harmonizer',
      resolved: true,
      date,
    });
    expect(otherDriver?.base).toBe(dailyPickIndex(7, 'Harmonizer', date));
  });

  it('holds the previous base while the library is empty', () => {
    const frozen = resolveDailyPickBase(null, args(7, true));
    expect(resolveDailyPickBase(frozen, args(0, true))).toBe(frozen);
    expect(resolveDailyPickBase(null, args(0, false))).toBeNull();
  });
});
