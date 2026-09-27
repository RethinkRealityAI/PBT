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
  /**
   * Hard caps on the prose the AI reads (no DB CHECK — enforced by the
   * server and mirrored by the editors). Generous for real writing, but a
   * bound: a scenario's text is posted to `ai-roleplay` on every turn, so
   * unbounded prose is unbounded model spend and, past the function's body
   * cap, a scenario trainees cannot start.
   */
  titleMax: 120,
  infoTitleMax: 120,
  contextMax: 4000,
  openingLineMax: 1000,
  pushbackNotesMax: 2000,
  /** `sort_order` is a Postgres `int`; an out-of-range number is a 500. */
  sortOrderMax: 1_000_000,
} as const;

/**
 * What `sanitizeScenario` (netlify/functions/_shared/ai.ts) accepts on the
 * wire for the scenario object every AI call carries. Vocabulary-shaped
 * fields over their cap are REJECTED (they are ids and labels, not prose);
 * the three prose fields are TRUNCATED so an over-long saved scenario stays
 * playable while its cost stays bounded.
 */
export const SCENARIO_WIRE_MAX = {
  breed: SCENARIO_LIMITS.breedMax,
  age: 40,
  persona: 60,
  pushbackId: 60,
  pushbackTitle: 120,
  pushbackExample: 600,
  context: SCENARIO_LIMITS.contextMax,
  pushbackNotes: SCENARIO_LIMITS.pushbackNotesMax,
  openingLine: SCENARIO_LIMITS.openingLineMax,
  weightKg: 16,
  focusArea: 40,
  overrideId: 120,
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
