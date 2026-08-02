/**
 * Library / clinical-reference screen. The accordion content lives inline in
 * `ResourcesScreen.tsx` (it is screen copy, not a data module), so the whole
 * body of the screen is extracted here.
 *
 * Glossary: BCS / MCS / WSAVA / NRC stay untranslated in every locale.
 */
export const resources = {
  'resources.title': 'Library',
  'resources.headline': 'Clinical reference,\nat the speed of conversation.',

  // ── Nutrition assessment ──────────────────────────────────
  'resources.nutrition.eyebrow': 'Nutrition assessment',
  'resources.nutrition.title': 'A six-question screening that fits any visit.',
  'resources.nutrition.summary':
    'WSAVA Global Nutrition Toolkit screening covers diet history, body condition, muscle condition, life-stage needs, environment, and product format.',
  'resources.nutrition.topic1.title': 'The 5-second screen',
  'resources.nutrition.topic1.body':
    'BCS + MCS + diet history. Anything outside normal triggers a fuller evaluation.',
  'resources.nutrition.topic2.title': 'Why anchor on BCS',
  'resources.nutrition.topic2.body':
    'Body condition is more reliable than weight alone — same dog, different builds, very different ideal weights.',
  'resources.nutrition.topic3.title': 'Diet history red flags',
  'resources.nutrition.topic3.body':
    'Multiple food brands rotated weekly, raw without supplementation, or grain-free for >12 months without GI history.',

  // ── Body condition (BCS) ──────────────────────────────────
  'resources.bcs.eyebrow': 'Body condition (BCS)',
  'resources.bcs.title': 'Score 1–9: ribs, waist, abdominal tuck.',
  'resources.bcs.summary':
    'A visual + palpation system. 4–5 is ideal for most adult dogs. Each point above 5 ≈ 10–15% above ideal weight.',
  'resources.bcs.topic1.title': 'How to palpate',
  'resources.bcs.topic1.body':
    'Light pressure over ribs. Easily felt, slight fat covering = ideal. Hard to feel = overweight.',
  'resources.bcs.topic2.title': 'Visual cues',
  'resources.bcs.topic2.body':
    'Tucked abdomen + visible waist from above = healthy. No tuck, no waist = elevated BCS.',

  // ── Muscle condition (MCS) ────────────────────────────────
  'resources.mcs.eyebrow': 'Muscle condition (MCS)',
  'resources.mcs.title': 'Independent of BCS — scored over four bony landmarks.',
  'resources.mcs.summary':
    'Spine, scapulae, skull, ilial wings. Categories: normal, mild, moderate, severe. Common in seniors and chronic disease.',
  'resources.mcs.topic1.title': 'Why MCS matters separately',
  'resources.mcs.topic1.body':
    "A dog can be both overweight (BCS 7+) and muscle-wasted (MCS moderate). Calories alone won't fix muscle loss.",
  'resources.mcs.topic2.title': 'When to flag',
  'resources.mcs.topic2.body':
    'Any non-normal MCS warrants chronic-disease screen and protein-focused nutrition plan.',

  // ── Calorie targets ───────────────────────────────────────
  'resources.calories.eyebrow': 'Calorie targets',
  'resources.calories.title': '130 × kg^0.75 active · 95 × kg^0.75 inactive.',
  'resources.calories.summary':
    'Daily maintenance energy requirement (DMER) per 2006 NRC. For weight loss, target 80% of DMER for ideal — not current — weight.',
  'resources.calories.topic1.title': 'Common feeding errors',
  'resources.calories.topic1.body':
    'Treats average 10–15% of daily intake — frequently uncounted. Free-feeding amplifies BCS drift.',
  'resources.calories.topic2.title': 'Practical math',
  'resources.calories.topic2.body':
    "A 30 kg lab at active level = 130 × 30^0.75 ≈ 1665 kcal/day. Compare against current bag's feeding guide.",

  // ── Sources footer ────────────────────────────────────────
  'resources.sources.label': 'Sources',
  'resources.sources.body':
    'WSAVA Global Nutrition Toolkit · Body & Muscle Scoring Charts (2020) · Tufts University MCS chart (2013) · 2006 NRC DMER',
} as const;
