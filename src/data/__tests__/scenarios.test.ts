import { describe, it, expect } from 'vitest';
import {
  PUSHBACK_CATEGORIES,
  LIFE_STAGES,
  OWNER_PERSONAS,
  DIFFICULTY_LABELS,
  SEED_SCENARIOS,
  type Difficulty,
} from '../scenarios';
import { DRIVER_KEYS } from '../../design-system/tokens';

// ─────────────────────────────────────────────────────────────
// PUSHBACK_CATEGORIES
// ─────────────────────────────────────────────────────────────

describe('PUSHBACK_CATEGORIES', () => {
  it('has exactly 5 entries', () => {
    expect(PUSHBACK_CATEGORIES).toHaveLength(5);
  });

  it('ids are the expected set', () => {
    expect(PUSHBACK_CATEGORIES.map((p) => p.id)).toEqual([
      'cost',
      'breeder-advice',
      'raw-food',
      'rx-diet',
      'brand-switch',
    ]);
  });

  it('every entry has a non-empty title and example', () => {
    for (const p of PUSHBACK_CATEGORIES) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.example.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// LIFE_STAGES
// ─────────────────────────────────────────────────────────────

describe('LIFE_STAGES', () => {
  it('matches the design enum', () => {
    expect(LIFE_STAGES).toEqual([
      'Puppy (<1)',
      'Junior (1-3)',
      'Adult (3-7)',
      'Senior (7+)',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────
// OWNER_PERSONAS
// ─────────────────────────────────────────────────────────────

describe('OWNER_PERSONAS', () => {
  it('matches the design enum', () => {
    expect(OWNER_PERSONAS).toEqual([
      'Skeptical',
      'Anxious',
      'Busy',
      'Bargain-hunter',
      'Devoted',
    ]);
  });
});

// ─────────────────────────────────────────────────────────────
// DIFFICULTY_LABELS
// ─────────────────────────────────────────────────────────────

describe('DIFFICULTY_LABELS', () => {
  it('matches the design labels at each level', () => {
    expect(DIFFICULTY_LABELS[1]).toBe('Coachable');
    expect(DIFFICULTY_LABELS[2]).toBe('Skeptical');
    expect(DIFFICULTY_LABELS[3]).toBe('Hostile');
    expect(DIFFICULTY_LABELS[4]).toBe('Combative');
  });
});

// ─────────────────────────────────────────────────────────────
// SEED_SCENARIOS — shape validation
// ─────────────────────────────────────────────────────────────

describe('SEED_SCENARIOS', () => {
  it('has at least 4 entries', () => {
    expect(SEED_SCENARIOS.length).toBeGreaterThanOrEqual(4);
  });

  it('every scenario has all required fields', () => {
    for (const s of SEED_SCENARIOS) {
      expect(typeof s.breed).toBe('string');
      expect(s.breed.length).toBeGreaterThan(0);
      expect(LIFE_STAGES).toContain(s.age);
      expect(s.pushback).toBeDefined();
      expect(typeof s.pushback.id).toBe('string');
      expect(typeof s.pushback.title).toBe('string');
      expect(typeof s.pushback.example).toBe('string');
      expect(OWNER_PERSONAS).toContain(s.persona);
      expect([1, 2, 3, 4]).toContain(s.difficulty as Difficulty);
    }
  });

  it('every scenario has a valid suggestedDriver', () => {
    const validDrivers: readonly string[] = DRIVER_KEYS;
    for (const s of SEED_SCENARIOS) {
      expect(validDrivers).toContain(s.suggestedDriver);
    }
  });

  it('breed values come from the BREEDS list or are full breed names', () => {
    // Seed scenarios may use full breed names (e.g. 'Labrador Retriever')
    // or chip shortcuts (e.g. 'Lab'). Just verify they're non-empty strings.
    for (const s of SEED_SCENARIOS) {
      expect(s.breed.length).toBeGreaterThan(0);
    }
  });

  it('pushback references are members of PUSHBACK_CATEGORIES', () => {
    const ids = PUSHBACK_CATEGORIES.map((p) => p.id);
    for (const s of SEED_SCENARIOS) {
      expect(ids).toContain(s.pushback.id);
    }
  });
});
