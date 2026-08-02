import type { chrome as enChrome } from '../en/chrome';

/** Français (fr-CA). Voir .claude/agents/translator.md pour le glossaire. */
export const chrome: Record<keyof typeof enChrome, string> = {
  'settings.language.label': 'Langue',
  'settings.language.hint': "S'applique à toute l'application, y compris le client IA et vos fiches de pointage.",
  'chrome.languageToggle.aria': 'Changer de langue',
  'tab.train': 'Pratique',
  'tab.history': 'Historique',
  'tab.library': 'Bibliothèque',
  'tab.you': 'Vous',
};
