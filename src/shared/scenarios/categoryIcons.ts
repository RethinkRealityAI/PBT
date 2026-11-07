// Category icons — the ONE vocabulary of pictures a scenario category can
// wear (the trainee's Training library cards, the Studio's category editor
// and cards).
//
//   • Built-in categories have a FIXED icon (`BUILT_IN_CATEGORY_ICON`) — an
//     admin may rename them but not re-picture them.
//   • Team categories carry the icon an admin chose in the Studio
//     (`scenario_objection_categories.icon`, migration
//     20261107000100_category_icons.sql; CHECKed against this list).
//   • Unset (or the column not migrated yet) → `guessCategoryIcon` reads the
//     name (then the description) for a keyword, else `tag`.
//
// Keys only — no React, no lucide import — so the database CHECK, the admin
// app, the trainee app and netlify/functions share one list. The drawings
// live in `src/design-system/CategoryIcon.tsx` (white line icons; never
// emoji). Keep this file dependency-free.

export const CATEGORY_ICON_KEYS = [
  'bowl',
  'scale',
  'pill',
  'stethoscope',
  'droplet',
  'kidney',
  'sprout',
  'heart',
  'bone',
  'sparkles',
  'shield',
  'clock',
  'coins',
  'users',
  'message',
  'tag',
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

/** What each icon is for, in the words the Studio picker shows (English: admin UI). */
export const CATEGORY_ICON_LABELS: Readonly<Record<CategoryIconKey, string>> = {
  bowl: 'Food bowl',
  scale: 'Scale (weight)',
  pill: 'Pill (supplements, medication)',
  stethoscope: 'Stethoscope (vet care)',
  droplet: 'Droplet (urinary)',
  kidney: 'Kidney (renal)',
  sprout: 'Sprout (digestion, probiotics)',
  heart: 'Heart',
  bone: 'Bone (joints, growth)',
  sparkles: 'Sparkles (trends, new)',
  shield: 'Shield (skin, allergy, protection)',
  clock: 'Clock (senior, routine)',
  coins: 'Coins (cost)',
  users: 'People (family, breeders)',
  message: 'Speech bubble',
  tag: 'Tag',
};

/** The icon every category falls back to when nothing else fits. */
export const DEFAULT_CATEGORY_ICON: CategoryIconKey = 'tag';

/** "Other pushback" — the group outside every category. */
export const OTHER_CATEGORY_ICON: CategoryIconKey = 'message';

/** Fixed icons for the built-in categories (`BUILT_IN_CATEGORIES` ids). */
export const BUILT_IN_CATEGORY_ICON: Readonly<Record<string, CategoryIconKey>> = {
  'everyday-nutrition': 'bowl',
  weight: 'scale',
  'prescription-diets': 'stethoscope',
};

export function isCategoryIconKey(value: unknown): value is CategoryIconKey {
  return typeof value === 'string' && (CATEGORY_ICON_KEYS as readonly string[]).includes(value);
}

/**
 * Keyword rules, most specific first: the first rule with a match wins.
 * Matched against lowercase, accent-free text at word STARTS (so "digest"
 * catches "digestive" / "digestif", and "gi" alone is a whole word). English
 * and Canadian-French words both — a team may name a category in either.
 */
const KEYWORD_RULES: ReadonlyArray<readonly [CategoryIconKey, RegExp]> = [
  ['droplet', /\b(urinar|urinai|urine|bladder|struvite|oxalate|crystal|cystitis|flutd|vessie|urolith|hydrat)/],
  ['kidney', /\b(renal|renau|kidney|ckd|nephr|rein[s]?\b)/],
  ['sprout', /\b(gi\b|gastro|digest|probiotic|prebiotic|gut|stool|diarrh|intestin|fibre|fiber|microbiom|selle)/],
  ['scale', /\b(weight|obes|overweight|satiety|slim|poids|surpoids|minceur|satiet)/],
  ['coins', /\b(cost|pric|afford|expens|budget|money|cheap|cout|prix|cher\b|argent)/],
  ['shield', /\b(skin|derm|allerg|itch|coat|immun|protect|peau|pelage|demangea)/],
  ['heart', /\b(heart|cardi|coeur)/],
  ['bone', /\b(joint|mobility|arthr|bone|growth|puppy|kitten|articul|os\b|croissance|chiot|chaton|mobilit)/],
  ['clock', /\b(senior|aging|ageing|age\b|older|routine|schedul|vieil|aine)/],
  ['pill', /\b(supplement|medica|medicine|pill|tablet|dose|complement|medicament|comprime)/],
  ['stethoscope', /\b(prescri|therapeut|rx\b|vet|clinic|diagnos|ordonnance|therapeutique|veterinaire)/],
  ['users', /\b(breeder|family|owner|household|friend|famil|eleveur|proprietaire|amis?\b)/],
  ['bowl', /\b(nutrition|food|diet|feed|kibble|meal|wet\b|dry\b|raw|grain|aliment|nourriture|diete|repas|croquette)/],
  ['sparkles', /\b(trend|brand|new\b|premium|fashion|marque|tendance|nouveau)/],
  ['message', /\b(communicat|conversation|objection|talk|discussion)/],
];

function normalise(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

function matchKeywords(text: string): CategoryIconKey | null {
  const t = normalise(text);
  if (!t.trim()) return null;
  for (const [icon, re] of KEYWORD_RULES) if (re.test(t)) return icon;
  return null;
}

/**
 * The icon a category's words suggest: its name (English, then French)
 * first — the name is what the admin chose it for — then its description;
 * `tag` when nothing matches.
 */
export function guessCategoryIcon(c: {
  name?: string | null;
  nameFr?: string | null;
  description?: string | null;
}): CategoryIconKey {
  return (
    matchKeywords(c.name ?? '') ??
    matchKeywords(c.nameFr ?? '') ??
    matchKeywords(c.description ?? '') ??
    DEFAULT_CATEGORY_ICON
  );
}

/**
 * The icon to draw for a category: the built-in's fixed one, else the
 * admin's stored choice, else the keyword guess.
 */
export function categoryIconFor(c: {
  id: string;
  icon?: string | null;
  name?: string | null;
  nameFr?: string | null;
  description?: string | null;
}): CategoryIconKey {
  const fixed = BUILT_IN_CATEGORY_ICON[c.id];
  if (fixed) return fixed;
  if (isCategoryIconKey(c.icon)) return c.icon;
  return guessCategoryIcon(c);
}
