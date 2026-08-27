/**
 * Pet Analyzer namespace — français canadien (fr-CA), registre clinique
 * chaleureux-professionnel, vouvoiement.
 *
 * Décisions de terminologie :
 * - « BCS » reste tel quel (initialisme clinique stable du glossaire).
 * - « profile » (au sens de la fiche sauvegardée d'un animal) → « fiche »,
 *   le mot qu'une équipe de clinique emploie réellement ; « profil » évoque
 *   plutôt le compte utilisateur.
 * - Espace fine insécable (U+202F) devant le « ? », typographie française.
 */
export const analyzer = {
  // ── Chrome de l'écran ─────────────────────────────────────
  'analyzer.title': "Analyseur d'animaux",

  // ── Carte 0 : analyse photo (Pet Vision) ──────────────────
  'analyzer.vision.eyebrow': 'Analyse photo · IA',
  'analyzer.vision.estimateTag': 'Estimation · à vérifier et modifier',
  'analyzer.vision.uploadAria': 'Téléverser une photo de chien à analyser',
  'analyzer.vision.replaceAria': 'Remplacer la photo',
  'analyzer.vision.photoAlt': 'Chien sélectionné',
  'analyzer.vision.uploadTitle': 'Téléversez ou prenez une photo',
  'analyzer.vision.uploadBody':
    'Nous estimons la race, le stade de vie, l’état corporel et les signes cutanés visibles. La photo n’est jamais conservée.',
  'analyzer.vision.analyzing': 'Analyse de la photo…',
  'analyzer.vision.tryAgain': 'Réessayer',
  'analyzer.vision.notADog':
    'On ne dirait pas un chien — essayez une photo nette et bien éclairée du chien, vu de côté.',
  'analyzer.vision.confidence': '{pct} de confiance',
  'analyzer.vision.alsoPossible': 'Aussi possible : {breeds}',
  'analyzer.vision.bcsLead': 'BCS {score}/9.',
  'analyzer.vision.skinLabel': 'Peau / pelage · {severity}',
  'analyzer.vision.skinNone':
    'Aucune anomalie évidente de la peau ou du pelage.',
  'analyzer.vision.notVisible': 'Impossible à juger sur photo : {items}.',

  // Gravité de l'atteinte cutanée — les clés (none/mild/moderate/marked)
  // restent des valeurs machine; seuls ces libellés sont traduits. Accord au
  // féminin : sous-entendu « atteinte ».
  'analyzer.vision.severity.none': 'aucune',
  'analyzer.vision.severity.mild': 'légère',
  'analyzer.vision.severity.moderate': 'modérée',
  'analyzer.vision.severity.marked': 'marquée',

  // Échecs de l'analyse photo (`usePetVision`)
  'analyzer.vision.error.notImage': 'Veuillez choisir un fichier image.',
  'analyzer.vision.error.tooLarge':
    'Cette image dépasse 5 Mo — essayez une photo plus petite.',
  'analyzer.vision.error.unreadable':
    'Impossible de lire cette image. Essayez une autre photo.',
  'analyzer.vision.error.notConfigured':
    'L’analyse photo n’est pas configurée — la clé API Gemini est manquante.',
  'analyzer.vision.error.failed':
    'Impossible d’analyser la photo. Vérifiez votre connexion et réessayez.',

  // Passage de l'analyse au scénario : le « contexte » remis au jeu de rôle.
  'analyzer.vision.context.pet': '{breed}, {age}.',
  'analyzer.vision.context.bcs': 'Cote d’état corporel estimée à {score}/9.',
  'analyzer.vision.context.skin':
    'Signes cutanés ou de pelage visibles ({severity}) : {details}.',

  // ── Carte 1 : identité ────────────────────────────────────
  'analyzer.petName': "Nom de l'animal",
  'analyzer.breed.label': 'Race',
  'analyzer.breed.typical': 'Groupe {group} · adulte typique {min} à {max} kg',

  // Autocomplétion de race (`BreedSearch`)
  'analyzer.breedSearch.placeholder':
    'Chercher une race (ex. lab, frenchie, gsd)',
  'analyzer.breedSearch.clearAria': 'Effacer la race',
  'analyzer.breedSearch.change': 'Modifier',
  'analyzer.breedSearch.popular': 'Populaires',
  'analyzer.breedSearch.noMatches': 'Aucun résultat.',
  'analyzer.breedSearch.useAnyway': 'Utiliser « {value} » quand même',
  'analyzer.breedSearch.sizeRange': '{group} · {min} à {max} kg',

  // ── Carte 2 : poids et activité ───────────────────────────
  'analyzer.weight.label': 'Poids et activité',
  'analyzer.weight.unit': 'kg',
  'analyzer.weight.implausible':
    "{weight} kg, c'est inhabituel pour un {breed} — les adultes font typiquement de {min} à {max} kg. Vérifiez avant de recommander une cible calorique.",
  'analyzer.activity.active': 'Actif',
  'analyzer.activity.inactive': 'Peu actif',

  // ── Cartes 3 et 4 : BCS et MCS ────────────────────────────
  'analyzer.bcs.label': "État corporel (BCS)",
  'analyzer.bcs.buttonAria': 'BCS {score} : {label}',
  'analyzer.mcs.label': 'État musculaire (MCS)',

  // ── Carte 5 : cible calorique et verdict ──────────────────
  'analyzer.calorie.label': 'Cible calorique et verdict',
  'analyzer.calorie.unit': 'kcal/jour',
  'analyzer.calorie.bcsChip': 'BCS {score}/9',
  'analyzer.verdict.good': 'Bon',
  'analyzer.verdict.warn': 'Attention',
  'analyzer.verdict.ok': 'Correct',

  // Verdicts cliniques (`deriveVerdict`). « BCS » et « MCS » restent tels
  // quels : initialismes cliniques du glossaire, jamais traduits.
  'analyzer.verdict.message.mcsAbnormal':
    'L’état musculaire (MCS) n’est pas normal — dépistez une maladie chronique ou une fonte musculaire liée à l’âge avant d’ajuster les calories.',
  'analyzer.verdict.message.bcsHigh':
    'BCS {bcs}/9. Déficit calorique recommandé ; repesez l’animal dans 4 semaines.',
  'analyzer.verdict.message.bcsLow':
    'BCS {bcs}/9. Écartez une cause médicale ; augmentez la densité nutritionnelle.',
  'analyzer.verdict.message.bcsIdeal':
    'BCS {bcs}/9 avec un état musculaire normal. Maintenez l’apport actuel.',
  'analyzer.verdict.message.bcsMonitor':
    'BCS {bcs}/9. Surveillez tous les mois.',

  // ── Carte 6 : référence ───────────────────────────────────
  'analyzer.reference.label': 'Référence (WSAVA · DMER du NRC 2006)',
  'analyzer.reference.closestRow': 'Ligne la plus proche :',
  'analyzer.reference.kcalSplit':
    '{active} kcal actif · {inactive} kcal peu actif',

  // ── Actions du bas ────────────────────────────────────────
  'analyzer.action.train': 'Pratiquer avec cet animal',
  'analyzer.action.saved': 'Fiche enregistrée',
  'analyzer.action.save': 'Enregistrer la fiche',
  'analyzer.action.needBreed': "Choisissez d'abord une race",

  // ── Fiches enregistrées ───────────────────────────────────
  'analyzer.savedPets.title': 'Fiches enregistrées',
  'analyzer.savedPets.hint': 'Rechargez une fiche dans l’analyseur.',
  'analyzer.savedPets.unnamed': 'Animal sans nom',
  'analyzer.savedPets.stats': '{weightKg} kg · BCS {bcs}/9',
  'analyzer.savedPets.fromPhoto': 'Depuis une photo',
  'analyzer.savedPets.load': 'Charger',
  'analyzer.savedPets.loadAria': 'Charger {name} dans l’analyseur',
  'analyzer.savedPets.loaded': 'Chargée',
  'analyzer.savedPets.delete': 'Supprimer',
  'analyzer.savedPets.deleteAria': 'Supprimer {name}',
  'analyzer.savedPets.confirmQuestion': 'Supprimer cette fiche ?',
  'analyzer.savedPets.confirmYes': 'Supprimer',
  'analyzer.savedPets.confirmCancel': 'Annuler',
} as const;
