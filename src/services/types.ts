import type { DimensionKey } from '../data/knowledge/scoringRubric';

/**
 * AI emotion / resolution state — same vocabulary the voice session uses
 * (red = defensive, yellow = receptive, green = convinced). Voice mode
 * gets this from the `updateEmotion` tool call; text mode gets it from
 * a structured-output field on each customer reply. Used to render the
 * state border + label on the AI bubble.
 */
export type AiEmotion = 'red' | 'yellow' | 'green';

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
  /** Customer's resolution state at the moment of this turn. AI turns
   *  only; user turns leave it undefined. */
  emotion?: AiEmotion;
  /** Internal flag — message is a transient error, never sent to the model */
  _transientError?: true;
}

/**
 * Full 7-dimension scorecard returned by the evaluator.
 * Replaces the 3-score ACTFeedback in the legacy app while keeping the
 * legacy fields available as `acknowledgeScore`/`clarifyScore`/`takeActionScore`.
 */
export interface ScoreReport {
  empathyTone: number;
  activeListening: number;
  productKnowledge: number;
  objectionHandling: number;
  confidence: number;
  closingEffectiveness: number;
  pacing: number;

  overall: number;
  band: 'good' | 'ok' | 'poor';

  acknowledgeScore: number;
  clarifyScore: number;
  takeActionScore: number;

  critique: string;
  betterAlternative: string;
  perDimensionNotes: Record<DimensionKey, string>;
  keyMoments: KeyMoment[];
  /**
   * Per-turn sentiment, populated by the scorer model. One entry per turn
   * in the transcript (aligned by index). Range -1 (hostile) → +1 (warm),
   * 0 = neutral. Both staff and customer turns are scored — drives the
   * sentiment chart in the admin session modal.
   *
   * Optional: older sessions saved before the scorer schema added this
   * field will have it as undefined; consumers should fall back gracefully.
   */
  turnSentiment?: TurnSentiment[];
}

export interface KeyMoment {
  ts: string;
  type: 'win' | 'miss';
  label: string;
  quote: string;
}

export interface TurnSentiment {
  /** 0-based index into the transcript array. */
  idx: number;
  /** 'staff' = role 'user' (trainee), 'customer' = role 'ai' (pet owner). */
  speaker: 'staff' | 'customer';
  /** -1 (hostile) → +1 (warm), 0 = neutral. */
  sentiment: number;
}

export interface SessionRecord {
  id: string;
  scenarioSummary: string;
  pushbackId: string;
  driver: string;
  durationSeconds: number;
  mode: 'text' | 'voice';
  scoreReport: ScoreReport;
  transcript: ChatMessage[];
  createdAt: string;
}
