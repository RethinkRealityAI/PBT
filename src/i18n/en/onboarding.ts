/**
 * Onboarding carousel (3 slides) + its footer CTAs.
 *
 * Headline strings keep their `\n` — the render site uses
 * `whiteSpace: 'pre-line'` and the break is layout, not punctuation.
 */
export const onboarding = {
  'onboarding.slide1.eyebrow': 'PBT · Pushback Training',
  'onboarding.slide1.title': 'Helping you navigate\ndifficult conversations.',
  'onboarding.slide1.body':
    'This human connection tool is designed to help you forge genuine, empathetic relationships. Perfect in business and everyday life.',

  'onboarding.slide2.eyebrow': 'Built for clinic conversations',
  'onboarding.slide2.title': 'Every Customer\nis Different.',
  'onboarding.slide2.body':
    'This tool provides you with the place to ask and then practice how to deal with difficult customer conversations.',

  'onboarding.slide3.eyebrow': 'Score with rigour',
  'onboarding.slide3.title': "See what landed.\nFix what didn't.",
  'onboarding.slide3.body':
    "After every practice you'll receive feedback on how you Acknowledged the client's feelings, Clarified their real concern, and Transformed the pushback — plus your empathy and rapport. You'll get concrete next-line suggestions too.",

  'onboarding.cta.continue': 'Continue',
  'onboarding.cta.getStarted': 'Get Started',
  'onboarding.signIn': 'I already have an account · Sign in',
} as const;
