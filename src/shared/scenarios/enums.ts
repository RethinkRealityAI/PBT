// Scenario enums — the canonical value lists the admin UI offers and the
// Netlify Functions validate against. Imported by BOTH admin/src (pickers) and
// netlify/functions (server-side validation), like src/shared/access and
// src/shared/knowledge — keep this file dependency-free.
//
// MIRROR: these lists must stay identical to the consumer's source of truth in
// `src/data/scenarios.ts`:
//   • PUSHBACK_IDS  ↔ PUSHBACK_CATEGORIES.map(c => c.id)
//   • LIFE_STAGES   ↔ LIFE_STAGES (the `LifeStage` union)
//   • PERSONAS      ↔ OWNER_PERSONAS (the `OwnerPersona` union)
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
