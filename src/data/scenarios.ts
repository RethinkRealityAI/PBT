/**
 * Scenario data — breeds, life stages, owner personas, pushback categories,
 * difficulty labels, and seed scenarios for the "Today's pick" rotation.
 *
 * Pushback categories, personas, life stages, and difficulty labels are
 * verbatim from design handoff: resources/design_handoff_pbt/design_files/screens/create.jsx
 */

import type { DriverKey } from '../design-system/tokens';

// ─────────────────────────────────────────────────────────────
// Enums / union types
// ─────────────────────────────────────────────────────────────

export type LifeStage = 'Puppy (<1)' | 'Junior (1-3)' | 'Adult (3-7)' | 'Senior (7+)';
export type OwnerPersona = 'Skeptical' | 'Anxious' | 'Busy' | 'Bargain-hunter' | 'Devoted';
export type Difficulty = 1 | 2 | 3 | 4;

// ─────────────────────────────────────────────────────────────
// Pushback categories — verbatim from prototype objections array
// ─────────────────────────────────────────────────────────────

export interface PushbackCategory {
  /** Stable identifier for this pushback type */
  id: string;
  /** Verbatim title from prototype */
  title: string;
  /** Italic example quote, verbatim from prototype */
  example: string;
}

export const PUSHBACK_CATEGORIES: PushbackCategory[] = [
  {
    id: 'cost',
    title: 'Cost / price pushback',
    example: "\"It's too expensive for what it is.\"",
  },
  {
    id: 'breeder-advice',
    title: 'Friend / breeder said…',
    example: '"My breeder told me to feed something else."',
  },
  {
    id: 'raw-food',
    title: 'Grain-free / trend belief',
    example: '"Grain-free is healthier, right?"',
  },
  {
    id: 'rx-diet',
    title: 'Skepticism on Rx diet',
    example: '"Is this really medically necessary?"',
  },
  {
    id: 'brand-switch',
    title: 'Switching brands hesitation',
    example: '"My dog already eats fine — why change?"',
  },
  {
    id: 'weight-denial',
    title: 'Weight / obesity denial',
    example: '"He\'s not fat — all Labs look like that."',
  },
  {
    id: 'custom',
    title: 'Other pushback',
    example: 'Describe the objection in your own words in the field below.',
  },
];

// ─────────────────────────────────────────────────────────────
// Static lists — verbatim from prototype
// ─────────────────────────────────────────────────────────────

/** Quick-select breed chips shown in the Create screen. */
export const BREEDS: string[] = [
  'Lab',
  'Golden',
  'French Bulldog',
  'GSD',
  'Mini Schnauzer',
  'Poodle',
  'Mixed',
];

export const LIFE_STAGES: LifeStage[] = [
  'Puppy (<1)',
  'Junior (1-3)',
  'Adult (3-7)',
  'Senior (7+)',
];

export const OWNER_PERSONAS: OwnerPersona[] = [
  'Skeptical',
  'Anxious',
  'Busy',
  'Bargain-hunter',
  'Devoted',
];

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  1: 'Coachable',
  2: 'Skeptical',
  3: 'Hostile',
  4: 'Combative',
};

export const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  1: 'The client is open-minded and willing to hear your recommendations with minimal resistance.',
  2: 'The client questions your advice and needs clear, evidence-backed reasoning to be persuaded.',
  3: 'The client is frustrated or defensive, requiring empathy and persistence to reach resolution.',
  4: 'The client is highly resistant and emotionally charged — tests your composure under pressure.',
};

// ─────────────────────────────────────────────────────────────
// Scenario shape
// ─────────────────────────────────────────────────────────────

export interface Scenario {
  breed: string;
  age: LifeStage;
  pushback: PushbackCategory;
  persona: OwnerPersona;
  difficulty: Difficulty;
  /** Optional free-text context from the staff member's memory of a real encounter */
  context?: string;
  /**
   * Required when `pushback.id === 'custom'`: what the client actually pushed back on.
   * Also optional for canned categories to add specifics (feeds prompts + scoring).
   */
  pushbackNotes?: string;
  /** Customer's suggested communication driver — drives AI personality */
  suggestedDriver: DriverKey;
  /**
   * Opening line the AI customer delivers to kick off the simulation.
   * Used in voice mode so the AI speaks first. Should be 1–2 sentences,
   * in character, and set up the core pushback immediately.
   */
  openingLine?: string;
  /** Dog weight in kg, as a string (e.g. "32.5"). Optional — absent means not specified. */
  weightKg?: string;
}

// ─────────────────────────────────────────────────────────────
// Seed scenarios — "Today's pick" rotation
// ─────────────────────────────────────────────────────────────

export const SEED_SCENARIOS: Scenario[] = [
  {
    breed: 'Lab',
    age: 'Adult (3-7)',
    pushback: PUSHBACK_CATEGORIES[5], // weight-denial
    persona: 'Skeptical',
    difficulty: 3,
    context:
      "Buddy is a 5-year-old male Lab weighing 42 kg — BCS 8/9. Vet flagged obesity and joint stress risk, recommended Satiety Support and a 12-week weight plan. Owner insists Buddy is just 'a big Lab' and that all his friends' Labs look the same. He eats whatever is on special at the supermarket and gets generous treats.",
    suggestedDriver: 'Activator',
    openingLine:
      "Look, Buddy's not fat — he's just a big Lab. All my friends' Labs look exactly the same.",
  },
  {
    breed: 'Lab',
    age: 'Adult (3-7)',
    pushback: PUSHBACK_CATEGORIES[0], // cost
    persona: 'Skeptical',
    difficulty: 2,
    context:
      "Owner came in for a routine weight check. Vet recommended Satiety Support but owner balked at the price difference vs. the store brand she's been using for two years.",
    suggestedDriver: 'Activator',
    openingLine:
      "I appreciate you seeing us, but honestly Royal Canin is just way too expensive. I can get similar food for half the price at the supermarket.",
  },
  {
    breed: 'GSD',
    age: 'Puppy (<1)',
    pushback: PUSHBACK_CATEGORIES[1], // breeder-advice
    persona: 'Devoted',
    difficulty: 2,
    context:
      'First-time owner, very attached. Breeder sent her home with a specific raw brand and she feels switching would be going against expert advice.',
    suggestedDriver: 'Harmonizer',
    openingLine:
      "My breeder specifically told me to feed her the raw brand she sent home with me — I'd feel terrible going against that advice.",
  },
  {
    breed: 'French Bulldog',
    age: 'Senior (7+)',
    pushback: PUSHBACK_CATEGORIES[3], // rx-diet
    persona: 'Anxious',
    difficulty: 3,
    context:
      'Owner is worried about over-medicalising her dog. Vet flagged early kidney markers but owner questions whether the prescription diet is truly necessary or just upselling.',
    suggestedDriver: 'Analyzer',
    openingLine:
      "I'm a bit worried — is this prescription diet actually medically necessary, or is this just an upsell? She seems perfectly fine on her current food.",
  },
  {
    breed: 'Golden',
    age: 'Adult (3-7)',
    pushback: PUSHBACK_CATEGORIES[2], // raw-food / trend belief
    persona: 'Busy',
    difficulty: 1,
    context:
      'Owner switched to grain-free after seeing content online. No clinical issues yet but vet flagged the DCM risk. Owner is open but short on time.',
    suggestedDriver: 'Energizer',
    openingLine:
      "I switched him to grain-free a few months ago — everything I read online says it's so much healthier. Why would I go back to something with grains?",
  },
  {
    breed: 'Mini Schnauzer',
    age: 'Junior (1-3)',
    pushback: PUSHBACK_CATEGORIES[4], // brand-switch
    persona: 'Bargain-hunter',
    difficulty: 2,
    context:
      'Dog is eating a supermarket brand with no apparent issues. Owner sees no reason to change and wants to know the ROI on the premium price point.',
    suggestedDriver: 'Activator',
    openingLine:
      "We've been using our current brand for over a year and she's perfectly healthy. I don't see why we'd need to change anything.",
  },
  {
    breed: 'Poodle',
    age: 'Senior (7+)',
    pushback: PUSHBACK_CATEGORIES[0], // cost
    persona: 'Devoted',
    difficulty: 3,
    context:
      'Owner is on a fixed income and genuinely distressed about the cost. Emotionally invested in giving her dog the best but feels priced out. Needs a compassionate, value-led conversation.',
    suggestedDriver: 'Harmonizer',
    openingLine:
      "I want the absolute best for her, I really do — but that price is just out of reach for me right now. Is there really no other option?",
  },
];

/**
 * The scenarios currently exposed in the UI.
 * Keep all scenarios in SEED_SCENARIOS; this curated list controls access without deleting content.
 * Current launch set:
 *   weight denial · cost / price · switching brands
 */
export const LIBRARY_SCENARIOS: Scenario[] = [
  SEED_SCENARIOS[0], // weight-denial: Lab BCS 8/9, Satiety Support
  SEED_SCENARIOS[1], // cost: Lab, Satiety Support price
  SEED_SCENARIOS[5], // brand-switch: Mini Schnauzer, supermarket brand
];
