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
