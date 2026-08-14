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

  // ── Barre supérieure ──────────────────────────────────────
  'chrome.back': 'Retour',
  'chrome.themeToggle.toLight': 'Passer au thème clair',
  'chrome.themeToggle.toDark': 'Passer au thème sombre',

  // ── Barre latérale (bureau) ───────────────────────────────
  'chrome.brand.tagline': 'Entraînement aux objections',
  'chrome.nav.create': 'Créer un scénario',
  'chrome.nav.analyzer': "Analyseur d'animaux",
  'chrome.nav.profile': 'Profil',
  'chrome.theme.dark': 'Thème sombre',
  'chrome.theme.light': 'Thème clair',

  // ── Primitives partagées ──────────────────────────────────
  'chrome.loading': 'Chargement',
  'chrome.score.ringAria': 'Résultat de {score} sur 100',
  'chrome.score.ringAriaLabelled': 'Résultat de {score} sur 100 — {label}',
  'chrome.score.chipAria': 'Résultat de {score}',
};
