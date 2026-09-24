import type { fecalScan as enFecalScan } from '../en/fecalScan';

/**
 * Analyse fécale — français canadien (fr-CA), registre clinique
 * professionnel.
 *
 * Décisions de terminologie :
 * - « fecal score » → « cote fécale » (le vocabulaire des chartes Royal Canin
 *   françaises, qui parlent de « système de cotation fécale »).
 * - « stool » → « selles » (pluriel, comme sur la charte FR).
 * - « knowledge base » → « base de connaissances ».
 * - « pgvector · knowledge_chunks » reste tel quel dans les détails
 *   techniques : ce sont des identifiants (extension Postgres + nom de
 *   table), pas de la prose.
 * - « score » n'apparaît nulle part dans ce fichier : « cote » pour la cote
 *   fécale, « degré de correspondance » pour la similarité (évite de mêler
 *   les deux notions).
 * - Provenance des passages : « Charte Royal Canin » / « Note de la
 *   clinique » (pas « complément », qui évoque un supplément alimentaire en
 *   clinique) ; « Extrait » quand la source est inconnue (« Passage »
 *   serait identique à l'anglais).
 * - « Consignes d'utilisation » : intitulé exact de la charte FR.
 */
export const fecalScan: Record<keyof typeof enFecalScan, string> = {
  // ── Chrome de l'écran ─────────────────────────────────────
  'fecalScan.title': 'Analyse fécale',
  'fecalScan.eyebrow': 'Évaluation des selles · IA + base de connaissances',
  'fecalScan.headline': 'analyse fécale',
  'fecalScan.purpose':
    "Photographiez un échantillon de selles et obtenez la cote correspondante de la charte Royal Canin, avec les passages de la charte d'où vient la réponse.",
  'fecalScan.notDiagnosis': 'Outil de soutien · pas un diagnostic',

  // ── Choix de la charte ────────────────────────────────────
  'fecalScan.chart.label': 'Charte de cotation',
  'fecalScan.chart.aria': 'Choisir la charte de cotation',
  'fecalScan.species.dog': 'Chien adulte',
  'fecalScan.species.puppy': 'Chiot (8 sem. +)',
  'fecalScan.species.cat': 'Chat',
  'fecalScan.breedSize.label': 'Taille de la race',
  'fecalScan.breedSize.aria': 'Choisir la taille de la race',
  'fecalScan.breedSize.smallMedium': 'Races petites et moyennes',
  'fecalScan.breedSize.largeGiant': 'Races grandes et géantes',
  'fecalScan.breedSize.hint':
    "Sur la charte des chiots, la cote 3 ne se lit pas de la même façon chez les races petites et moyennes et chez les races grandes et géantes.",

  // ── Carte de prise de photo (ouvre la fenêtre de capture) ─
  'fecalScan.capture.eyebrow': 'Prise de photo',
  'fecalScan.capture.title': "Photographiez l'échantillon",
  'fecalScan.capture.body':
    "La caméra s'ouvre en plein écran. Vous vérifiez la photo avant toute analyse, et elle n'est jamais conservée.",
  'fecalScan.capture.tip.background': 'Fond uni',
  'fecalScan.capture.tip.light': 'Bon éclairage',
  'fecalScan.capture.tip.fill': 'Cadrage serré',
  'fecalScan.capture.takePhoto': 'Prendre une photo',
  'fecalScan.capture.chooseFromLibrary': 'Choisir dans la photothèque',
  'fecalScan.capture.choosePhoto': 'Choisir une photo',
  'fecalScan.capture.newPhoto': 'Nouvelle photo',
  'fecalScan.capture.library': 'Photos',
  'fecalScan.capture.photoAlt': 'La photo de selles que vous avez choisie',

  // ── Fenêtre de capture ────────────────────────────────────
  'fecalScan.modal.title.camera': 'Prenez la photo',
  'fecalScan.modal.title.review': 'Vérifiez la photo',
  'fecalScan.modal.title.scanning': 'Analyse en cours',
  'fecalScan.modal.chart': 'Charte · {chart}',
  'fecalScan.modal.close': 'Fermer',

  // ── Appareil photo intégré (dans la fenêtre) ──────────────
  'fecalScan.camera.shutterAria': 'Prendre la photo',
  'fecalScan.camera.flipAria': 'Changer de caméra',
  'fecalScan.camera.denied':
    "L'accès à la caméra est bloqué. Autorisez-le dans les paramètres du navigateur, ou choisissez une photo dans votre photothèque.",
  'fecalScan.camera.unavailable':
    'Aucune caméra détectée sur cet appareil. Choisissez plutôt une photo dans votre photothèque.',
  'fecalScan.camera.failed':
    "Impossible d'ouvrir la caméra. Choisissez plutôt une photo dans votre photothèque.",
  'fecalScan.camera.hint': 'Cadrez les selles de près, sur un fond uni',
  'fecalScan.camera.starting': 'Démarrage de la caméra…',

  // ── Vérification de la photo ──────────────────────────────
  'fecalScan.review.prompt':
    'Les selles sont-elles nettes et occupent-elles la majeure partie du cadre ?',
  'fecalScan.review.ok': "La photo semble nette. Lancez l'analyse quand vous le souhaitez.",
  'fecalScan.review.issue.blurry':
    'Cette photo semble floue. Une photo plus nette donne une cote plus fiable.',
  'fecalScan.review.issue.dark':
    'Cette photo semble trop sombre pour bien voir la texture. Reprenez-la avec plus de lumière.',
  'fecalScan.review.retake': 'Reprendre',
  'fecalScan.review.chooseAnother': 'Autre photo',
  'fecalScan.review.start': 'Analyser',
  'fecalScan.review.scanAnyway': 'Analyser quand même',

  // ── Étapes de l'analyse ───────────────────────────────────
  'fecalScan.analyzing.eyebrow': 'En cours',
  'fecalScan.analyzing.aria': 'Cotation de la photo en cours',
  'fecalScan.analyzing.done': 'Terminé. Ouverture du résultat.',
  'fecalScan.analyzing.step.observe': "Observation de l'échantillon",
  'fecalScan.analyzing.step.retrieve': 'Récupération des passages de la charte',
  'fecalScan.analyzing.step.match': 'Appariement avec la cote de la charte',
  'fecalScan.scanning.cancel': "Annuler l'analyse",

  // ── Résultat ──────────────────────────────────────────────
  'fecalScan.result.eyebrow': 'Cote fécale',
  'fecalScan.result.noScore': 'Aucune cote',
  'fecalScan.result.scoreAria': 'Cote fécale de {score} sur 5',
  'fecalScan.result.announce': 'Cote fécale de {score} sur 5 : {band}.',
  'fecalScan.result.confidence.high': 'Confiance élevée',
  'fecalScan.result.confidence.moderate': 'Confiance modérée',
  'fecalScan.result.confidence.low': 'Confiance faible',
  'fecalScan.result.confidence.qualifier': 'Estimation de l’IA',
  'fecalScan.result.yourPhoto': 'Votre photo',
  'fecalScan.result.chartReference': 'Charte · cote {score}',
  'fecalScan.result.observations': 'Ce que montre la photo',
  'fecalScan.result.obs.form': 'Forme',
  'fecalScan.result.obs.moisture': 'Humidité',
  'fecalScan.result.obs.surface': 'Aspect',
  'fecalScan.result.obs.residue': 'Résidu',
  'fecalScan.result.obs.homogeneity': 'Consistance',
  'fecalScan.result.rationale': 'Pourquoi cette cote',
  'fecalScan.result.alternates': 'Cotes voisines possibles',
  'fecalScan.result.notVisibleLabel': 'Ce qu’une photo ne peut pas montrer',
  'fecalScan.result.caution': 'Quand consulter le vétérinaire',
  'fecalScan.result.notStool':
    "Cette image ne semble pas montrer des selles. Essayez une photo nette, bien éclairée, prise à la verticale sur un fond uni.",

  // ── Catégories (tirées de la charte, jamais du modèle) ────
  'fecalScan.band.tooHard': 'Trop dures',
  'fecalScan.band.tooSoft': 'Trop molles',
  'fecalScan.band.acceptable': 'Acceptables',
  'fecalScan.band.optimal': 'Optimales',
  'fecalScan.band.normal': 'Normales',
  'fecalScan.band.meaning.tooHard': 'Plus fermes que la plage idéale de la charte',
  'fecalScan.band.meaning.tooSoft': 'Plus molles que la plage idéale de la charte',
  'fecalScan.band.meaning.acceptable': 'Acceptables, juste hors de la plage idéale',
  'fecalScan.band.meaning.optimal': 'Dans la plage idéale de la charte',
  'fecalScan.band.meaning.normal': 'Dans la plage normale de la charte',

  // ── Panneau de provenance (« d'où vient cette cote ») ──
  'fecalScan.grounding.eyebrow': "D'où vient cette cote",
  'fecalScan.grounding.referencePhotos': 'Comparé à {n} photos de la charte',
  'fecalScan.grounding.referencePhotosOne': 'Comparé à 1 photo de la charte',
  'fecalScan.grounding.kind.chart': 'Charte Royal Canin',
  'fecalScan.grounding.kind.supplement': 'Note de la clinique',
  'fecalScan.grounding.kind.restOfChart': 'Reste de la charte',
  'fecalScan.grounding.match.alsoConsidered': 'Aussi pris en compte',
  'fecalScan.grounding.kind.unknown': 'Extrait',
  'fecalScan.grounding.match.strong': 'Correspondance forte',
  'fecalScan.grounding.match.good': 'Bonne correspondance',
  'fecalScan.grounding.match.partial': 'Correspondance partielle',
  'fecalScan.grounding.expand': 'Lire la suite',
  'fecalScan.grounding.collapse': 'Afficher moins',
  'fecalScan.grounding.empty': "Aucun passage n'a été trouvé pour cette analyse.",
  'fecalScan.grounding.idle':
    "Après une analyse, les passages de la charte qui fondent la cote s'affichent ici, pour que vous voyiez exactement sur quoi elle repose.",
  'fecalScan.grounding.technical': 'Détails techniques',
  'fecalScan.grounding.tech.retrieval': 'Récupération',
  'fecalScan.grounding.source.rag': 'Recherche vectorielle · pgvector · knowledge_chunks',
  'fecalScan.grounding.source.bundled':
    "Texte de la charte intégré (la recherche n'a trouvé aucun passage)",
  'fecalScan.grounding.tech.scope': 'Portée de la recherche',
  'fecalScan.grounding.queryLabel': 'Requête de recherche (vectorisée)',
  'fecalScan.grounding.docs': 'Documents sources',
  'fecalScan.grounding.similarity': 'Degrés de correspondance (similarité cosinus)',
  'fecalScan.grounding.tech.confidence': 'Confiance du modèle (autoévaluation, 0–1)',

  // ── Charte complète ───────────────────────────────────────
  'fecalScan.chartSheet.eyebrow': 'Charte de référence',
  'fecalScan.chartSheet.open': 'Voir la charte complète',
  'fecalScan.chartSheet.close': 'Fermer la charte',
  'fecalScan.chartSheet.directions': "Consignes d'utilisation",
  'fecalScan.chartSheet.imageAlt': 'Photo de référence Royal Canin pour la cote {score}',
  'fecalScan.chartSheet.scoreAria': 'Cote {score}',

  // ── Pied de page ──────────────────────────────────────────
  'fecalScan.footer.disclaimer':
    "Une référence de soutien tirée des chartes de cotation fécale Royal Canin — une aide à la discussion entre la clinique et le client, jamais un diagnostic ni la source de vérité.",
  'fecalScan.footer.scanAnother': 'Analyser une autre photo',
  'fecalScan.footer.tryAnotherPhoto': 'Essayer une autre photo',
  'fecalScan.footer.tryAgain': 'Réessayer',

  // ── Renvoi depuis l'Analyseur d'animaux ───────────────────
  'fecalScan.crossLink.fromAnalyzer':
    'Besoin d’évaluer des selles ? Ouvrir l’analyse fécale →',

  // ── Échecs (`useFecalScan`) ───────────────────────────────
  'fecalScan.error.notImage': 'Veuillez choisir un fichier image.',
  'fecalScan.error.tooLarge': 'Cette image dépasse 5 Mo — essayez une photo plus légère.',
  'fecalScan.error.unreadable': "Impossible de lire cette image. Essayez une autre photo.",
  'fecalScan.error.failed':
    'Impossible de coter la photo. Vérifiez votre connexion et réessayez.',
};
