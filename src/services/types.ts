import {
  normalizeDimensions,
  type DimensionKey,
  type LegacyScoreFields,
} from '../data/knowledge/scoringRubric';

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
 * ACT-first scorecard returned by the evaluator (Phase 2).
 *
 * The five dimensions are the ACT pillars (acknowledge / clarify / transform)
 * plus empathy + rapport — see `scoringRubric.ts`. Legacy sales dimensions
 * from pre-Phase-2 records are preserved as optional fields (via
 * `LegacyScoreFields`) so historic sessions still deserialise; the
 * `normalizeScoreReport` helper backfills the new dimensions from them.
 */
export interface ScoreReport extends LegacyScoreFields {
  acknowledge: number;
  clarify: number;
  transform: number;
  empathy: number;
  rapport: number;

  overall: number;
  band: 'good' | 'ok' | 'poor';

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

/**
 * Coerce any saved/returned score report onto the current ACT-first shape.
 *
 * - New records pass through unchanged.
 * - Pre-Phase-2 records get their five dimensions backfilled from the legacy
 *   sales dimensions + 1–10 ACT subscores, and per-dimension notes mapped
 *   from the closest legacy note so the breakdown still reads sensibly.
 *
 * UI surfaces (Stats, History detail) call this before rendering so a mix of
 * old and new history never produces blank bars or `NaN` widths.
 */
export function normalizeScoreReport(report: ScoreReport): ScoreReport {
  const dims = normalizeDimensions(report);
  const notes = report.perDimensionNotes ?? ({} as Record<DimensionKey, string>);
  const legacyNote = (k: DimensionKey): string => {
    const n = notes as Record<string, string | undefined>;
    switch (k) {
      case 'acknowledge':
        return n.acknowledge ?? n.empathyTone ?? '';
      case 'clarify':
        return n.clarify ?? n.activeListening ?? '';
      case 'transform':
        return n.transform ?? n.objectionHandling ?? '';
      case 'empathy':
        return n.empathy ?? n.empathyTone ?? '';
      case 'rapport':
        return n.rapport ?? n.pacing ?? '';
    }
  };
  return {
    ...report,
    ...dims,
    perDimensionNotes: {
      acknowledge: legacyNote('acknowledge'),
      clarify: legacyNote('clarify'),
      transform: legacyNote('transform'),
      empathy: legacyNote('empathy'),
      rapport: legacyNote('rapport'),
    },
  };
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
