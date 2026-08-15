import type { stats as enStats } from '../en/stats';

/** Français (fr-CA). Voir .claude/agents/translator.md pour le glossaire. */
export const stats: Record<keyof typeof enStats, string> = {
  'stats.topbar.title': 'Fiche de résultats',
  'stats.topbar.unavailable': 'Fiche de résultats de la séance',

  'stats.unavailable.title': 'Évaluation indisponible',
  'stats.unavailable.body':
    'L’évaluateur IA n’a pas pu être joint. Votre conversation est enregistrée — vous pouvez relancer l’évaluation sans refaire la séance.',
  'stats.unavailable.retry': 'Relancer l’évaluation',
  'stats.unavailable.retrying': 'Évaluation de votre conversation…',
  'stats.unavailable.retryFailed':
    'Toujours impossible de joindre l’évaluateur — vérifiez votre connexion et réessayez.',
  'stats.none.title': 'Aucune séance pour l’instant',
  'stats.none.body': 'Faites d’abord une séance.',

  'stats.headline.good': 'Belle séance.\nGardez cette approche.',
  // {focus} est le libellé (minusculé) de la dimension la plus faible — souvent
  // un verbe à l'infinitif (« reconnaître », « clarifier »). La tournure
  // nominale « prochaine cible : … » l'accueille sans faute d'accord.
  'stats.headline.ok': 'Bonne base.\nProchaine cible : {focus}.',
  'stats.headline.poor': 'Beaucoup à apprendre ici —\net c’est tout l’intérêt.',
  'stats.overall': 'Global',
  'stats.turns': '{count} tours',
  'stats.turnsOne': '1 tour',

  'stats.delta.personalBest': 'Record personnel',
  'stats.delta.first': 'Première séance évaluée',
  'stats.delta.improved': '+{delta} vs dernière séance',
  'stats.delta.dropped': '{delta} vs dernière séance',
  'stats.delta.even': 'Égal à la dernière séance',

  'stats.focus.label': 'À travailler · {dimension}',
  'stats.focus.excellent': 'À quoi ressemble l’excellence',

  'stats.breakdown': 'Détail',
  'stats.keyMoments': 'Moments clés',
  'stats.moment.win': 'Réussite · {label}',
  'stats.moment.miss': 'Manqué · {label}',
  'stats.coachNotes': 'Notes du coach',
  'stats.betterAlternative': 'Meilleure formulation',
  'stats.reviewTranscript': 'Revoir la transcription',

  'stats.cta.home': 'Accueil',
  'stats.cta.runAgain': 'Refaire la séance',
} as const;
