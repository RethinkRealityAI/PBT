import type { chat as enChat } from '../en/chat';

/** Français (fr-CA). Voir .claude/agents/translator.md pour le glossaire. */
export const chat: Record<keyof typeof enChat, string> = {
  'chat.voice.capWarning':
    'Les séances vocales se terminent à 5 minutes — il reste environ une minute.',

  'chat.emotion.defensive': 'Défensif',
  'chat.emotion.receptive': 'Réceptif',
  'chat.emotion.convinced': 'Convaincu',

  'chat.header.backAria': 'Retour au tableau de bord',
  'chat.header.eyebrowVoice': 'PBT · Pratique vocale',
  'chat.header.eyebrowText': 'PBT · Pratique écrite',
  'chat.scenarioNav.eyebrow': 'Scénario',
  'chat.scenarioNav.prev': 'Scénario précédent',
  'chat.scenarioNav.next': 'Scénario suivant',
  'chat.scenarioInfo': 'Infos du scénario',

  'chat.empty.title': 'Scénario en direct',
  'chat.empty.body': 'Aucun scénario actif. Choisissez-en un depuis l’accueil.',

  'chat.details.closeScrimAria': 'Fermer les détails du scénario',
  'chat.details.counter': 'Scénario {index} de {total}',
  'chat.details.custom': 'Scénario personnalisé',
  'chat.details.objectiveLabel': 'Objectif :',
  'chat.details.objectiveText':
    'Amenez ce client de l’objection à la résolution avec ACT.',
  'chat.details.contextLabel': 'Contexte :',
  'chat.details.openingLabel': 'Objection de départ :',
  'chat.details.begin': 'Commencer la simulation',

  'chat.controls.driverEyebrow': 'Moteur ECHO · {driver}',
  'chat.controls.modeAria': 'Mode de conversation',
  'chat.controls.end': 'Terminer',

  'chat.composer.placeholder': 'Reconnaissez, questionnez, recommandez…',
  'chat.composer.send': 'Envoyer',
  'chat.bubble.you': 'Vous',
  'chat.typing.aria': 'Le client est en train d’écrire',
  'chat.status.scoring': 'Évaluation de la conversation…',
  'chat.error.connect': 'Connexion impossible — vérifiez votre réseau.',
  'chat.error.retry': 'Réessayer',

  'chat.voice.status.idle': 'Initialisation…',
  'chat.voice.status.connecting': 'Connexion…',
  'chat.voice.status.listening': 'Allez-y — je vous écoute',
  'chat.voice.status.thinking': 'Traitement…',
  'chat.voice.status.aiSpeaking': 'En train de parler…',
  'chat.voice.status.ended': 'Séance terminée',
  'chat.voice.status.error': 'Erreur de connexion',
  'chat.voice.ready': 'Mode vocal prêt',
  'chat.voice.processing': 'Traitement',
  'chat.voice.analyzing': 'Analyse de la séance…',
  'chat.voice.scorecardReady': 'Votre fiche de résultats est prête',
  'chat.voice.analyzeFailed':
    'Échec de l’analyse de la séance — vérifiez votre réseau et réessayez.',
  'chat.voice.retryVoice': 'Réessayer le mode vocal',

  'chat.modal.close': 'Fermer',
  'chat.endModal.title': 'Terminer cette séance ?',
  'chat.endModal.subtitleVoice':
    'Enregistrez-la dans votre historique avec une fiche de résultats complète, ou terminez sans enregistrer.',
  'chat.endModal.subtitleText':
    'Enregistrez-la dans votre historique avec une fiche de résultats complète, recommencez avec la même entrée en matière, ou terminez sans enregistrer.',
  'chat.endModal.save': 'Enregistrer et évaluer',
  'chat.endModal.restart': 'Recommencer avec la même entrée en matière',
  'chat.endModal.end': 'Terminer sans enregistrer',
  'chat.exitModal.title': 'Enregistrer votre progression ?',
  'chat.exitModal.subtitle':
    'Vous quittez une séance en cours. Enregistrez-la dans votre historique avec une fiche de résultats complète, ou abandonnez et revenez en arrière.',
  'chat.exitModal.discard': 'Abandonner et quitter',

  'chat.coach.thinking': 'Le coach réfléchit…',
  'chat.coach.unavailable': 'Coach indisponible',
  'chat.coach.hintCount': 'Coach · conseil {used}/{max}',
  'chat.coach.errorBody':
    'Impossible de joindre le coach — vérifiez votre connexion et touchez le bouton du coach pour réessayer (ça ne coûte pas de conseil).',
  'chat.coach.dismiss': 'Masquer le conseil',
  'chat.coach.exhaustedAria': 'Plus aucun conseil du coach pour cette séance',
  'chat.coach.requestAria': 'Obtenir un conseil du coach ({count} restants)',
  'chat.coach.exhausted': 'Plus de conseils',
  // Identique à l'anglais — « Coach » est le terme employé tel quel au Québec
  // et l'espace de la pastille (9 px) ne permet pas plus long.
  'chat.coach.label': 'Coach · {count}',
} as const;
