/**
 * ACT Guide screen — CHROME ONLY.
 *
 * The canonical ACT step content (labels, goals, techniques, do/don't
 * examples) lives in `src/data/knowledge/actGuide.ts` and is localised by the
 * data-catalog layer, NOT here. What lives here is screen copy that only
 * exists inside `ActGuideScreen.tsx`: section eyebrows, the step blurbs and
 * example phrases written for this screen, the driver × ACT tips, and the
 * worked example.
 *
 * Glossary: "ACT" stays as-is; the spelled-out steps are
 * Acknowledge / Clarify / Transform → Reconnaître / Clarifier / Transformer.
 * ECHO driver names (Activator, Energizer, Analyzer, Harmonizer) never
 * localise.
 */
export const actGuide = {
  'actGuide.title': 'ACT Guide',
  'actGuide.framework': 'Framework',
  'actGuide.subtitle': 'Acknowledge · Clarify · Transform',
  'actGuide.intro':
    'A proven 3-step framework for turning client pushback into meaningful conversations.',
  'actGuide.threeSteps': 'The three steps',

  // Mono/uppercase step labels used by the cards, the SVG diagram and the
  // worked example. Rendered uppercase by CSS in the cards.
  'actGuide.step.acknowledge.label': 'ACKNOWLEDGE',
  'actGuide.step.clarify.label': 'CLARIFY',
  'actGuide.step.takeAction.label': 'TRANSFORM',

  'actGuide.step.acknowledge.description':
    "Don't apologise — show empathy, not weakness. Validate the feeling before anything else.",
  'actGuide.step.clarify.description':
    'Ask one open question at a time. Let them talk. Listen for the real concern beneath the objection.',
  'actGuide.step.takeAction.description':
    'Redirect to value. Lead with the outcome, anchor it to a specific product benefit, and set a defined next step.',

  'actGuide.step.acknowledge.phrase':
    '"I hear you — Bella clearly means the world to you."',
  'actGuide.step.clarify.phrase':
    '"Walk me through her day — how much exercise does she get?"',
  'actGuide.step.takeAction.phrase':
    '"Let\'s do a 4-week trial. 97% of dogs lost weight in 12 weeks — I\'ll check in at week two."',

  'actGuide.stepIndex': 'Step {index} · {label}',
  'actGuide.examplePhrase': 'Example phrase',

  // ── Driver × ACT ──────────────────────────────────────────
  'actGuide.driverSection': 'Your driver & ACT',
  'actGuide.driverLabel': 'Your Driver · {driver}',
  'actGuide.driverTip.Activator':
    'Your energy is your superpower in ACT. Lead with a confident, direct acknowledgement — clients feel your conviction. In Clarify, ask bold questions that get to the real issue fast. In Transform, paint a vivid picture of success to inspire action.',
  'actGuide.driverTip.Energizer':
    'Your natural enthusiasm makes Acknowledge feel warm and genuine — clients open up to you. Use Clarify to deepen that connection with curious, open questions. In Transform, bring your storytelling flair: share a relatable example that makes the value proposition land emotionally.',
  'actGuide.driverTip.Analyzer':
    'Precision is your edge in ACT. Your Acknowledge should be measured and specific — mirror their exact words back. Clarify with data-minded questions that uncover the root concern. In Transform, lead with evidence: facts, case studies, and clear ROI make your value proposition irresistible.',
  'actGuide.driverTip.Harmonizer':
    'Empathy is baked into your Acknowledge — clients feel genuinely heard. Use Clarify gently, focusing on what matters most to the relationship. In Transform, frame value around partnership and long-term outcomes; Harmonizers close with care, not pressure.',
  'actGuide.practiceCta': 'Practice in Simulator',

  // ── Worked example ────────────────────────────────────────
  'actGuide.exampleSection': 'Example in practice',
  'actGuide.example.objectionLabel': 'Client objection',
  'actGuide.example.objection':
    '"Your pricing is too high — I can get similar food at the supermarket for half the price!"',
  'actGuide.example.acknowledge':
    '"I completely understand — budget is a real factor, and you clearly want the best for Max."',
  'actGuide.example.clarify':
    '"What would make you feel confident that a food change is worth it for him?"',
  'actGuide.example.takeAction':
    '"Based on what you\'ve shared, Satiety Support is built for exactly this — 97% of dogs lost weight in 12 weeks. Let\'s do a 4-week trial."',
} as const;
