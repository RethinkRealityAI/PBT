import type { DimensionKey } from '../data/knowledge/scoringRubric';

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
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
}

export interface KeyMoment {
  ts: string;
  type: 'win' | 'miss';
  label: string;
  quote: string;
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
