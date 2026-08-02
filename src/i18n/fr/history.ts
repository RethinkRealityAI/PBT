/**
 * fr-CA — Historique + fiche de séance (fiche de pointage / transcription).
 *
 * Registre : vouvoiement, voix de clinique chaleureuse-professionnelle.
 * Décisions :
 * - « session » (au sens d'un exercice de pratique) → « séance », le mot
 *   qu'une équipe de clinique emploie ; « session » évoque l'informatique.
 * - Espace fine insécable (U+202F) devant « ? » et « % » (voir format.ts).
 */
import type { history as en } from '../en/history';

export const history: Record<keyof typeof en, string> = {
  // ── Écran liste ───────────────────────────────────────────
  'history.title': 'Historique',
  'history.headline': 'Chaque conversation,\nsuivie et étiquetée.',
  'history.sessionCount': '{count} séances',
  'history.sessionCountOne': '1 séance',
  'history.avgScore': 'score moyen de {pct}',
  'history.filter.all': 'Tout',
  'history.empty.none':
    "Aucune séance pour l'instant. Lancez un scénario et il apparaîtra ici, étiqueté par type d'objection.",
  'history.empty.filtered':
    "Aucune séance ne correspond à ce filtre — essayez un autre type d'objection.",
  'history.empty.cta': 'Lancez votre première séance',
  'history.row.turns': '{count} tours',
  'history.row.notScoredAria': 'Non évaluée',
  'history.mode.text': 'texte',
  'history.mode.voice': 'voix',

  // ── Écran détail ──────────────────────────────────────────
  'history.detail.title': 'Séance',
  'history.detail.notFound.title': 'Séance introuvable',
  'history.detail.notFound.body':
    'Cette séance a peut-être été supprimée, ou le lien est périmé.',
  'history.detail.durationSeconds': '{seconds} s',
  'history.detail.viewAria': 'Affichage',
  'history.detail.tab.scorecard': 'Pointage',
  'history.detail.tab.transcript': 'Transcription',
  'history.detail.notScored.title': 'Non évaluée',
  'history.detail.notScored.body':
    "L'évaluateur IA était injoignable à la fin de cette séance : aucune évaluation n'a donc été enregistrée. La transcription complète reste dans l'onglet Transcription.",
  'history.detail.headline.good': 'Belle séance.',
  'history.detail.headline.ok': 'Bonne base.',
  'history.detail.headline.poor': 'De la marge à gagner.',
  'history.detail.overall': 'Global',
  'history.detail.turns': '{count} tours',
  'history.detail.breakdown': 'Détail',
  'history.detail.keyMoments': 'Moments clés',
  'history.detail.coachNotes': 'Notes du coach',
  'history.detail.betterAlternative': 'Meilleure formulation',
  'history.detail.emptyTranscript':
    'Aucune transcription enregistrée pour cette séance.',
  'history.detail.speaker.customer': 'Client',
  'history.detail.speaker.you': 'Vous',
  'history.detail.bottom.home': 'Accueil',
  'history.detail.bottom.back': "Retour à l'historique",
};
