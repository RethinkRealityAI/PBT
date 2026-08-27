// Scenario enums — the canonical value lists the admin UI offers and the
// Netlify Functions validate against. Imported by BOTH admin/src (pickers) and
// netlify/functions (server-side validation), like src/shared/access and
// src/shared/knowledge — keep this file dependency-free.
//
// MIRROR: these lists must stay identical to the consumer's source of truth in
// `src/data/scenarios.ts`:
//   • PUSHBACK_IDS      ↔ PUSHBACK_CATEGORIES.map(c => c.id)
//   • PUSHBACK_LABELS   ↔ PUSHBACK_CATEGORIES[].title
//   • PUSHBACK_EXAMPLES ↔ PUSHBACK_CATEGORIES[].example
//   • LIFE_STAGES       ↔ LIFE_STAGES (the `LifeStage` union)
//   • PERSONAS          ↔ OWNER_PERSONAS (the `OwnerPersona` union)
//   • DIFFICULTY_LABELS ↔ DIFFICULTY_LABELS
// The consumer data module is NOT imported here on purpose: the admin bundle is
// a separate Vite entry and must not pull consumer data (and the Functions must
// not pull design-system types through it). A parity test guards the mirror.
//
// Unlike focus areas, these are NOT free-form: a pushback id keys into
// `pushbackTaxonomy`, and life stage / persona are interpolated verbatim into
// the customer prompt. An unknown value would silently degrade the roleplay,
// so the server rejects it rather than storing it.

/** Pushback category ids (`PUSHBACK_CATEGORIES[].id`). */
export const PUSHBACK_IDS: string[] = [
  'cost',
  'breeder-advice',
  'raw-food',
  'rx-diet',
  'brand-switch',
  'weight-denial',
  'custom',
];

/**
 * What each pushback id is called in English (`PUSHBACK_CATEGORIES[].title`).
 *
 * The ids are storage, not language — `rx-diet` and `weight-denial` mean
 * nothing to the person choosing between them, and `custom` reads as a
 * setting rather than as "some other objection". Anywhere a pushback is shown
 * to a human, it is shown from here.
 */
export const PUSHBACK_LABELS: Record<string, string> = {
  cost: 'Cost / price pushback',
  'breeder-advice': 'Friend / breeder said…',
  'raw-food': 'Grain-free / trend belief',
  'rx-diet': 'Skepticism on Rx diet',
  'brand-switch': 'Switching brands hesitation',
  'weight-denial': 'Weight / obesity denial',
  custom: 'Other pushback',
};

/**
 * The objection each category is written around
 * (`PUSHBACK_CATEGORIES[].example`) — the fastest way to tell two categories
 * apart when picking one.
 */
export const PUSHBACK_EXAMPLES: Record<string, string> = {
  cost: '"It\'s too expensive for what it is."',
  'breeder-advice': '"My breeder told me to feed something else."',
  'raw-food': '"Grain-free is healthier, right?"',
  'rx-diet': '"Is this really medically necessary?"',
  'brand-switch': '"My dog already eats fine — why change?"',
  'weight-denial': '"He\'s not fat — all Labs look like that."',
  custom: 'Describe the objection in your own words in the field below.',
};

/** What each difficulty level means (`DIFFICULTY_LABELS`). */
export const DIFFICULTY_LABELS: Record<number, string> = {
  1: 'Coachable',
  2: 'Skeptical',
  3: 'Hostile',
  4: 'Combative',
};

/** Pet life stages (`LifeStage`). Labels are the stored values. */
export const LIFE_STAGES: string[] = [
  'Puppy (<1)',
  'Junior (1-3)',
  'Adult (3-7)',
  'Senior (7+)',
];

/** Owner personas (`OwnerPersona`). */
export const PERSONAS: string[] = [
  'Skeptical',
  'Anxious',
  'Busy',
  'Bargain-hunter',
  'Devoted',
];

export function isPushbackId(value: unknown): value is string {
  return typeof value === 'string' && PUSHBACK_IDS.includes(value);
}

export function isLifeStage(value: unknown): value is string {
  return typeof value === 'string' && LIFE_STAGES.includes(value);
}

export function isPersona(value: unknown): value is string {
  return typeof value === 'string' && PERSONAS.includes(value);
}
