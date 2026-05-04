/**
 * Customer pushback categories with root concerns and ACT response patterns.
 * Used to ground the AI both as customer (which concerns to surface) and as
 * coach (what response patterns to look for in the staff turn).
 *
 * Sourced from "Pet Owner Push Back.xlsx" and ACT training materials in
 * `resources/Pet Nutritional Guide and Info/`.
 */

export interface PushbackKnowledge {
  id: string;
  title: string;
  /** Verbatim example phrasings a customer might lead with. */
  examples: string[];
  /** What the customer actually fears beneath the surface. */
  rootConcerns: string[];
  /** ACT-aligned recommended response patterns. */
  acknowledgePatterns: string[];
  clarifyQuestions: string[];
  takeActionPatterns: string[];
  /** Common staff failure modes — for the coach to call out. */
  watchOuts: string[];
}

export const PUSHBACK_KNOWLEDGE: Record<string, PushbackKnowledge> = {
  cost: {
    id: 'cost',
    title: 'Cost objection on a Rx diet',
    examples: [
      "It's way too expensive.",
      "I can get something almost as good for half the price.",
      "Can you just tell me a cheaper alternative?",
      "Sixty bucks for dog food? Come on.",
    ],
    rootConcerns: [
      'Concerns about ongoing affordability, not one-time spend',
      'Suspicion that prescription branding is a markup',
      'Feeling judged for previously feeding cheaper food',
      'Fear of being upsold by the clinic',
    ],
    acknowledgePatterns: [
      'Validate the cost without minimising it: "It is a real expense, you\'re right."',
      'Name the trust gap: "I\'d want to know what makes it worth it too."',
      'Reflect the dog\'s name back to anchor the conversation in care',
    ],
    clarifyQuestions: [
      'What does her current food cost per day?',
      'How long has she been at this weight?',
      'What would change for you if she lost the weight in 12 weeks?',
      'How long have you been thinking about her weight?',
    ],
    takeActionPatterns: [
      'Reframe price into cost-per-day, not bag-price',
      'Cite the 97% / 12-week clinical evaluation as the value anchor',
      'Offer a 4-week trial commitment, not a 6-month one',
      'Tie the diet change to fewer future vet visits, joint care savings',
    ],
    watchOuts: [
      'Do not say "I understand, but..." — it negates the acknowledge',
      'Do not pitch before clarifying daily feeding cost',
      'Do not compare on protein% alone — clients hear that as deflection',
    ],
  },
  'breeder-advice': {
    id: 'breeder-advice',
    title: 'Breeder told them otherwise',
    examples: [
      "My breeder said this brand for the first two years.",
      "The breeder fed her parents this and they were fine.",
      "Breeder swears by raw — said kibble is the worst thing.",
    ],
    rootConcerns: [
      'Loyalty and trust toward a known person',
      'Sense that vet recommendations are "salesy" by comparison',
      'Lineage / pedigree pride',
      'Confusion when sources conflict',
    ],
    acknowledgePatterns: [
      'Honor the breeder relationship: "It makes sense to trust someone who knew her parents."',
      'Avoid implying the breeder is wrong; instead introduce a new lens',
    ],
    clarifyQuestions: [
      'How does she look and feel today, in your eyes?',
      'Has the breeder seen her recently?',
      'What did the breeder think the goal was at this stage of her life?',
    ],
    takeActionPatterns: [
      'Frame the diet as the next chapter, not a contradiction',
      'Cite life-stage nutrition: what worked at 8 weeks differs at 8 years',
      'Offer to share the WSAVA assessment with both you and the breeder',
    ],
    watchOuts: [
      'Do not contradict the breeder directly',
      'Do not call raw "dangerous" without explaining why',
    ],
  },
  'raw-food': {
    id: 'raw-food',
    title: 'Convinced raw is best',
    examples: [
      "Raw is what their ancestors ate.",
      "I read that kibble causes cancer.",
      "He gets a fresh meal every day — kibble feels lazy.",
    ],
    rootConcerns: [
      'Distrust of "processed" foods',
      'Influence of online communities',
      'Genuine love expressed through preparation effort',
      'Fear of being a "lazy" pet owner',
    ],
    acknowledgePatterns: [
      'Honor the effort and intention',
      'Validate the desire to feed "real food"',
    ],
    clarifyQuestions: [
      'What does a typical day of meals look like for him?',
      'Have you had any concerns about completeness?',
      'What\'s your sourcing — same butcher, varied?',
    ],
    takeActionPatterns: [
      'Bring the WSAVA balanced-diet checklist',
      'Discuss salmonella + nutrient deficiencies factually, not fearfully',
      'Offer a hybrid plan if the owner is committed: half balanced kibble, half their fresh prep',
    ],
    watchOuts: [
      'Do not call raw "dumb" or "fad"',
      'Do not lead with disease risk before acknowledging effort',
    ],
  },
  'rx-diet': {
    id: 'rx-diet',
    title: 'Skeptical of prescription diet',
    examples: [
      "Prescription? She\'s not sick.",
      "Why does the vet need to prescribe a food?",
      "It\'s just food — it shouldn\'t need a prescription.",
    ],
    rootConcerns: [
      'Confusion between Rx in human medicine and veterinary nutrition',
      'Suspicion that "prescription" means "expensive markup"',
      'Concern that prescribing a food medicalises a healthy dog',
    ],
    acknowledgePatterns: [
      'Validate the confusion — most people share it',
      'Reframe Rx as "veterinary-formulated" not "medication"',
    ],
    clarifyQuestions: [
      'What did you understand "prescription" to mean here?',
      'Has she been at this weight for a while?',
    ],
    takeActionPatterns: [
      'Explain the regulatory designation simply: targeted formulation, vet-monitored',
      'Anchor on the trial outcome (97% in 12 weeks)',
      'Offer the 4-week monitored trial as the proof point',
    ],
    watchOuts: [
      'Do not lecture about veterinary formulation rules',
      'Do not use the word "prescription" without explaining it the first time',
    ],
  },
  'brand-switch': {
    id: 'brand-switch',
    title: 'Reluctant to switch brands',
    examples: [
      "She\'s eaten the same food her whole life.",
      "Switching foods always upsets her stomach.",
      "Why mess with what works?",
    ],
    rootConcerns: [
      'Past experience with bad transition',
      'Belief that consistency = good ownership',
      'Fear of GI upset, refusal, vomiting',
    ],
    acknowledgePatterns: [
      'Honor the consistency — that has been good ownership',
      'Validate transition fear is grounded in real prior experience',
    ],
    clarifyQuestions: [
      'When you say "upset stomach" — what specifically did you see?',
      'How quickly did you switch last time?',
      'How long has the current weight trend been concerning to you?',
    ],
    takeActionPatterns: [
      'Walk through the 7–10 day transition protocol explicitly',
      'Offer a written feeding schedule',
      'Set a 2-week check-in for the gut-tolerance milestone',
    ],
    watchOuts: [
      'Do not dismiss past GI episodes',
      'Do not skip the transition-protocol explanation',
    ],
  },
  'weight-denial': {
    id: 'weight-denial',
    title: 'Weight / obesity denial',
    examples: [
      "He's not fat — all Labs look like that.",
      "He's just big-boned, not overweight.",
      "I can still feel his ribs, kind of.",
      "He's always been this size and he's fine.",
      "He's happy and energetic, so he can't be that bad.",
    ],
    rootConcerns: [
      'Owner normalised the weight because it changed gradually',
      'Guilt or shame about being "a bad owner"',
      'Fear that agreeing means expensive or complicated changes ahead',
      'Genuine confusion — breed norms are not well understood by most owners',
      'Concern that a diet food will make the dog miserable or hungry',
    ],
    acknowledgePatterns: [
      '"I can hear how much you care about Buddy — and that\'s exactly why this conversation matters."',
      '"It\'s really common for this to creep up — it\'s not something owners usually notice day-to-day."',
      'Never use the word "obese" without a gentle lead-in',
      'Validate that the dog seems happy and energetic — then bridge to hidden risk',
    ],
    clarifyQuestions: [
      'Can you feel his ribs without pressing? (BCS palpation invite)',
      'How long has he been at this weight?',
      'Does he slow down on longer walks, or strain to get up?',
      'How many treats does he get in a day — roughly?',
      'What would bother you most: the diet change, or joint issues down the road?',
    ],
    takeActionPatterns: [
      'Use the BCS 1–9 scale as a shared, non-shaming reference tool',
      'Cite the joint load equation: every 1 kg excess = 3–4 kg extra joint force',
      'Frame Satiety Support as "feels full on less" — dog won\'t be hungry',
      'Anchor on the 12-week visual change: "You\'ll see it before we weigh him"',
      'Offer a monthly weight check — turns it into a shared project, not a verdict',
    ],
    watchOuts: [
      'Do not call the dog "obese" or "fat" — say "above ideal condition score"',
      'Do not imply the owner caused the problem',
      'Do not skip palpation demonstration — seeing is believing for this pushback',
      'Do not lead with joint disease before earning trust',
    ],
  },
};

export function getPushbackKnowledge(id: string): PushbackKnowledge | null {
  return PUSHBACK_KNOWLEDGE[id] ?? null;
}
