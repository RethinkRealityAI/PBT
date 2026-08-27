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

  // ── Reprise après plantage (ErrorBoundary) ────────────────
  'chrome.error.eyebrow': 'Une erreur est survenue',
  'chrome.error.title': "Cet écran n'a pas pu se charger",
  'chrome.error.body':
    "Désolé — quelque chose a flanché pendant le chargement de cet écran. Recharger règle habituellement le problème, et vos séances enregistrées sont intactes.",
  'chrome.error.stale.eyebrow': 'Nouvelle version',
  'chrome.error.stale.title': 'Une nouvelle version est disponible',
  'chrome.error.stale.body':
    "L'application a été mise à jour pendant que cet onglet était ouvert : une partie n'a donc pas pu se charger. Rechargez pour obtenir la version la plus récente — vos séances enregistrées sont intactes.",
  'chrome.error.reload': "Recharger l'application",
};
