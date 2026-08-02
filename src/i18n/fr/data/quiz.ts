import type { QuizOverlay } from '../../dataL10n/quiz';

/**
 * Canadian-French overlay for the ECHO quiz (`src/data/quizQuestions.ts`).
 * Display text only — ids, parts, option letters and driver mapping stay in
 * the canonical module. Typed as `QuizOverlay`, so a missing question or
 * option letter fails `tsc`.
 *
 * Register: vouvoiement throughout (the quiz addresses the trainee as a
 * professional), Québec clinic vocabulary, sentence-style capitalization.
 */
export const quiz: QuizOverlay = {
  questions: {
    // ── Partie 1 · Votre façon de travailler ──────────────────────────────
    1: {
      partLabel: 'Votre façon de travailler',
      prompt:
        'Quand une plage de rendez-vous est modifiée à la dernière minute, vous êtes plutôt :',
      options: {
        A: 'Du genre à suivre le courant — sans en faire de cas',
        B: 'Déjà en action — vous tranchez vite',
        C: "Sur la réserve tant que vous n'avez pas le portrait complet",
        D: "Habile pour rallier l'équipe autour du changement",
      },
    },
    2: {
      partLabel: 'Votre façon de travailler',
      prompt:
        'Un matin survolté, avec une salle d’attente pleine à craquer, vous êtes généralement :',
      options: {
        A: 'En pleine effervescence — cette énergie vous stimule',
        B: 'En mode exécution : vous avancez vite et vous livrez',
        C: 'Calme et stable, vous mettez tout le monde à l’aise',
        D: 'Méthodique, vous avancez une chose à la fois',
      },
    },
    3: {
      partLabel: 'Votre façon de travailler',
      prompt:
        'Quand l’équipe cherche une meilleure façon de faire, vous avez tendance à :',
      options: {
        A: 'Y réfléchir soigneusement avant de prendre la parole',
        B: 'Aller droit à ce qui a du sens, sans détour',
        C: 'Lancer des idées — les détails, vous verrez plus tard',
        D: 'Écouter d’abord et vous assurer que chacun a son mot à dire',
      },
    },
    4: {
      partLabel: 'Votre façon de travailler',
      prompt:
        'Quand la clinique est débordée et que la pression monte, votre plus grande force, c’est :',
      options: {
        A: 'De continuer d’avancer sans perdre l’élan',
        B: 'D’empêcher le moral de tomber',
        C: 'De rester d’une précision sans faille, même dans le chaos',
        D: 'D’être la personne sur qui tout le monde peut compter',
      },
    },
    5: {
      partLabel: 'Votre façon de travailler',
      prompt:
        'Si un collègue devait vous décrire dans la salle de pause, il dirait probablement :',
      options: {
        A: 'Sans détour : va droit au but',
        B: 'Fiable : ne coupe jamais les coins ronds',
        C: 'Boute-en-train : toujours de bonne humeur, toujours en train de jaser',
        D: 'Facile d’approche : écoute vraiment',
      },
    },

    // ── Partie 2 · Votre façon de créer des liens ─────────────────────────
    6: {
      partLabel: 'Votre façon de créer des liens',
      prompt:
        'Quand vous expliquez quelque chose à un client ou que vous faites le point avec l’équipe, vous êtes surtout :',
      options: {
        A: 'Chaleureux et enthousiaste — vous voulez qu’ils se sentent bien avec ça',
        B: 'Calme et rassurant — pas de drame, juste du réconfort',
        C: 'Clair et précis — seulement les faits utiles',
        D: 'Assuré et direct — vous allez droit au but',
      },
    },
    7: {
      partLabel: 'Votre façon de créer des liens',
      prompt:
        'Quand quelqu’un lance une nouvelle idée pendant une rencontre d’équipe, votre premier réflexe est de :',
      options: {
        A: 'Demander ce que disent réellement les données probantes',
        B: 'Évaluer si c’est réaliste et si ça vaut la peine',
        C: 'Vous emballer — vous voyez déjà toutes les possibilités',
        D: 'Réagir sur le moment — vous vous fiez à votre instinct',
      },
    },
    8: {
      partLabel: 'Votre façon de créer des liens',
      prompt:
        'Quand un collègue bloque sur quelque chose, la première chose que vous faites, c’est :',
      options: {
        A: 'Vous assurer qu’il se sent écouté avant de proposer quoi que ce soit',
        B: 'Reprendre le tout étape par étape jusqu’à ce que ce soit réglé',
        C: 'L’aider à trouver le chemin le plus rapide',
        D: 'Lui donner un élan et vous y attaquer ensemble, avec énergie',
      },
    },
    9: {
      partLabel: 'Votre façon de créer des liens',
      prompt:
        'Quand vous travaillez en équipe, ce qui compte le plus pour vous, c’est :',
      options: {
        A: 'Que ce soit bien fait — la rigueur et la minutie comptent',
        B: 'Que ce soit fait — les résultats parlent d’eux-mêmes',
        C: 'Que l’ambiance reste positive et que ça avance',
        D: 'Que personne ne se sente laissé de côté ou sans appui',
      },
    },
    10: {
      partLabel: 'Votre façon de créer des liens',
      prompt:
        'Quand vous n’êtes pas du même avis qu’une personne au travail, vous restez plutôt :',
      options: {
        A: 'Conciliant — vous préférez trouver un terrain d’entente que de vous braquer',
        B: 'Persuasif — vous savez rallier les gens à votre point de vue',
        C: 'Ferme — vous tenez votre bout quand vous vous croyez dans le vrai',
        D: 'Posé — vous vous en tenez à la logique et aux données probantes',
      },
    },

    // ── Partie 3 · Qui vous êtes ──────────────────────────────────────────
    11: {
      partLabel: 'Qui vous êtes',
      prompt:
        'Quand c’est vous qui prenez les choses en main, vous êtes naturellement :',
      options: {
        A: 'Direct — vous assumez et vous faites avancer les choses',
        B: 'Inspirant — vous amenez l’énergie et les gens vous suivent',
        C: 'Réfléchi — vous tracez le meilleur chemin avant de vous engager',
        D: 'Soutenant — vous vous assurez que tout le monde est à l’aise',
      },
    },
    12: {
      partLabel: 'Qui vous êtes',
      prompt:
        'Quand quelque chose tourne mal, au travail comme dans la vie, vous avez tendance à :',
      options: {
        A: 'Décortiquer ce qui s’est passé pour faire autrement la prochaine fois',
        B: 'Passer à autre chose — ressasser ne donne rien',
        C: 'Chercher le bon côté — il y en a toujours un',
        D: 'Vous laisser le temps de le vivre — vous avez besoin d’un moment pour vous replacer',
      },
    },
    13: {
      partLabel: 'Qui vous êtes',
      prompt:
        'Lors d’une journée de formation continue ou d’un congrès où vous ne connaissez personne, vous êtes généralement :',
      options: {
        A: 'Dans le feu de l’action — vous aimez rencontrer du monde et vous plongez',
        B: 'Accueillant — vous mettez d’abord les autres à l’aise',
        C: 'Sûr de vous — vous vous présentez et engagez la conversation',
        D: 'Plutôt du genre à observer d’abord et à créer des liens de façon sélective',
      },
    },
    14: {
      partLabel: 'Qui vous êtes',
      prompt:
        'Quand vous terminez une tâche, ce qui compte le plus pour vous, c’est :',
      options: {
        A: 'Qu’elle ait été faite dans les règles — chaque détail vérifié',
        B: 'Qu’elle soit faite — efficacement, sans trop se casser la tête',
        C: 'Que les personnes qui comptent sur vous se sentent bien avec le résultat',
        D: 'Qu’elle soit derrière vous — place à la suivante',
      },
    },
    15: {
      partLabel: 'Qui vous êtes',
      prompt: 'Ce qui vous anime vraiment au travail, plus que tout, c’est :',
      options: {
        A: 'La précision — bien faire, pas seulement vite',
        B: 'L’avancement — faire progresser les choses, toujours',
        C: 'Le lien — être vraiment là pour les gens autour de vous',
        D: 'L’énergie — mettre de l’enthousiasme dans tout ce que vous faites',
      },
    },
  },

  tieBreaker: {
    prompt:
      'Votre avant-midi est complet et une admission imprévue se présente. Votre réflexe est de :',
    options: {
      A: 'Trier la priorité rapidement et réorganiser tout le reste autour.',
      B: 'Rallier l’équipe — vous allez y arriver ensemble, ça va bien aller.',
      C: 'Passer les options en revue soigneusement pour que rien ne soit oublié.',
      D: 'Vous assurer que tout le monde — patient comme propriétaire — se sente calme et bien pris en charge.',
    },
  },
};
