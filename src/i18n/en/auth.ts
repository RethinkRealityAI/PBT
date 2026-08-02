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
