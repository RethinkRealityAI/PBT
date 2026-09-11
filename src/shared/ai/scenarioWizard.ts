/**
 * Scenario Builder AI wizard — the field vocabulary and prompt shared by the
 * admin UI (which shows the wizard) and the `admin-scenario-ai` Netlify
 * Function (which actually calls Gemini with the server-held key).
 *
 * The wizard sends the partially-filled scenario as context and asks for
 * 3 short suggestions for the current field.
 */

export interface ScenarioDraftForAi {
  breed?: string | null;
  life_stage?: string | null;
  pushback_id?: string | null;
  pushback_notes?: string | null;
  suggested_driver?: string | null;
  persona_override?: string | null;
  difficulty_override?: number | null;
  context_override?: string | null;
  opening_line_override?: string | null;
  card_title_override?: string | null;
  card_subtitle_override?: string | null;
  info_modal_body?: string | null;
}

export type WizardField =
  | 'breed'
  | 'life_stage'
  | 'pushback_id'
  | 'pushback_notes'
  | 'suggested_driver'
  | 'persona_override'
  | 'difficulty_override'
  | 'opening_line_override'
  | 'context_override'
  | 'card_title_override'
  | 'card_subtitle_override'
  | 'info_modal_body'
  | 'prompt_prefix'
  | 'prompt_suffix';

export const WIZARD_FIELDS: readonly WizardField[] = [
  'breed',
  'life_stage',
  'pushback_id',
  'pushback_notes',
  'suggested_driver',
  'persona_override',
  'difficulty_override',
  'opening_line_override',
  'context_override',
  'card_title_override',
  'card_subtitle_override',
  'info_modal_body',
  'prompt_prefix',
  'prompt_suffix',
] as const;

export function isWizardField(v: unknown): v is WizardField {
  return typeof v === 'string' && (WIZARD_FIELDS as readonly string[]).includes(v);
}

export const FIELD_DESCRIPTIONS: Record<WizardField, string> = {
  breed: 'A specific dog breed for this Royal Canin pushback scenario (e.g. "Lab", "French Bulldog", "Mini Schnauzer", "Mixed").',
  life_stage:
    'Life stage from this exact list: "Puppy (<1)", "Junior (1-3)", "Adult (3-7)", "Senior (7+)".',
  pushback_id:
    'Pick exactly ONE pushback id from: cost, breeder-advice, raw-food, rx-diet, brand-switch, weight-denial, custom.',
  pushback_notes:
    'A 1-2 sentence specific pushback the owner is making, in their own voice.',
  suggested_driver:
    'Pick exactly ONE ECHO driver: Activator, Energizer, Analyzer, Harmonizer.',
  persona_override:
    'Owner persona archetype, exactly one of: Skeptical, Anxious, Busy, Bargain-hunter, Devoted.',
  difficulty_override:
    'Difficulty integer 1-4. 1=coachable, 2=skeptical, 3=hostile, 4=combative.',
  opening_line_override:
    'A single in-character opening line (1-2 sentences) the customer says to kick off. Conversational American English.',
  context_override:
    'A 2-3 sentence backstory: dog name, weight/condition, vet note, owner history. Realistic, vet-clinic appropriate.',
  card_title_override:
    'A short 2-5 word library card title that names this scenario clearly.',
  card_subtitle_override:
    'A short subtitle (under 80 chars) for the library card. Format: "{breed}, {life stage}. Driver: {driver}." or freer phrasing.',
  info_modal_body:
    'A 2-3 paragraph plain-text description for the per-scenario info modal: what is the trap, why is this hard, what should the trainee watch for. No markdown.',
  prompt_prefix:
    'A brief admin note (under 1500 chars) inserted at the very top of the customer system prompt. Use to nudge tone, accent, or a clinical specifier without overriding canonical sections.',
  prompt_suffix:
    'A brief admin note (under 1500 chars) appended after the rules block. Use for clinic-specific addenda or recent guidance.',
};

/** Keys the server will read from a draft; anything else is dropped. */
export const DRAFT_KEYS: readonly (keyof ScenarioDraftForAi)[] = [
  'breed',
  'life_stage',
  'pushback_id',
  'pushback_notes',
  'suggested_driver',
  'persona_override',
  'difficulty_override',
  'context_override',
  'opening_line_override',
  'card_title_override',
  'card_subtitle_override',
  'info_modal_body',
] as const;

export function describeDraft(draft: ScenarioDraftForAi): string {
  const lines: string[] = [];
  for (const k of DRAFT_KEYS) {
    const v = draft[k];
    if (v !== null && v !== undefined && v !== '') lines.push(`- ${k}: ${String(v).slice(0, 2000)}`);
  }
  return lines.length ? lines.join('\n') : '(no fields filled in yet)';
}

/** `grounding` is the pre-formatted research block (may be empty). */
export function buildWizardSystemPrompt(
  field: WizardField,
  draft: ScenarioDraftForAi,
  grounding = '',
): string {
  return `
You are helping a Royal Canin training admin design a vet-clinic pushback
scenario for AI-driven roleplay practice. Be concise, realistic, and
clinically grounded. Each suggestion must be standalone — the admin will
pick one verbatim.

Field to suggest: ${field}
Field guidance: ${FIELD_DESCRIPTIONS[field]}

Already filled (treat as constraints — don't contradict):
${describeDraft(draft)}${grounding}

Output JSON: { suggestions: string[] } with exactly 3 distinct options.
`.trim();
}
