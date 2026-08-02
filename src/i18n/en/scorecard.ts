/**
 * Scorecard insight surfaces — currently the client resolution arc
 * (`src/features/scorecard/ResolutionJourney.tsx`).
 *
 * The red/yellow/green emotion values stay machine keys; their display
 * labels live in the `chat` namespace (`chat.emotion.*`) and are reused
 * here so the arc and the chat bubbles always speak the same vocabulary.
 */
export const scorecard = {
  'scorecard.arc.title': 'Client resolution arc',
  'scorecard.arc.aria': 'Client went from {from} to {to} across {count} replies',
  'scorecard.arc.ariaOne': 'Client went from {from} to {to} across 1 reply',

  'scorecard.arc.caption.heldGreen':
    'The client was on board from the start — you kept them there.',
  'scorecard.arc.caption.movedToGreen':
    'You moved the client from {from} to convinced over {count} replies.',
  'scorecard.arc.caption.movedToGreenOne':
    'You moved the client from {from} to convinced in a single reply.',
  'scorecard.arc.caption.openedDoor':
    'You opened the door — the client left receptive, but not yet convinced.',
  'scorecard.arc.caption.stayedReceptive':
    'The client stayed receptive without fully committing.',
  'scorecard.arc.caption.stayedDefensive':
    'The client stayed defensive throughout — look at the Focus Next card below.',
  'scorecard.arc.caption.closedDown':
    'The client closed back down — revisit where the tone turned.',
} as const;
