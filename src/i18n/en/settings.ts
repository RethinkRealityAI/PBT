/**
 * Settings screen + account lifecycle strings (privacy toggle, account
 * deletion, email-verification flow).
 */
export const settings = {
  // ── Privacy & data (spec §8.3) ────────────────────────────
  'settings.privacy.label': 'Allow training data use',
  'settings.privacy.help':
    'Lets us use your anonymised practice activity to improve the simulations and scoring. Your own sessions, ratings and reports are always kept either way.',
  'settings.privacy.on': 'On',
  'settings.privacy.off': 'Off',
  'settings.privacy.ariaLabel': 'Allow training data use',
  'settings.privacy.terms': 'Terms & privacy policy',

  // ── Account deletion (spec §9.11) ─────────────────────────
  'settings.delete.row': 'Delete account',
  'settings.delete.eyebrow': 'This cannot be undone',
  'settings.delete.title': 'Delete your account',
  'settings.delete.confirmBody':
    'This permanently deletes your account, your saved sessions, your pets and your scenarios. Everything on this device is cleared too.',
  'settings.delete.typePrompt': 'Type {word} to confirm',
  'settings.delete.placeholder': '{word}',
  'settings.delete.cancel': 'Cancel',
  'settings.delete.confirm': 'Delete account',
  'settings.delete.working': 'Deleting…',
  'settings.delete.confirmWord': 'DELETE',
  'settings.delete.error': "We couldn't delete your account. Please try again.",
  'settings.delete.close': 'Close',

  // ── Email verification (flag-gated) ───────────────────────
  'auth.verify.eyebrow': 'One more step',
  'auth.verify.title': 'Check your inbox',
  'auth.verify.body':
    'We sent a confirmation link to {email}. Open it to activate your account, then come back and sign in.',
  'auth.verify.resend': 'Resend email',
  'auth.verify.resendIn': 'Resend in {seconds}s',
  'auth.verify.resent': 'Sent — check your inbox again.',
  'auth.verify.back': 'Back',
  'auth.verify.unconfirmed':
    'That email address is not confirmed yet. Check your inbox, or send yourself a new link.',
} as const;
