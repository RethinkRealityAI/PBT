/**
 * fr-CA — carrousel d'accueil (3 diapositives) et boutons de pied de page.
 *
 * Registre : vouvoiement. Les `\n` des titres sont de la mise en page :
 * on les conserve, en rééquilibrant la coupure selon la longueur française.
 * « PBT · Pushback Training » est la signature du produit — non traduite.
 */
import type { onboarding as en } from '../en/onboarding';

export const onboarding: Record<keyof typeof en, string> = {
  'onboarding.slide1.eyebrow': 'PBT · Pushback Training',
  'onboarding.slide1.title': 'Pour vous aider à mener\ndes conversations difficiles.',
  'onboarding.slide1.body':
    "Cet outil de connexion humaine est conçu pour vous aider à bâtir des relations authentiques et empathiques. Idéal au travail comme dans la vie de tous les jours.",

  'onboarding.slide2.eyebrow': 'Conçu pour les conversations en clinique',
  'onboarding.slide2.title': 'Chaque client\nest différent.',
  'onboarding.slide2.body':
    "Cet outil vous offre un espace pour poser vos questions, puis vous exercer à gérer les conversations difficiles avec les clients.",

  'onboarding.slide3.eyebrow': 'Une évaluation rigoureuse',
  'onboarding.slide3.title': 'Voyez ce qui a porté.\nCorrigez le reste.',
  'onboarding.slide3.body':
    "Après chaque séance, vous recevez une rétroaction sur la façon dont vous avez Reconnu les émotions du client, Clarifié sa véritable préoccupation et Transformé l'objection — en plus de votre empathie et de votre lien de confiance. Vous obtenez aussi des suggestions concrètes de répliques.",

  'onboarding.cta.continue': 'Continuer',
  'onboarding.cta.getStarted': 'Commencer',
  'onboarding.signIn': "J'ai déjà un compte · Se connecter",
};
