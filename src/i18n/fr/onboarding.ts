/**
 * fr-CA — carrousel d'accueil (3 diapositives) et boutons de pied de page.
 *
 * Registre : vouvoiement. Chaque diapositive : titre, phrase d'accroche
 * (en gras), texte. Les `*mot*` du texte s'affichent en italique : on garde
 * les astérisques.
 * Les `\n` des titres sont de la mise en page :
 * on les conserve, en rééquilibrant la coupure selon la longueur française.
 * « PBT · Pushback Training » est la signature du produit — non traduite.
 */
import type { onboarding as en } from '../en/onboarding';

export const onboarding: Record<keyof typeof en, string> = {
  'onboarding.slide1.eyebrow': 'PBT · Pushback Training',
  'onboarding.slide1.title': 'Menez les conversations\ndifficiles.',
  'onboarding.slide1.lead':
    'Bâtissez la confiance et l’empathie avec les propriétaires d’animaux quand ça compte le plus.',
  'onboarding.slide1.body':
    'Apprenez à guider vos clients avec aisance dans les moments à fort enjeu, les discussions délicates sur le budget et les décisions chargées d’émotion.',

  'onboarding.slide2.eyebrow': 'Conçu pour les conversations en clinique',
  'onboarding.slide2.title': 'Exercez-vous avec\ndes scénarios réels.',
  'onboarding.slide2.lead':
    'Chaque client est unique. Exercez-vous à répondre avant d’entrer dans la salle d’examen.',
  'onboarding.slide2.body':
    'Lancez-vous dans un scénario difficile et testez différentes approches en toute sécurité, jusqu’à vous sentir pleinement en confiance.',

  'onboarding.slide3.eyebrow': 'Une évaluation rigoureuse',
  'onboarding.slide3.title': 'Voyez ce qui\na porté.',
  'onboarding.slide3.lead':
    'Recevez une rétroaction instantanée et concrète après chaque séance de pratique.',
  'onboarding.slide3.body':
    'Voyez exactement dans quelle mesure vous avez *Reconnu* les émotions, *Clarifié* les préoccupations et *Transformé* l’objection, en plus de suggestions instantanées de répliques.',

  'onboarding.cta.continue': 'Continuer',
  'onboarding.cta.getStarted': 'Commencer',
  'onboarding.signIn': "J'ai déjà un compte · Se connecter",
};
