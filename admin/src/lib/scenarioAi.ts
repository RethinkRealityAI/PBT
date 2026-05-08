/**
 * Gemini-powered suggestion engine for the Scenario Builder's AI wizard.
 *
 * Uses the same `@google/genai` client + GEMINI_API_KEY the consumer app
 * uses. The wizard sends the partially-filled scenario as context and asks
 * for 3 short suggestions for the current field.
 */
import { GoogleGenAI, Type } from '@google/genai';

const MODEL = 'gemini-3-flash-preview';

function getClient(): GoogleGenAI {
  const apiKey =
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
    (process.env.GEMINI_API_KEY as string | undefined) ||
    '';
  return new GoogleGenAI({ apiKey });
}

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

const FIELD_DESCRIPTIONS: Record<WizardField, string> = {
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

function describeDraft(draft: ScenarioDraftForAi): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(draft)) {
    if (v !== null && v !== undefined && v !== '') lines.push(`- ${k}: ${v}`);
  }
  return lines.length ? lines.join('\n') : '(no fields filled in yet)';
}

export async function suggestField(
  field: WizardField,
  draft: ScenarioDraftForAi,
): Promise<string[]> {
  const ai = getClient();
  const desc = FIELD_DESCRIPTIONS[field];
  const filled = describeDraft(draft);

  const systemInstruction = `
You are helping a Royal Canin training admin design a vet-clinic pushback
scenario for AI-driven roleplay practice. Be concise, realistic, and
clinically grounded. Each suggestion must be standalone — the admin will
pick one verbatim.

Field to suggest: ${field}
Field guidance: ${desc}

Already filled (treat as constraints — don't contradict):
${filled}

Output JSON: { suggestions: string[] } with exactly 3 distinct options.
`.trim();

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: 'Generate the 3 suggestions now.',
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['suggestions'],
      },
    },
  });
  const raw = response.text ?? '';
  if (!raw) throw new Error('Empty AI response');
  const parsed = JSON.parse(raw) as { suggestions: string[] };
  return Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 3) : [];
}
