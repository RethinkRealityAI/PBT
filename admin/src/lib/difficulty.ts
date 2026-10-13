/**
 * Session difficulty for the admin views (Sessions, the session modal,
 * Insights). Scoring holds every level to the SAME standard on purpose, so
 * scores stay comparable; difficulty is shown beside a score as context and
 * never adjusts one.
 */
import { DIFFICULTY_LABELS } from '../../../src/shared/scenarios/enums';
import {
  DIFFICULTY_LEVEL_COUNT,
  difficultyFromScenario,
  parseDifficulty,
  type DifficultyLevel,
} from '../../../src/shared/scenarios/difficulty';
import type { AdminSession } from '../data/types';

export const DIFFICULTY_LEVELS: readonly DifficultyLevel[] = [1, 2, 3, 4];

/**
 * The level a session was played at. `admin-sessions` derives `difficulty`
 * server-side; the stored scenario is the fallback for a function deploy that
 * predates the field. Null when the session never stored one.
 */
export function sessionDifficulty(
  s: Pick<AdminSession, 'difficulty' | 'scenario'>,
): DifficultyLevel | null {
  return parseDifficulty(s.difficulty) ?? difficultyFromScenario(s.scenario);
}

/** "Hostile" — the English word for a level. */
export function difficultyLabel(level: DifficultyLevel): string {
  return DIFFICULTY_LABELS[level] ?? `Level ${level}`;
}

/** Accessible name for the meter: "Difficulty: Hostile, level 3 of 4". */
export function difficultyAria(level: DifficultyLevel): string {
  return `Difficulty: ${difficultyLabel(level)}, level ${level} of ${DIFFICULTY_LEVEL_COUNT}`;
}

export interface DifficultyScoreBucket {
  level: DifficultyLevel;
  label: string;
  /** Scored sessions at this level. */
  count: number;
  /** Mean `score_overall` of those sessions; null when there are none. */
  avgScore: number | null;
}

/**
 * Average score per difficulty level. Pass ONLY sessions that were really
 * scored (completed, not `score_unavailable`) — a scoring-failure placeholder
 * is a stand-in 0, and counting it would invent a low score. Sessions without
 * a recorded level are counted in `unknown`, never guessed into a bucket.
 */
export function averageScoreByDifficulty(
  scored: Array<Pick<AdminSession, 'difficulty' | 'scenario' | 'score_overall'>>,
): { buckets: DifficultyScoreBucket[]; unknown: number; hasData: boolean } {
  const sums = new Map<DifficultyLevel, { sum: number; count: number }>();
  let unknown = 0;
  for (const s of scored) {
    if (s.score_overall == null || !Number.isFinite(s.score_overall)) continue;
    const level = sessionDifficulty(s);
    if (level == null) {
      unknown++;
      continue;
    }
    const acc = sums.get(level) ?? { sum: 0, count: 0 };
    acc.sum += s.score_overall;
    acc.count++;
    sums.set(level, acc);
  }
  const buckets = DIFFICULTY_LEVELS.map((level) => {
    const acc = sums.get(level);
    return {
      level,
      label: difficultyLabel(level),
      count: acc?.count ?? 0,
      avgScore: acc && acc.count > 0 ? acc.sum / acc.count : null,
    };
  });
  return { buckets, unknown, hasData: buckets.some((b) => b.count > 0) };
}
