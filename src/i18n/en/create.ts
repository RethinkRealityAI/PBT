/**
 * Scenario-builder namespace — English (source catalog).
 *
 * Covers `CreateScreen` chrome (tabs, section headers, inputs, CTAs) and the
 * shared `ScenarioHints` panel (`create.hints.*`), which is also rendered by
 * HomeScreen's scenario-info modal and ChatScreen's Begin Simulation modal.
 *
 * NOT here on purpose: pushback titles/examples, difficulty labels and
 * descriptions, breeds, life stages and owner personas. Those are authored
 * data in `src/data/scenarios.ts` (and the pushback taxonomy) and are
 * localized through the data-overlay registry, not this catalog.
 */
export const create = {
  // ── Screen chrome / tabs ──────────────────────────────────
  'create.title': 'Build a scenario',
  'create.tabsAria': 'Scenario tabs',
  'create.tab.build': 'Build',
  'create.tab.library': 'Library',

  // ── Library tab ───────────────────────────────────────────
  'create.library.start': 'Start',

  // ── Section headers ───────────────────────────────────────
  'create.section.breed': 'Breed',
  'create.section.lifeStage': 'Life stage',
  'create.section.pushback': 'The pushback',
  'create.section.persona': 'Owner persona',
  'create.section.driver': 'ECHO driver',
  'create.section.difficulty': 'Difficulty',
  'create.section.details': 'Additional details',

  // ── Breed + weight ────────────────────────────────────────
  'create.breed.placeholder': 'Search breed',
  'create.breed.error': 'Choose a breed or type one in.',
  'create.savedPets.eyebrow': 'Saved pets',
  /** SI unit symbol — identical in every locale (allowlisted in the parity test). */
  'create.weight.unit': 'kg',
  'create.weight.label': "Dog's weight (optional)",

  // ── Pushback picker ───────────────────────────────────────
  'create.pushback.selectAria': 'Select pushback type',
  'create.pushback.placeholder': 'Choose a pushback type…',
  'create.pushback.notesOptional': 'What exactly did they say? · optional',
  'create.pushback.notesOptionalPlaceholder':
    'Add the actual wording or nuance — helps the AI stay specific.',
  'create.pushback.or': 'or',
  'create.pushback.otherTitle': 'Other pushback',
  'create.pushback.otherSub': 'Describe any objection in your own words',
  'create.pushback.notesRequired': 'What did they push back on? · required',
  'create.pushback.notesRequiredPlaceholder':
    'e.g. "They insisted supermarket senior food is identical to Rx…"',
  'create.pushback.error': 'Describe what the client pushed back on.',

  // ── Difficulty + details ──────────────────────────────────
  'create.difficulty.aria': 'Difficulty',
  'create.details.placeholder':
    'Add specifics — what was said, what stalled the conversation…',

  // ── Submit ────────────────────────────────────────────────
  'create.submit': 'Start scenario',

  // ── Pre-session ACT hints (ScenarioHints) ─────────────────
  'create.hints.eyebrow': 'What earns credit',
  'create.hints.acknowledge': 'Acknowledge',
  'create.hints.clarify': 'Clarify',
  'create.hints.takeAction': 'Take action',
} as const;
