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

  // ── Card 0: Pet Vision (photo analysis) ───────────────────
  'analyzer.vision.eyebrow': 'Photo analysis · AI',
  'analyzer.vision.estimateTag': 'Estimate · review & edit',
  'analyzer.vision.uploadAria': 'Upload a dog photo to analyze',
  'analyzer.vision.replaceAria': 'Replace photo',
  'analyzer.vision.photoAlt': 'Selected dog',
  'analyzer.vision.uploadTitle': 'Upload or take a photo',
  'analyzer.vision.uploadBody':
    'We estimate breed, life stage, body condition and visible skin signs. The photo is never stored.',
  'analyzer.vision.analyzing': 'Analyzing photo…',
  'analyzer.vision.tryAgain': 'Try again',
  'analyzer.vision.notADog':
    "That doesn't look like a dog — try a clear, well-lit photo of the dog from the side.",
  /** {pct} is pre-formatted by `src/i18n/format.ts#formatPercent`. */
  'analyzer.vision.confidence': '{pct} confident',
  /** {breeds} is a comma-joined list of untranslated breed names. */
  'analyzer.vision.alsoPossible': 'Also possible: {breeds}',
  'analyzer.vision.bcsLead': 'BCS {score}/9.',
  'analyzer.vision.skinLabel': 'Skin / coat · {severity}',
  'analyzer.vision.skinNone': 'No obvious skin or coat anomalies visible.',
  'analyzer.vision.notVisible': "Can't judge from a photo: {items}.",

  // Dermatitis severity — the enum keys (none/mild/moderate/marked) are
  // machine values sent to the model; these are their display labels.
  'analyzer.vision.severity.none': 'none',
  'analyzer.vision.severity.mild': 'mild',
  'analyzer.vision.severity.moderate': 'moderate',
  'analyzer.vision.severity.marked': 'marked',

  // Pet Vision failures (`usePetVision`)
  'analyzer.vision.error.notImage': 'Please choose an image file.',
  'analyzer.vision.error.tooLarge': 'That image is over 5 MB — try a smaller photo.',
  'analyzer.vision.error.unreadable': 'Could not read that image. Try another photo.',
  'analyzer.vision.error.notConfigured':
    'Vision is not configured — the Gemini API key is missing.',
  'analyzer.vision.error.failed':
    'Could not analyze the photo. Check your connection and try again.',

  // Vision → scenario handoff: the `context` brief handed to the roleplay.
  'analyzer.vision.context.pet': '{breed}, {age}.',
  'analyzer.vision.context.bcs': 'Estimated body condition score {score}/9.',
  'analyzer.vision.context.skin': 'Visible skin/coat signs ({severity}): {details}.',

  // ── Card 1: identity ──────────────────────────────────────
  'analyzer.petName': 'Pet name',
  'analyzer.breed.label': 'Breed',
  /** {group} is an untranslated breed-group name from the breeds data module. */
  'analyzer.breed.typical': '{group} group · typical adult {min}–{max} kg',

  // Breed autocomplete (`BreedSearch`)
  'analyzer.breedSearch.placeholder': 'Search breed (e.g. lab, frenchie, gsd)',
  'analyzer.breedSearch.clearAria': 'Clear breed',
  'analyzer.breedSearch.change': 'Change',
  'analyzer.breedSearch.popular': 'Popular',
  'analyzer.breedSearch.noMatches': 'No matches.',
  'analyzer.breedSearch.useAnyway': 'Use “{value}” anyway',
  /** {group} is an untranslated breed-group name from the breeds data module. */
  'analyzer.breedSearch.sizeRange': '{group} · {min}–{max} kg',

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
