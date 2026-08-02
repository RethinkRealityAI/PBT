/**
 * Pet Analyzer namespace — English (source catalog).
 *
 * Keys are flat + dotted so `en/index.ts` can spread every namespace into one
 * lookup table. `BCS` is a stable clinical initialism and stays untranslated in
 * every locale (see .claude/agents/translator.md glossary).
 */
export const analyzer = {
  'analyzer.savedPets.title': 'Saved pets',
  'analyzer.savedPets.hint': 'Load a profile back into the analyzer.',
  'analyzer.savedPets.unnamed': 'Unnamed pet',
  /** {weightKg} kg · BCS {bcs}/9 — the row's key stats line. */
  'analyzer.savedPets.stats': '{weightKg} kg · BCS {bcs}/9',
  'analyzer.savedPets.fromPhoto': 'From photo',
  'analyzer.savedPets.load': 'Load',
  'analyzer.savedPets.loadAria': 'Load {name} into the analyzer',
  'analyzer.savedPets.loaded': 'Loaded',
  'analyzer.savedPets.delete': 'Delete',
  'analyzer.savedPets.deleteAria': 'Delete {name}',
  'analyzer.savedPets.confirmQuestion': 'Delete this profile?',
  'analyzer.savedPets.confirmYes': 'Delete',
  'analyzer.savedPets.confirmCancel': 'Cancel',
} as const;
