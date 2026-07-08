import {
  isScoreUnavailable,
  type AiEmotion,
  type ChatMessage,
  type ScoreReport,
  type SessionRecord,
} from '../../services/types';
import {
  DIMENSIONS,
  type DimensionDef,
} from '../../data/knowledge/scoringRubric';

/**
 * Pure helpers behind the scorecard's "insight" layer — progress vs the
 * trainee's own history, the customer's resolution arc, and the single
 * dimension to focus on next. Kept free of React so they're trivially
 * testable and shared between the live scorecard and history detail.
 */

export interface ScoreDelta {
  /** No prior scorable session to compare against. */
  kind: 'first' | 'improved' | 'dropped' | 'even';
  /** Signed difference vs the most recent prior scorable session. */
  delta: number;
  /** Strictly better than every prior scorable session. */
  personalBest: boolean;
  previousOverall: number | null;
}

/**
 * Compare the current overall against the trainee's saved history.
 *
 * `sessions` is the `pbt:sessions` array (newest first). The current
 * session may or may not already be persisted — it's excluded by id.
 * Placeholder "scoring unavailable" records never count as comparisons.
 */
export function computeScoreDelta(
  sessions: SessionRecord[],
  currentId: string | null,
  currentOverall: number,
): ScoreDelta {
  const prior = sessions.filter(
    (s) => s.id !== currentId && !isScoreUnavailable(s.scoreReport),
  );
  if (prior.length === 0) {
    return { kind: 'first', delta: 0, personalBest: false, previousOverall: null };
  }
  const previousOverall = prior[0].scoreReport.overall;
  const best = Math.max(...prior.map((s) => s.scoreReport.overall));
  const delta = currentOverall - previousOverall;
  return {
    kind: delta > 0 ? 'improved' : delta < 0 ? 'dropped' : 'even',
    delta,
    personalBest: currentOverall > best,
    previousOverall,
  };
}

/**
 * The customer's resolution arc — one entry per AI turn that carried an
 * emotion (red = defensive, yellow = receptive, green = convinced).
 * Empty when the transcript predates emotion capture.
 */
export function emotionJourney(transcript: ChatMessage[]): AiEmotion[] {
  return transcript
    .filter((m) => m.role === 'ai' && !m._transientError && m.emotion != null)
    .map((m) => m.emotion as AiEmotion);
}

/**
 * The single dimension the trainee should work on next: the lowest score,
 * ties broken by rubric weight (heavier dimension = more leverage).
 */
export function weakestDimension(report: ScoreReport): DimensionDef {
  let weakest = DIMENSIONS[0];
  for (const dim of DIMENSIONS) {
    const score = report[dim.key];
    const currentWeakest = report[weakest.key];
    if (
      score < currentWeakest ||
      (score === currentWeakest && dim.weight > weakest.weight)
    ) {
      weakest = dim;
    }
  }
  return weakest;
}
