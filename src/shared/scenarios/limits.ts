// Scenario field limits — the numbers `validateOverride` enforces in
// netlify/functions/admin-scenario-overrides.ts, shared so the Studio can
// count against them while the admin types and the assistant's proposals
// can be clamped to them before they ever reach a card.
//
// Dependency-free: imported by admin/src and netlify/functions.

export const SCENARIO_LIMITS = {
  /** prompt_prefix / prompt_suffix, each. Also a DB CHECK. */
  promptMax: 1500,
  breedMax: 80,
  cardTitleMax: 120,
  cardSubtitleMax: 240,
  startButtonMax: 40,
  infoBodyMax: 4000,
  knowledgeSlugsMax: 40,
  knowledgeSlugLenMax: 200,
  /** Open interval (0, weightMaxKg]. */
  weightMaxKg: 200,
  difficultyLevels: [1, 2, 3, 4] as readonly number[],
} as const;

/**
 * Soft caps for prose the server does not length-check. The editor lets an
 * admin write more; the assistant's proposals are clamped to these so a
 * runaway model answer never lands a wall of text in a field.
 */
export const SCENARIO_PROSE_CAPS = {
  pushbackNotes: 600,
  context: 1500,
  openingLine: 400,
  infoTitle: 120,
} as const;
