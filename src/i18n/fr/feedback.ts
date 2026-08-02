import type { feedback as enFeedback } from '../en/feedback';

/** Français (fr-CA). Voir .claude/agents/translator.md pour le glossaire. */
export const feedback: Record<keyof typeof enFeedback, string> = {
  'feedback.title': 'Évaluez cette simulation',
  'feedback.realism': 'Réalisme du scénario',
  'feedback.aiQuality': 'Qualité des réponses de l’IA',
  'feedback.comfort': 'À quel point vous êtes-vous senti à l’aise',
  'feedback.starAria': '{n} sur 5',
  'feedback.commentPlaceholder': 'Autre chose ? (facultatif)',
  'feedback.submit': 'Envoyer le commentaire',
  'feedback.submitting': 'Envoi…',
  'feedback.error':
    'Impossible d’enregistrer — touchez Envoyer pour réessayer.',
  'feedback.thanks':
    'Merci — vos commentaires nous aident à affiner les simulations.',
  'feedback.alreadyRated': 'Merci — vous avez déjà évalué cette séance.',
} as const;
