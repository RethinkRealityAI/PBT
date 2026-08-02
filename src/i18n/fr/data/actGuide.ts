import type { ActGuideOverlay } from '../../dataL10n/actGuide';

/**
 * Méthode ACT — français canadien (fr-CA).
 *
 * Décisions de terminologie :
 * - « ACT » reste tel quel (initialisme du glossaire). Les trois étapes se
 *   nomment Reconnaître / Clarifier / Transformer.
 * - Les clés (`acknowledge`, `clarify`, `takeAction`) et les noms de produits
 *   Royal Canin (Satiety Support) ne sont jamais traduits.
 * - Les exemples `doExamples` sont de la PAROLE de l'équipe adressée au
 *   client : français parlé du Québec, vouvoiement, phrases courtes qu'on peut
 *   dire à voix haute (« l'auto », « Faisons un essai »). Les `techniques` et
 *   les `dontExamples` sont des consignes au personnel, d'où l'impératif.
 * - Formulations neutres en genre pour l'intervenant (« j'hésiterais » plutôt
 *   que « je serais méfiant/méfiante »), l'équipe étant mixte.
 * - Espace fine insécable (U+202F) devant « % », comme src/i18n/format.ts.
 */
export const actGuide: ActGuideOverlay = {
  acknowledge: {
    label: 'Reconnaître',
    goal: 'Valider ce que le client ressent, sans lui donner raison ni tort.',
    techniques: [
      'Nommer l’émotion explicitement (« Ça semble frustrant. »)',
      'Utiliser le nom du chien pour montrer que vous avez écouté',
      'Laisser un court silence après la validation',
      'Nommer la valeur derrière l’objection (affection, soin, argent, temps)',
    ],
    doExamples: [
      '« Je vous entends — Bella compte énormément pour vous. »',
      '« C’est normal de vouloir une nourriture en laquelle vous avez confiance. »',
      '« La dernière transition a été pénible. Moi aussi, j’hésiterais. »',
    ],
    dontExamples: [
      '« Je comprends, mais… » (annule la validation)',
      '« Vous ne devriez pas ressentir ça. »',
      'Sauter directement à la recommandation',
    ],
  },
  clarify: {
    label: 'Clarifier',
    goal: 'Poser des questions ouvertes pour comprendre le vrai contexte du chien (âge, alimentation, énergie, observations du vétérinaire).',
    techniques: [
      'Questions ouvertes : « Qu’est-ce que… », « Comment… », « Racontez-moi… »',
      'Une seule question à la fois — laissez le client parler',
      'Écouter le nom du chien et les détails de son quotidien',
      'Reformuler ce que vous avez entendu avant de passer à la suite',
    ],
    doExamples: [
      '« Racontez-moi sa journée — combien d’exercice fait-elle ? »',
      '« Que vous dit votre vétérinaire quand vous l’amenez en clinique ? »',
      '« Comment ça va dans les escaliers, ou pour monter dans l’auto ? »',
    ],
    dontExamples: [
      '« Vous ne trouvez pas qu’elle devrait maigrir ? » (question orientée)',
      '« Avez-vous essayé de réduire les portions ? » (question fermée)',
      'Trois questions de suite sans laisser le client en répondre une',
    ],
  },
  takeAction: {
    label: 'Transformer',
    goal: 'Proposer une prochaine étape Royal Canin précise et crédible, avec des bénéfices concrets et un essai bien défini.',
    techniques: [
      'Commencer par le résultat, puis nommer le produit',
      'Citer des données précises (l’évaluation clinique de 12 semaines, 97 %)',
      'Offrir un essai encadré — 4 semaines, pas « on verra »',
      'Fixer un point de suivi',
    ],
    doExamples: [
      '« D’après ce que vous me dites, Satiety Support est conçu exactement pour ça — 97 % des chiens ont perdu du poids en 12 semaines. »',
      '« Faisons un essai de 4 semaines. Je vous rappelle à la deuxième semaine. »',
      '« Voici le calendrier de transition — on y va graduellement sur 7 jours. »',
    ],
    dontExamples: [
      '« Ça va aider » (trop vague)',
      '« C’est la meilleure nourriture » (rien pour l’appuyer)',
      'Terminer sans prochaine étape définie',
    ],
  },
};
