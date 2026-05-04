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
  // ── Part 1 · Workplace dynamics ──────────────────────────────────────────
  {
    id: 1,
    part: 1,
    partLabel: 'Workplace dynamics',
    prompt: 'When a last-minute change is made to a project timeline, how do you typically respond?',
    options: [
      { letter: 'A', text: 'Easy going, flexible',                         driver: 'Harmonizer' },
      { letter: 'B', text: 'Confident, sure of yourself',                  driver: 'Activator' },
      { letter: 'C', text: 'Careful, wary',                                driver: 'Analyzer' },
      { letter: 'D', text: 'Persuasive, good at convincing others',        driver: 'Energizer' },
    ],
  },
  {
    id: 2,
    part: 1,
    partLabel: 'Workplace dynamics',
    prompt: 'Which trait best describes your approach to a busy Monday morning?',
    options: [
      { letter: 'A', text: 'Energetic, full of life',                      driver: 'Energizer' },
      { letter: 'B', text: 'Determined, focused',                          driver: 'Activator' },
      { letter: 'C', text: 'Diplomatic, good at saying the right thing',   driver: 'Harmonizer' },
      { letter: 'D', text: 'Hardworking, dedicated',                       driver: 'Analyzer' },
    ],
  },
  {
    id: 3,
    part: 1,
    partLabel: 'Workplace dynamics',
    prompt: 'In a brainstorming session, you tend to be:',
    options: [
      { letter: 'A', text: 'Deep thinking, logical',                       driver: 'Analyzer' },
      { letter: 'B', text: 'Fair, unbiased',                               driver: 'Activator' },
      { letter: 'C', text: 'Quick to act without thinking, spontaneous',   driver: 'Energizer' },
      { letter: 'D', text: 'Considerate, reflective',                      driver: 'Harmonizer' },
    ],
  },
  {
    id: 4,
    part: 1,
    partLabel: 'Workplace dynamics',
    prompt: 'What is your greatest strength when working in a high-pressure team?',
    options: [
      { letter: 'A', text: 'Resolved, persistent',                         driver: 'Activator' },
      { letter: 'B', text: 'Passionate, excited',                          driver: 'Energizer' },
      { letter: 'C', text: 'Reliable, consistent',                         driver: 'Analyzer' },
      { letter: 'D', text: 'Trustworthy, dependable',                      driver: 'Harmonizer' },
    ],
  },
  {
    id: 5,
    part: 1,
    partLabel: 'Workplace dynamics',
    prompt: 'How would your colleagues describe your general "vibe"?',
    options: [
      { letter: 'A', text: 'Difficult, demanding',                         driver: 'Activator' },
      { letter: 'B', text: 'Traditional, ordinary',                        driver: 'Analyzer' },
      { letter: 'C', text: 'Sociable, friendly',                           driver: 'Energizer' },
      { letter: 'D', text: 'Tolerant, understanding',                      driver: 'Harmonizer' },
    ],
  },

  // ── Part 2 · Communication & interaction ─────────────────────────────────
  {
    id: 6,
    part: 2,
    partLabel: 'Communication & interaction',
    prompt: 'When delivering a presentation or update, you are mostly:',
    options: [
      { letter: 'A', text: 'Happy, optimistic',                            driver: 'Energizer' },
      { letter: 'B', text: 'Relaxed, peaceful',                            driver: 'Harmonizer' },
      { letter: 'C', text: 'Brief, to the point',                          driver: 'Analyzer' },
      { letter: 'D', text: 'Powerful, strong',                             driver: 'Activator' },
    ],
  },
  {
    id: 7,
    part: 2,
    partLabel: 'Communication & interaction',
    prompt: 'How do you process new information in a meeting?',
    options: [
      { letter: 'A', text: 'Based on facts, true',                         driver: 'Analyzer' },
      { letter: 'B', text: 'Ambitious, motivated',                         driver: 'Activator' },
      { letter: 'C', text: 'Interesting, captivating',                     driver: 'Energizer' },
      { letter: 'D', text: 'Responding quickly, impulsive',                driver: 'Harmonizer' },
    ],
  },
  {
    id: 8,
    part: 2,
    partLabel: 'Communication & interaction',
    prompt: 'When helping a co-worker with a problem, you are:',
    options: [
      { letter: 'A', text: 'Compassionate, caring',                        driver: 'Harmonizer' },
      { letter: 'B', text: 'Thorough, precise',                            driver: 'Analyzer' },
      { letter: 'C', text: 'Driven, enthusiastic',                         driver: 'Activator' },
      { letter: 'D', text: 'Eager to win, ambitious',                      driver: 'Energizer' },
    ],
  },
  {
    id: 9,
    part: 2,
    partLabel: 'Communication & interaction',
    prompt: 'Which of these is your priority during a group project?',
    options: [
      { letter: 'A', text: 'Correct, precise',                             driver: 'Analyzer' },
      { letter: 'B', text: 'Sure, confident',                              driver: 'Activator' },
      { letter: 'C', text: 'Hopeful, positive',                            driver: 'Energizer' },
      { letter: 'D', text: 'Willing to work together, helpful',            driver: 'Harmonizer' },
    ],
  },
  {
    id: 10,
    part: 2,
    partLabel: 'Communication & interaction',
    prompt: 'When you disagree with a peer, you remain:',
    options: [
      { letter: 'A', text: 'Agreeable, easy to deal with',                 driver: 'Harmonizer' },
      { letter: 'B', text: 'Convincing, good at arguing',                  driver: 'Energizer' },
      { letter: 'C', text: 'Strong, determined',                           driver: 'Activator' },
      { letter: 'D', text: 'Reasonable, sensible',                         driver: 'Analyzer' },
    ],
  },

  // ── Part 3 · Personal style & values ─────────────────────────────────────
  {
    id: 11,
    part: 3,
    partLabel: 'Personal style & values',
    prompt: 'In a leadership role, you lean toward being:',
    options: [
      { letter: 'A', text: 'Controlling, bossy',                           driver: 'Activator' },
      { letter: 'B', text: 'Powerful, good at influencing others',         driver: 'Energizer' },
      { letter: 'C', text: 'Skilled at dealing with people, tactful',      driver: 'Analyzer' },
      { letter: 'D', text: 'Obedient, willing to do what others say',      driver: 'Harmonizer' },
    ],
  },
  {
    id: 12,
    part: 3,
    partLabel: 'Personal style & values',
    prompt: 'How do you handle a personal setback?',
    options: [
      { letter: 'A', text: 'Organised, methodical',                        driver: 'Analyzer' },
      { letter: 'B', text: 'Determined, stubborn',                         driver: 'Activator' },
      { letter: 'C', text: 'Optimistic, hopeful',                          driver: 'Energizer' },
      { letter: 'D', text: 'Easily hurt, emotional',                       driver: 'Harmonizer' },
    ],
  },
  {
    id: 13,
    part: 3,
    partLabel: 'Personal style & values',
    prompt: 'At a professional networking event, you are:',
    options: [
      { letter: 'A', text: 'Comfortable in company, outgoing',             driver: 'Energizer' },
      { letter: 'B', text: 'Kind, considerate',                            driver: 'Harmonizer' },
      { letter: 'C', text: 'Brave, fearless',                              driver: 'Activator' },
      { letter: 'D', text: 'Thoughtful, careful',                          driver: 'Analyzer' },
    ],
  },
  {
    id: 14,
    part: 3,
    partLabel: 'Personal style & values',
    prompt: 'When finishing a task, your main focus is being:',
    options: [
      { letter: 'A', text: 'Someone who wants everything to be perfect',   driver: 'Analyzer' },
      { letter: 'B', text: 'Practical, sensible',                          driver: 'Activator' },
      { letter: 'C', text: 'Faithful, supportive',                         driver: 'Harmonizer' },
      { letter: 'D', text: 'Flexible, able to change',                     driver: 'Energizer' },
    ],
  },
  {
    id: 15,
    part: 3,
    partLabel: 'Personal style & values',
    prompt: 'If you were to choose one word to describe your work ethic, it would be:',
    options: [
      { letter: 'A', text: 'Exact, accurate',                              driver: 'Analyzer' },
      { letter: 'B', text: 'Brave, adventurous',                           driver: 'Activator' },
      { letter: 'C', text: 'Kind, welcoming',                              driver: 'Harmonizer' },
      { letter: 'D', text: 'Enjoyable, entertaining',                      driver: 'Energizer' },
    ],
  },
]

export interface TieBreaker {
  prompt: string
  options: QuizOption[]
}

export const TIE_BREAKER: TieBreaker = {
  prompt: 'If you had to lead a project tomorrow, which is your absolute priority?',
  options: [
    { letter: 'A', text: 'Reaching the goal as fast as possible.',                        driver: 'Activator' },
    { letter: 'B', text: 'Ensuring the team are vibrant and connected.',                   driver: 'Energizer' },
    { letter: 'C', text: 'Making sure every detail is flawless and logical.',              driver: 'Analyzer' },
    { letter: 'D', text: 'Ensuring the process is stable and everyone is supported.',      driver: 'Harmonizer' },
  ],
}
