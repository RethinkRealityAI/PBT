/**
 * The ACT method — Acknowledge → Clarify → Transform.
 * Distilled from "Training session notes - How to train ACT Objection Handling.pptx"
 * and the ACT scenario transcripts.
 *
 * Consumed by the scoring prompt builder and (lightly) by the coach drawer.
 */

export interface ActStep {
  key: 'acknowledge' | 'clarify' | 'takeAction';
  label: string;
  goal: string;
  techniques: string[];
  doExamples: string[];
  dontExamples: string[];
}

export const ACT_STEPS: ActStep[] = [
  {
    key: 'acknowledge',
    label: 'Acknowledge',
    goal: 'Validate the customer\'s feelings without agreeing or disagreeing.',
    techniques: [
      'Reflect feelings explicitly ("That sounds frustrating.")',
      'Use the dog\'s name to show you listened',
      'Hold space — short pause after acknowledging',
      'Label the underlying value (love, care, money, time)',
    ],
    doExamples: [
      '"I hear you — Bella clearly means the world to you."',
      '"It makes sense to want food you can trust."',
      '"That last transition sounded miserable. I\'d be wary too."',
    ],
    dontExamples: [
      '"I understand, but..." (negates the validation)',
      '"You shouldn\'t feel that way."',
      'Skipping straight to the recommendation',
    ],
  },
  {
    key: 'clarify',
    label: 'Clarify',
    goal: 'Ask open questions to understand the dog\'s real context (age, diet, energy, vet observations).',
    techniques: [
      'Open questions starting with "What", "How", "Walk me through"',
      'One question at a time — let them talk',
      'Listen for the dog\'s name and life details',
      'Reflect back what you heard before pivoting',
    ],
    doExamples: [
      '"Walk me through her day — how much exercise does she get?"',
      '"What does your vet say when you bring her in?"',
      '"How\'s she on the stairs or getting in the car?"',
    ],
    dontExamples: [
      '"Don\'t you think she should lose weight?" (leading)',
      '"Have you tried portion control?" (yes/no closes)',
      'Three questions in a row before the customer can answer one',
    ],
  },
  {
    key: 'takeAction',
    label: 'Transform',
    goal: 'Propose a specific, credible Royal Canin next step with concrete benefits and a defined trial.',
    techniques: [
      'Lead with the outcome, then the product',
      'Cite specific data (the 97% / 12-week clinical evaluation)',
      'Offer a bounded trial — 4 weeks, not "let\'s see"',
      'Set a follow-up checkpoint',
    ],
    doExamples: [
      '"Based on what you\'ve told me, Satiety Support is built for exactly this — 97% of dogs lost weight in 12 weeks."',
      '"Let\'s do a 4-week trial. I\'ll check in at week two."',
      '"Here\'s the transition schedule — gradual over 7 days."',
    ],
    dontExamples: [
      '"This will help" (vague)',
      '"It\'s the best food" (unsubstantiated)',
      'Ending without a defined next step',
    ],
  },
];
