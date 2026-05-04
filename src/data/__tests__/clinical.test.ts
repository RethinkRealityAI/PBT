import { describe, it, expect } from 'vitest';
import { BCS_LEVELS } from '../bcsLevels';
import { MCS_LEVELS } from '../mcsLevels';
import { CAL_TABLE, calorieFor, closestRow } from '../calorieTable';

// ─────────────────────────────────────────────────────────────
// BCS_LEVELS
// ─────────────────────────────────────────────────────────────

describe('BCS_LEVELS', () => {
  it('has exactly 9 entries', () => {
    expect(BCS_LEVELS).toHaveLength(9);
  });

  it('scores run 1 through 9 in order', () => {
    const scores = BCS_LEVELS.map((l) => l.score);
    expect(scores).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('every entry has a non-empty label, description, and color', () => {
    for (const entry of BCS_LEVELS) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.color).toMatch(/^oklch/);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// MCS_LEVELS
// ─────────────────────────────────────────────────────────────

describe('MCS_LEVELS', () => {
  it('has exactly 4 entries', () => {
    expect(MCS_LEVELS).toHaveLength(4);
  });

  it('keys are: normal, mild, moderate, severe — in that order', () => {
    expect(MCS_LEVELS.map((l) => l.key)).toEqual([
      'normal',
      'mild',
      'moderate',
      'severe',
    ]);
  });

  it('every entry has a non-empty label, description, and color', () => {
    for (const entry of MCS_LEVELS) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.color).toMatch(/^oklch/);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// CAL_TABLE
// ─────────────────────────────────────────────────────────────

describe('CAL_TABLE', () => {
  it('has exactly 48 rows (weights 2–49 kg, integer steps)', () => {
    expect(CAL_TABLE).toHaveLength(48);
  });

  it('rows are in increasing weight order', () => {
    for (let i = 1; i < CAL_TABLE.length; i++) {
      expect(CAL_TABLE[i].weightKg).toBeGreaterThan(CAL_TABLE[i - 1].weightKg);
    }
  });

  it('first row is 2 kg and last row is 49 kg', () => {
    expect(CAL_TABLE[0].weightKg).toBe(2);
    expect(CAL_TABLE[CAL_TABLE.length - 1].weightKg).toBe(49);
  });
});

// ─────────────────────────────────────────────────────────────
// calorieFor
// ─────────────────────────────────────────────────────────────

describe('calorieFor', () => {
  it('active adult at 10 kg returns 731', () => {
    expect(calorieFor(10, 'active')).toBe(731);
  });

  it('inactive at 10 kg returns 534', () => {
    expect(calorieFor(10, 'inactive')).toBe(534);
  });
});

// ─────────────────────────────────────────────────────────────
// closestRow
// ─────────────────────────────────────────────────────────────

describe('closestRow', () => {
  it('returns the CAL_TABLE row nearest to 13 kg', () => {
    const row = closestRow(13);
    // 13 is an exact table entry
    expect(row.weightKg).toBe(13);
  });

  it('returns the nearest row for a weight between table entries', () => {
    // 13.4 is closer to 13 than to 14
    const row = closestRow(13.4);
    expect(row.weightKg).toBe(13);
  });

  it('returns the nearest row when weight is above the midpoint', () => {
    // 13.6 is closer to 14 than to 13
    const row = closestRow(13.6);
    expect(row.weightKg).toBe(14);
  });
});
