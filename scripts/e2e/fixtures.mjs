/**
 * Test data for the Scenario Studio end-to-end check (`studio-e2e.mjs`).
 *
 * Everything here is FICTIONAL and clearly labelled: every name starts with
 * `QA E2E`, every document carries an invented marker word that appears
 * nowhere else in the knowledge base (BRIGHTBITE for dogs, RIVULET for
 * cats). Finding a marker in the AI's briefing proves retrieval reached that
 * document; finding the OTHER animal's marker would prove cross-contamination.
 *
 * Cleanup keys off these prefixes (see `cleanup.sql`), so keep them.
 */
export const PREFIX = 'QA E2E';

export const DOG = {
  key: 'dog',
  marker: 'BRIGHTBITE',
  category: {
    name: 'QA E2E · Dog dental care',
    description: 'Test category (end-to-end check). Safe to delete.',
  },
  objection: {
    name: 'QA E2E: dental chews are just treats',
    example: '"Dental chews are just expensive treats — he doesn’t need them."',
  },
  document: {
    title: 'QA E2E · Brightbite dental chew study (dogs)',
    text: [
      '# QA E2E test document — fictional data for an automated check',
      '',
      'BRIGHTBITE dental chew field study (invented for testing).',
      '',
      'In the BRIGHTBITE study, adult dogs given one dental chew a day had 37% less tartar after 8 weeks than dogs given none.',
      'Each BRIGHTBITE chew provides about 70 kcal, so the daily food portion should be reduced by roughly 5% to keep body condition stable.',
      'Owners in the study most often objected that dental chews are "just treats"; the clinics that explained the 37% tartar reduction and the calorie adjustment saw the most owners agree to try them.',
    ].join('\n'),
  },
  scenario: {
    breed: 'Labrador Retriever',
    lifeStage: 'Adult (3-7)',
    weightKg: '32',
    title: 'QA E2E · Bella and the dental chews',
  },
  trainee: [
    'I hear you — nobody wants to pay for something that feels like a treat. Can I ask what you’ve heard about dental chews so far?',
    'That makes sense. Have you read anything about how much difference they actually make to tartar?',
    'Here is what the study we follow found: dogs on a daily chew had a lot less tartar after eight weeks, and we would trim her food slightly so the calories balance out. Would you be open to trying it for a month?',
  ],
};

export const CAT = {
  key: 'cat',
  marker: 'RIVULET',
  category: {
    name: 'QA E2E · Cat hydration',
    description: 'Test category (end-to-end check). Safe to delete.',
  },
  objection: {
    name: 'QA E2E: my cat drinks enough water',
    example: '"She has a full water bowl — she drinks plenty, she doesn’t need wet food."',
  },
  document: {
    title: 'QA E2E · Rivulet hydration survey (cats)',
    text: [
      '# QA E2E test document — fictional data for an automated check',
      '',
      'RIVULET feline hydration survey (invented for testing).',
      '',
      'In the RIVULET survey, cats fed one wet-food meal a day took in about 2.5 times more total water than cats on dry food only.',
      'Adding a water fountain increased drinking by about 20%, but did not close the gap with a wet-food meal.',
      'Owners most often said their cat "drinks enough already"; clinics that shared the 2.5x figure and suggested one wet meal a day saw the most owners agree.',
    ].join('\n'),
  },
  scenario: {
    breed: 'Domestic Shorthair',
    lifeStage: 'Adult (3-7)',
    weightKg: '4.5',
    title: 'QA E2E · Luna and the water bowl',
  },
  trainee: [
    'It’s great that you keep her bowl full — that matters. Can I ask how much you see her drinking in a day?',
    'Thanks, that helps. Have you come across anything about how much water cats get from wet food compared with dry?',
    'What we see in the research we follow is that cats on one wet meal a day take in much more water overall. Would you be willing to try one wet meal a day for a few weeks?',
  ],
};

export const ANIMALS = [DOG, CAT];
