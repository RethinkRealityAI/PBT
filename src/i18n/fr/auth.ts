/**
 * fr-CA — Fenêtre de création de compte + bannière « sauvegarder ma
 * progression ».
 *
 * Registre : vouvoiement. Terminologie québécoise : « courriel » (jamais
 * « e-mail » ni « mail »), « ouvrir une session » / « se connecter ».
 * Les variables d'environnement et « Supabase » ne se traduisent pas.
 */
import type { auth as en } from '../en/auth';

export const auth: Record<keyof typeof en, string> = {
  // ── Chrome de la fenêtre ──────────────────────────────────
  'auth.signup.eyebrow': 'Sauvegardez votre progression',
  'auth.signup.title': 'Créez votre compte',
  'auth.signin.eyebrow': 'Content de vous revoir',
  'auth.signin.title': 'Connexion',
  'auth.close': 'Fermer',

  // ── Bascule de mode ───────────────────────────────────────
  'auth.mode.aria': 'Mode de connexion',
  'auth.mode.signup': "S'inscrire",
  'auth.mode.signin': 'Se connecter',

  // ── Champs ────────────────────────────────────────────────
  'auth.field.displayName': "Nom d'affichage (facultatif)",
  'auth.field.displayNamePlaceholder': 'Comment devons-nous vous appeler ?',
  'auth.field.email': 'Courriel',
  'auth.field.emailPlaceholder': 'you@clinic.com',
  'auth.field.password': 'Mot de passe',
  'auth.field.passwordPlaceholderSignup': 'Au moins 10 caractères',
  'auth.field.passwordPlaceholderSignin': 'Votre mot de passe',

  // ── Envoi ─────────────────────────────────────────────────
  'auth.submit.working': 'Un instant…',
  'auth.submit.signup': 'Créer le compte',
  'auth.submit.signin': 'Se connecter',
  'auth.noVerificationNote':
    'Aucune vérification par courriel — vous serez connecté immédiatement.',

  // ── Erreurs ───────────────────────────────────────────────
  'auth.error.notConfigured':
    "Supabase n'est pas configuré pour cette version. Définissez VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.",
  'auth.error.resend': "Impossible d'envoyer de nouveau",
  'auth.error.generic': "Échec de l'authentification",

  // ── Bannière de sauvegarde ────────────────────────────────
  'auth.banner.title': 'Sauvegardez votre progression',
  'auth.banner.dismiss': 'Plus tard',
  'auth.banner.accountCreated': 'Compte créé',
  'auth.banner.welcome': 'Bienvenue,\n{name}.',
};
