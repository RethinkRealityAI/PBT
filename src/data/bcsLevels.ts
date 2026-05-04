/**
 * Body Condition Score levels — WSAVA 1–9 scale.
 * Verbatim from design handoff: resources/design_handoff_pbt/design_files/screens/misc.jsx
 */

export interface BcsLevel {
  score: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  label: string;
  description: string;
  /** oklch color verbatim from prototype */
  color: string;
}

export const BCS_LEVELS: BcsLevel[] = [
  {
    score: 1,
    label: 'Severely underweight',
    description:
      'Ribs, lumbar vertebrae, pelvic bones and all bony prominences evident from a distance. No discernible body fat. Obvious loss of muscle mass.',
    color: 'oklch(0.72 0.14 235)',
  },
  {
    score: 2,
    label: 'Underweight',
    description:
      'Ribs, lumbar vertebrae and pelvic bones easily visible. No palpable fat. Some evidence of other bony prominences. Minimal loss of muscle mass.',
    color: 'oklch(0.74 0.14 235)',
  },
  {
    score: 3,
    label: 'Thin',
    description:
      'Ribs easily palpated and may be visible with no palpable fat. Tops of lumbar vertebrae visible. Pelvic bones becoming prominent. Obvious waist and abdominal tuck.',
    color: 'oklch(0.78 0.12 235)',
  },
  {
    score: 4,
    label: 'Lean ideal',
    description:
      'Ribs easily palpable, with minimal fat covering. Waist easily noted, viewed from above. Abdominal tuck evident.',
    color: 'oklch(0.70 0.18 145)',
  },
  {
    score: 5,
    label: 'Ideal',
    description:
      'Ribs palpable without excess fat covering. Waist observed behind ribs when viewed from above. Abdomen tucked up when viewed from side.',
    color: 'oklch(0.62 0.20 145)',
  },
  {
    score: 6,
    label: 'Above ideal',
    description:
      'Ribs palpable with slight excess fat covering. Waist is discernible viewed from above but is not prominent. Abdominal tuck apparent.',
    color: 'oklch(0.78 0.16 95)',
  },
  {
    score: 7,
    label: 'Overweight',
    description:
      'Ribs palpable with difficulty; heavy fat cover. Noticeable fat deposits over lumbar area and base of tail. Waist absent or barely visible. Abdominal tuck may be present.',
    color: 'oklch(0.78 0.16 70)',
  },
  {
    score: 8,
    label: 'Obese',
    description:
      'Ribs not palpable under very heavy fat cover, or palpable only with significant pressure. Heavy fat deposits over lumbar area and base of tail. Waist absent. No abdominal tuck.',
    color: 'oklch(0.66 0.20 35)',
  },
  {
    score: 9,
    label: 'Severely obese',
    description:
      'Massive fat deposits over thorax, spine and base of tail. Waist and abdominal tuck absent. Fat deposits on neck and limbs. Obvious abdominal distention.',
    color: 'oklch(0.55 0.24 18)',
  },
];
