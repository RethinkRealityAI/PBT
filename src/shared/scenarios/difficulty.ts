// Difficulty — reading a session's level back out of stored data.
//
// Imported by the trainee app (History / scorecard), the admin (Sessions,
// Insights) and netlify/functions (admin-sessions), like the other modules in
// src/shared — keep this file dependency-free.
//
// The SCORE is held to the same standard at every level (deliberate: it keeps
// scores comparable), so difficulty is only ever shown BESIDE a score, never
// folded into it. These helpers exist so every surface reads the level the
// same tolerant way: the trainee's copy lives in user-editable localStorage
// and the admin's in a jsonb `training_sessions.scenario` that older rows
// (and backfilled ones) may not carry it in.
//
// MIRROR: the 1–4 range is `Difficulty` in src/data/scenarios.ts and
// `SCENARIO_LIMITS.difficultyLevels` in ./limits.ts.

/** The four difficulty levels (1 = Coachable … 4 = Combative). */
export type DifficultyLevel = 1 | 2 | 3 | 4;

export const DIFFICULTY_LEVEL_COUNT = 4;

/**
 * A stored difficulty, or null when it is missing or not a level. Accepts the
 * integer 1–4 (and its one-digit string form, which a hand-edited or
 * re-serialised record can carry); anything else — 0, 5, 2.5, NaN, a label —
 * is null, so a corrupt value shows nothing rather than a wrong level.
 */
export function parseDifficulty(raw: unknown): DifficultyLevel | null {
  const n = typeof raw === 'string' && /^\s*[1-4]\s*$/.test(raw) ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > DIFFICULTY_LEVEL_COUNT) {
    return null;
  }
  return n as DifficultyLevel;
}

/**
 * The difficulty a session was played at, read from the scenario object it
 * stored (`training_sessions.scenario` — the full `Scenario` for sessions the
 * app wrote, a three-field summary for backfilled ones). Null when absent.
 */
export function difficultyFromScenario(scenario: unknown): DifficultyLevel | null {
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) return null;
  return parseDifficulty((scenario as { difficulty?: unknown }).difficulty);
}
