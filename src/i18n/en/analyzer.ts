/**
 * Pet Analyzer namespace — English (source catalog).
 *
 * Keys are flat + dotted so `en/index.ts` can spread every namespace into one
 * lookup table. `BCS` is a stable clinical initialism and stays untranslated in
 * every locale (see .claude/agents/translator.md glossary).
 */
export const analyzer = {
  // ── Screen chrome ─────────────────────────────────────────
  'analyzer.title': 'Pet Analyzer',

  // ── Card 1: identity ──────────────────────────────────────
  'analyzer.petName': 'Pet name',
  'analyzer.breed.label': 'Breed',
  /** {group} is an untranslated breed-group name from the breeds data module. */
  'analyzer.breed.typical': '{group} group · typical adult {min}–{max} kg',

  // ── Card 2: weight & activity ─────────────────────────────
  'analyzer.weight.label': 'Weight & activity',
  'analyzer.weight.unit': 'kg',
  'analyzer.weight.implausible':
    '{weight} kg is unusual for a {breed} — typical adults are {min}–{max} kg. Double-check before recommending a calorie target.',
  'analyzer.activity.active': 'Active',
  'analyzer.activity.inactive': 'Inactive',

  // ── Card 3/4: BCS + MCS ───────────────────────────────────
  'analyzer.bcs.label': 'Body condition (BCS)',
  'analyzer.bcs.buttonAria': 'BCS {score}: {label}',
  'analyzer.mcs.label': 'Muscle condition (MCS)',

  // ── Card 5: calorie target & verdict ──────────────────────
  'analyzer.calorie.label': 'Calorie target & verdict',
  'analyzer.calorie.unit': 'kcal/day',
  'analyzer.calorie.bcsChip': 'BCS {score}/9',
  'analyzer.verdict.good': 'Good',
  'analyzer.verdict.warn': 'Warn',
  'analyzer.verdict.ok': 'OK',

  // ── Card 6: reference ─────────────────────────────────────
  'analyzer.reference.label': 'Reference (WSAVA · 2006 NRC DMER)',
  'analyzer.reference.closestRow': 'Closest row:',
  'analyzer.reference.kcalSplit':
    '{active} kcal active · {inactive} kcal inactive',

  // ── Bottom actions ────────────────────────────────────────
  'analyzer.action.train': 'Train with this pet',
  'analyzer.action.saved': 'Saved to profiles',
  'analyzer.action.save': 'Save as profile',
  'analyzer.action.needBreed': 'Pick a breed first',

  // ── Saved pets ────────────────────────────────────────────
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
