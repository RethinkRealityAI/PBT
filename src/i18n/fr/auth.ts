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

  // ── Rétroaction sur la robustesse du mot de passe ─────────
  'auth.pw.empty': 'Entrez un mot de passe.',
  'auth.pw.short': 'Au moins 10 caractères, s\u2019il vous plaît.',
  'auth.pw.score0': 'Trop faible — essayez une phrase plus longue ou ajoutez des symboles.',
  'auth.pw.score1': 'Faible — essayez une phrase plus longue ou ajoutez des symboles.',
  'auth.pw.score2': 'Correct, mais facile à percer. Ajoutez de la longueur ou des mots.',
  'auth.pw.score3': 'Assez robuste.',
  'auth.pw.score4': 'Excellente robustesse.',
  'auth.pw.checkFailed': 'Impossible de vérifier la robustesse du mot de passe — vérifiez votre connexion et réessayez.',

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
