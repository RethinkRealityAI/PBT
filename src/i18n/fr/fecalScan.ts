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
 * - « pgvector · knowledge_chunks » reste tel quel : ce sont des identifiants
 *   techniques (extension Postgres + nom de table), pas de la prose.
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

  // ── Carte de prise de photo ───────────────────────────────
  'fecalScan.capture.eyebrow': 'Prise de photo',
  'fecalScan.capture.title': 'Prenez ou téléversez une photo',
  'fecalScan.capture.body':
    "Photographiez les selles sur un fond uni, à bonne lumière. La photo n'est jamais conservée.",
  'fecalScan.capture.hint': 'Cadrez les selles de près, sur un fond uni.',
  'fecalScan.capture.takePhoto': 'Prendre une photo',
  'fecalScan.capture.uploadPhoto': 'Téléverser une photo',
  'fecalScan.capture.retake': 'Reprendre',
  'fecalScan.capture.dropActive': "Déposez la photo pour lancer l'analyse",
  'fecalScan.capture.replace': 'Remplacer',
  'fecalScan.capture.photoAlt': 'La photo de selles que vous avez choisie',

  // ── Appareil photo intégré ────────────────────────────────
  'fecalScan.camera.shutterAria': 'Prendre la photo',
  'fecalScan.camera.flipAria': 'Changer de caméra',
  'fecalScan.camera.cancel': 'Annuler',
  'fecalScan.camera.denied':
    "L'accès à la caméra a été refusé — vous pouvez quand même téléverser une photo.",
  'fecalScan.camera.unavailable':
    'Aucune caméra sur cet appareil — téléversez plutôt une photo.',
  'fecalScan.camera.failed':
    "Impossible d'ouvrir la caméra. Téléversez plutôt une photo.",
  'fecalScan.camera.hint': 'Cadrez les selles de près, sur un fond uni.',

  // ── Étapes de l'analyse ───────────────────────────────────
  'fecalScan.analyzing.eyebrow': 'En cours',
  'fecalScan.analyzing.aria': 'Cotation de la photo en cours',
  'fecalScan.analyzing.step.observe': "Observation de l'échantillon",
  'fecalScan.analyzing.step.retrieve': 'Récupération des passages de la charte',
  'fecalScan.analyzing.step.match': 'Appariement avec la cote de la charte',

  // ── Résultat ──────────────────────────────────────────────
  'fecalScan.result.eyebrow': 'Score fécal',
  'fecalScan.result.noScore': 'Aucune cote',
  'fecalScan.result.scoreAria': 'Cote fécale de {score} sur 5',
  'fecalScan.result.confidence': 'confiance de {pct}',
  'fecalScan.result.confidenceAria': 'Degré de confiance du modèle',
  'fecalScan.result.yourPhoto': 'Votre photo',
  'fecalScan.result.chartReference': 'Référence de la charte {score}',
  'fecalScan.result.observations': 'Ce que montre la photo',
  'fecalScan.result.obs.form': 'Forme',
  'fecalScan.result.obs.moisture': 'Humidité',
  'fecalScan.result.obs.surface': 'Aspect',
  'fecalScan.result.obs.residue': 'Résidu',
  'fecalScan.result.obs.homogeneity': 'Consistance',
  'fecalScan.result.rationale': 'Pourquoi cette cote',
  'fecalScan.result.alternates': 'Cotes voisines possibles',
  'fecalScan.result.notVisible': 'Une photo ne peut pas montrer : {items}.',
  'fecalScan.result.caution': 'Quand consulter le vétérinaire',
  'fecalScan.result.notStool':
    "Cette image ne semble pas montrer des selles. Essayez une photo nette, bien éclairée, prise à la verticale sur un fond uni.",

  // ── Catégories (tirées de la charte, jamais du modèle) ────
  'fecalScan.band.tooHard': 'Trop dures',
  'fecalScan.band.tooSoft': 'Trop molles',
  'fecalScan.band.acceptable': 'Acceptables',
  'fecalScan.band.optimal': 'Optimales',
  'fecalScan.band.normal': 'Normales',

  // ── Panneau de provenance (la piste RAG) ──────────────────
  'fecalScan.grounding.eyebrow': 'Extrait de la base de connaissances',
  'fecalScan.grounding.source.rag': 'pgvector · knowledge_chunks',
  'fecalScan.grounding.source.bundled': 'charte intégrée',
  'fecalScan.grounding.sourceAria': "D'où proviennent les passages",
  'fecalScan.grounding.referencePhotos': 'Comparé à {n} photos de la charte',
  'fecalScan.grounding.referencePhotosOne': 'Comparé à 1 photo de la charte',
  'fecalScan.grounding.passage': 'Passage {n}',
  'fecalScan.grounding.similarity': 'Similarité',
  'fecalScan.grounding.similarityNone': 'Non mesurée',
  'fecalScan.grounding.scores': 'Cotes citées',
  'fecalScan.grounding.expand': 'Lire le passage complet',
  'fecalScan.grounding.collapse': 'Replier le passage',
  'fecalScan.grounding.queryLabel': 'Requête vectorisée',
  'fecalScan.grounding.docs': 'Documents interrogés',
  /** {tool} et {species} proviennent du vocabulaire partagé des portées. */
  'fecalScan.grounding.scope': 'Portée · {tool} · {species}',
  'fecalScan.grounding.empty': "Aucun passage n'a été retourné pour cette analyse.",
  'fecalScan.grounding.idle':
    "Analysez une photo et les passages de la charte qui fondent la cote s'afficheront ici.",

  // ── Charte complète ───────────────────────────────────────
  'fecalScan.chartSheet.eyebrow': 'Charte de référence',
  'fecalScan.chartSheet.open': 'Voir la charte complète',
  'fecalScan.chartSheet.close': 'Fermer la charte',
  'fecalScan.chartSheet.directions': "Directives d'utilisation",
  'fecalScan.chartSheet.imageAlt': 'Photo de référence Royal Canin pour la cote {score}',
  'fecalScan.chartSheet.scoreAria': 'Cote {score}',

  // ── Pied de page ──────────────────────────────────────────
  'fecalScan.footer.disclaimer':
    "Une référence de soutien tirée des chartes de cotation fécale Royal Canin — une aide à la discussion entre la clinique et le client, jamais un diagnostic ni la source de vérité.",
  'fecalScan.footer.scanAnother': 'Analyser une autre photo',
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
