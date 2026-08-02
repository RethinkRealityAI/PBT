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

  // ── Carte 1 : identité ────────────────────────────────────
  'analyzer.petName': "Nom de l'animal",
  'analyzer.breed.label': 'Race',
  'analyzer.breed.typical': 'Groupe {group} · adulte typique {min} à {max} kg',

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
