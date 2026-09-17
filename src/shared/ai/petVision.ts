/**
 * Pet Vision Analyzer — the parts shared by the browser (types + result
 * normaliser) and the `ai-vision` Netlify Function (prompt + normaliser).
 *
 * The raw image is NEVER persisted anywhere — it travels browser → function →
 * Gemini in memory and only the structured result is saved downstream.
 * Per Phase 2 scope there are NO product recommendations.
 */
import { BCS_LEVELS } from '../../data/bcsLevels';
import type { Locale } from '../../i18n/locales';

export type DermatitisSeverity = 'none' | 'mild' | 'moderate' | 'marked';
export type VisionLifeStage = 'puppy' | 'junior' | 'adult' | 'senior' | 'unknown';

export interface PetVisionDermatitis {
  severity: DermatitisSeverity;
  /** Visible coat/skin anomalies, e.g. "patchy hair loss on flank". */
  indicators: string[];
  note: string;
}

export interface PetVisionResult {
  /** False when the image clearly isn't a dog — UI surfaces a gentle retry. */
  isDog: boolean;
  breed: string;
  /** 0–1 model confidence in the primary breed call. */
  breedConfidence: number;
  /** Other plausible breeds, most-likely first. */
  alternativeBreeds: string[];
  lifeStage: VisionLifeStage;
  /** Free-text age estimate, e.g. "approximately 2–4 years". */
  ageEstimate: string;
  /** Body Condition Score on the standard 1–9 veterinary scale. */
  bcs: number;
  bcsRationale: string;
  dermatitis: PetVisionDermatitis;
  /** Non-branded, clinically-grounded next-step guidance. */
  guidance: string;
  /** Caveats the model couldn't assess from a single still (e.g. weight). */
  notVisible: string[];
}

const BCS_REFERENCE = BCS_LEVELS.map(
  (l) => `${l.score} — ${l.label}: ${l.description}`,
).join('\n');

export const PET_VISION_SYSTEM_INSTRUCTION = `
You are a veterinary visual triage assistant analysing a single still photo of
a dog. You are NOT making a diagnosis — you produce careful, hedged estimates a
veterinary professional will review and correct.

Ground every estimate in what is actually visible. If the photo angle, lighting,
or framing makes something impossible to judge, say so in notVisible and choose
the most conservative estimate. Never invent detail you cannot see.

# BODY CONDITION SCORE (WSAVA 1–9)
${BCS_REFERENCE}

# DERMATITIS / COAT INDICATORS to look for
Redness or inflammation, scaling or flaking, patchy or symmetrical hair loss,
hot spots / moist lesions, thickened or darkened skin, visible scratching
trauma, ear or periocular irritation. severity = none when the coat looks
healthy. Only report indicators you can actually see.

# RULES
- If the image is not a dog, set isDog=false and leave the other fields at safe
  defaults (breed "Unknown", bcs 5, dermatitis severity "none").
- breedConfidence is 0–1. Mixed-breed dogs are common — say "Mixed breed" with
  the most likely contributing breeds in alternativeBreeds when unsure.
- bcs is an integer 1–9.
- guidance is 1–3 sentences of NON-BRANDED, general clinical guidance (e.g.
  "A BCS of 7/9 suggests a calorie review and a recheck in 4 weeks."). Do NOT
  name or recommend any commercial product or brand.
- Weight cannot be measured from a photo — always include it in notVisible.
`.trim();

/**
 * Locale addendum for the vision prompt.
 *
 * As with the roleplay prompts, the clinical scaffolding stays English and
 * only the OUTPUT language switches. Enum values (`lifeStage`, dermatitis
 * `severity`), the numeric BCS and breed names are machine/glossary values
 * and are never translated — a French `lifeStage` would fail the schema and
 * a translated breed would break the scenario prefill downstream.
 */
export function petVisionLanguageAddendum(locale: Locale): string {
  if (locale !== 'fr') return '';
  return `

# OUTPUT LANGUAGE — CANADIAN FRENCH
Write every free-text field in Canadian French (Québec register, professional
clinic voice): ageEstimate, bcsRationale, dermatitis.note, dermatitis
indicators, guidance, and notVisible.
Do NOT translate: the enum values (lifeStage, dermatitis severity), the BCS
number, the "BCS" initialism itself, or dog breed names — breed and
alternativeBreeds stay in their standard English/kennel-club form
(e.g. "Labrador Retriever", "Mixed breed").`;
}

function clampBcs(n: unknown): number {
  const v = typeof n === 'number' ? Math.round(n) : 5;
  return Math.max(1, Math.min(9, v));
}

function clampConfidence(n: unknown): number {
  const v = typeof n === 'number' ? n : 0;
  return Math.max(0, Math.min(1, v));
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];

/**
 * Coerce whatever the model returned into a well-formed `PetVisionResult`.
 * Pure; the schema is enforced upstream but a drifting model can still omit
 * or mistype a field, and the UI must never see NaN / undefined.
 */
export function normalizePetVisionResult(
  parsed: Partial<PetVisionResult> | null | undefined,
  locale: Locale,
): PetVisionResult {
  const p = parsed ?? {};
  const derm = p.dermatitis ?? { severity: 'none', indicators: [], note: '' };
  return {
    isDog: p.isDog !== false,
    breed: p.breed?.trim() || 'Unknown',
    breedConfidence: clampConfidence(p.breedConfidence),
    alternativeBreeds: strings(p.alternativeBreeds),
    lifeStage: (p.lifeStage as VisionLifeStage) ?? 'unknown',
    ageEstimate:
      p.ageEstimate?.trim() ||
      (locale === 'fr'
        ? 'Impossible à déterminer à partir de la photo'
        : 'Not determinable from photo'),
    bcs: clampBcs(p.bcs),
    bcsRationale: p.bcsRationale?.trim() || '',
    dermatitis: {
      severity: (derm.severity as DermatitisSeverity) ?? 'none',
      indicators: strings(derm.indicators),
      note: derm.note?.trim() || '',
    },
    guidance: p.guidance?.trim() || '',
    notVisible: strings(p.notVisible),
  };
}
