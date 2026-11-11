/**
 * Bibliothèque d'entraînement + fenêtre « Choisir un scénario » de l'accueil —
 * français canadien (fr-CA), vouvoiement, registre chaleureux-professionnel
 * de clinique.
 *
 * Décisions de terminologie :
 * - « Library » (scénarios) → « Bibliothèque d'entraînement » ; l'onglet des
 *   références cliniques devient « Ressources ».
 * - « pushback » → « objection » (comme les autres catalogues).
 * - « focus area » → « thème » (court, naturel pour une équipe de clinique).
 * - « Ready-made » → « clés en main » (déjà employé dans create.ts).
 * - « practice » → « s'exercer » (comme onboarding.ts et terms.ts) plutôt que
 *   « pratiquer » employé seul, calque de l'anglais selon l'OQLF.
 * - Ponctuation double précédée d'une espace ordinaire, comme les autres
 *   catalogues fr du dépôt.
 */
import type { library as en } from '../en/library';

export const library: Record<keyof typeof en, string> = {
  // ── Fenêtre « Choisir un scénario » (accueil) ─────────────
  'select.eyebrow': 'Entraînement',
  'select.title': 'Comment souhaitez-vous vous exercer ?',
  'select.close': 'Fermer',
  'select.library.title': 'Choisir dans la bibliothèque',
  'select.library.body': 'Des scénarios clés en main rédigés par votre équipe de formation',
  'select.library.count': '{count} scénarios',
  'select.library.countOne': '1 scénario',
  'select.library.none': 'Aucun scénario publié',
  'select.build.title': 'Créer le vôtre',
  'select.build.body': 'Choisissez l’animal, l’objection et le propriétaire.',

  // ── Écran Bibliothèque d'entraînement ─────────────────────
  'library.title': 'Bibliothèque d’entraînement',
  'library.eyebrow': 'Bibliothèque d’entraînement',
  'library.heading': 'Choisissez un thème',
  'library.sub': 'Des scénarios clés en main rédigés par votre équipe de formation.',
  'library.animalAria': 'Animal pour l’entraînement',
  'library.groupsAria': 'Thèmes',
  'library.all.title': 'Tous les scénarios',
  'library.count': '{count} scénarios',
  'library.countOne': '1 scénario',
  'library.back': 'Tous les thèmes',
  'library.filterAria': 'Filtrer par objection',
  'library.filterAll': 'Toutes',
  'library.scenariosAria': 'Scénarios',

  // ── Carte d'un scénario ───────────────────────────────────
  'library.card.startAria': 'Lancer : {title}',
  'library.card.persona': 'Propriétaire : {persona}',
  'library.card.difficultyAria': 'Difficulté : {label}, niveau {level} sur 4',

  // ── État vide ─────────────────────────────────────────────
  'library.empty.titleDog': 'Pas encore de scénario clés en main pour les chiens',
  'library.empty.titleCat': 'Pas encore de scénario clés en main pour les chats',
  'library.empty.title': 'Pas encore de scénario clés en main',
  'library.empty.body':
    'Votre équipe de formation n’en a publié aucun pour l’instant. Créez le vôtre pour vous exercer en attendant.',
  'library.empty.bodyNoBuild': 'Votre équipe de formation n’en a publié aucun pour l’instant. Revenez bientôt.',
  'library.empty.cta': 'Créer le vôtre',
};
