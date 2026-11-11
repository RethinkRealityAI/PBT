/**
 * Onboarding carousel (3 slides) + its footer CTAs.
 *
 * Headline strings keep their `\n`: the render site uses
 * `whiteSpace: 'pre-line'` and the break is layout, not punctuation.
 * Each slide is title → lead (bold) → body. In a body, `*word*` renders as
 * emphasis (italic); keep the asterisks in every locale.
 */
export const onboarding = {
  'onboarding.slide1.eyebrow': 'PBT · Pushback Training',
  'onboarding.slide1.title': 'Navigate tough\nconversations.',
  'onboarding.slide1.lead':
    'Build trust and empathy with pet parents when it matters most.',
  'onboarding.slide1.body':
    'Learn to guide clients smoothly through high-stakes moments, sensitive budget talks, and emotional decisions.',

  'onboarding.slide2.eyebrow': 'Built for clinic conversations',
  'onboarding.slide2.title': 'Practise real\nscenarios.',
  'onboarding.slide2.lead':
    'Every client is unique. Practise how to respond before you step into the exam room.',
  'onboarding.slide2.body':
    'Drop in a tough scenario and safely test different approaches until you feel completely confident.',

  'onboarding.slide3.eyebrow': 'Score with rigour',
  'onboarding.slide3.title': 'See what\nlanded.',
  'onboarding.slide3.lead': 'Get instant, actionable feedback after every practice round.',
  'onboarding.slide3.body':
    'See exactly how well you *Acknowledged* emotions, *Clarified* concerns, and *Transformed* pushback, plus get instant “next-line” suggestions.',

  'onboarding.cta.continue': 'Continue',
  'onboarding.cta.getStarted': 'Get Started',
  'onboarding.signIn': 'I already have an account · Sign in',
} as const;
