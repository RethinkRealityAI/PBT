import { describe, expect, it } from 'vitest';
import {
  averageScoreByDifficulty,
  difficultyAria,
  difficultyLabel,
  sessionDifficulty,
} from '../difficulty';

describe('sessionDifficulty', () => {
  it('prefers the server-derived field', () => {
    expect(sessionDifficulty({ difficulty: 3, scenario: { difficulty: 1 } })).toBe(3);
  });

  it('falls back to the stored scenario for a function deploy that predates the field', () => {
    expect(sessionDifficulty({ scenario: { difficulty: 4 } })).toBe(4);
  });

  it('is null when neither carries a level', () => {
    expect(sessionDifficulty({ difficulty: null, scenario: { summary: 'x' } })).toBeNull();
    expect(sessionDifficulty({ scenario: null })).toBeNull();
  });
});

describe('labels', () => {
  it('names each level the way the trainee app does', () => {
    expect([1, 2, 3, 4].map((l) => difficultyLabel(l as 1 | 2 | 3 | 4))).toEqual([
      'Coachable',
      'Skeptical',
      'Hostile',
      'Combative',
    ]);
    expect(difficultyAria(4)).toBe('Difficulty: Combative, level 4 of 4');
  });
});

describe('averageScoreByDifficulty', () => {
  it('averages per level, keeps every level in order, and never guesses a missing level', () => {
    const { buckets, unknown, hasData } = averageScoreByDifficulty([
      { difficulty: 1, scenario: null, score_overall: 90 },
      { difficulty: 1, scenario: null, score_overall: 80 },
      { difficulty: 4, scenario: null, score_overall: 75 },
      { difficulty: null, scenario: { difficulty: 4 }, score_overall: 65 },
      { difficulty: null, scenario: { summary: 'backfilled' }, score_overall: 50 },
      { difficulty: 2, scenario: null, score_overall: null },
    ]);
    expect(hasData).toBe(true);
    expect(unknown).toBe(1);
    expect(buckets.map((b) => [b.level, b.label, b.count, b.avgScore])).toEqual([
      [1, 'Coachable', 2, 85],
      [2, 'Skeptical', 0, null],
      [3, 'Hostile', 0, null],
      [4, 'Combative', 2, 70],
    ]);
  });

  it('reports no data for an empty window', () => {
    const r = averageScoreByDifficulty([]);
    expect(r.hasData).toBe(false);
    expect(r.unknown).toBe(0);
    expect(r.buckets).toHaveLength(4);
  });
});
