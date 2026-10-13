/**
 * What the assistant offers before the admin has said anything: the opening
 * line, four starter prompts for the step they are on, and the composer
 * placeholder. Pure — tailored to the step and to what the draft already
 * holds, so the chips never suggest something that is already done.
 */
import { STUDIO_STEP_LABELS, type StudioStepKey } from '../../../../src/shared/ai/scenarioAgent';
import { PUSHBACK_LABELS } from '../../../../src/shared/scenarios/enums';
import type { StudioDraft } from '../studioModel';

const STARTER_COUNT = 4;

function has(v: unknown): boolean {
  return typeof v === 'string' ? v.trim() !== '' : v !== null && v !== undefined;
}

/**
 * True when the admin hasn't described the scenario yet — nothing that says
 * what the conversation is about. (Defaults like difficulty 2 don't count.)
 */
export function isBlankDraft(draft: StudioDraft): boolean {
  return ![
    draft.breed,
    draft.pushback_id,
    draft.pushback_notes,
    draft.context_override,
    draft.suggested_driver,
    draft.opening_line_override,
    draft.card_title_override,
  ].some(has);
}

/** The greeting shown on an empty conversation. */
export function greetingFor(step: StudioStepKey, draft: StudioDraft): { title: string; body: string } {
  if (isBlankDraft(draft)) {
    return {
      title: 'Tell me about the conversation you want your team to practise…',
      body:
        'The pet, what the owner is pushing back on, and how tough they should be. ' +
        'I’ll suggest answers for each step — you check them and decide.',
    };
  }
  return {
    title: `Want help with ${STEP_PHRASE[step]}?`,
    body: 'Ask for ideas, rewrites or a second opinion. Nothing changes until you press Apply.',
  };
}

/** `STUDIO_STEP_LABELS` as they read mid-sentence ("Want help with the AI brief?"). */
const STEP_PHRASE: Record<StudioStepKey, string> = {
  pet: STUDIO_STEP_LABELS.pet.toLowerCase(),
  pushback: STUDIO_STEP_LABELS.pushback.toLowerCase(),
  customer: STUDIO_STEP_LABELS.customer.toLowerCase(),
  knowledge: 'the knowledge',
  brief: `the ${STUDIO_STEP_LABELS.brief}`,
  test: `the ${STUDIO_STEP_LABELS.test.toLowerCase()}`,
  publish: 'publishing',
};

function pushbackPhrase(draft: StudioDraft): string | null {
  if (!draft.pushback_id || draft.pushback_id === 'custom') return null;
  const label = PUSHBACK_LABELS[draft.pushback_id];
  return label ? label.toLowerCase() : null;
}

/** Four starter prompts for the step the admin is on. */
export function starterPrompts(step: StudioStepKey, draft: StudioDraft): string[] {
  const cat = draft.species === 'cat';
  const animal = cat ? 'cat' : 'dog';
  const breed = typeof draft.breed === 'string' && draft.breed.trim() ? draft.breed.trim() : null;
  const pushback = pushbackPhrase(draft);
  let list: string[];

  switch (step) {
    case 'pet':
      list = [
        pushback
          ? `Suggest a ${animal} breed that fits ${pushback}`
          : cat
            ? 'Suggest a cat breed where weight denial is common'
            : 'Suggest a breed where weight denial is common',
        breed ? `What life stage makes a ${breed} scenario interesting?` : 'Make this about a senior cat',
        isBlankDraft(draft)
          ? 'A Labrador owner who insists their overweight dog is fine'
          : `Is a ${breed ?? animal} realistic for this pushback?`,
        'What weight would make this realistic?',
      ];
      break;
    case 'pushback':
      list = [
        'Write a realistic backstory',
        'Say the objection in the owner’s own words',
        breed ? `What pushback is common for ${breed} owners?` : `What pushback is common for ${animal} owners?`,
        pushback ? 'Make the pushback more specific' : 'Make the pushback about price',
      ];
      break;
    case 'customer':
      list = [
        'Write three opening lines',
        'Make this owner an Analyzer who wants studies',
        'Which ECHO driver would make this hardest?',
        'Make the owner harder to move',
      ];
      break;
    case 'knowledge':
      list = [
        'Which documents should this scenario use?',
        pushback ? `Which topic fits ${pushback}?` : 'Which topic should the AI focus on?',
        'Should the AI use the whole library?',
        'What will the AI customer read for this scenario?',
      ];
      break;
    case 'brief':
      list = [
        'Make the owner more resistant to price talk',
        'Write opening notes for the AI customer',
        'Remind the AI to stay in character',
        'Have the owner mention advice from a friend',
      ];
      break;
    case 'test':
      list = [
        'What should I try in the test drive?',
        'What would a great first reply look like?',
        'Which ACT step will be hardest here?',
        'How do I make this harder to win?',
      ];
      break;
    case 'publish':
      list = [
        'Write a catchy card title and subtitle',
        'Write the info text trainees see first',
        'Suggest a start button label',
        'Is this ready to publish?',
      ];
      break;
  }
  return [...new Set(list)].slice(0, STARTER_COUNT);
}

/** The composer's placeholder, per step. */
export function composerPlaceholder(step: StudioStepKey): string {
  switch (step) {
    case 'pet':
      return 'Describe the pet, or ask for a breed…';
    case 'pushback':
      return 'Describe the objection, or ask for a backstory…';
    case 'customer':
      return 'Describe the owner, or ask for opening lines…';
    case 'knowledge':
      return 'Ask which documents the AI should read…';
    case 'brief':
      return 'Ask for notes that shape the AI customer…';
    case 'test':
      return 'Ask what to try in the test drive…';
    case 'publish':
      return 'Ask for a card title, info text…';
  }
}
