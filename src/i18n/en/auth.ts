/**
 * Account upgrade modal + the anonymous "save your progress" banner.
 *
 * NOTE: the email-verification keys (`auth.verify.*`) predate this namespace
 * and live in `en/settings.ts`. Don't move or rename them — keep new auth
 * strings here.
 */
export const auth = {
  // ── Modal chrome ──────────────────────────────────────────
  'auth.signup.eyebrow': 'Save your progress',
  'auth.signup.title': 'Create your account',
  'auth.signin.eyebrow': 'Welcome back',
  'auth.signin.title': 'Sign in',
  'auth.close': 'Close',

  // ── Mode toggle ───────────────────────────────────────────
  'auth.mode.aria': 'Mode',
  'auth.mode.signup': 'Sign up',
  'auth.mode.signin': 'Sign in',

  // ── Fields ────────────────────────────────────────────────
  'auth.field.displayName': 'Display name (optional)',
  'auth.field.displayNamePlaceholder': 'What should we call you?',
  'auth.field.email': 'Email',
  /** Sample address — reads the same in every locale. */
  'auth.field.emailPlaceholder': 'you@clinic.com',
  'auth.field.password': 'Password',
  'auth.field.passwordPlaceholderSignup': 'At least 10 characters',
  'auth.field.passwordPlaceholderSignin': 'Your password',

  // ── Submit ────────────────────────────────────────────────
  'auth.submit.working': 'Working…',
  'auth.submit.signup': 'Create account',
  'auth.submit.signin': 'Sign in',
  'auth.noVerificationNote':
    "No email verification — you'll be signed in immediately.",

  // ── Password strength feedback (codes from passwordStrength.ts) ──
  'auth.pw.empty': 'Enter a password.',
  'auth.pw.short': 'At least 10 characters, please.',
  'auth.pw.score0': 'Too weak — try a longer phrase or mix in symbols.',
  'auth.pw.score1': 'Weak — try a longer phrase or mix in symbols.',
  'auth.pw.score2': 'Okay, but easy to crack. Add length or words.',
  'auth.pw.score3': 'Strong enough.',
  'auth.pw.score4': 'Excellent.',
  'auth.pw.checkFailed': "Couldn't check password strength — check your connection and try again.",

  // ── Password recovery (request) ───────────────────────────
  'auth.forgot.link': 'Forgot your password?',
  'auth.forgot.needEmail': 'Enter your email address first.',
  'auth.forgot.sending': 'Sending…',
  /** Deliberately non-committal: we never confirm whether an account exists. */
  'auth.forgot.sent':
    'If {email} has an account, a reset link is on its way. It expires in an hour and can only be used once.',

  // ── Password recovery (reset screen) ──────────────────────
  'auth.reset.eyebrow': 'Account recovery',
  'auth.reset.checking': 'Checking your link…',
  'auth.reset.title': 'Choose a new\npassword',
  'auth.reset.subtitle': 'Pick something long. A short phrase beats a scrambled word.',
  'auth.reset.newPassword': 'New password',
  'auth.reset.confirm': 'Confirm password',
  'auth.reset.mismatch': 'Both passwords need to match.',
  'auth.reset.submit': 'Update password',
  'auth.reset.working': 'Saving…',
  'auth.reset.error': 'Could not update your password.',
  'auth.reset.done.title': 'Password updated',
  'auth.reset.done.body': "You're signed in with your new password.",
  'auth.reset.done.cta': 'Continue training',
  'auth.reset.expired.title': 'Reset link expired',
  'auth.reset.expired.body':
    'Reset links last an hour and work only once. Request a new one from the sign-in screen.',
  'auth.reset.expired.cta': 'Back to the app',

  // ── Errors ────────────────────────────────────────────────
  'auth.error.notConfigured':
    'Supabase is not configured for this build. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
  'auth.error.resend': 'Could not resend',
  'auth.error.generic': 'Auth failed',

  // ── Save-progress banner ──────────────────────────────────
  'auth.banner.title': 'Save your progress',
  'auth.banner.dismiss': 'Maybe later',
  'auth.banner.accountCreated': 'Account created',
  'auth.banner.welcome': 'Welcome,\n{name}.',
} as const;
