/**
 * fr-CA — écran Réglages + cycle de vie du compte (consentement aux données,
 * suppression de compte, vérification par courriel).
 *
 * Registre : vouvoiement. Terminologie québécoise (« courriel », pas « e-mail »).
 */
import type { settings as en } from '../en/settings';

export const settings: Record<keyof typeof en, string> = {
  // ── Chrome de l'écran ─────────────────────────────────────
  'settings.title': 'Vous',
  'settings.noProfile': 'Faites le quiz pour créer votre profil.',
  'settings.anonymousSession': 'Session anonyme',
  'settings.notSignedIn': 'Non connecté',

  // ── Section Pratique ──────────────────────────────────────
  'settings.section.practice': 'Pratique',
  'settings.theme.label': 'Thème',
  'settings.theme.light': 'Clair',
  'settings.theme.dark': 'Sombre',
  'settings.theme.system': 'Système',
  'settings.retakeQuiz': 'Refaire le quiz ECHO',

  // ── Section Compte ────────────────────────────────────────
  'settings.section.account': 'Compte',
  'settings.signedInAs': 'Connecté en tant que',
  'settings.signOut': 'Se déconnecter',
  'settings.saveProgress': 'Sauvegardez votre progression',
  'settings.signUp': "S'inscrire",
  'settings.signIn': 'Se connecter',

  // ── Section Rétroaction ───────────────────────────────────
  'settings.section.feedback': 'Rétroaction',
  'settings.report.bug': 'Signaler un problème',
  'settings.report.suggestion': 'Proposer une amélioration',

  // ── Section À propos ──────────────────────────────────────
  'settings.section.about': 'À propos',
  'settings.version': "Version de l'application",
  'settings.reset.row': 'Réinitialiser les données locales',
  'settings.reset.confirm':
    'Cette action efface votre profil, vos séances et vos réglages. Continuer ?',

  // ── Confidentialité et données (spec §8.3) ────────────────
  'settings.privacy.label': "Autoriser l'utilisation des données d'entraînement",
  'settings.privacy.help':
    "Nous permet d'utiliser votre activité d'entraînement anonymisée pour améliorer les simulations et l'évaluation. Vos propres séances, évaluations et signalements sont conservés dans tous les cas.",
  'settings.privacy.on': 'Activé',
  'settings.privacy.off': 'Désactivé',
  'settings.privacy.ariaLabel': "Autoriser l'utilisation des données d'entraînement",
  'settings.privacy.terms': 'Conditions et politique de confidentialité',

  // ── Suppression de compte (spec §9.11) ────────────────────
  'settings.delete.row': 'Supprimer le compte',
  'settings.delete.eyebrow': 'Cette action est irréversible',
  'settings.delete.title': 'Supprimer votre compte',
  'settings.delete.confirmBody':
    "Cette action supprime définitivement votre compte, vos séances enregistrées, vos animaux et vos scénarios. Tout ce qui se trouve sur cet appareil est également effacé.",
  'settings.delete.typePrompt': 'Tapez {word} pour confirmer',
  'settings.delete.placeholder': '{word}',
  'settings.delete.cancel': 'Annuler',
  'settings.delete.confirm': 'Supprimer le compte',
  'settings.delete.working': 'Suppression…',
  'settings.delete.confirmWord': 'SUPPRIMER',
  'settings.delete.error':
    "Nous n'avons pas pu supprimer votre compte. Veuillez réessayer.",
  'settings.delete.close': 'Fermer',
  'settings.delete.notSignedIn': 'Non connecté',
  'settings.delete.requestFailed': 'Échec de la requête ({status})',

  // ── Vérification par courriel (contrôlée par le drapeau) ──
  'auth.verify.eyebrow': 'Encore une étape',
  'auth.verify.title': 'Vérifiez votre boîte de réception',
  'auth.verify.body':
    'Nous avons envoyé un lien de confirmation à {email}. Ouvrez-le pour activer votre compte, puis revenez vous connecter.',
  'auth.verify.resend': 'Renvoyer le courriel',
  'auth.verify.resendIn': 'Renvoyer dans {seconds} s',
  'auth.verify.resent': 'Envoyé — vérifiez de nouveau votre boîte de réception.',
  'auth.verify.back': 'Retour',
  'auth.verify.unconfirmed':
    "Cette adresse courriel n'est pas encore confirmée. Vérifiez votre boîte de réception ou envoyez-vous un nouveau lien.",
};
