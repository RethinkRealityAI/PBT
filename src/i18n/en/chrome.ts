/**
 * App-shell + settings chrome strings. Namespaces use flat dotted keys;
 * every key added here must be added to EVERY other locale's matching file
 * (the `Catalog` type makes a missing key a compile error — see
 * CLAUDE.md "Translations (MANDATORY)").
 */
export const chrome = {
  'settings.language.label': 'Language',
  'settings.language.hint': 'Applies to the whole app, including the AI customer and your scorecards.',
  'chrome.languageToggle.aria': 'Switch language',
  'tab.train': 'Train',
  'tab.history': 'History',
  'tab.library': 'Library',
  'tab.you': 'You',

  // ── TopBar ────────────────────────────────────────────────
  'chrome.back': 'Back',
  'chrome.themeToggle.toLight': 'Switch to light mode',
  'chrome.themeToggle.toDark': 'Switch to dark mode',

  // ── Desktop sidebar ───────────────────────────────────────
  /** Wordmark is "PBT" (untranslated); this is the line under it. */
  'chrome.brand.tagline': 'Pushback Training',
  // Train / History / Library reuse the tab.* keys above.
  'chrome.nav.create': 'Build scenario',
  'chrome.nav.analyzer': 'Pet Analyzer',
  'chrome.nav.profile': 'Profile',
  'chrome.theme.dark': 'Dark mode',
  'chrome.theme.light': 'Light mode',

  // ── Shared primitives ─────────────────────────────────────
  /** Screen-reader text for the lazy-screen loading fallback. */
  'chrome.loading': 'Loading',
  /** `ScoreRing` accessible name, without a band label. */
  'chrome.score.ringAria': 'Score {score} out of 100',
  /** `ScoreRing` accessible name when a band label is shown. */
  'chrome.score.ringAriaLabelled': 'Score {score} out of 100 — {label}',
  /** `ScoreChip` accessible name. */
  'chrome.score.chipAria': 'Score {score}',
} as const;
