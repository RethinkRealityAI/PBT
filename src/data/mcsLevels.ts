/**
 * Muscle Condition Score levels — 4-point scale.
 * Verbatim from design handoff: resources/design_handoff_pbt/design_files/screens/misc.jsx
 */

export interface McsLevel {
  key: 'normal' | 'mild' | 'moderate' | 'severe';
  label: string;
  description: string;
  /** oklch color verbatim from prototype */
  color: string;
}

export const MCS_LEVELS: McsLevel[] = [
  {
    key: 'normal',
    label: 'Normal muscle mass',
    description:
      'No detectable wasting on palpation of spine, scapulae, skull, or wings of ilia.',
    color: 'oklch(0.62 0.20 145)',
  },
  {
    key: 'mild',
    label: 'Mild loss',
    description:
      'Slight reduction in epaxial muscle along the spine. Often missed without palpation.',
    color: 'oklch(0.78 0.16 95)',
  },
  {
    key: 'moderate',
    label: 'Moderate loss',
    description:
      'Clear reduction at spine plus secondary sites. Visible to the trained eye.',
    color: 'oklch(0.78 0.16 70)',
  },
  {
    key: 'severe',
    label: 'Severe loss',
    description:
      'Profound wasting across multiple sites. Significant clinical concern.',
    color: 'oklch(0.55 0.24 18)',
  },
];
