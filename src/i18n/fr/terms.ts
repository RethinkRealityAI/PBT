/**
 * fr-CA — écran des conditions d'utilisation. Traduction fidèle et complète
 * du texte anglais (registre juridique professionnel) : aucune clause n'est
 * ajoutée, résumée ni retirée. À faire réviser par le service juridique.
 *
 * Glossaire : ACT reste « ACT »; ses trois étapes se disent Reconnaître,
 * Clarifier, Transformer. WSAVA, NRC, Royal Canin et PBT sont des noms propres.
 */
import type { terms as en } from '../en/terms';

export const terms: Record<keyof typeof en, string> = {
  'terms.topbar.title': 'Avant de commencer',
  'terms.eyebrow': 'PBT · Pushback Training',
  'terms.headline': 'Quelques précisions\navant de commencer.',

  'terms.section.what.title': "Ce qu'est cet outil",
  'terms.section.what.body':
    "PBT (Pushback Training) est un outil de simulation conçu pour aider les équipes vétérinaires à s'exercer à gérer les objections courantes des clients — le prix, les aliments adaptés à la race, l'alimentation crue, et plus encore. Les scénarios présentés ici sont des exercices de jeu de rôle, et non de véritables interactions avec des clients. Ils ne remplacent pas le jugement professionnel.",

  'terms.section.act.title': 'Le cadre ACT',
  'terms.section.act.body':
    "Les séances sont évaluées selon le modèle ACT : Reconnaître, Clarifier, Transformer. L'IA joue le rôle du client; vous, vous exercez votre réponse. Les résultats reflètent la qualité de la communication dans la simulation, et non la compétence clinique.",

  'terms.section.ai.title': "Comment fonctionne l'IA",
  'terms.section.ai.body':
    "Le jeu de rôle du client et l'évaluation reposent sur un grand modèle de langage. L'IA peut produire des réponses imparfaites ou inattendues — considérez ce qu'elle produit comme un stimulus d'entraînement, et non comme un fait faisant autorité. (Les réponses servent à améliorer continuellement la simulation, de façon anonyme.)",

  'terms.section.knowledge.title': 'Base de connaissances',
  'terms.section.knowledge.body':
    "PBT s'appuie sur des lignes directrices publiées (WSAVA, NRC) et sur du matériel de formation Royal Canin comme contexte pour créer des scénarios réalistes. Validez toujours vos décisions cliniques à l'aide de votre propre expertise et de sources à jour.",

  'terms.section.anonymous.title': 'Anonyme par défaut',
  'terms.section.anonymous.body':
    "Vous pouvez utiliser PBT sans compte. Votre profil et votre historique de séances demeurent dans le stockage local de votre navigateur, sur cet appareil seulement. La création d'un compte est facultative — elle sauvegarde vos données dans un profil infonuagique privé et chiffré.",

  'terms.section.privacy.title': 'Confidentialité',
  'terms.section.privacy.body':
    "Aucun renseignement personnel identifiable n'est recueilli à moins que vous ne créiez explicitement un compte. Les données de séance ne sont pas communiquées à des tiers et ne servent pas à la publicité. Pour toute question, communiquez avec l'équipe de formation de Royal Canin.",

  'terms.agree.checkbox':
    "Je comprends que PBT est un simulateur d'entraînement et non un substitut au jugement professionnel, et j'accepte l'approche de confidentialité décrite ci-dessus.",
  'terms.agree.cta': "J'accepte — c'est parti",
};
