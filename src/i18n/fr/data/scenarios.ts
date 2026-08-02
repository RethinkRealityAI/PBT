import type { ScenarioDataOverlay } from '../../dataL10n/scenarios';

/**
 * Français (fr-CA) — textes affichés des scénarios de la bibliothèque.
 *
 * Registre : les notes de contexte s'adressent à l'équipe de la clinique
 * (vouvoiement, ton professionnel). Les `openingLine` sont la réplique du
 * client dans le jeu de rôle — français parlé du Québec, ton conservé
 * (frustré, sceptique, inquiet).
 *
 * Ne se traduisent pas : noms de races (Lab, GSD, Golden, French Bulldog,
 * Mini Schnauzer, Poodle), produits Royal Canin (Satiety Support), BCS/MCS,
 * noms de drivers ECHO.
 */
export const scenarios: ScenarioDataOverlay = {
  scenarios: {
    'weight-denial-lab': {
      context:
        "Buddy est un Lab mâle de 5 ans qui pèse 42 kg — cote d'état corporel (BCS) 8/9. Le vétérinaire a signalé l'obésité et le risque de stress articulaire, et a recommandé Satiety Support avec un plan de perte de poids de 12 semaines. Le propriétaire insiste : Buddy est juste « un gros Lab » et tous les Labs de ses amis ont la même allure. Il mange ce qui est en spécial à l'épicerie et reçoit des gâteries en masse.",
      openingLine:
        "Écoutez, Buddy n'est pas gros — c'est juste un gros Lab. Tous les Labs de mes amis sont bâtis exactement de même.",
    },
    'cost-lab': {
      context:
        "La propriétaire est venue pour un contrôle de poids de routine. Le vétérinaire a recommandé Satiety Support, mais elle a reculé devant l'écart de prix avec la marque d'épicerie qu'elle utilise depuis deux ans.",
      openingLine:
        "Merci de nous recevoir, mais honnêtement, Royal Canin, c'est vraiment trop cher. Je peux avoir de la nourriture semblable à moitié prix à l'épicerie.",
    },
    'breeder-advice-gsd': {
      context:
        "Première expérience comme propriétaire, très attachée à sa chienne. L'éleveuse l'a renvoyée à la maison avec une marque de nourriture crue bien précise, et elle a l'impression que changer irait à l'encontre de l'avis d'une experte.",
      openingLine:
        "Mon éleveuse m'a dit clairement de lui donner la nourriture crue qu'elle m'a remise — je me sentirais vraiment mal d'aller contre son conseil.",
    },
    'rx-diet-french-bulldog': {
      context:
        "La propriétaire craint de trop médicaliser sa chienne. Le vétérinaire a relevé des marqueurs rénaux précoces, mais elle se demande si la diète vétérinaire est vraiment nécessaire ou si c'est juste de la vente.",
      openingLine:
        "Je suis un peu inquiète — est-ce que cette diète vétérinaire est vraiment nécessaire sur le plan médical, ou c'est juste pour me faire acheter plus? Elle va très bien avec sa nourriture actuelle.",
    },
    'raw-food-golden': {
      context:
        "Le propriétaire est passé au sans-grains après avoir vu du contenu en ligne. Aucun problème clinique pour l'instant, mais le vétérinaire a soulevé le risque de cardiomyopathie dilatée. Le propriétaire est ouvert, mais il manque de temps.",
      openingLine:
        "Je l'ai mis au sans-grains il y a quelques mois — tout ce que je lis en ligne dit que c'est bien plus santé. Pourquoi je reviendrais à quelque chose avec des grains?",
    },
    'brand-switch-mini-schnauzer': {
      context:
        "La chienne mange une marque d'épicerie sans problème apparent. Le propriétaire ne voit aucune raison de changer et veut savoir ce que le prix plus élevé lui rapporte concrètement.",
      openingLine:
        "Ça fait plus qu'un an qu'on utilise notre marque actuelle et elle est en parfaite santé. Je vois pas pourquoi on changerait quoi que ce soit.",
    },
    'cost-poodle': {
      context:
        "La propriétaire a un revenu fixe et le coût la met sincèrement en détresse. Elle tient profondément à offrir le meilleur à sa chienne, mais elle se sent exclue par le prix. Il faut une conversation empathique, centrée sur la valeur.",
      openingLine:
        "Je veux vraiment ce qu'il y a de mieux pour elle, sincèrement — mais ce prix-là, je ne peux tout simplement pas me le permettre en ce moment. Il n'y a vraiment pas d'autre option?",
    },
  },

  lifeStages: {
    'Puppy (<1)': 'Chiot (<1)',
    'Junior (1-3)': 'Junior (1-3)',
    'Adult (3-7)': 'Adulte (3-7)',
    'Senior (7+)': 'Sénior (7+)',
  },

  personas: {
    Skeptical: 'Sceptique',
    Anxious: 'Anxieux',
    Busy: 'Pressé',
    'Bargain-hunter': 'Chasseur d\'aubaines',
    Devoted: 'Dévoué',
  },
};
