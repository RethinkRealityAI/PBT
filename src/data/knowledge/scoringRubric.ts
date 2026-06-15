/**
 * ACT-first scoring rubric used by the AI to evaluate a training session.
 *
 * Phase 2 re-engineered scoring around EMPATHY and the ACT methodology
 * (Acknowledge → Clarify → Transform), deliberately moving away from the
 * earlier general "sales acumen" dimensions (product knowledge, confidence,
 * closing effectiveness). The three ACT pillars carry 70% of the weight;
 * empathy + rapport make up the rest.
 *
 * Each dimension is scored 0–100 with band thresholds: ≥85 good, 70–84 ok,
 * <70 poor. Per-dimension weights compose the overall score and sum to 1.0.
 */

export type DimensionKey =
  | 'acknowledge'
  | 'clarify'
  | 'transform'
  | 'empathy'
  | 'rapport';

export interface DimensionDef {
  key: DimensionKey;
  label: string;
  description: string;
  weight: number;
  bands: {
    excellent: { min: 85; description: string; example: string };
    solid: { min: 70; description: string; example: string };
    developing: { min: 50; description: string; example: string };
    needsWork: { min: 0; description: string; example: string };
  };
}

export const DIMENSIONS: DimensionDef[] = [
  {
    key: 'acknowledge',
    label: 'Acknowledge',
    weight: 0.24,
    description:
      'Did the staff member validate the client\'s feeling FIRST — before clarifying or recommending — without minimising or arguing?',
    bands: {
      excellent: {
        min: 85,
        description: 'Names the feeling, honours the bond, holds space before moving on',
        example:
          '"It\'s clear how much Bella means to you — and changing her routine after 8 years is genuinely hard."',
      },
      solid: {
        min: 70,
        description: 'Validates the emotion but moves on a touch quickly',
        example: '"That\'s completely understandable. Can I ask you a couple of things?"',
      },
      developing: {
        min: 50,
        description: 'A brief nod, then pushes ahead to the pitch',
        example: '"I get it. So, the food I\'d recommend is..."',
      },
      needsWork: {
        min: 0,
        description: 'Skips the acknowledge entirely, negates it ("I understand, but..."), or contradicts the client',
        example: '"You shouldn\'t feel bad — but your dog really is overweight."',
      },
    },
  },
  {
    key: 'clarify',
    label: 'Clarify',
    weight: 0.24,
    description:
      'Did the staff ask open questions and reflect back what they heard to surface the real concern before pivoting?',
    bands: {
      excellent: {
        min: 85,
        description: 'Multiple open questions, paraphrases the answers, uncovers the root concern',
        example:
          '"Walk me through her day — and you mentioned the stairs are tougher; tell me more about that."',
      },
      solid: {
        min: 70,
        description: 'Asks one or two open questions and listens',
        example: '"How is her energy lately?"',
      },
      developing: {
        min: 50,
        description: 'Mostly closed yes/no questions; little reflecting back',
        example: '"Has she gained weight recently?"',
      },
      needsWork: {
        min: 0,
        description: 'Talks over the client; no clarifying questions; jumps to a pitch',
        example: 'Goes straight into a product recommendation',
      },
    },
  },
  {
    key: 'transform',
    label: 'Transform',
    weight: 0.22,
    description:
      'Did the staff reframe the objection and guide the client toward a specific, credible next step (a bounded trial, a recheck, a written plan) rather than retreating or steamrolling?',
    bands: {
      excellent: {
        min: 85,
        description: 'Reframes with new info, offers a concrete path AND a checkpoint',
        example:
          '"Per day, with portion control, it works out to less than a coffee — let\'s try 4 weeks and I\'ll see Bella back at week two for a weigh-in."',
      },
      solid: {
        min: 70,
        description: 'Addresses the objection and proposes a step, but no clear checkpoint',
        example: '"It is more per bag, but per day it\'s small — let\'s give it a try."',
      },
      developing: {
        min: 50,
        description: 'Sidesteps the objection or suggests something vague with no commitment',
        example: '"You could pick some up if you want."',
      },
      needsWork: {
        min: 0,
        description: 'Caves to the objection or argues; no next step at all',
        example: '"Okay, never mind then." or "You\'re wrong about the price."',
      },
    },
  },
  {
    key: 'empathy',
    label: 'Empathy & warmth',
    weight: 0.18,
    description:
      'Across the whole conversation, was the staff member\'s tone warm, non-judgmental, and attuned to the client — not clinical, defensive, or shaming?',
    bands: {
      excellent: {
        min: 85,
        description: 'Consistently warm and human; the client clearly feels heard',
        example: 'Uses the dog\'s name, softens delivery, never makes the owner feel judged',
      },
      solid: {
        min: 70,
        description: 'Warm overall with the odd clinical or flat moment',
        example: '"That\'s understandable. Let\'s look at her diet."',
      },
      developing: {
        min: 50,
        description: 'Mostly transactional; warmth comes and goes',
        example: 'Polite but detached, focused on getting through the steps',
      },
      needsWork: {
        min: 0,
        description: 'Cold, defensive, or subtly shaming',
        example: '"Well, this is what happens when a dog is overfed."',
      },
    },
  },
  {
    key: 'rapport',
    label: 'Rapport & pacing',
    weight: 0.12,
    description:
      'Did the staff match the client\'s energy and build trust — neither rushing them nor stalling — so the conversation felt collaborative?',
    bands: {
      excellent: {
        min: 85,
        description: 'Adapts speed to the client; pauses where needed; partners with them',
        example:
          'Mirrors a Harmonizer\'s slower pace; cuts straight to the outcome with an Activator',
      },
      solid: {
        min: 70,
        description: 'Reasonable pace and connection, occasional mismatch',
        example: '',
      },
      developing: {
        min: 50,
        description: 'Either rushes through or labours the points; connection is thin',
        example: '',
      },
      needsWork: {
        min: 0,
        description: 'Talks past the client or freezes when they push back',
        example: '',
      },
    },
  },
];

export function dimensionWeights(): Record<DimensionKey, number> {
  return DIMENSIONS.reduce(
    (acc, d) => {
      acc[d.key] = d.weight;
      return acc;
    },
    {} as Record<DimensionKey, number>,
  );
}

export function weightedOverall(scores: Record<DimensionKey, number>): number {
  const w = dimensionWeights();
  let total = 0;
  for (const k of Object.keys(w) as DimensionKey[]) {
    total += (scores[k] ?? 0) * w[k];
  }
  return Math.round(total);
}

export function bandFor(score: number): 'good' | 'ok' | 'poor' {
  if (score >= 85) return 'good';
  if (score >= 70) return 'ok';
  return 'poor';
}

/**
 * Legacy (pre-Phase-2) score shape. Sessions saved before the ACT-first
 * restructure carry the old 7 sales dimensions and the 1–10 ACT subscores.
 * We keep this loose so the normaliser below can read them off historic
 * records without widening `ScoreReport` itself.
 */
export interface LegacyScoreFields {
  empathyTone?: number;
  activeListening?: number;
  productKnowledge?: number;
  objectionHandling?: number;
  confidence?: number;
  closingEffectiveness?: number;
  pacing?: number;
  acknowledgeScore?: number;
  clarifyScore?: number;
  takeActionScore?: number;
}

/**
 * Map an old-shape score record onto the new ACT-first dimensions so historic
 * sessions still render meaningful bars instead of blanks/NaN.
 *
 * Preference order per dimension:
 *   1. the new field if present (current records)
 *   2. the matching legacy 1–10 ACT subscore, scaled ×10
 *   3. the closest legacy 0–100 dimension
 *   4. 0
 */
export function normalizeDimensions(
  raw: Partial<Record<DimensionKey, number>> & LegacyScoreFields,
): Record<DimensionKey, number> {
  const scale10 = (n: number | undefined) =>
    typeof n === 'number' ? Math.max(0, Math.min(100, Math.round(n * 10))) : undefined;
  const pick = (...vals: Array<number | undefined>): number => {
    for (const v of vals) if (typeof v === 'number') return v;
    return 0;
  };
  return {
    acknowledge: pick(raw.acknowledge, scale10(raw.acknowledgeScore), raw.empathyTone),
    clarify: pick(raw.clarify, scale10(raw.clarifyScore), raw.activeListening),
    transform: pick(raw.transform, scale10(raw.takeActionScore), raw.objectionHandling),
    empathy: pick(raw.empathy, raw.empathyTone),
    rapport: pick(raw.rapport, raw.pacing),
  };
}
