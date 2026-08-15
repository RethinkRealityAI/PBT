// Focus areas — the shared clinical-topic vocabulary that links scenarios to
// knowledge documents. Imported by BOTH the admin app (pickers, labels) and
// netlify/functions (validation), like src/shared/access — keep dependency-free.
//
// Keys are stable identifiers persisted in scenario_overrides.focus_area and
// in knowledge chunk/document tags ({ focus: <key> }); labels and descriptions
// are display-only and safe to reword. Adding a focus area here needs no
// migration (the column is CHECK-length text, not an enum).

export interface FocusArea {
  key: string;
  label: string;
  description: string;
}

export const FOCUS_AREAS: FocusArea[] = [
  {
    key: 'weight',
    label: 'Weight management',
    description: 'Obesity, weight-loss diets, body condition scoring, weight denial.',
  },
  {
    key: 'gi',
    label: 'Digestive health (GI)',
    description: 'Digestion, GI upset, sensitive stomachs, gastrointestinal diets.',
  },
  {
    key: 'dermatitis',
    label: 'Skin & coat',
    description: 'Dermatitis, itching, food allergies, skin-support diets.',
  },
  {
    key: 'urinary',
    label: 'Urinary health',
    description: 'Urinary crystals, stones, and urinary-care diets.',
  },
  {
    key: 'aging',
    label: 'Senior care',
    description: 'Aging pets, mobility, cognition, senior diets.',
  },
  {
    key: 'communication',
    label: 'Client communication',
    description: 'Conversation technique, empathy, and pushback-handling research.',
  },
];

export const FOCUS_AREA_KEYS = FOCUS_AREAS.map((f) => f.key);

export function isFocusAreaKey(value: unknown): value is string {
  return typeof value === 'string' && FOCUS_AREA_KEYS.includes(value);
}

export function focusAreaLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return FOCUS_AREAS.find((f) => f.key === key)?.label ?? key;
}
