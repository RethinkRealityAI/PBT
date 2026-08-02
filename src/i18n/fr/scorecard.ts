import type { scorecard as enScorecard } from '../en/scorecard';

/** Français (fr-CA). Voir .claude/agents/translator.md pour le glossaire. */
export const scorecard: Record<keyof typeof enScorecard, string> = {
  'scorecard.arc.title': 'Parcours de résolution du client',
  'scorecard.arc.aria':
    'Le client est passé de {from} à {to} en {count} réponses',
  'scorecard.arc.ariaOne': 'Le client est passé de {from} à {to} en 1 réponse',

  'scorecard.arc.caption.heldGreen':
    'Le client était acquis dès le départ — vous l’y avez gardé.',
  'scorecard.arc.caption.movedToGreen':
    'Vous avez amené le client de {from} à convaincu en {count} réponses.',
  'scorecard.arc.caption.movedToGreenOne':
    'Vous avez amené le client de {from} à convaincu en une seule réponse.',
  'scorecard.arc.caption.openedDoor':
    'Vous avez ouvert la porte — le client est reparti réceptif, mais pas encore convaincu.',
  'scorecard.arc.caption.stayedReceptive':
    'Le client est resté réceptif sans s’engager pleinement.',
  'scorecard.arc.caption.stayedDefensive':
    'Le client est resté sur la défensive du début à la fin — consultez la carte À travailler ci-dessous.',
  'scorecard.arc.caption.closedDown':
    'Le client s’est refermé — revoyez le moment où le ton a basculé.',
} as const;
