import type { PushbackDataOverlay } from '../../dataL10n/pushbacks';

/**
 * Français (fr-CA) — objections, niveaux de difficulté et repères ACT
 * affichés. Voir .claude/agents/translator.md pour le glossaire (ACT =
 * Reconnaître / Clarifier / Transformer; noms de races, produits Royal Canin,
 * BCS/MCS et noms de drivers ECHO ne se traduisent pas).
 *
 * Affichage seulement : les champs `examples` / `rootConcerns` / `watchOuts`
 * de la taxonomie servent aux prompts et restent en anglais.
 */
export const pushbacks: PushbackDataOverlay = {
  categories: {
    cost: {
      title: 'Objection sur le coût / le prix',
      example: '"C\'est bien trop cher pour ce que c\'est."',
    },
    'breeder-advice': {
      title: 'Un ami / l\'éleveur a dit…',
      example: '"Mon éleveur m\'a dit de lui donner autre chose."',
    },
    'raw-food': {
      title: 'Sans grains / croyance à la mode',
      example: '"Le sans-grains, c\'est plus santé, non?"',
    },
    'rx-diet': {
      title: 'Scepticisme envers la diète vétérinaire',
      example: '"Est-ce vraiment nécessaire sur le plan médical?"',
    },
    'brand-switch': {
      title: 'Hésitation à changer de marque',
      example: '"Mon chien mange déjà très bien — pourquoi changer?"',
    },
    'weight-denial': {
      title: 'Déni du poids / de l\'obésité',
      example: '"Il n\'est pas gros — tous les Labs sont bâtis de même."',
    },
    custom: {
      title: 'Autre objection',
      example: 'Décrivez l\'objection dans vos propres mots dans le champ ci-dessous.',
    },
  },

  difficulties: {
    1: {
      label: 'Réceptif',
      description:
        'Le client est ouvert d\'esprit et prêt à écouter vos recommandations, avec très peu de résistance.',
    },
    2: {
      label: 'Sceptique',
      description:
        'Le client remet vos conseils en question et a besoin d\'explications claires, appuyées par des preuves, pour être convaincu.',
    },
    3: {
      label: 'Hostile',
      description:
        'Le client est frustré ou sur la défensive : il faut de l\'empathie et de la persévérance pour arriver à une résolution.',
    },
    4: {
      label: 'Combatif',
      description:
        'Le client est très résistant et à fleur de peau — il met votre sang-froid à l\'épreuve.',
    },
  },

  hints: {
    cost: {
      title: 'Objection au coût d\'une diète vétérinaire',
      acknowledgePatterns: [
        'Validez la dépense sans la minimiser : « C\'est une vraie dépense, vous avez raison. »',
        'Nommez le doute : « Moi aussi, je voudrais savoir ce qui justifie ce prix-là. »',
        'Redites le nom du chien pour ramener la conversation sur les soins',
      ],
      clarifyQuestions: [
        'Combien coûte sa nourriture actuelle, par jour?',
        'Depuis combien de temps est-elle à ce poids-là?',
        'Qu\'est-ce que ça changerait pour vous si elle perdait le poids en 12 semaines?',
        'Depuis quand y pensez-vous, à son poids?',
      ],
      takeActionPatterns: [
        'Ramenez le prix au coût par jour, pas au prix du sac',
        'Citez l\'évaluation clinique de 12 semaines (97 %) comme point d\'ancrage de la valeur',
        'Proposez un engagement d\'essai de 4 semaines, pas de 6 mois',
        'Reliez le changement d\'alimentation aux visites évitées et aux soins articulaires économisés',
      ],
    },
    'breeder-advice': {
      title: 'L\'éleveur a dit le contraire',
      acknowledgePatterns: [
        'Honorez le lien avec l\'éleveur : « C\'est normal de faire confiance à quelqu\'un qui a connu ses parents. »',
        'Évitez de laisser entendre que l\'éleveur a tort; proposez plutôt un autre angle',
      ],
      clarifyQuestions: [
        'Comment la trouvez-vous aujourd\'hui, avec vos yeux à vous?',
        'Est-ce que l\'éleveur l\'a revue récemment?',
        'Quel objectif l\'éleveur avait-il en tête pour cette étape-ci de sa vie?',
      ],
      takeActionPatterns: [
        'Présentez la diète comme la suite du parcours, pas comme une contradiction',
        'Parlez de nutrition par stade de vie : ce qui convenait à 8 semaines diffère à 8 ans',
        'Offrez de partager l\'évaluation WSAVA avec vous et avec l\'éleveur',
      ],
    },
    'raw-food': {
      title: 'Convaincu que le cru est le meilleur choix',
      acknowledgePatterns: [
        'Reconnaissez l\'effort et l\'intention',
        'Validez le désir de donner de la « vraie nourriture »',
      ],
      clarifyQuestions: [
        'À quoi ressemble une journée de repas typique pour lui?',
        'Avez-vous déjà eu des doutes sur l\'équilibre nutritionnel?',
        'Où vous approvisionnez-vous — toujours le même boucher, ou ça varie?',
      ],
      takeActionPatterns: [
        'Sortez la liste de vérification WSAVA sur l\'alimentation équilibrée',
        'Parlez de la salmonelle et des carences avec des faits, sans faire peur',
        'Proposez un plan hybride si le propriétaire y tient : moitié croquettes équilibrées, moitié sa préparation fraîche',
      ],
    },
    'rx-diet': {
      title: 'Sceptique envers la diète vétérinaire',
      acknowledgePatterns: [
        'Validez la confusion — la plupart des gens la partagent',
        'Reformulez « Rx » comme « formulé par des vétérinaires », pas comme un médicament',
      ],
      clarifyQuestions: [
        'Qu\'est-ce que le mot « prescription » voulait dire pour vous, ici?',
        'Est-elle à ce poids-là depuis un bon moment?',
      ],
      takeActionPatterns: [
        'Expliquez simplement la désignation : formulation ciblée, suivi vétérinaire',
        'Ancrez sur le résultat de l\'essai (97 % en 12 semaines)',
        'Proposez l\'essai encadré de 4 semaines comme preuve',
      ],
    },
    'brand-switch': {
      title: 'Réticent à changer de marque',
      acknowledgePatterns: [
        'Soulignez la constance — c\'est du bon travail de propriétaire',
        'Validez que la crainte de la transition vient d\'une vraie expérience passée',
      ],
      clarifyQuestions: [
        'Quand vous dites « mal de ventre » — qu\'est-ce que vous avez vu exactement?',
        'À quelle vitesse aviez-vous fait le changement la dernière fois?',
        'Depuis combien de temps la tendance du poids vous inquiète-t-elle?',
      ],
      takeActionPatterns: [
        'Expliquez clairement le protocole de transition sur 7 à 10 jours',
        'Offrez un plan d\'alimentation écrit',
        'Fixez un suivi à 2 semaines pour l\'étape de la tolérance digestive',
      ],
    },
    'weight-denial': {
      title: 'Déni du poids / de l\'obésité',
      acknowledgePatterns: [
        '« Je vois à quel point vous tenez à Buddy — et c\'est exactement pour ça que cette conversation-là compte. »',
        '« C\'est très fréquent que ça monte tranquillement — au quotidien, les propriétaires ne le voient pas. »',
        'N\'utilisez jamais le mot « obèse » sans une entrée en matière tout en douceur',
        'Validez que le chien a l\'air heureux et plein d\'énergie — puis faites le pont vers le risque invisible',
      ],
      clarifyQuestions: [
        'Sentez-vous ses côtes sans appuyer? (invitation à la palpation BCS)',
        'Depuis combien de temps est-il à ce poids-là?',
        'Est-ce qu\'il ralentit dans les longues marches, ou force pour se relever?',
        'Combien de gâteries reçoit-il dans une journée, à peu près?',
        'Qu\'est-ce qui vous dérangerait le plus : changer sa nourriture, ou des problèmes articulaires plus tard?',
      ],
      takeActionPatterns: [
        'Servez-vous de l\'échelle BCS 1 à 9 comme outil de référence commun, sans jugement',
        'Citez la charge articulaire : chaque kilo en trop = 3 à 4 kg de force supplémentaire sur les articulations',
        'Présentez Satiety Support comme « rassasié avec moins » — le chien n\'aura pas faim',
        'Ancrez sur le changement visible en 12 semaines : « Vous allez le voir avant même qu\'on le pèse »',
        'Proposez une pesée mensuelle — ça devient un projet commun, pas un verdict',
      ],
    },
    custom: {
      title: 'Objection définie par la personne en formation',
      acknowledgePatterns: [
        'Reprenez ses mots exacts sans les minimiser',
        'Nommez l\'émotion en dessous (inquiétude, frustration, conflit de loyauté)',
      ],
      clarifyQuestions: [
        'À quoi ressemblerait « assez bon » pour vous et votre chien?',
        'Qu\'est-ce qui est arrivé la dernière fois qu\'on vous a recommandé un changement?',
        'Quelle est votre principale crainte si vous changez?',
      ],
      takeActionPatterns: [
        'Proposez une seule prochaine étape claire, liée à la préoccupation nommée',
        'Utilisez un cadrage aligné sur la WSAVA — nutrition guidée par le diagnostic en contexte clinique',
      ],
    },
  },
};
