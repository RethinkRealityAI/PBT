import type { DriverKey } from '../design-system/tokens'

export interface QuizOption {
  letter: 'A' | 'B' | 'C' | 'D'
  text: string
  driver: DriverKey
}

export interface QuizQuestion {
  id: number
  part: 1 | 2 | 3
  partLabel: string
  prompt: string
  options: QuizOption[]
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // ── Part 1 · How you work ────────────────────────────────────────────────
  {
    id: 1,
    part: 1,
    partLabel: 'How you work',
    prompt: 'When an appointment slot gets reshuffled at the last minute, you tend to be:',
    options: [
      { letter: 'A', text: 'Go with the flow — no fuss',                         driver: 'Harmonizer' },
      { letter: 'B', text: 'On it straight away — decisive',                      driver: 'Activator' },
      { letter: 'C', text: 'A bit cautious until you know the full picture',      driver: 'Analyzer' },
      { letter: 'D', text: 'Good at rallying the team around the change',         driver: 'Energizer' },
    ],
  },
  {
    id: 2,
    part: 1,
    partLabel: 'How you work',
    prompt: 'On a hectic morning with a packed waiting room, you\'re usually:',
    options: [
      { letter: 'A', text: 'Buzzing — the energy actually fires you up',          driver: 'Energizer' },
      { letter: 'B', text: 'Locked in, moving fast, getting it done',             driver: 'Activator' },
      { letter: 'C', text: 'Calm and steady, keeping everyone at ease',           driver: 'Harmonizer' },
      { letter: 'D', text: 'Focused, working through it methodically',            driver: 'Analyzer' },
    ],
  },
  {
    id: 3,
    part: 1,
    partLabel: 'How you work',
    prompt: 'When the team is working out a better approach to something, you tend to:',
    options: [
      { letter: 'A', text: 'Think it through carefully before speaking up',       driver: 'Analyzer' },
      { letter: 'B', text: 'Cut straight to what actually makes sense',           driver: 'Activator' },
      { letter: 'C', text: 'Jump in with ideas — you\'ll sort the detail later',  driver: 'Energizer' },
      { letter: 'D', text: 'Listen first and make sure everyone gets heard',      driver: 'Harmonizer' },
    ],
  },
  {
    id: 4,
    part: 1,
    partLabel: 'How you work',
    prompt: 'When the clinic is stretched and things get stressful, your strongest quality is:',
    options: [
      { letter: 'A', text: 'Pushing through without losing momentum',             driver: 'Activator' },
      { letter: 'B', text: 'Keeping the mood from sinking',                       driver: 'Energizer' },
      { letter: 'C', text: 'Staying accurate even when things are chaotic',       driver: 'Analyzer' },
      { letter: 'D', text: 'Being the person people know they can count on',      driver: 'Harmonizer' },
    ],
  },
  {
    id: 5,
    part: 1,
    partLabel: 'How you work',
    prompt: 'If a colleague had to describe you in the break room, they\'d most likely say:',
    options: [
      { letter: 'A', text: 'Direct — just gets straight to the point',            driver: 'Activator' },
      { letter: 'B', text: 'Reliable — never cutting corners',                    driver: 'Analyzer' },
      { letter: 'C', text: 'Fun — always chatting, always upbeat',                driver: 'Energizer' },
      { letter: 'D', text: 'Easy to talk to — really listens',                    driver: 'Harmonizer' },
    ],
  },

  // ── Part 2 · How you connect ─────────────────────────────────────────────
  {
    id: 6,
    part: 2,
    partLabel: 'How you connect',
    prompt: 'When you\'re explaining something to a client or running the team through an update, you\'re mostly:',
    options: [
      { letter: 'A', text: 'Warm and enthusiastic — you want them to feel good about it',    driver: 'Energizer' },
      { letter: 'B', text: 'Calm and clear — no drama, just reassurance',                    driver: 'Harmonizer' },
      { letter: 'C', text: 'Clear and precise — just the facts they need',                   driver: 'Analyzer' },
      { letter: 'D', text: 'Confident and direct — you get to the point fast',               driver: 'Activator' },
    ],
  },
  {
    id: 7,
    part: 2,
    partLabel: 'How you connect',
    prompt: 'When someone raises a new idea in a team huddle, your first instinct is to:',
    options: [
      { letter: 'A', text: 'Ask what the evidence actually says',                 driver: 'Analyzer' },
      { letter: 'B', text: 'Figure out if it\'s realistic and worth doing',       driver: 'Activator' },
      { letter: 'C', text: 'Get excited — you\'re already thinking possibilities', driver: 'Energizer' },
      { letter: 'D', text: 'React in the moment — you trust your gut feel',       driver: 'Harmonizer' },
    ],
  },
  {
    id: 8,
    part: 2,
    partLabel: 'How you connect',
    prompt: 'When a colleague is stuck on something, the first thing you do is:',
    options: [
      { letter: 'A', text: 'Make sure they feel heard before you offer anything', driver: 'Harmonizer' },
      { letter: 'B', text: 'Walk through it step by step until it\'s sorted',    driver: 'Analyzer' },
      { letter: 'C', text: 'Help them find the quickest path forward',            driver: 'Activator' },
      { letter: 'D', text: 'Give them a boost and tackle it together with energy', driver: 'Energizer' },
    ],
  },
  {
    id: 9,
    part: 2,
    partLabel: 'How you connect',
    prompt: 'When you\'re part of a group effort, the thing you care most about is:',
    options: [
      { letter: 'A', text: 'Getting it right — accuracy and thoroughness matter', driver: 'Analyzer' },
      { letter: 'B', text: 'Getting it done — results speak for themselves',      driver: 'Activator' },
      { letter: 'C', text: 'Keeping things positive and moving forward',          driver: 'Energizer' },
      { letter: 'D', text: 'Making sure no one feels left out or unsupported',    driver: 'Harmonizer' },
    ],
  },
  {
    id: 10,
    part: 2,
    partLabel: 'How you connect',
    prompt: 'When you don\'t see eye to eye with someone at work, you tend to stay:',
    options: [
      { letter: 'A', text: 'Agreeable — you\'d rather find common ground than dig in', driver: 'Harmonizer' },
      { letter: 'B', text: 'Persuasive — you\'re pretty good at bringing people around', driver: 'Energizer' },
      { letter: 'C', text: 'Firm — you hold your ground when you believe you\'re right', driver: 'Activator' },
      { letter: 'D', text: 'Measured — you stick to logic and what the evidence says',   driver: 'Analyzer' },
    ],
  },

  // ── Part 3 · Who you are ─────────────────────────────────────────────────
  {
    id: 11,
    part: 3,
    partLabel: 'Who you are',
    prompt: 'When you\'re the one taking charge of a situation, you naturally lean toward being:',
    options: [
      { letter: 'A', text: 'Direct — you take ownership and move things along',   driver: 'Activator' },
      { letter: 'B', text: 'Inspiring — you bring the energy and take people with you', driver: 'Energizer' },
      { letter: 'C', text: 'Thoughtful — you map out the best path before committing', driver: 'Analyzer' },
      { letter: 'D', text: 'Supportive — you make sure everyone feels settled',   driver: 'Harmonizer' },
    ],
  },
  {
    id: 12,
    part: 3,
    partLabel: 'Who you are',
    prompt: 'When something goes wrong — at work or in life — you usually:',
    options: [
      { letter: 'A', text: 'Break it down and work out what to do differently next time', driver: 'Analyzer' },
      { letter: 'B', text: 'Shake it off and keep going — dwelling doesn\'t help', driver: 'Activator' },
      { letter: 'C', text: 'Look for the upside — there\'s always something',     driver: 'Energizer' },
      { letter: 'D', text: 'Let yourself feel it — you need a moment to reset',   driver: 'Harmonizer' },
    ],
  },
  {
    id: 13,
    part: 3,
    partLabel: 'Who you are',
    prompt: 'At a CPD day or industry event with people you haven\'t met, you\'re typically:',
    options: [
      { letter: 'A', text: 'In the mix — you like meeting people and dive right in', driver: 'Energizer' },
      { letter: 'B', text: 'Warm and welcoming — you put others at ease first',   driver: 'Harmonizer' },
      { letter: 'C', text: 'Confident — you introduce yourself and get talking',  driver: 'Activator' },
      { letter: 'D', text: 'Happy to observe first and connect more selectively', driver: 'Analyzer' },
    ],
  },
  {
    id: 14,
    part: 3,
    partLabel: 'Who you are',
    prompt: 'When you\'re wrapping up a task, what matters most to you is:',
    options: [
      { letter: 'A', text: 'That it was done properly — every detail checked',   driver: 'Analyzer' },
      { letter: 'B', text: 'That it got done — efficiently and without overthinking', driver: 'Activator' },
      { letter: 'C', text: 'That the people depending on you feel good about it', driver: 'Harmonizer' },
      { letter: 'D', text: 'That it\'s done — now on to the next thing',         driver: 'Energizer' },
    ],
  },
  {
    id: 15,
    part: 3,
    partLabel: 'Who you are',
    prompt: 'The thing that really drives you at work, more than anything else, is:',
    options: [
      { letter: 'A', text: 'Precision — doing it right, not just fast',           driver: 'Analyzer' },
      { letter: 'B', text: 'Progress — always moving things forward',             driver: 'Activator' },
      { letter: 'C', text: 'Connection — being genuinely there for the people around you', driver: 'Harmonizer' },
      { letter: 'D', text: 'Energy — bringing enthusiasm to whatever you do',     driver: 'Energizer' },
    ],
  },
]

export interface TieBreaker {
  prompt: string
  options: QuizOption[]
}

export const TIE_BREAKER: TieBreaker = {
  prompt: 'You\'ve got a full morning roster and one unexpected admission walks in. Your instinct is to:',
  options: [
    { letter: 'A', text: 'Sort the priority fast and adjust everything else around it.',              driver: 'Activator' },
    { letter: 'B', text: 'Rally the team — you\'ll figure it out together, and it\'ll be fine.',     driver: 'Energizer' },
    { letter: 'C', text: 'Work through the options carefully so nothing gets missed.',                driver: 'Analyzer' },
    { letter: 'D', text: 'Make sure everyone — patient and owner — feels calm and looked after.',    driver: 'Harmonizer' },
  ],
}
