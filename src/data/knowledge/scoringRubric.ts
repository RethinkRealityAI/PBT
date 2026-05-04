/**
 * 7-dimension scoring rubric used by the AI to evaluate a training session.
 * Each dimension is scored 0–100 with band thresholds: ≥85 good, 70–84 ok, <70 poor.
 *
 * Per-dimension weights compose the overall score. Sum to 1.0.
 */

export type DimensionKey =
  | 'empathyTone'
  | 'activeListening'
  | 'productKnowledge'
  | 'objectionHandling'
  | 'confidence'
  | 'closingEffectiveness'
  | 'pacing';

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
    key: 'empathyTone',
    label: 'Empathy & tone',
    weight: 0.18,
    description:
      'Did the staff member validate the customer\'s feelings without minimising or over-pitching?',
    bands: {
      excellent: {
        min: 85,
        description: 'Acknowledges the bond, names the feeling, uses dog\'s name',
        example:
          '"It\'s clear how much Bella means to you — and changing her routine after 8 years is hard."',
      },
      solid: {
        min: 70,
        description: 'Validates emotion but slightly clinical',
        example: '"That\'s understandable. Let\'s talk about her diet."',
      },
      developing: {
        min: 50,
        description: 'Acknowledges briefly then pushes ahead',
        example: '"I get it. So, the food I\'d recommend is..."',
      },
      needsWork: {
        min: 0,
        description: 'Skips the acknowledge entirely or contradicts the customer',
        example: '"You shouldn\'t feel bad — but your dog really is overweight."',
      },
    },
  },
  {
    key: 'activeListening',
    label: 'Active listening',
    weight: 0.16,
    description:
      'Did the staff ask open questions and reflect what they heard before pivoting?',
    bands: {
      excellent: {
        min: 85,
        description: 'Multiple open questions, paraphrases customer answers',
        example:
          '"Walk me through her day — and you mentioned stairs are tougher; tell me more about that."',
      },
      solid: {
        min: 70,
        description: 'Asks one or two open questions',
        example: '"How is her energy?"',
      },
      developing: {
        min: 50,
        description: 'Mostly closed yes/no questions',
        example: '"Has she gained weight recently?"',
      },
      needsWork: {
        min: 0,
        description: 'Talks over the customer; no clarifying questions',
        example: 'Goes straight into a product pitch',
      },
    },
  },
  {
    key: 'productKnowledge',
    label: 'Product knowledge',
    weight: 0.14,
    description:
      'Did the staff cite specific Royal Canin product claims (e.g. 97% weight loss in 12 weeks)?',
    bands: {
      excellent: {
        min: 85,
        description: 'Names the product, cites a specific stat, names a mechanism',
        example:
          '"Satiety Support — 97% of dogs lost weight in 12 weeks; the high-fibre blend keeps her fuller longer."',
      },
      solid: {
        min: 70,
        description: 'Names the product and one supporting claim',
        example: '"Satiety Support is designed for weight loss."',
      },
      developing: {
        min: 50,
        description: 'Mentions a Royal Canin product without specifics',
        example: '"There\'s a Royal Canin diet that could help."',
      },
      needsWork: {
        min: 0,
        description: 'Vague or no product mention',
        example: '"There are foods for this."',
      },
    },
  },
  {
    key: 'objectionHandling',
    label: 'Objection handling',
    weight: 0.20,
    description:
      'When the customer pushed back, did the staff reframe rather than retreat or steamroll?',
    bands: {
      excellent: {
        min: 85,
        description:
          'Acknowledges the objection, reframes it with new info, offers an alternative path',
        example:
          '"You\'re right that it costs more per bag. Per day, with portion control, it works out to less than a coffee — and you\'re paying for the trial outcome."',
      },
      solid: {
        min: 70,
        description: 'Addresses the objection but a bit defensively',
        example: '"It is more expensive, but the results are worth it."',
      },
      developing: {
        min: 50,
        description: 'Sidesteps the objection or repeats the original pitch',
        example: 'Pivots to "but it really works" without addressing cost',
      },
      needsWork: {
        min: 0,
        description: 'Caves to the objection or argues with the customer',
        example: '"Okay, never mind then." or "You\'re wrong about the price."',
      },
    },
  },
  {
    key: 'confidence',
    label: 'Confidence',
    weight: 0.10,
    description:
      'Did the staff sound certain in their recommendation — clear, unhedged, calm?',
    bands: {
      excellent: {
        min: 85,
        description: 'Clear, calm, specific. No filler. Owns the recommendation.',
        example: '"For Bella, my recommendation is Satiety Support, starting next week."',
      },
      solid: {
        min: 70,
        description: 'Mostly direct, occasional hedge',
        example: '"I\'d probably recommend Satiety Support, if that sounds okay?"',
      },
      developing: {
        min: 50,
        description: 'Heavy hedging, asks for permission to recommend',
        example: '"I think maybe… we could try… if you\'re open to it…"',
      },
      needsWork: {
        min: 0,
        description: 'Apologises for the recommendation; abandons it under pressure',
        example: '"Sorry, never mind, I shouldn\'t have brought it up."',
      },
    },
  },
  {
    key: 'closingEffectiveness',
    label: 'Closing effectiveness',
    weight: 0.14,
    description:
      'Did the conversation end with a defined next step — trial period, recheck date, written plan?',
    bands: {
      excellent: {
        min: 85,
        description: 'Specific commitment + checkpoint scheduled',
        example: '"Let\'s do a 4-week trial. I\'ll see Bella back at week 2 for a weigh-in."',
      },
      solid: {
        min: 70,
        description: 'Commitment without a clear checkpoint',
        example: '"Let\'s give it a try."',
      },
      developing: {
        min: 50,
        description: 'Soft suggestion with no commitment',
        example: '"You could pick some up if you want."',
      },
      needsWork: {
        min: 0,
        description: 'No close. Conversation just ends.',
        example: 'Trails off into pleasantries with no plan',
      },
    },
  },
  {
    key: 'pacing',
    label: 'Pacing',
    weight: 0.08,
    description:
      'Did the staff match the customer\'s energy and avoid rushing or stalling?',
    bands: {
      excellent: {
        min: 85,
        description: 'Adapts speed to customer; pauses where needed',
        example:
          'Mirrors a Harmonizer\'s slower pace; cuts straight to outcome with an Activator',
      },
      solid: {
        min: 70,
        description: 'Reasonable pace, occasional mismatch',
        example: '',
      },
      developing: {
        min: 50,
        description: 'Either rushes through or labors over points',
        example: '',
      },
      needsWork: {
        min: 0,
        description: 'Talks past the customer or freezes when they push back',
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
