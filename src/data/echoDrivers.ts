import type { DriverKey } from '../design-system/tokens'

export interface DriverTrait {
  name: string
  description: string
}

export interface EchoDriver {
  key: DriverKey
  name: string
  motto?: string
  tagline: string
  blurb: string
  traits: DriverTrait[]
  growth: string
  color: string
  accent: string
  soft: string
}

export const ECHO_DRIVERS: Record<DriverKey, EchoDriver> = {
  Activator: {
    key: 'Activator',
    name: 'Activator',
    tagline: 'Clear expectations, swift action',
    color: 'oklch(0.62 0.22 25)',
    accent: 'oklch(0.52 0.24 22)',
    soft: 'oklch(0.92 0.06 22)',
    blurb: 'You move conversations forward with confidence. Owners know exactly what to do next, and they trust your certainty.',
    traits: [
      { name: 'Master Delegator',      description: 'You assign next steps cleanly — no hedging, no soft-pedal. Clients leave with a plan.' },
      { name: 'Progress Enforcer',     description: 'You monitor follow-through and intervene quickly to keep care on track.' },
      { name: 'Decisive Authority',    description: "You're comfortable making tough recommendations, prioritizing care over popularity." },
      { name: 'Unwavering Control',    description: 'You address pushback to your guidance swiftly, keeping the conversation focused.' },
      { name: 'Clarity Reigns Supreme', description: 'Your direct communication style ensures every owner walks out with the same message.' },
    ],
    growth: 'Watch for: speed at the cost of warmth. Slow your first 30 seconds and name the worry before naming the plan.',
  },
  Energizer: {
    key: 'Energizer',
    name: 'Energizer',
    tagline: 'Motivation through positivity',
    color: 'oklch(0.85 0.16 95)',
    accent: 'oklch(0.65 0.16 80)',
    soft: 'oklch(0.96 0.08 95)',
    blurb: 'You bring warmth and momentum into every interaction. Owners feel safe asking the awkward question.',
    traits: [
      { name: 'Team Spirit Champion',     description: 'You build a positive room within the first ten seconds of a conversation.' },
      { name: 'Natural Motivator',        description: 'Humor is your superpower — owners leave feeling lifted, not lectured.' },
      { name: 'Relationship Builder',     description: 'Strong client connections are the foundation of how you practice.' },
      { name: 'Conflict Diffuser',        description: 'You skillfully use humor to de-escalate tension when pushback gets sharp.' },
      { name: 'Enthusiasm Multiplier',    description: 'Your positive energy inspires owners to follow through on the plan.' },
    ],
    growth: 'Watch for: glossing over real concerns to keep the room warm. Slow down and name the worry out loud.',
  },
  Analyzer: {
    key: 'Analyzer',
    name: 'Analyzer',
    tagline: 'Quality first, comfort with details',
    color: 'oklch(0.72 0.14 235)',
    accent: 'oklch(0.55 0.18 245)',
    soft: 'oklch(0.94 0.05 235)',
    blurb: 'You ground every recommendation in evidence. Skeptical owners leave convinced because the math is right there.',
    traits: [
      { name: 'Excellence Advocate',       description: 'You prioritize meticulous work and encourage owners to ask the deeper question.' },
      { name: 'Quality Over Speed',        description: "You'd rather a 4-minute conversation that lands than a 90-second one that doesn't." },
      { name: 'Constructive Coaching',     description: 'You give thoughtful feedback focused on solutions, not direct confrontation.' },
      { name: 'Logic Reigns',              description: 'When emotions run high, you bring the conversation back to the data.' },
      { name: 'Empowerment Through Trust', description: 'You recognize and empower the owners who match your focus on quality.' },
    ],
    growth: "Watch for: too much detail, too soon. Lead with the headline; reserve the evidence for when it's asked for.",
  },
  Harmonizer: {
    key: 'Harmonizer',
    name: 'Harmonizer',
    tagline: 'Building trust for peak care',
    color: 'oklch(0.70 0.18 145)',
    accent: 'oklch(0.55 0.18 145)',
    soft: 'oklch(0.94 0.06 145)',
    blurb: 'You meet owners where they are. They feel heard before they feel sold to — which is why they listen.',
    traits: [
      { name: 'Team Advocate',              description: 'You champion the well-being of every pet and owner in front of you.' },
      { name: 'Relationship Builder',       description: 'Your follow-up calls land because the relationship is already real.' },
      { name: 'Fairness Champion',          description: 'You ensure clients feel treated equitably, never pressured into a decision.' },
      { name: 'Motivational Boost',         description: 'By fostering owner self-esteem, you empower them to follow through.' },
      { name: 'Strength in Collaboration',  description: 'You invite owners into the plan instead of handing it to them.' },
    ],
    growth: 'Watch for: under-pushing when an owner needs a clear, decisive recommendation. Practice the firm ask.',
  },
}

export const ECHO_DRIVER_LIST: EchoDriver[] = [
  ECHO_DRIVERS.Activator,
  ECHO_DRIVERS.Energizer,
  ECHO_DRIVERS.Analyzer,
  ECHO_DRIVERS.Harmonizer,
]
