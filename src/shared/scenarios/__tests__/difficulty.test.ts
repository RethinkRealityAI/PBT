import { describe, expect, it } from 'vitest';
import { difficultyFromScenario, parseDifficulty } from '../difficulty';
import { SCENARIO_LIMITS } from '../limits';
import { DIFFICULTY_LABELS } from '../../../data/scenarios';

describe('parseDifficulty', () => {
  it('accepts the four integer levels', () => {
    expect([1, 2, 3, 4].map(parseDifficulty)).toEqual([1, 2, 3, 4]);
  });

  it('accepts a one-digit string (a re-serialised record)', () => {
    expect(parseDifficulty('3')).toBe(3);
    expect(parseDifficulty(' 4 ')).toBe(4);
  });

  it('rejects anything that is not a level — a corrupt value shows nothing, never a wrong level', () => {
    for (const bad of [0, 5, -1, 2.5, Number.NaN, Infinity, '0', '5', '2.5', 'Hostile', '', null, undefined, {}, [3], true]) {
      expect(parseDifficulty(bad), String(bad)).toBeNull();
    }
  });

  it('mirrors the consumer + server level range', () => {
    expect(Object.keys(DIFFICULTY_LABELS).map(Number)).toEqual([1, 2, 3, 4]);
    expect([...SCENARIO_LIMITS.difficultyLevels]).toEqual([1, 2, 3, 4]);
  });
});

describe('difficultyFromScenario', () => {
  it('reads the level off a stored scenario', () => {
    expect(difficultyFromScenario({ difficulty: 4, breed: 'Labrador' })).toBe(4);
  });

  it('is null for rows that never stored one (backfilled summaries, nulls, junk)', () => {
    expect(difficultyFromScenario({ summary: 'Cost · Lab', pushbackId: 'cost', driver: 'Analyzer' })).toBeNull();
    expect(difficultyFromScenario(null)).toBeNull();
    expect(difficultyFromScenario(undefined)).toBeNull();
    expect(difficultyFromScenario('{"difficulty":3}')).toBeNull();
    expect(difficultyFromScenario([{ difficulty: 3 }])).toBeNull();
    expect(difficultyFromScenario({ difficulty: 9 })).toBeNull();
  });
});
