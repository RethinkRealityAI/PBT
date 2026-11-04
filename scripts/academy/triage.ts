/**
 * Deterministic triage: an article's site taxonomy + wording → a PROPOSED
 * focus, species scope, approve/reject and one-line reason. Pure.
 *
 * PBT trains nutrition-pushback conversations for dogs and cats, so an
 * article earns a place when it helps the AI owner, the scorer or the coach
 * talk about weight, diet, feeding, diet-managed conditions, senior care or
 * the client conversation itself — and is rejected when it is clinical
 * procedure (surgery, imaging, cytology, oncology, cardiology, neurology,
 * emergency medicine, infectious disease) or off-topic (sustainability, AI,
 * careers). This is only the PROPOSAL: a human reviews the list, and the
 * manifest records the decision that ships.
 *
 * The theme table below was built from the values the Academy actually
 * uses (catalogue run of 2026-10-26); a theme it does not map to a focus is
 * listed in `catalogue.json` → `unmappedThemes` for review.
 */

export type FocusKey = 'weight' | 'gi' | 'dermatitis' | 'urinary' | 'aging' | 'communication';

export interface TriageInput {
  title: string;
  description: string;
  themes: string[];
  topics: string[];
  keywords: string[];
  species: string[];
}

export interface TriageProposal {
  focus: FocusKey | null;
  species: string[];
  approved: boolean;
  reason: string;
}

/** Site theme → PBT focus area. First match (in the article's order) wins. */
export const THEME_FOCUS: Record<string, FocusKey> = {
  'Overweight / Obesity': 'weight',
  'Healthy Weight': 'weight',
  'Weight management': 'weight',
  Gastroenterology: 'gi',
  Dermatology: 'dermatitis',
  'Urinary System': 'urinary',
  Aging: 'aging',
  'Practice Management': 'communication',
};

/** Themes that are on-topic by themselves (approve unless a reject rule hits). */
const CORE_THEMES = new Set(['Overweight / Obesity', 'Healthy Weight', 'Nutrition', 'Practice Management']);

/** Themes on-topic only when the article is about diet or the client. */
const DIET_GATED_THEMES = new Set([
  'Gastroenterology',
  'Dermatology',
  'Urinary System',
  'Renal Disease',
  'Aging',
  'Pediatrics',
  'Mobility',
  'Behavior',
  'Endocrinology',
  'Dentistry',
  'Reproduction',
  'Other',
]);

/** Themes rejected whatever the wording (procedure-led specialties). */
const REJECT_THEMES = new Set(['Emergency and Critical Care', 'Cardiology', 'Oncology', 'Vital Support']);

/** Title words that mark clinical procedure or off-topic content. */
const REJECT_TITLE: Array<[RegExp, string]> = [
  [/\bsurg(ery|ical)\b|\bsurgeon|\boperating theat|\bminimally invasive|\bremoval\b|\bresection|\bectomy\b|\w+ectomy\b|\banaesthe|\banesthe|\btransplant/i, 'surgery / anaesthesia'],
  [/\bcytolog|\bhaemat|\bhemat|\bbiops|\bhistopath|\bimmunohisto|\bpatholog|\blaborator|\burinalysis\b/i, 'cytology / laboratory'],
  [/\boncolog|\btumou?rs?\b|\bcancer|\bcarcinom|\blymphoma|\bsarcoma|\bneoplas|\bmast cell|\bchemotherap|\bradiotherap|\bliquid biopsy/i, 'oncology'],
  [/\bneurolog|\bseizure|\bepilep|\bsyringomyel|\bhydroceph|\bspinal|\bparoxysmal|\bvestibular/i, 'neurology'],
  [/\bcardi|\bheart\b|\bmurmur|\bthromboembol|\bhypertension\b|\barrhythm/i, 'cardiology'],
  [/\bemergenc|\btrauma|\bshock\b|\bcritical care|\btriage\b|\bdyspno|\bfluid therapy|\bintensive care|\bpoison|\btoxic/i, 'emergency medicine'],
  [/\bimaging\b|\bultrasound|\bultrasonograph|\bradiograph|\bx-ray|\bcomputed tomograph|\b(ct|mri)\b|\bendoscop|\bechocardio/i, 'imaging'],
  [/\binfect|\bparasit|\bvaccin|\bvir(al|us)\b|\bbacteri|\bleishmani|\bfeline infectious|\bfip\b|\bantimicrobial|\bantibiotic|\bresistan|\bstaphylococc|\bvector-borne|\btick|\bflea|\bworm|\bgiardia|\bleptospir|\bparvovir/i, 'infectious disease'],
  [/\bsustainab|\bcarbon\b|\benvironmental impact|\bclimate/i, 'sustainability'],
  [/\bartificial intelligence|\bmachine learning|\b(ai)\b|\balgorithm/i, 'AI'],
  [/\bcareer|\bfirst job|\bgood colleague|\binternship|\bburnout|\bcompassion fatigue|\bworkload|\bwellbeing|\brecruit/i, 'careers / wellbeing'],
  [/\bcovid/i, 'COVID-19 practice management'],
  [/\beuthanas/i, 'end-of-life care'],
  [/\bfractur|\borthop|\bligament|\bcruciate|\bhip dysplasia|\belbow|\bpatell|\blegg-calv|\bphysical rehabilitation/i, 'orthopaedics'],
  [/\bophthalm|\bocular|\beyes?\b|\bcornea|\bretina/i, 'ophthalmology'],
  [/\bgenetic|\bgenom|\bgene\b|\bdna\b|\bhereditary|\bbreed predisposition/i, 'genetics'],
  [/\bdental|\bdentist|\bteeth|\btooth|\bperiodont|\bgumline/i, 'dentistry'],
  [/\bdystocia|\bcaesarean|\bcesarean|\bpregnan|\bfertil|\bestrus|\boestrus|\bsemen|\bmammary|\bpyometra/i, 'reproduction'],
];

/** Words that make a diet-gated or core article relevant to PBT. */
const ON_TOPIC = /\b(diet|dietary|nutrition|nutritional|nutrient|feed|feeding|food|foods|meal|calori|kibble|obes|overweight|weight|body condition|bcs\b|milk replacer|weaning|owner|client|communicat|consult|compliance|adherence|pricing|price|cost|nurse|technician|pet owner experience|recommendation|supplement|fibre|fiber|protein|phosphor|hydration|water intake|treats?)\b/i;

/** Keyword fallback when no theme maps to a focus. */
const FOCUS_WORDS: Array<[RegExp, FocusKey]> = [
  [/\bobes|\boverweight|\bweight\b|\bbody condition|\bbcs\b|\bsatiety/i, 'weight'],
  [/\bdiarrh|\bgastro|\benteropath|\bdigest|\bintestin|\bcolitis|\bvomit|\bmicrobio|\bconstipat|\bpancrea|\bfaec|\bfec(al|es)\b|\bstool/i, 'gi'],
  [/\bskin\b|\bderm|\bprurit|\batop|\ballerg|\bcoat\b|\bitch/i, 'dermatitis'],
  [/\burin|\burolith|\bstruvite|\boxalate|\bbladder|\bcystitis|\bflutd|\blower urinary/i, 'urinary'],
  [/\bsenior|\bageing|\baging|\bgeriatric|\bcognitive|\bolder (dogs|cats|pets)/i, 'aging'],
  [/\bcommunicat|\bclient|\bowner|\bconsultation|\bpractice|\bnurse|\btechnician|\bpricing/i, 'communication'],
];

/** Site `Species[]` → PBT knowledge species. A puppy is a dog. Empty → all three. */
export function mapSpecies(site: readonly string[]): string[] {
  const s = new Set(site.map((v) => v.trim().toLowerCase()));
  const out: string[] = [];
  if (s.has('dog')) out.push('dog', 'puppy');
  if (s.has('cat')) out.push('cat');
  return out.length ? out : ['dog', 'puppy', 'cat'];
}

export function focusFor(input: Pick<TriageInput, 'themes' | 'title' | 'keywords'>): FocusKey | null {
  for (const theme of input.themes) {
    const f = THEME_FOCUS[theme];
    if (f) return f;
  }
  const text = `${input.title} ${input.keywords.join(' ')}`;
  for (const [re, key] of FOCUS_WORDS) if (re.test(input.title)) return key;
  for (const [re, key] of FOCUS_WORDS) if (re.test(text)) return key;
  return null;
}

/** Themes with no focus mapping (for the catalogue's review list). */
export function unmappedThemes(themes: readonly string[]): string[] {
  return themes.filter((t) => !(t in THEME_FOCUS));
}

export function triage(input: TriageInput): TriageProposal {
  const species = mapSpecies(input.species);
  const focus = focusFor(input);
  const themes = input.themes.length ? input.themes.join(', ') : 'no theme';

  const rejectTheme = input.themes.find((t) => REJECT_THEMES.has(t));
  if (rejectTheme) {
    return { focus, species, approved: false, reason: `Rejected: ${rejectTheme} (procedure-led specialty)` };
  }
  for (const [re, label] of REJECT_TITLE) {
    // An obesity article survives the genetics rule ("Canine genetics and obesity").
    if (label === 'genetics' && /obes|weight/i.test(input.title)) continue;
    if (re.test(input.title)) return { focus, species, approved: false, reason: `Rejected: ${label} (title)` };
  }

  const text = `${input.title} ${input.description} ${input.keywords.join(' ')} ${input.topics.join(' ')}`;
  const core = input.themes.find((t) => CORE_THEMES.has(t));
  if (core) {
    return { focus, species, approved: true, reason: `Themes: ${themes} — on-topic theme "${core}"` };
  }
  const gated = input.themes.find((t) => DIET_GATED_THEMES.has(t));
  const onTopic = ON_TOPIC.exec(input.title) ?? ON_TOPIC.exec(text);
  if ((gated || input.themes.length === 0) && onTopic) {
    return {
      focus,
      species,
      approved: true,
      reason: `Themes: ${themes} — diet/client wording ("${onTopic[0].toLowerCase()}")`,
    };
  }
  return {
    focus,
    species,
    approved: false,
    reason: `Rejected: ${themes} with no diet or client-conversation angle`,
  };
}
