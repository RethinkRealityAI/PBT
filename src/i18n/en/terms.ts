/**
 * Terms & conditions gate (`TermsScreen`). This copy is legal-adjacent:
 * translations must be faithful and complete — do not summarise, drop or
 * invent clauses. Flag locale changes here for legal review.
 */
export const terms = {
  'terms.topbar.title': 'Before we begin',
  'terms.eyebrow': 'PBT · Pushback Training',
  'terms.headline': 'A few things\nbefore we start.',

  'terms.section.what.title': 'What this is',
  'terms.section.what.body':
    'PBT (Pushback Training) is a simulation tool designed to help veterinary teams practise handling common client objections — pricing, breed diets, raw food, and more. Scenarios here are roleplay exercises, not real client interactions. They are not a substitute for professional judgment.',

  'terms.section.act.title': 'The ACT framework',
  'terms.section.act.body':
    'Sessions are scored against the ACT model: Acknowledge, Clarify, Transform. The AI plays the customer; you practise your response. Scores reflect communication quality within the simulation, not clinical competence.',

  'terms.section.ai.title': 'How the AI works',
  'terms.section.ai.body':
    'Customer roleplay and scoring are powered by a large language model. The AI may produce imperfect or unexpected responses — treat its output as a training stimulus, not authoritative fact. (Responses are used to continuously improve the simulation anonymously.)',

  'terms.section.knowledge.title': 'Knowledge base',
  'terms.section.knowledge.body':
    'PBT references published guidelines (WSAVA, NRC) and Royal Canin training material as context for realistic scenarios. Always verify clinical decisions with your own expertise and up-to-date sources.',

  'terms.section.anonymous.title': 'Anonymous by default',
  'terms.section.anonymous.body':
    "You can use PBT without an account. Your profile and session history live in your browser's local storage on this device only. Creating an account is optional — it backs up your data to a private, encrypted cloud profile.",

  'terms.section.privacy.title': 'Privacy',
  'terms.section.privacy.body':
    'No personally identifiable information is collected unless you explicitly create an account. Session data is not shared with third parties and is not used for advertising. For questions, contact the Royal Canin training team.',

  'terms.agree.checkbox':
    'I understand PBT is a training simulator, not a substitute for professional judgment, and I agree to the privacy approach above.',
  'terms.agree.cta': "I agree — let's go",
} as const;
