import type { RubricOverlay } from '../../dataL10n/rubric';

/**
 * Rubrique de notation ACT — libellés et prose lus par la personne en
 * formation (fiche de résultats, modale « Comment on évalue »).
 *
 * Décisions de terminologie :
 * - Les CLÉS (`acknowledge`, `clarify`, …) ne sont jamais traduites : ce sont
 *   des valeurs machine du `ScoreReport`.
 * - Les trois piliers ACT reprennent la traduction déjà fixée ailleurs dans
 *   les catalogues : Reconnaître / Clarifier / Transformer.
 * - « rapport » (le lien) → « lien de confiance », comme `home.dim.rapport`.
 * - « Bella » (nom du chien dans les exemples) reste tel quel.
 * - Les exemples sont des répliques parlées : registre oral québécois, mais on
 *   vouvoie le client comme le ferait une équipe de clinique.
 */
export const rubric: RubricOverlay = {
  acknowledge: {
    label: 'Reconnaître',
    description:
      "Est-ce que la personne a d'abord validé ce que ressent le client — avant de clarifier ou de recommander — sans minimiser ni argumenter ?",
    excellentExample:
      '« On voit bien tout ce que Bella représente pour vous — et changer sa routine après 8 ans, c\'est vraiment difficile. »',
  },
  clarify: {
    label: 'Clarifier',
    description:
      'Est-ce que la personne a posé des questions ouvertes et reformulé ce qu\'elle entendait, pour faire ressortir la vraie préoccupation avant de proposer quelque chose ?',
    excellentExample:
      '« Racontez-moi une journée type avec elle — et vous parliez des escaliers qui sont plus durs ; dites-m\'en plus là-dessus. »',
  },
  transform: {
    label: 'Transformer',
    description:
      "Est-ce que la personne a recadré l'objection et guidé le client vers une prochaine étape précise et crédible (un essai balisé, un suivi, un plan écrit) plutôt que de reculer ou de forcer ?",
    excellentExample:
      '« Par jour, avec les portions bien mesurées, ça revient à moins qu\'un café — essayons 4 semaines, et je revois Bella à la deuxième semaine pour une pesée. »',
  },
  empathy: {
    label: 'Empathie et chaleur',
    description:
      "Sur l'ensemble de la conversation, est-ce que le ton est resté chaleureux, sans jugement et à l'écoute du client — pas clinique, défensif ou culpabilisant ?",
    excellentExample:
      "Emploie le nom du chien, adoucit sa façon de dire les choses, ne fait jamais sentir au propriétaire qu'il est jugé",
  },
  rapport: {
    label: 'Lien de confiance et rythme',
    description:
      "Est-ce que la personne s'est ajustée à l'énergie du client et a bâti la confiance — sans le presser ni s'éterniser — pour que l'échange reste collaboratif ?",
    excellentExample:
      "Suit le rythme plus lent d'un Harmonizer; va droit au résultat avec un Activator",
  },
};
