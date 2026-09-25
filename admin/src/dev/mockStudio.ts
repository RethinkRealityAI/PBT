/**
 * Offline fixtures for the Scenario Studio (see ./mockApi.ts).
 *
 * `STUDIO_ROUTES` answers GETs (they win over mockApi's ROUTES for the same
 * function name); `STUDIO_POST_HANDLERS` answers POSTs from the request body.
 * Covered: admin-scenario-agent (assistant turns with A2UI-able proposals),
 * admin-scenario-inspect (prompt + passages), ai-roleplay / ai-evaluate (the
 * Test drive), and a few saved scenario rows so the gallery isn't empty.
 *
 * The assistant here is a small keyword script, not a model — enough to
 * review every card type (ask, update_fields, offer_options, set_ai_notes,
 * attach_knowledge, go_to_step) and the conversation flow between them. Its
 * proposals still go through the real `normalizeAgentActions`, so a fixture
 * can never show a card the live gate would drop. Document slugs are the
 * roleplay-readable ones in mockApi's KNOWLEDGE_DOCS.
 */
import type {
  EvaluateResponse,
  InspectPassage,
  RoleplayResponse,
  ScenarioAgentResponse,
  ScenarioInspectResponse,
} from '../../../src/shared/ai/contract';
import {
  normalizeAgentActions,
  pickAgentDraft,
  type ScenarioAgentDraft,
} from '../../../src/shared/ai/scenarioAgent';
import {
  draftToScenario,
  missingScenarioFields,
} from '../../../src/shared/scenarios/draftToScenario';
import { PUSHBACK_EXAMPLES, PUSHBACK_LABELS } from '../../../src/shared/scenarios/enums';
import { lifeStageLabel } from '../../../src/shared/scenarios/species';
import type { Scenario } from '../../../src/data/scenarios';
import type { AiEmotion, ChatMessage, ScoreReport } from '../../../src/services/types';
import type { ScenarioOverrideRow } from '../data/types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const ME = '00000000-0000-4000-8000-000000000001';

/** Roleplay-readable documents in mockApi's KNOWLEDGE_DOCS (slug → title). */
const MOCK_DOCS: Record<string, string> = {
  'study:davies-2024': 'Owner preferences in weight conversations',
  'clinical:reference': 'Clinical reference',
  'pushback:playbook': 'Pushback playbook',
  'act:guide': 'The ACT method',
  'driver:Activator': 'ECHO driver — Activator',
};
const KNOWN_SLUGS: ReadonlySet<string> = new Set(Object.keys(MOCK_DOCS));

// ── admin-scenario-agent ─────────────────────────────────────────────────

const CAT_WORDS =
  /\b(cats?|kittens?|feline|persian|siamese|maine coon|ragdoll|bengal|renal|kidneys?|litter)\b/;
const DOG_WORDS =
  /\b(dogs?|pupp(y|ies)|canine|labs?|labrador|retriever|schnauzer|bulldog|shepherd|beagle|weight|overweight|obese|obesity|chubby)\b/;
const WANTS_OPTIONS = /\b(opening lines?|ideas?|options|alternatives|first line|how (would|should) (they|the owner) start)\b/;
const WANTS_HARDER =
  /\b(harder|tougher|more difficult|push back more|stubborn|notes?|brief(ing)?|stay in character)\b/;

function lastAdminText(messages: unknown): string {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: unknown; content?: unknown };
    if (m?.role === 'user' && typeof m.content === 'string') {
      return m.content
        .split('\n')
        .filter((line) => !line.trim().startsWith('[tool_result]'))
        .join(' ')
        .trim()
        .toLowerCase();
    }
  }
  return '';
}

function pick<T>(text: string, table: Array<[RegExp, T]>, fallback: T): T {
  return table.find(([rx]) => rx.test(text))?.[1] ?? fallback;
}

function respond(
  reply: string,
  actions: unknown[],
  suggestions: string[],
): ScenarioAgentResponse {
  return {
    reply,
    actions: normalizeAgentActions(actions, { knownSlugs: KNOWN_SLUGS }),
    suggestions,
  };
}

function catBuild(text: string): ScenarioAgentResponse {
  const breed = pick(
    text,
    [
      [/persian/, 'Persian'],
      [/siamese/, 'Siamese'],
      [/maine coon/, 'Maine Coon'],
      [/ragdoll/, 'Ragdoll'],
      [/bengal/, 'Bengal'],
    ],
    'Domestic Shorthair',
  );
  const renal = /renal|kidney|urinary|litter/.test(text);
  const lifeStage = /kitten/.test(text)
    ? 'Puppy (<1)'
    : renal || /senior|older|elderly/.test(text)
      ? 'Senior (7+)'
      : 'Adult (3-7)';
  const pushback = renal ? 'rx-diet' : /price|cost|expensive/.test(text) ? 'cost' : 'brand-switch';
  return respond(
    renal
      ? `A senior ${breed} on a kidney diet is a great one to practise — owners often doubt a prescription food when their cat seems fine. I've drafted the whole setup; have a look, then pick an opening line.`
      : `Nice — a ${breed} scenario. I've filled in the pet, the pushback and the owner so you can adjust anything that doesn't feel right.`,
    [
      {
        tool: 'update_fields',
        fields: {
          species: 'cat',
          breed,
          life_stage: lifeStage,
          weight_kg: lifeStage === 'Puppy (<1)' ? 2.1 : 4.6,
          pushback_id: pushback,
          pushback_notes: renal
            ? "She's eating her old food just fine — is this kidney food really necessary, or is it just upselling?"
            : "She's been on the same food for years. Why would I change what's working?",
          context_override: renal
            ? `Mochi is a 13-year-old ${breed} weighing 4.6 kg. Bloodwork at her senior check showed early kidney changes, and the vet recommended a renal diet with a recheck in three months. Her owner feels she is "just getting old" and worries she won't eat anything new.`
            : `Mochi is a ${lifeStageLabel(lifeStage, 'cat').toLowerCase()} ${breed}. At her annual check the vet recommended a diet change; her owner is attached to the current routine and suspicious of anything that sounds like a sales pitch.`,
          suggested_driver: 'Analyzer',
          persona_override: 'Anxious',
          difficulty_override: 2,
        },
        note: 'Everything I could infer from your description.',
      },
      {
        tool: 'offer_options',
        field: 'opening_line_override',
        options: [
          "Before you say anything — Mochi's eating fine. Why would she need a special kidney food?",
          'I read online that prescription diets are mostly marketing. What does this one actually do?',
          "She's thirteen. I just want her comfortable, not fussing over a food she might refuse.",
        ],
      },
    ],
    ['Make the owner harder to convince', 'Which documents should the AI use?', 'Suggest a card title'],
  );
}

function dogBuild(text: string): ScenarioAgentResponse {
  const breed = pick(
    text,
    [
      [/schnauzer/, 'Miniature Schnauzer'],
      [/bulldog/, 'French Bulldog'],
      [/shepherd/, 'German Shepherd'],
      [/beagle/, 'Beagle'],
      [/golden/, 'Golden Retriever'],
    ],
    'Labrador Retriever',
  );
  const weight = /weight|overweight|obes|chubby|fat/.test(text);
  const puppy = /pupp(y|ies)/.test(text);
  return respond(
    weight
      ? `Weight denial with a ${breed} is a classic — I've drafted the pet, the pushback and a blunt, results-first owner. I also found two documents in your library that fit.`
      : `Got it — a ${breed} scenario. I've drafted the details below; tweak anything, then we can look at the owner's opening line.`,
    [
      {
        tool: 'update_fields',
        fields: {
          species: 'dog',
          breed,
          life_stage: puppy ? 'Puppy (<1)' : 'Adult (3-7)',
          weight_kg: puppy ? 14 : weight ? 41.5 : 30,
          pushback_id: weight ? 'weight-denial' : 'cost',
          pushback_notes: weight
            ? "He's not fat — he's just a big dog. All the Labs at the park look like him."
            : "It's a lot of money for a bag of kibble. What's actually different about it?",
          context_override: weight
            ? `Buddy is a 6-year-old ${breed} weighing 41.5 kg — body condition 8/9. The vet recommended a weight-loss diet and a 12-week plan with monthly weigh-ins. The owner free-feeds and gives table scraps every evening.`
            : `Buddy is a ${puppy ? 'five-month-old' : 'five-year-old'} ${breed}. The vet recommended a diet change at his check-up, and the owner balked at the price difference with the supermarket brand.`,
          suggested_driver: 'Activator',
          persona_override: 'Skeptical',
          difficulty_override: 3,
        },
        note: 'Everything I could infer from your description.',
      },
      weight
        ? {
            tool: 'attach_knowledge',
            mode: 'documents',
            slugs: ['study:davies-2024', 'clinical:reference'],
            note: 'Weight-conversation research plus body condition scoring.',
          }
        : { tool: 'go_to_step', step: 'customer' },
    ],
    ['Give me three opening lines', 'Make the owner harder to convince', 'Is it ready to test?'],
  );
}

function askSpecies(): ScenarioAgentResponse {
  return respond(
    "Happy to help you build this. First things first — is the pet in this conversation a dog or a cat?",
    [
      {
        tool: 'ask',
        question: 'Which animal is this scenario about?',
        field: 'species',
        options: [
          { label: 'Dog', value: 'dog' },
          { label: 'Cat', value: 'cat' },
        ],
      },
    ],
    ['A chubby Lab whose owner denies the weight', 'A senior cat that needs a kidney diet', 'Surprise me'],
  );
}

function offerOpeningLines(draft: ScenarioAgentDraft): ScenarioAgentResponse {
  const cat = draft.species === 'cat';
  const pet = cat ? 'she' : 'he';
  return respond('Here are three ways the owner could open — pick the one that sounds most like the people your team meets.', [
    {
      tool: 'offer_options',
      field: 'opening_line_override',
      options: [
        `Honestly, ${pet}'s fine the way ${pet} is. I don't see why we need to change anything.`,
        `Before you start — I looked this food up and it costs twice what I pay now.`,
        `My ${cat ? 'breeder' : 'trainer'} told me the opposite of what you're saying. Who am I supposed to believe?`,
      ],
    },
  ], ['Make the owner harder to convince', 'Write a backstory', 'Is it ready to test?']);
}

function makeHarder(draft: ScenarioAgentDraft): ScenarioAgentResponse {
  const nextDifficulty = Math.min(4, Math.max(3, (draft.difficulty_override ?? 2) + 1));
  return respond(
    "I've turned the owner up a notch and added two short notes for the AI. They sit on top of the standard briefing, so scoring and the ending stay exactly as they are.",
    [
      { tool: 'update_fields', fields: { difficulty_override: nextDifficulty } },
      {
        tool: 'set_ai_notes',
        prompt_prefix:
          "Interrupt once early if the staff member starts with a product name. Mention a friend's pet that did fine on supermarket food.",
        prompt_suffix:
          'Only soften after the staff member has asked at least one genuine question about your routine.',
        note: 'Tougher, but still winnable with good ACT.',
      },
    ],
    ['Try it in the Test drive', 'Show me the full briefing', 'Make it a little easier'],
  );
}

function nextMissing(draft: ScenarioAgentDraft): ScenarioAgentResponse | null {
  const missing = missingScenarioFields(draft);
  if (missing.includes('Pushback')) {
    return respond('What is the owner pushing back on?', [
      {
        tool: 'ask',
        question: 'Which objection should the owner raise?',
        field: 'pushback_id',
        options: [
          { label: PUSHBACK_LABELS.cost, value: 'cost' },
          { label: PUSHBACK_LABELS['weight-denial'], value: 'weight-denial' },
          { label: PUSHBACK_LABELS['rx-diet'], value: 'rx-diet' },
          { label: PUSHBACK_LABELS['brand-switch'], value: 'brand-switch' },
        ],
      },
    ], ['You pick', 'Something about price', 'Grain-free beliefs']);
  }
  if (missing.includes('ECHO driver')) {
    return respond('How does this owner tend to talk?', [
      {
        tool: 'ask',
        question: "Which ECHO driver fits the owner best?",
        field: 'suggested_driver',
        options: [
          { label: 'Activator — blunt, bottom line', value: 'Activator' },
          { label: 'Energizer — chatty, emotional', value: 'Energizer' },
          { label: 'Analyzer — wants evidence', value: 'Analyzer' },
          { label: 'Harmonizer — agrees, resists quietly', value: 'Harmonizer' },
        ],
      },
    ], ['You pick', 'Explain the drivers', 'Make them hard work']);
  }
  return null;
}

async function agentMock(body: Record<string, unknown>): Promise<ScenarioAgentResponse> {
  await new Promise((r) => setTimeout(r, 450)); // let the typing indicator show
  const draft = pickAgentDraft(body.draft);
  const text = lastAdminText(body.messages);
  const cat = CAT_WORDS.test(text);
  const dog = DOG_WORDS.test(text);

  // Nothing about the pet yet: build from the description, or ask once.
  if (!draft.species || !draft.breed) {
    if (cat) return catBuild(text);
    if (dog) return dogBuild(text);
    if (/surprise me|you pick/.test(text)) return dogBuild('weight lab');
    return askSpecies();
  }
  if (WANTS_OPTIONS.test(text)) return offerOpeningLines(draft);
  if (WANTS_HARDER.test(text)) return makeHarder(draft);
  if (cat && draft.species !== 'cat') return catBuild(text);
  if (dog && draft.species !== 'dog') return dogBuild(text);
  const missing = nextMissing(draft);
  if (missing) return missing;
  return respond(
    'This looks ready to try. Run a quick Test drive to hear how the owner sounds — you can still change anything afterwards.',
    [{ tool: 'go_to_step', step: 'test', note: 'The core details are all set.' }],
    ['Give me three opening lines', 'Make the owner harder to convince', 'Suggest a card title'],
  );
}

// ── admin-scenario-inspect ───────────────────────────────────────────────

const PASSAGES: InspectPassage[] = [
  {
    slug: 'study:davies-2024',
    title: MOCK_DOCS['study:davies-2024'],
    citation: 'Davies et al., 2024 — Veterinary Record',
    snippet:
      'Owners respond to a written plan and a recheck date far more reliably than to a verbal warning about weight. Framing the plan around the pet’s daily routine lowered defensiveness in two thirds of consultations.',
    similarity: 0.8712,
  },
  {
    slug: 'clinical:reference',
    title: MOCK_DOCS['clinical:reference'],
    citation: null,
    snippet:
      'Body condition scoring runs 1–9; 4–5 is ideal. Each point above 5 is roughly 10% over ideal weight.',
    similarity: 0.8034,
  },
  {
    slug: 'pushback:playbook',
    title: MOCK_DOCS['pushback:playbook'],
    citation: null,
    snippet:
      'Cost pushback usually hides a value question, not a price question. Ask what the owner compares the food with before defending it.',
    similarity: 0.7419,
  },
];

function mockPrompt(scenario: Scenario, draft: ScenarioAgentDraft): string {
  const cat = scenario.species === 'cat';
  const animal = cat ? 'CAT' : 'DOG';
  const prefix = draft.prompt_prefix?.trim();
  const suffix = draft.prompt_suffix?.trim();
  const facts = [
    `- Breed: ${scenario.breed}`,
    `- Life stage: ${scenario.age}`,
    scenario.weightKg ? `- Weight: ${scenario.weightKg} kg` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return [
    prefix ? `# ADMIN NOTES (apply on top of the canonical brief below)\n${prefix}\n` : null,
    'You are roleplaying a Royal Canin customer pushing back during an in-clinic conversation.',
    `You are NOT the staff member. You are the OWNER of the ${animal.toLowerCase()}. Stay in character.`,
    'Reply in 1–3 sentences per turn. Never break character. Never grade the staff.',
    'Never mention that you are an AI.',
    '',
    `# ${animal}`,
    facts,
    '',
    '# PUSHBACK',
    `${scenario.pushback.title} — ${scenario.pushback.example ?? ''}`,
    scenario.pushbackNotes ? `In the owner's words: ${scenario.pushbackNotes}` : null,
    '',
    `# YOUR PERSONALITY (ECHO driver: ${scenario.suggestedDriver})`,
    'Motivation: (resolved from the live AI tuning config)',
    '',
    '# DIFFICULTY',
    `Level ${scenario.difficulty}.`,
    '',
    '# CONTEXT FROM THE OWNER (optional)',
    scenario.context ?? '(none)',
    '',
    '# REFERENCE — WHAT RESEARCH SAYS ABOUT OWNERS LIKE YOU',
    ...PASSAGES.map((p) => `- ${p.snippet}${p.citation ? ` [${p.citation}]` : ''}`),
    '',
    '# RULES',
    '- ADDRESS THE STAFF MEMBER DIRECTLY using SECOND PERSON ("you").',
    '- Open the conversation with your pushback — do not wait for staff to greet you.',
    '- ENDING THE SIMULATION: … append the literal token [END_SIMULATION] …',
    suffix ? `\n# ADMIN ADDENDUM\n${suffix}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

async function inspectMock(body: Record<string, unknown>): Promise<ScenarioInspectResponse> {
  await new Promise((r) => setTimeout(r, 350));
  const draft = pickAgentDraft(body.draft);
  const adminNotes = {
    scenarioPrefix: draft.prompt_prefix?.trim() || null,
    scenarioSuffix: draft.prompt_suffix?.trim() || null,
    globalPrefix: null,
    globalSuffix: 'Keep every reply under 60 words.',
  };
  const mode: ScenarioInspectResponse['knowledge']['mode'] = draft.knowledge_slugs?.length
    ? 'documents'
    : draft.focus_area
      ? 'focus'
      : 'library';
  const missing = missingScenarioFields(draft);
  const scenario = missing.length ? null : draftToScenario(draft);
  if (!scenario) {
    return {
      missing,
      prompt: null,
      adminNotes,
      knowledge: { enabled: true, k: 4, mode, appliedFilter: {}, focusRelaxed: false, passages: [] },
    };
  }
  const appliedFilter: Record<string, unknown> = { tools: ['roleplay'] };
  if (draft.species) appliedFilter.species = [draft.species === 'cat' ? 'cat' : 'dog'];
  if (mode === 'focus') appliedFilter.focus = draft.focus_area;
  const passages =
    mode === 'documents'
      ? PASSAGES.filter((p) => p.slug && draft.knowledge_slugs?.includes(p.slug))
      : PASSAGES;
  return {
    missing: [],
    prompt: mockPrompt(scenario, draft),
    adminNotes,
    knowledge: {
      enabled: true,
      k: 4,
      mode,
      appliedFilter,
      focusRelaxed: false,
      passages,
    },
  };
}

// ── ai-roleplay / ai-evaluate (the Test drive) ───────────────────────────

const CUSTOMER_SCRIPT: Array<{ emotion: AiEmotion; text: string }> = [
  { emotion: 'red', text: "I hear you, but I really don't see the problem. We've been doing fine." },
  { emotion: 'red', text: "That's easy for you to say — you're not the one paying for it every month." },
  { emotion: 'yellow', text: "Okay… I didn't know it could make that much difference. What would it actually involve?" },
  { emotion: 'yellow', text: 'A trial with a recheck sounds more reasonable. What happens if it doesn\'t work?' },
  { emotion: 'green', text: "Alright, let's give it the twelve weeks and see how it goes. Thanks for explaining it properly." },
];

async function roleplayMock(body: Record<string, unknown>): Promise<RoleplayResponse> {
  await new Promise((r) => setTimeout(r, 600));
  const history = Array.isArray(body.history) ? (body.history as ChatMessage[]) : [];
  const scenario = (body.scenario ?? {}) as Partial<Scenario>;
  const userTurns =
    history.filter((m) => m?.role === 'user').length +
    (typeof body.userMessage === 'string' && body.userMessage.trim() ? 1 : 0);

  if (userTurns === 0) {
    const pushbackId = scenario.pushback?.id ?? 'cost';
    const opener =
      scenario.openingLine?.trim() ||
      (PUSHBACK_EXAMPLES[pushbackId] ?? '"It\'s too expensive for what it is."').replace(/^"|"$/g, '');
    return { message: { role: 'ai', text: opener, emotion: 'red', timestamp: Date.now() } };
  }
  const step = CUSTOMER_SCRIPT[Math.min(userTurns, CUSTOMER_SCRIPT.length) - 1];
  const text = userTurns >= 5 ? `${step.text}\n[END_SIMULATION]` : step.text;
  return { message: { role: 'ai', text, emotion: step.emotion, timestamp: Date.now() } };
}

async function evaluateMock(body: Record<string, unknown>): Promise<EvaluateResponse> {
  await new Promise((r) => setTimeout(r, 900));
  const transcript = Array.isArray(body.transcript) ? (body.transcript as ChatMessage[]) : [];
  const staffTurns = transcript.filter((m) => m?.role === 'user').length;
  const lift = Math.min(12, staffTurns * 3);
  const dims = {
    acknowledge: 74 + lift,
    clarify: 66 + lift,
    transform: 58 + lift,
    empathy: 78 + Math.round(lift / 2),
    rapport: 71 + Math.round(lift / 2),
  };
  // ACT pillars carry 70% of the weight, empathy + rapport the rest.
  const overall = Math.round(
    (dims.acknowledge + dims.clarify + dims.transform) * (0.7 / 3) +
      (dims.empathy + dims.rapport) * 0.15,
  );
  const report: ScoreReport = {
    ...dims,
    overall,
    band: overall >= 75 ? 'good' : overall >= 55 ? 'ok' : 'poor',
    critique:
      'You opened by genuinely naming the owner’s worry and asked a good question about the daily routine. ' +
      'The close was softer than it could be — the owner agreed, but no recheck date was set.',
    betterAlternative:
      '“How about we try it for twelve weeks and book a weigh-in now, so you can see the difference for yourself?”',
    perDimensionNotes: {
      acknowledge: 'Named the concern before answering it.',
      clarify: 'One open question; a second would have surfaced the treat habit.',
      transform: 'Offered a trial, but without a concrete next step.',
      empathy: 'Warm, unhurried tone throughout.',
      rapport: 'Used the pet’s name and kept it conversational.',
    },
    keyMoments: [
      { ts: '00:40', type: 'win', label: 'Acknowledged the worry', quote: 'It sounds like you really want him comfortable.' },
      { ts: '02:10', type: 'miss', label: 'No recheck booked', quote: "Let's see how it goes." },
    ],
    turnSentiment: transcript.map((m, idx) => ({
      idx,
      speaker: m.role === 'user' ? 'staff' : 'customer',
      sentiment: m.role === 'user' ? 0.4 : m.emotion === 'green' ? 0.6 : m.emotion === 'yellow' ? 0.1 : -0.5,
    })),
  };
  return { report, persisted: false };
}

// ── Saved scenario rows (gallery) ────────────────────────────────────────

function overrideRow(
  scenario_id: string,
  age: number,
  fields: Partial<ScenarioOverrideRow>,
): ScenarioOverrideRow {
  return {
    scenario_id,
    visible: false,
    sort_order: null,
    title_override: null,
    context_override: null,
    opening_line_override: null,
    difficulty_override: null,
    persona_override: null,
    prompt_prefix: null,
    prompt_suffix: null,
    card_title_override: null,
    card_subtitle_override: null,
    info_modal_title: null,
    info_modal_body: null,
    start_button_label: null,
    card_driver_override: null,
    breed: null,
    life_stage: null,
    pushback_id: null,
    pushback_notes: null,
    suggested_driver: null,
    weight_kg: null,
    species: null,
    focus_area: null,
    knowledge_slugs: null,
    deleted_at: null,
    created_by: ME,
    updated_by: ME,
    updated_at: ago(age),
    ...fields,
  };
}

const SCENARIO_ROWS: ScenarioOverrideRow[] = [
  overrideRow('admin:3f6c2a1e-8b7d-4c5e-9a10-2b3c4d5e6f70', 2 * DAY, {
    visible: true,
    sort_order: 1,
    species: 'dog',
    breed: 'Labrador Retriever',
    life_stage: 'Adult (3-7)',
    weight_kg: 41.5,
    pushback_id: 'weight-denial',
    pushback_notes: "He's not fat — he's just a big dog. All the Labs at the park look like him.",
    context_override:
      'Buddy is a 6-year-old Labrador weighing 41.5 kg — body condition 8/9. The vet recommended a weight-loss diet and a 12-week plan with monthly weigh-ins. The owner free-feeds and gives table scraps every evening.',
    suggested_driver: 'Activator',
    persona_override: 'Skeptical',
    difficulty_override: 3,
    opening_line_override: "Look, Buddy's not overweight. He's built like that — you should see his dad.",
    focus_area: 'weight',
    knowledge_slugs: ['study:davies-2024', 'clinical:reference'],
    card_title_override: 'Buddy is "just big-boned"',
    card_subtitle_override: 'A blunt owner who thinks the scale is wrong.',
    start_button_label: 'Start the visit',
    card_driver_override: 'Activator',
    info_modal_title: 'About this scenario',
    info_modal_body:
      'Practise acknowledging an owner who does not see a weight problem, then turn it into a concrete, low-pressure plan.',
    prompt_suffix: 'Only agree once the staff member proposes a specific recheck date.',
  }),
  overrideRow('admin:7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 5 * HOUR, {
    visible: false,
    species: 'cat',
    breed: 'Persian',
    life_stage: 'Senior (7+)',
    weight_kg: 4.6,
    pushback_id: 'rx-diet',
    pushback_notes: "She's eating her old food just fine — is this kidney food really necessary?",
    context_override:
      'Mochi is a 13-year-old Persian. Bloodwork at her senior check showed early kidney changes, and the vet recommended a renal diet with a recheck in three months. Her owner worries she will refuse anything new.',
    suggested_driver: 'Analyzer',
    persona_override: 'Anxious',
    difficulty_override: 2,
    focus_area: 'aging',
  }),
  overrideRow('admin:c0ffee00-1234-4abc-8def-0123456789ab', 40 * 60 * 1000, {
    visible: false,
    species: 'dog',
    breed: 'French Bulldog',
    pushback_id: 'cost',
  }),
  overrideRow('seed:1', 9 * DAY, {
    visible: true,
    card_title_override: 'The price of a good bag of food',
  }),
];

// ── Exports ──────────────────────────────────────────────────────────────

export const STUDIO_ROUTES: Record<string, unknown> = {
  'admin-scenario-overrides': SCENARIO_ROWS,
};

export const STUDIO_POST_HANDLERS: Record<
  string,
  (body: Record<string, unknown>) => unknown | Promise<unknown>
> = {
  'admin-scenario-agent': agentMock,
  'admin-scenario-inspect': inspectMock,
  'ai-roleplay': roleplayMock,
  'ai-evaluate': evaluateMock,
};
