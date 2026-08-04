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

  // ── Récupération du mot de passe (demande) ────────────────
  'auth.forgot.link': 'Mot de passe oublié ?',
  'auth.forgot.needEmail': 'Entrez d’abord votre adresse courriel.',
  'auth.forgot.sending': 'Envoi en cours…',
  'auth.forgot.sent':
    'Si un compte est associé à {email}, un lien de réinitialisation est en route. Il expire dans une heure et ne peut servir qu’une fois.',

  // ── Récupération du mot de passe (écran de réinitialisation) ──
  'auth.reset.eyebrow': 'Récupération du compte',
  'auth.reset.checking': 'Vérification de votre lien…',
  'auth.reset.title': 'Choisissez un\nnouveau mot de passe',
  'auth.reset.subtitle':
    'Optez pour quelque chose de long. Une phrase courte vaut mieux qu’un mot brouillé.',
  'auth.reset.newPassword': 'Nouveau mot de passe',
  'auth.reset.confirm': 'Confirmez le mot de passe',
  'auth.reset.mismatch': 'Les deux mots de passe doivent être identiques.',
  'auth.reset.submit': 'Mettre à jour le mot de passe',
  'auth.reset.working': 'Enregistrement…',
  'auth.reset.error': 'Impossible de mettre à jour votre mot de passe.',
  'auth.reset.done.title': 'Mot de passe mis à jour',
  'auth.reset.done.body': 'Votre session est ouverte avec votre nouveau mot de passe.',
  'auth.reset.done.cta': 'Poursuivre l’entraînement',
  'auth.reset.expired.title': 'Lien de réinitialisation expiré',
  'auth.reset.expired.body':
    'Les liens de réinitialisation durent une heure et ne servent qu’une fois. Demandez-en un nouveau à partir de l’écran de connexion.',
  'auth.reset.expired.cta': 'Retour à l’application',

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
