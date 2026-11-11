/**
 * Training library + Home's "Select scenario" dialog — English (source).
 *
 * "Library" means the SCENARIO library from 2026-11-07 on; the clinical
 * reference tab is "Resources" (`tab.library` keeps its key, see chrome.ts).
 *
 * NOT here on purpose: category names (built-ins through the pushbacks data
 * overlay, team ones through their `nameFr`), objection titles, breeds,
 * life stages, personas and difficulty words — authored data, localised
 * through the data overlays.
 */
export const library = {
  // ── Select scenario dialog (Home) ─────────────────────────
  'select.eyebrow': 'Training',
  'select.title': 'How would you like to practice?',
  'select.close': 'Close',
  'select.library.title': 'Choose from the library',
  'select.library.body': 'Ready-made scenarios written by your training team',
  'select.library.count': '{count} scenarios',
  'select.library.countOne': '1 scenario',
  'select.library.none': 'None published yet',
  'select.build.title': 'Build your own',
  'select.build.body': 'Pick the pet, the pushback and the owner.',

  // ── Training library screen ───────────────────────────────
  'library.title': 'Training library',
  'library.eyebrow': 'Training library',
  'library.heading': 'Choose a focus area',
  'library.sub': 'Ready-made scenarios written by your training team.',
  'library.animalAria': 'Animal to train on',
  'library.groupsAria': 'Focus areas',
  // Every step names its animal (owner request, 2026-11-11).
  'library.step.allDog': 'All Dog Scenarios',
  'library.step.allCat': 'All Cat Scenarios',
  'library.step.groupDog': 'Dog {area} Scenarios',
  'library.step.groupCat': 'Cat {area} Scenarios',
  'library.count': '{count} scenarios',
  'library.countOne': '1 scenario',
  'library.back': 'All focus areas',
  'library.filterAria': 'Filter by objection',
  'library.practice.aria': 'Filter by practice',
  'library.practice.done': 'Practised',
  'library.practice.new': 'Not practised',
  'library.practice.noneDone': 'You haven’t practised any of these yet.',
  'library.practice.noneNew': 'You’ve practised every scenario here. Nice work.',
  'library.filterAll': 'All',
  'library.scenariosAria': 'Scenarios',

  // ── One scenario card ─────────────────────────────────────
  'library.card.startAria': 'Start: {title}',
  'library.card.persona': '{persona} owner',
  'library.card.difficultyAria': 'Difficulty: {label}, level {level} of 4',

  // ── Empty state ───────────────────────────────────────────
  'library.empty.titleDog': 'No ready-made dog scenarios yet',
  'library.empty.titleCat': 'No ready-made cat scenarios yet',
  'library.empty.title': 'No ready-made scenarios yet',
  'library.empty.body': 'Your training team hasn’t published any yet. Build your own to practice in the meantime.',
  'library.empty.bodyNoBuild': 'Your training team hasn’t published any yet. Check back soon.',
  'library.empty.cta': 'Build your own',
} as const;
