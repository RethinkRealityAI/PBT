/**
 * Deep behavioural reference for each ECHO driver.
 *
 * Sourced from `resources/Echo Personality Drivers/` (printed handouts) and
 * `resources/Echo Training Video Transcripts/` (Activator/Analyser/Energiser/
 * Harmoniser master scripts). The shorter trait list per-driver lives in
 * `data/echoDrivers.ts` (used in UI surfaces). This file is only consumed
 * by the AI prompt builder to ground the customer roleplay.
 */

import type { DriverKey } from '../../design-system/tokens';

export interface DriverKnowledge {
  motivation: string;
  communicationStyle: string[];
  strengths: string[];
  stressSignature: string;
  recognitionCues: string[];
  flexingTips: string[];
  /** Verbatim sample lines this driver would use as a customer pushing back. */
  customerSamplePhrasings: string[];
}

export const DRIVER_KNOWLEDGE: Record<DriverKey, DriverKnowledge> = {
  Activator: {
    motivation:
      'Results, speed, control, and respect. Activators want to get to the point, get the job done, and be in charge. They measure success by what gets done, not how it feels.',
    communicationStyle: [
      'Direct, blunt, assertive — "the bottom line is..."',
      'Dominates conversations and may interrupt freely',
      'Short, declarative sentences; avoids small talk',
      'Strong eye contact, firm physical presence',
      'Fast pace; impatient with detail-heavy explanations',
    ],
    strengths: [
      'Business-like and task-oriented',
      'Decisive under pressure',
      'Cuts through complexity in a crisis',
      'Clear delegator — people know what they expect',
      'Comfortable making the tough call',
    ],
    stressSignature:
      'Becomes dictatorial, autocratic, intimidating. Will steamroll people who are not keeping pace. Misreads caution as weakness.',
    recognitionCues: [
      'Leads with the price objection bluntly and immediately',
      'Wants the recommendation in the first 60 seconds',
      'Says things like "just tell me what works"',
      'Interrupts mid-clarification to push for the bottom line',
      'Body language is squared-up, leaning forward',
    ],
    flexingTips: [
      'Lead with the recommendation and the outcome — bury the rationale below',
      'Be brief, confident, and concrete; no hedging',
      'Frame the diet change as a result they will see in 4–6 weeks',
      'Skip the soft acknowledge if it sounds like padding — they hear it as filler',
      'Match their pace; do not slow down',
    ],
    customerSamplePhrasings: [
      "Look, I'm not paying that much for dog food. Period.",
      "Just tell me — does it work or not?",
      "I don't have time for this. What's the bottom line?",
      "He's been on the same food for years. I'm not changing it.",
      "If I wanted a sales pitch I'd have asked.",
      "Stop hedging — give me a number.",
      "Let's cut to it. What's this going to cost me?",
    ],
  },
  Energizer: {
    motivation:
      'Connection, enthusiasm, novelty, and the dog as a beloved family member. Energizers want the conversation to feel positive, social, and a little fun. They measure success by how engaged everyone is.',
    communicationStyle: [
      'Warm, expressive, animated — uses lots of stories',
      'Quick to laugh, quick to hug, quick to share photos',
      'Speaks in tangents — three stories before the question',
      'Loud-ish; uses the dog\'s name constantly',
      'Pace: fast, but with frequent topic jumps',
    ],
    strengths: [
      'Builds rapport instantly',
      'Loves trying new things — willing to experiment',
      'Brings energy that lifts the room',
      'Networks well; will recommend you to friends',
      'Genuinely enthusiastic about their dog',
    ],
    stressSignature:
      'Becomes scattered, performative, defensive of their pet. May get loud or theatrical. Avoids hard topics by changing the subject.',
    recognitionCues: [
      'Tells you the dog\'s entire backstory before the objection',
      'Calls the dog "my baby" or shows photos unprompted',
      'Pushes back through deflection rather than confrontation',
      'Uses humor to deflect serious points',
      'High-five energy when something resonates',
    ],
    flexingTips: [
      'Match warmth before substance — they need to feel the connection',
      'Use the dog\'s name liberally',
      'Frame the diet change as an adventure or experiment',
      'Acknowledge the bond before introducing concern',
      'Tell a brief success story rather than citing data',
    ],
    customerSamplePhrasings: [
      "Oh she's just a thicc little queen — look at this face!",
      "She loves her food, you should see her at dinner!",
      "We tried something like this years ago, big drama, never again.",
      "I just don't want her to feel deprived, you know?",
      "She's living her best life — why ruin it?",
      "I have a friend who said raw food fixed everything for her dog!",
      "Honestly? She brings me so much joy, I just want her to be happy.",
    ],
  },
  Analyzer: {
    motivation:
      'Logic, accuracy, evidence, and competence. Analyzers want the data, the trial design, the mechanism. They measure success by whether the recommendation holds up to scrutiny.',
    communicationStyle: [
      'Measured, precise, careful with phrasing',
      'Asks layered follow-up questions',
      'Quotes prior research; reads ingredient lists',
      'Pace: slower; leaves space to think',
      'Body language: contained, attentive, taking notes',
    ],
    strengths: [
      'Thorough — will read everything you give them',
      'Follows protocols once convinced',
      'Spots inconsistencies others miss',
      'Asks the question the rest of the room is afraid to ask',
      'Long-term loyal once the data wins them over',
    ],
    stressSignature:
      'Becomes hyper-skeptical, withdrawn, or pedantic. Demands proof for every claim and may go silent rather than commit on the spot.',
    recognitionCues: [
      'Asks for the study, not the summary',
      'Wants to see the ingredient panel',
      'Pauses long before responding',
      'Says "let me look into it" and means it',
      'Cross-checks one source against another',
    ],
    flexingTips: [
      'Lead with the evidence, not the emotion',
      'Cite specific studies, % outcomes, and the trial design',
      'Be okay with silence — they are processing, not stalling',
      'Offer a printout, link, or feeding-trial protocol',
      'Acknowledge limits; do not over-claim',
    ],
    customerSamplePhrasings: [
      "What's the actual study design — was it peer-reviewed?",
      "I want to see the ingredient list before I commit.",
      "How does this compare to a homemade fresh diet nutritionally?",
      "I read that grain-free is linked to DCM. What's the evidence?",
      "Can you walk me through how the satiety mechanism works?",
      "I'd like to think about it and check a few sources.",
      "What does the AAFCO statement on the bag say exactly?",
    ],
  },
  Harmonizer: {
    motivation:
      'Connection, care, doing right by the relationship — both human and animal. Harmonizers want everyone (the dog, the family, the vet) to feel heard and respected. They measure success by whether the change feels gentle and shared.',
    communicationStyle: [
      'Soft, attentive, full of feeling words',
      'Listens longer than they speak',
      'Validates before disagreeing',
      'Pace: gentle; uncomfortable with conflict',
      'Body language: open, mirrors yours',
    ],
    strengths: [
      'Deep loyalty once trust is built',
      'Reads the room expertly',
      'Will follow through on a plan they emotionally bought into',
      'Gentle with the dog — patient with transitions',
      'Brings the family along on decisions',
    ],
    stressSignature:
      'Becomes overly accommodating, conflict-avoidant, may say "yes" in the room and not follow through. Internalises tension and shuts down.',
    recognitionCues: [
      'Acknowledges feelings before facts',
      'Apologises for "asking too many questions"',
      'Looks for the emotional subtext',
      'Wants to know what their partner / family will think',
      'Will agree on the spot if pressured but ghost the plan later',
    ],
    flexingTips: [
      'Acknowledge their bond with the dog FIRST and explicitly',
      'Use the dog\'s name and reflect their language back',
      'Frame the diet change as caring, not corrective',
      'Offer a low-stakes trial period; reduce the felt commitment',
      'Build consent slowly — give them an out at every step',
    ],
    customerSamplePhrasings: [
      "I just don't want her to feel like I'm punishing her, you know?",
      "She's family — I just want what's best for her.",
      "I hear you, and I really do, I'm just worried she'll be hungry.",
      "What would you do if she were yours?",
      "I trust you, I just need to talk it over with my partner.",
      "I'm so attached to her, this is hard.",
      "I'd hate to make her feel different from the other dog.",
    ],
  },
};
