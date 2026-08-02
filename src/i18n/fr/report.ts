/**
 * fr-CA — Fenêtre de signalement (bogue / suggestion).
 *
 * Terminologie québécoise : « bogue » (et non « bug »), « rétroaction ».
 * « IA » remplace « AI ». Espace fine insécable (U+202F) devant « ? ».
 * Registre : vouvoiement.
 */
import type { report as en } from '../en/report';

export const report: Record<keyof typeof en, string> = {
  'report.eyebrow': 'Aidez-nous à nous améliorer',
  'report.title': 'Signaler ou suggérer',
  'report.title.done': 'Merci',
  'report.close': 'Fermer',

  'report.done.bug':
    'Votre signalement est arrivé dans notre file de triage. Nous les lisons tous.',
  'report.done.suggestion':
    'Votre suggestion est arrivée dans notre file de triage. Nous les lisons toutes.',
  'report.done.cta': 'Terminé',

  'report.kind.aria': 'Type de signalement',
  'report.kind.bug': 'Signalement de bogue',
  'report.kind.suggestion': 'Suggestion',

  'report.subject.label': 'Sujet rapide',
  'report.subject.featureNotWorking': 'Fonction qui ne marche pas',
  'report.subject.aiNotResponding': "L'IA ne répond pas",
  'report.subject.voiceMode': 'Problème en mode voix',
  'report.subject.buttonNotWorking': 'Bouton qui ne répond pas',
  'report.subject.crashes': 'Plantages ou pépins',
  'report.subject.scoring': "Problème d'évaluation",
  'report.subject.newFeature': 'Idée de nouvelle fonction',
  'report.subject.ui': "Amélioration de l'interface",
  'report.subject.content': 'Demande de contenu',
  'report.subject.betterAi': "Meilleures réponses de l'IA",
  'report.subject.accessibility': 'Accessibilité',
  'report.subject.other': 'Autre',

  'report.message.label.bug': "Qu'est-ce qui s'est passé ?",
  'report.message.label.suggestion': 'Votre idée',
  'report.message.placeholder.bug':
    "Qu'est-ce qui s'est passé ? À quoi vous attendiez-vous plutôt ?",
  'report.message.placeholder.suggestion':
    'Qu\'est-ce qui rendrait ça meilleur ? Tous les détails aident.',
  'report.charCount': '{count} caractères',

  'report.error.empty': "Ajoutez d'abord une courte description.",
  'report.error.send':
    "Impossible d'envoyer — touchez Envoyer pour réessayer.",

  'report.submit': 'Envoyer',
  'report.submitting': 'Envoi…',
};
