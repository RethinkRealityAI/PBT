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
} as const;
