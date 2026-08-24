/**
 * Écran d'accueil — français canadien (fr-CA), vouvoiement, registre
 * chaleureux-professionnel de clinique.
 *
 * Décisions de terminologie :
 * - « pushback » → « objection ».
 * - « ECHO driver » → « moteur ECHO » ; « ECHO » et les noms des moteurs
 *   (Activator, Energizer, Analyzer, Harmonizer) restent tels quels.
 * - ACT : « Reconnaître / Clarifier / Transformer » (glossaire).
 * - « Rapport » (dimension d'évaluation) → « Lien de confiance » : « rapport »
 *   est un faux ami en français.
 * - BCS / MCS / kcal / WSAVA / Royal Canin Satiety : jamais traduits.
 * - Ponctuation double précédée d'une espace ordinaire, comme les autres
 *   catalogues fr du dépôt.
 */
import type { home as enHome } from '../en/home';

export const home: Record<keyof typeof enHome, string> = {
  // ── Bande de série (spec §9.4) ────────────────────────────
  'home.streak.days': 'Série de {count} jours',
  'home.streak.daysOne': 'Série de 1 jour',
  'home.streak.practicedToday': 'Pratique faite aujourd’hui',
  'home.streak.keepItAlive': 'Pratiquez aujourd’hui pour la garder',
  'home.streak.thisWeek': '{count} cette semaine',
  'home.streak.thisWeekOne': '1 cette semaine',
  'home.streak.aria': 'Série de pratique',

  // ── Salutation / accueil / pastille du moteur ─────────────
  'home.greeting.named': 'Bonjour, {name}.',
  'home.greeting.anonymous': 'Bonjour.',
  'home.welcome.named': 'Bienvenue, {name}.',
  'home.welcome.anonymous': 'Bienvenue, invité anonyme.',
  'home.driverPill': 'Moteur ECHO · {name}',
  'home.profileAria': 'Profil',
  'home.headline': 'Quelle objection allez-vous\naffronter aujourd’hui ?',

  // ── Carte Guide ACT ───────────────────────────────────────
  'home.actCard.title': 'Guide ACT',

  // ── Libellés des dimensions (carte ACT + exemple) ─────────
  'home.dim.acknowledge': 'Reconnaître',
  'home.dim.clarify': 'Clarifier',
  'home.dim.transform': 'Transformer',
  'home.dim.empathy': 'Empathie',
  'home.dim.rapport': 'Lien de confiance',

  // ── Carte vedette « choix du jour » ───────────────────────
  'home.pick.subtitle': '{breed}, {age}. Moteur : {driver}.',
  'home.pick.start': 'Lancer le scénario',
  'home.pick.prevAria': 'Scénario précédent',
  'home.pick.nextAria': 'Scénario suivant',
  'home.pick.startHere': 'Commencez ici →',
  'home.pick.scoringAria': 'Comment les séances sont évaluées',
  'home.pick.empty.title': 'Aucun scénario disponible pour le moment',
  'home.pick.empty.body':
    'Tous les scénarios sont actuellement masqués. Créez le vôtre ou revenez plus tard.',

  // ── Actions rapides ───────────────────────────────────────
  'home.actions.build.title': 'Créer un scénario',
  'home.actions.build.sub': 'Objection personnalisée',
  'home.actions.analyzer.title': 'Analyseur animal',
  'home.actions.analyzer.sub': 'BCS · MCS · kcal',

  // ── Cartes Bibliothèque et profil ECHO ────────────────────
  'home.library.aria': 'Bibliothèque',
  'home.library.title': 'Bibliothèque clinique',
  'home.library.sub': 'WSAVA · BCS · MCS · cibles caloriques',
  'home.echo.aria': 'Votre profil de moteur ECHO',
  'home.echo.title': 'Votre profil ECHO',
  'home.echo.sub': 'Moteur ECHO · {name} · touchez pour revoir',

  // ── Signaler un problème ──────────────────────────────────
  'home.report.button': 'Signaler un problème',

  // ── Chrome des fenêtres modales ───────────────────────────
  'home.modal.close': 'Fermer',
  'home.scenarioInfo.closeAria': 'Fermer les détails du scénario',

  // ── Fenêtre du guide d'évaluation ─────────────────────────
  'home.scoring.closeAria': "Fermer le guide d'évaluation",
  'home.scoring.eyebrow': 'Comment se fait votre évaluation',
  'home.scoring.title': 'Cinq dimensions, une note globale',
  'home.scoring.scenariosEyebrow': 'Comment fonctionnent les scénarios',
  'home.scoring.voiceLabel': 'Voix',
  'home.scoring.voiceBody':
    'Une conversation en direct — le client IA parle et écoute en temps réel. Répondez naturellement, comme vous le feriez au comptoir de la clinique.',
  'home.scoring.chatLabel': 'Clavier',
  'home.scoring.chatBody':
    "Au tour par tour — l'IA envoie un message, vous répondez, et ainsi de suite. Prenez le temps de peaufiner chaque réponse.",
  'home.scoring.autoEnd':
    "La séance se termine automatiquement dès que l'IA juge que la conversation a atteint une fin naturelle — habituellement après que vous avez reconnu la préoccupation, clarifié les faits et transformé la valeur.",
  'home.scoring.introLead':
    'Chaque séance est notée de 0 à 100 sur cinq dimensions, puis regroupée en une note globale pondérée. Le chemin le plus court vers une bonne note :',
  'home.scoring.introTail':
    '— ne vantez pas le produit avant que le client se sente écouté.',
  'home.scoring.exampleEyebrow': 'Exemple de fiche de pointage',
  'home.scoring.exampleOverall': 'Global',
  'home.scoring.exampleBand': 'Fort',
  'home.scoring.coachNoteLabel': 'Note du coach :',
  'home.scoring.coachNoteBody':
    'Belle ouverture en reconnaissance et virage bien mené vers Royal Canin Satiety. La prochaine fois, proposez la pesée de la deuxième semaine plus tôt pour hausser le volet Transformer.',
  'home.scoring.dimensionsEyebrow': 'Les cinq dimensions',
  'home.scoring.endEyebrow': 'Comment un scénario se termine',
  'home.scoring.endIntro':
    'La réceptivité du client passe par trois états. Surveillez le point sous la sphère pour voir où vous en êtes en temps réel :',
  'home.scoring.state.red.label': 'Rouge — Défensif',
  'home.scoring.state.red.body':
    'Le client part de là. Il résiste et répète sa préoccupation. Reconnaissez ce qu’il ressent avant toute chose.',
  'home.scoring.state.yellow.label': 'Jaune — Réceptif',
  'home.scoring.state.yellow.body':
    'Le client se sent écouté. Posez une seule question de clarification précise pour faire ressortir la vraie préoccupation.',
  'home.scoring.state.green.label': 'Vert — Convaincu',
  'home.scoring.state.green.body':
    'Le client est prêt à agir. Proposez une recommandation Royal Canin concrète et l’essai de 12 semaines — la séance se termine comme résolue.',
  'home.scoring.stalemate':
    'Si vous n’arrivez pas à le sortir du rouge après une quinzaine de tours, la séance se termine en « impasse ». Dans les deux cas, la transcription complète est évaluée selon les cinq dimensions ci-dessus.',
  'home.scoring.bands':
    'Paliers : 85 et plus Fort · 70 à 84 Sur la bonne voie · moins de 70 À travailler',
};
