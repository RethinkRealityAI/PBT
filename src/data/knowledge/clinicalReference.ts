/**
 * Clinical reference for AI grounding — body condition, muscle condition,
 * calorie targets, and Royal Canin product anchors.
 *
 * Sourced from WSAVA Global Nutrition Toolkit, BCS/MCS charts, 2006 NRC DMER,
 * and Royal Canin product literature in `resources/Pet Nutritional Guide and Info/`.
 *
 * Kept short — used as injected context, not surfaced to users directly.
 * The user-facing BCS/MCS/calorie data lives in `data/bcsLevels.ts` etc.
 */

export const BCS_BLURB = `
Body Condition Score (BCS) is scored 1–9. 4–5 is ideal for most adult dogs.
6 is overweight; 7–9 indicates progressive obesity. 1–3 indicates underweight.
Each point above 5 corresponds to roughly 10–15% above ideal body weight.
`.trim();

export const MCS_BLURB = `
Muscle Condition Score (MCS) is independent of BCS. A dog can be overweight
AND muscle-wasted (common in seniors). Categories: normal, mild, moderate,
severe. Palpation over spine, scapulae, skull, and ilial wings.
`.trim();

export const CALORIE_FORMULA_BLURB = `
Resting energy requirement (RER) ≈ 70 × kg^0.75. Daily maintenance energy
requirement (DMER) for adult dogs:
- Active / typical: 130 × kg^0.75
- Inactive / weight-prone: 95 × kg^0.75
For weight loss, target 80% of DMER for ideal weight, not current weight.
`.trim();

export const PRODUCT_ANCHORS = {
  satietySupport: {
    name: 'Royal Canin Satiety Support',
    type: 'Veterinary Diet (prescription / vet-formulated)',
    indication: 'Weight loss in overweight dogs, BCS 7–9',
    keyClaims: [
      '97% of dogs in a 12-week clinical evaluation lost weight',
      '83% of owners reported reduced begging behaviour',
      'High protein + specialised fibre blend extends satiety',
      'Vitamin and mineral density preserved despite calorie restriction',
    ],
    transition: 'Gradual 7–10 day transition; 4-week recheck recommended',
  },
  weightCare: {
    name: 'Royal Canin Weight Care',
    type: 'Care Nutrition (over-the-counter)',
    indication: 'Mildly overweight or weight-prone adults; maintenance after Satiety',
    keyClaims: [
      'Lower calorie density than standard adult diets',
      'Supports lean muscle while moderating energy intake',
    ],
  },
} as const;

export const NON_SHAMING_FRAMING = `
Royal Canin's "Scaling the Conversation" approach: discuss weight without
shaming the owner. Avoid words like "fat", "chubby", "overfed". Prefer:
- "carrying extra weight"
- "above her ideal body condition"
- "supporting healthy weight"
Always acknowledge the owner's love and bond before introducing a clinical
concern. Frame weight management as longevity, mobility, and joy — not
correction.
`.trim();
