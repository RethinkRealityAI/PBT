/**
 * Scenario templates — pre-authored starting points for the admin Scenario
 * Builder, sourced from the client spreadsheet "Pet Owner Push Back" and
 * refined into complete, playable dense rows.
 *
 * Each template's `fields` is the full editable column set a fresh admin draft
 * carries (see `emptyDraftForNewAdmin()` in ScenarioBuilderScreen) minus the
 * identity columns (scenario_id / visible / sort_order), with every unset
 * column explicitly null so applying a template yields a complete draft.
 * Every template passes `validateOverride` as an `admin:` dense row —
 * breed, life_stage, pushback_id, and suggested_driver are always set.
 */

import type { ScenarioOverrideRow } from './types';

// ─────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────

export type TemplateCategoryKey = 'general' | 'gi-owner' | 'gi-vet';

export const TEMPLATE_CATEGORIES: {
  key: TemplateCategoryKey;
  label: string;
  description: string;
}[] = [
  {
    key: 'general',
    label: 'General pushback',
    description:
      'Everyday nutrition objections — cost, raw feeding, brand loyalty, breeder advice, and more.',
  },
  {
    key: 'gi-owner',
    label: 'GI — pet owner',
    description:
      'Owners pushing back on GI / digestive diet recommendations; next platform phase.',
  },
  {
    key: 'gi-vet',
    label: 'GI — vet professional',
    description:
      'Colleague-to-colleague: vet team members blocking a GI diet recommendation — the hardest and most common source of GI pushback.',
  },
];

// ─────────────────────────────────────────────────────────────
// Template shape
// ─────────────────────────────────────────────────────────────

/**
 * The subset of `ScenarioOverrideRow` columns a fresh draft carries — all the
 * editable columns except the identity trio (scenario_id, visible, sort_order)
 * and the server-managed columns.
 */
export type TemplateFields = Pick<
  ScenarioOverrideRow,
  | 'title_override'
  | 'context_override'
  | 'opening_line_override'
  | 'difficulty_override'
  | 'persona_override'
  | 'prompt_prefix'
  | 'prompt_suffix'
  | 'card_title_override'
  | 'card_subtitle_override'
  | 'info_modal_title'
  | 'info_modal_body'
  | 'start_button_label'
  | 'card_driver_override'
  | 'breed'
  | 'life_stage'
  | 'pushback_id'
  | 'pushback_notes'
  | 'suggested_driver'
  | 'weight_kg'
  | 'focus_area'
  | 'knowledge_slugs'
>;

export interface ScenarioTemplate {
  id: string;
  category: TemplateCategoryKey;
  name: string;
  summary: string;
  fields: TemplateFields;
}

// ─────────────────────────────────────────────────────────────
// Templates — General pushback (11)
// ─────────────────────────────────────────────────────────────

const GENERAL_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'gen-too-expensive',
    category: 'general',
    name: 'Too expensive, can’t afford it',
    summary:
      'Classic cost objection: the owner says the recommended diet is simply out of budget.',
    fields: {
      title_override: null,
      context_override:
        'Rosie is a 4-year-old Beagle, 13.5 kg and trending above her ideal body condition. At her annual exam the vet recommended moving her from a grocery-store food to a veterinary weight-management diet. Her owner is juggling a tight household budget and shut the conversation down the moment she saw the price per bag.',
      opening_line_override:
        'I’m going to stop you right there — what you’re recommending is just too expensive. I can’t afford that.',
      difficulty_override: 1,
      persona_override: 'Busy',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'Too expensive, can’t afford it',
      card_subtitle_override:
        'Turn a bag-price objection into a cost-per-day conversation without dismissing a real budget worry.',
      info_modal_title: 'Handling the cost objection',
      info_modal_body:
        'The most common pushback in practice: the recommendation is heard as a price tag, not a health plan. Good ACT handling acknowledges the cost as real (never minimises it), clarifies what Rosie eats now and what it costs per day, and transforms the frame to daily cost, feeding-guide portioning, and fewer weight-related vet bills down the road. Watch for the classic failure mode: pitching value before the owner feels heard.',
      start_button_label: null,
      card_driver_override: 'Activator',
      breed: 'Beagle',
      life_stage: 'Adult (3-7)',
      pushback_id: 'cost',
      pushback_notes: null,
      suggested_driver: 'Activator',
      weight_kg: 13.5,
      focus_area: 'communication',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-raw-only',
    category: 'general',
    name: 'Raw feeder rejects “processed kibble”',
    summary:
      'A committed raw feeder refuses any kibble on principle — “natural is better for them.”',
    fields: {
      title_override: null,
      context_override:
        'Finn is a 2-year-old Border Collie, 19 kg, in for a routine wellness visit. His owner has fed a home-assembled raw diet since he was a puppy and is deeply invested in it. The vet flagged concerns about nutritional completeness and food-safety handling and recommended transitioning to a complete, balanced commercial diet — which the owner heard as an insult to how he cares for his dog.',
      opening_line_override:
        'I won’t feed my dog ultra-processed kibble. I only feed natural, raw food — it’s better for them, and honestly I’m surprised you’d recommend anything else.',
      difficulty_override: 3,
      persona_override: 'Skeptical',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'Raw feeder rejects “processed kibble”',
      card_subtitle_override:
        'An entrenched raw-feeding belief — honour the effort and intention before touching the evidence.',
      info_modal_title: 'Working with a committed raw feeder',
      info_modal_body:
        'This trains the hardest belief-based objection: raw feeding is an identity, not just a preference. Strong ACT handling acknowledges the love and effort behind the raw diet, clarifies what a typical day of meals looks like and whether completeness has ever been checked, and transforms toward balanced-diet criteria and — where the owner stays committed — a pragmatic hybrid plan. Calling raw a “fad” or leading with pathogen risk loses the room instantly.',
      start_button_label: null,
      card_driver_override: 'Analyzer',
      breed: 'Border Collie',
      life_stage: 'Junior (1-3)',
      pushback_id: 'raw-food',
      pushback_notes: null,
      suggested_driver: 'Analyzer',
      weight_kg: 19,
      focus_area: 'communication',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-grain-free-fillers',
    category: 'general',
    name: 'Grain-free believer: “fillers and by-products”',
    summary:
      'The owner insists their itchy dog is grain-allergic and dismisses the recommended food as full of fillers.',
    fields: {
      title_override: null,
      context_override:
        'Maisie is a 5-year-old West Highland White Terrier, 9 kg, presenting with recurrent itching and paw licking. The vet suspects an adverse food reaction and recommended a structured diet trial on a veterinary dermatology diet. Her owner is convinced the problem is grain and rejects the recommended food because it isn’t grain-free, calling the ingredient list “fillers and by-products.”',
      opening_line_override:
        'That food isn’t even grain-free — my dog is allergic, and what you’re recommending is full of fillers and by-products.',
      difficulty_override: 2,
      persona_override: 'Anxious',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'Grain-free believer: “fillers”',
      card_subtitle_override:
        'Unpick the grain-allergy assumption without making the owner feel foolish for believing it.',
      info_modal_title: 'The grain-free / fillers objection',
      info_modal_body:
        'This scenario trains gentle myth-correction: the owner’s worry about allergy is legitimate even though grain is rarely the culprit. Good ACT handling acknowledges the worry and the research the owner has done, clarifies what signs they’ve seen and what “filler” means to them, and transforms toward how a proper diet trial actually identifies the trigger — positioning the recommendation as the diagnostic tool, not a compromise.',
      start_button_label: null,
      card_driver_override: 'Harmonizer',
      breed: 'West Highland White Terrier',
      life_stage: 'Adult (3-7)',
      pushback_id: 'raw-food',
      pushback_notes:
        'Grain-free / trend belief expressed as a suspected grain allergy plus distrust of “fillers and by-products” on the ingredient panel.',
      suggested_driver: 'Harmonizer',
      weight_kg: 9,
      focus_area: 'dermatitis',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-only-eats-my-chicken',
    category: 'general',
    name: '“She only eats the chicken I cook”',
    summary:
      'A devoted owner has tried “loads of diets” and settled on home-cooked chicken; she’s sure nothing else will work.',
    fields: {
      title_override: null,
      context_override:
        'Coco is a 9-year-old Shih Tzu, 6 kg, in for a senior wellness check. Bloodwork and body condition point to a complete senior diet being overdue, and the vet recommended one. Her owner has tried many foods over the years, decided Coco is impossibly picky, and now cooks her plain chicken every day — a routine she’s proud of and sees as proof of her devotion.',
      opening_line_override:
        'I’ve tried loads of different diets and she doesn’t like any of them. She will only eat the chicken I cook for her — that’s just who she is.',
      difficulty_override: 2,
      persona_override: 'Devoted',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: '“She only eats my chicken”',
      card_subtitle_override:
        'A picky-eater story that’s really a devotion story — honour the care before rebalancing the diet.',
      info_modal_title: 'The home-cooked picky eater',
      info_modal_body:
        'This trains the transition conversation with an owner whose cooking routine is an act of love. Effective ACT handling acknowledges the devotion (never labels the chicken “wrong”), clarifies how past food switches were attempted and what “didn’t like it” actually looked like, and transforms toward a gradual, chicken-bridged transition plan with a concrete follow-up — keeping the owner in the role of the one who feeds her dog well.',
      start_button_label: null,
      card_driver_override: 'Harmonizer',
      breed: 'Shih Tzu',
      life_stage: 'Senior (7+)',
      pushback_id: 'brand-switch',
      pushback_notes:
        'Refusal-based switching hesitation: many failed diet attempts have hardened into “she only eats my home-cooked chicken.”',
      suggested_driver: 'Harmonizer',
      weight_kg: 6,
      focus_area: 'communication',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-vet-tech-fee',
    category: 'general',
    name: '“Why pay to see the tech about food?”',
    summary:
      'The owner doesn’t see the point of a paid nutrition consult with the veterinary technician.',
    fields: {
      title_override: null,
      context_override:
        'Duke is a 6-year-old Labrador Retriever, 34 kg and above ideal body condition. After his exam, the vet recommended booking a dedicated nutrition consultation with the clinic’s registered veterinary technician to build a feeding and weight plan. At the front desk, his owner balked at paying for an appointment “just to talk about food.”',
      opening_line_override:
        'Hold on — you want to charge me to see the vet tech about food for my dog? I don’t see the point of that at all.',
      difficulty_override: 2,
      persona_override: 'Skeptical',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'Why pay to see the tech?',
      card_subtitle_override:
        'Defend the value of a tech-led nutrition consult without getting defensive about the fee.',
      info_modal_title: 'Selling the nutrition consult',
      info_modal_body:
        'This scenario trains value communication for team-based care. The objection isn’t really about the fee — it’s that the owner doesn’t yet know what a structured nutrition consult delivers. Good ACT handling acknowledges that paying for “food advice” sounds odd at first, clarifies what the owner currently feeds and what they’d want for Duke’s weight, and transforms by describing concretely what the consult produces: a tailored plan, portioning, and scheduled follow-up.',
      start_button_label: null,
      card_driver_override: 'Activator',
      breed: 'Lab',
      life_stage: 'Adult (3-7)',
      pushback_id: 'custom',
      pushback_notes:
        'Objects to paying for a nutrition consultation with the veterinary technician. Root concerns: doesn’t understand the tech’s clinical expertise, feels nickel-and-dimed by the clinic, and assumes “food advice” should be free small talk rather than a structured service.',
      suggested_driver: 'Activator',
      weight_kg: 34,
      focus_area: 'communication',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-boring-no-flavours',
    category: 'general',
    name: '“That food is boring — no flavours”',
    summary:
      'The owner equates flavour variety on the store shelf with a happier pet and calls the recommended diet boring.',
    fields: {
      title_override: null,
      context_override:
        'Biscuit is a 2-year-old Cocker Spaniel, 14 kg, in for a vaccine visit. His owner rotates through supermarket varieties — chicken, beef, lamb, “gravy dinners” — convinced Biscuit loves the variety. The vet recommended settling on a single complete adult diet for consistency and digestive stability, which the owner heard as sentencing Biscuit to boring food.',
      opening_line_override:
        'That food looks so boring — there are no flavours! He loves all the different flavours I get him from the store.',
      difficulty_override: 1,
      persona_override: 'Devoted',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: '“That food is boring”',
      card_subtitle_override:
        'Reframe flavour-rotation from an act of love into what dogs actually experience at the bowl.',
      info_modal_title: 'The flavour-variety objection',
      info_modal_body:
        'A gentle warm-up scenario about anthropomorphism: the owner projects human mealtime boredom onto their dog. Good ACT handling acknowledges the generous instinct behind the variety, clarifies how Biscuit actually behaves at mealtimes and after food changes, and transforms by explaining palatability and consistency from the dog’s side — offering approved ways to add interest (toppers, food toys) that don’t destabilise the diet.',
      start_button_label: null,
      card_driver_override: 'Energizer',
      breed: 'Cocker Spaniel',
      life_stage: 'Junior (1-3)',
      pushback_id: 'brand-switch',
      pushback_notes:
        'Hesitant to switch to one consistent diet because the owner believes flavour rotation from the store makes the dog happier.',
      suggested_driver: 'Energizer',
      weight_kg: 14,
      focus_area: 'communication',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-breeder-already-feeds',
    category: 'general',
    name: 'Sticking with the breeder’s food',
    summary:
      'A new puppy owner is loyal to the breeder’s feeding instructions and sees no need to change.',
    fields: {
      title_override: null,
      context_override:
        'Juno is a 7-month-old Bernese Mountain Dog puppy, already 17 kg and growing fast. At her booster visit the vet recommended a large-breed puppy diet to support controlled growth and joint development. Her owner went home from the breeder with a specific feeding plan and feels that changing it would mean second-guessing the person who knows Juno’s whole family line.',
      opening_line_override:
        'I’m already feeding exactly what the breeder recommended, and she knows this line better than anyone. I don’t need to change anything.',
      difficulty_override: 2,
      persona_override: 'Devoted',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'Sticking with the breeder’s food',
      card_subtitle_override:
        'Respect the breeder relationship while making the case for large-breed growth nutrition.',
      info_modal_title: 'When the breeder said otherwise',
      info_modal_body:
        'This trains the loyalty-conflict conversation. Contradicting the breeder head-on forces the owner to pick a side — and they won’t pick you. Good ACT handling honours the breeder relationship, clarifies what the breeder’s goals were and how Juno is doing today, and transforms by framing the large-breed growth diet as the next chapter for a rapidly growing giant-breed puppy — even offering to share the reasoning with the breeder.',
      start_button_label: null,
      card_driver_override: 'Harmonizer',
      breed: 'Bernese Mountain Dog',
      life_stage: 'Puppy (<1)',
      pushback_id: 'breeder-advice',
      pushback_notes: null,
      suggested_driver: 'Harmonizer',
      weight_kg: 17,
      focus_area: 'communication',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-cat-bored-rotator',
    category: 'general',
    name: 'The diet-bored cat',
    summary:
      'The owner constantly rotates foods because “the cat gets bored” and sees a full bag of one diet as money wasted.',
    fields: {
      title_override: null,
      context_override:
        'Pixel is a 2-year-old Domestic Shorthair cat, 4.2 kg, in for a routine check with mild intermittent soft stool. The vet recommended committing to one complete feline diet for at least eight weeks to stabilise her digestion. Her owner is sure Pixel “gets bored” of foods within days and expects the bag to end up half-eaten in a cupboard — wasted money.',
      opening_line_override:
        'My cat gets bored with food, so I have to keep changing diets. It’ll be a total waste of money for me to buy that big bag.',
      difficulty_override: 2,
      persona_override: 'Bargain-hunter',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'The diet-bored cat',
      card_subtitle_override:
        'Break the rotation cycle: show how constant switching creates the “bored cat” it tries to fix.',
      info_modal_title: 'The food-rotation trap',
      info_modal_body:
        'This trains a subtle behavioural reframe: frequent switching often teaches cats to hold out for the next novelty, and the owner reads that as boredom. Good ACT handling acknowledges the very real fear of a wasted bag, clarifies the rotation history and what “bored” looks like at the bowl, and transforms with a structured transition, small-bag or guarantee options, and a concrete timeline before judging success.',
      start_button_label: null,
      card_driver_override: 'Energizer',
      breed: 'Domestic Shorthair (cat)',
      life_stage: 'Junior (1-3)',
      pushback_id: 'custom',
      pushback_notes:
        'Habitual food rotation justified as feline boredom; objection is that committing to one diet (and one large bag) will be wasted money. Root concerns: past experience of refused food, cost of waste, belief that pickiness is fixed personality rather than learned behaviour.',
      suggested_driver: 'Energizer',
      weight_kg: 4.2,
      focus_area: 'communication',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-wet-food-and-treats',
    category: 'general',
    name: 'Wet food and treats, no compromise',
    summary:
      'The owner wants to keep feeding wet food and the treats her dog loves, resisting a structured weight plan.',
    fields: {
      title_override: null,
      context_override:
        'Willow is a 6-year-old Dachshund, 9.5 kg and well above her ideal body condition — a real concern for a long-backed breed. The vet recommended a weight-management diet with measured portions and a strict treat budget. Her owner enjoys their routine of wet-food dinners and shared treats and feels the plan takes away everything Willow loves.',
      opening_line_override:
        'I like to feed her wet food, and she gets her treats too — she loves them. I’m not going to take all that away from her.',
      difficulty_override: 2,
      persona_override: 'Devoted',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'Wet food and treats, no compromise',
      card_subtitle_override:
        'Protect the bond, change the calories — build a weight plan that keeps the rituals the owner loves.',
      info_modal_title: 'Treats, wet food, and the weight plan',
      info_modal_body:
        'This scenario trains negotiating a weight plan without turning food into a battleground. The treats are the relationship, so “stop the treats” lands as “stop loving her that way.” Good ACT handling acknowledges the rituals, clarifies a full day of Willow’s food and treats, and transforms by building wet options and a defined treat allowance into the plan — tying it to her back and joint health, which this breed makes urgent.',
      start_button_label: null,
      card_driver_override: 'Harmonizer',
      breed: 'Dachshund',
      life_stage: 'Adult (3-7)',
      pushback_id: 'brand-switch',
      pushback_notes:
        'Resists moving to a structured weight-management plan because it threatens the wet-food and treat rituals she shares with her dog.',
      suggested_driver: 'Harmonizer',
      weight_kg: 9.5,
      focus_area: 'weight',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-not-sustainable',
    category: 'general',
    name: 'Sustainability objection',
    summary:
      'The owner challenges the recommendation on environmental grounds — the packaging and the brand’s footprint.',
    fields: {
      title_override: null,
      context_override:
        'Atlas is a 4-year-old Golden Retriever, 30 kg, whose vet recommended a complete adult diet after his owner mentioned assembling meals from assorted small-batch products. The owner lives a low-waste lifestyle, scrutinises supply chains, and rejected the recommendation on sight: the packaging looks unrecyclable and he doubts the brand’s environmental record.',
      opening_line_override:
        'Honestly, that pack doesn’t look very sustainable. I don’t think that brand is doing anything for the environment, and that matters to me.',
      difficulty_override: 3,
      persona_override: 'Skeptical',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'Sustainability objection',
      card_subtitle_override:
        'A values-based objection: engage the owner’s environmental ethics honestly, without greenwashing.',
      info_modal_title: 'When values are the objection',
      info_modal_body:
        'This trains handling an objection rooted in personal values rather than pet health — you cannot argue the owner out of caring about the planet, and you shouldn’t try. Good ACT handling acknowledges the values as legitimate, clarifies which aspects matter most (packaging, sourcing, footprint), and transforms by returning honestly to what is knowable: complete nutrition for Atlas, offered alongside a genuine commitment to find answers about the brand’s practices rather than improvised green claims.',
      start_button_label: null,
      card_driver_override: 'Analyzer',
      breed: 'Golden',
      life_stage: 'Adult (3-7)',
      pushback_id: 'custom',
      pushback_notes:
        'Rejects the recommended diet on environmental grounds: packaging looks unsustainable and the brand’s footprint is distrusted. Root concerns: personal environmental ethics, distrust of corporate green claims, wanting purchases to align with values — not a doubt about the food’s nutrition.',
      suggested_driver: 'Analyzer',
      weight_kg: 30,
      focus_area: 'communication',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gen-cheaper-online',
    category: 'general',
    name: '“I can buy that cheaper online”',
    summary:
      'The owner accepts the recommendation but plans to buy it from an online discounter instead of the clinic.',
    fields: {
      title_override: null,
      context_override:
        'Milo is a 5-year-old mixed-breed dog, 22 kg, and his owner actually agrees with the diet the vet recommended — she’s just not buying it here. She’s found the same bag listed cheaper on an online marketplace and is politely closing the conversation before the team can explain what comes with a clinic purchase.',
      opening_line_override:
        'Thanks, that all makes sense — but I can buy that exact food cheaper online, so I’ll just order it there.',
      difficulty_override: 1,
      persona_override: 'Bargain-hunter',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: '“I can buy it cheaper online”',
      card_subtitle_override:
        'The recommendation landed — now articulate the clinic’s value without disparaging online sellers.',
      info_modal_title: 'Competing with the online price',
      info_modal_body:
        'This trains value articulation when the clinical argument is already won. Arguing that online is “bad” backfires; the owner has the listing open on her phone. Good ACT handling acknowledges that the price difference is real and shopping smart is sensible, clarifies what matters to her beyond price (freshness, the right formula, support if Milo won’t eat it), and transforms by naming what the clinic purchase includes — verified supply, feeding guidance, weight checks, and easy course-correction — letting her make an informed choice either way.',
      start_button_label: null,
      card_driver_override: 'Activator',
      breed: 'Mixed',
      life_stage: 'Adult (3-7)',
      pushback_id: 'custom',
      pushback_notes:
        'Accepts the diet recommendation but intends to buy it cheaper from an online discounter. Root concerns: pure price sensitivity plus unawareness of what the clinic channel adds (verified storage and supply, feeding support, follow-up); not a rejection of the recommendation itself.',
      suggested_driver: 'Activator',
      weight_kg: 22,
      focus_area: 'communication',
      knowledge_slugs: null,
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Templates — GI, pet owner (8)
// ─────────────────────────────────────────────────────────────

const GI_OWNER_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'gi-owner-home-cooked',
    category: 'gi-owner',
    name: '“She only eats the chicken and salmon I cook”',
    summary:
      'A devoted home-cooker is sure her dog will refuse the recommended GI diet outright.',
    fields: {
      title_override: null,
      context_override:
        'Luna is a 4-year-old Cavapoo, 8 kg, with months of intermittent soft stool and occasional vomiting. After ruling out parasites and other causes, the vet recommended a veterinary gastrointestinal diet as the core of her management plan. Her owner home-cooks every meal — chicken and salmon, lovingly prepared — and is certain Luna will not touch anything else.',
      opening_line_override:
        'There’s no way she’ll eat that. She only eats the chicken and salmon I cook for her — believe me, I’ve tried everything else.',
      difficulty_override: 2,
      persona_override: 'Devoted',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: '“She only eats what I cook”',
      card_subtitle_override:
        'Move a GI patient off a beloved home-cooked menu without dismissing the love that built it.',
      info_modal_title: 'Home cooking vs the GI diet',
      info_modal_body:
        'This trains the transition conversation when home cooking may be part of the GI problem and is definitely part of the owner’s identity. Good ACT handling acknowledges the care in every cooked meal, clarifies how past food refusals actually played out, and transforms with a gradual transition plan that keeps the owner’s hands in the process — warming the food, hand-feeding the first meals — plus a clear picture of how a GI diet’s digestibility targets her symptoms.',
      start_button_label: null,
      card_driver_override: 'Harmonizer',
      breed: 'Cavapoo',
      life_stage: 'Adult (3-7)',
      pushback_id: 'custom',
      pushback_notes:
        'Refuses a GI diet recommendation because the dog “only eats” her home-cooked chicken and salmon. Root concerns: fear of food refusal in an already-unwell dog, identity and love invested in cooking, past failed switch attempts.',
      suggested_driver: 'Harmonizer',
      weight_kg: 8,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-owner-chicken-rice',
    category: 'gi-owner',
    name: '“The last vet said chicken and rice”',
    summary:
      'The owner cites previous professional advice: bland home-cooked chicken and rice fixed it last time.',
    fields: {
      title_override: null,
      context_override:
        'Rocky is a 5-year-old Boxer, 28 kg, presenting with two days of vomiting and diarrhea. The vet recommended a highly digestible veterinary gastrointestinal diet to support recovery. His owner remembers a previous episode where a different vet advised cooking chicken and rice — it seemed to work, it was cheap, and now this clinic appears to be contradicting its own profession.',
      opening_line_override:
        'The last time this happened, the vet told me to just cook chicken and rice for an upset tummy. Why is that suddenly not good enough?',
      difficulty_override: 2,
      persona_override: 'Skeptical',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: '“The last vet said chicken and rice”',
      card_subtitle_override:
        'Handle conflicting professional advice without throwing a colleague under the bus.',
      info_modal_title: 'When past advice conflicts',
      info_modal_body:
        'This trains one of the trickiest credibility moments: the owner is quoting a vet at you. Undermining the previous advice damages trust in the whole profession. Good ACT handling acknowledges that the advice was real and reasonable at the time, clarifies what happened during and after that episode, and transforms by explaining what a formulated GI diet adds over bland home cooking — complete nutrition, consistent digestibility, and electrolyte and fibre profiles designed for recovery — framed as an upgrade, not a correction.',
      start_button_label: null,
      card_driver_override: 'Analyzer',
      breed: 'Boxer',
      life_stage: 'Adult (3-7)',
      pushback_id: 'custom',
      pushback_notes:
        'Cites prior veterinary advice (home-cooked chicken and rice for GI upset) against the current GI diet recommendation. Root concerns: conflicting professional advice erodes trust, the old approach seemed to work, and the new one costs more.',
      suggested_driver: 'Analyzer',
      weight_kg: 28,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-owner-sweet-potato',
    category: 'gi-owner',
    name: '“I saw online that sweet potato is best”',
    summary:
      'Internet advice says sweet potato fixes vomiting and diarrhea; the owner wants to try that first.',
    fields: {
      title_override: null,
      context_override:
        'Ziggy is a 2-year-old Jack Russell Terrier, 7 kg, in with vomiting and diarrhea since yesterday. The vet recommended a short course on a veterinary gastrointestinal diet. His owner did some quick research on the drive over and found confident posts saying sweet potato is the best thing for an upset stomach — natural, cheap, and already in her kitchen.',
      opening_line_override:
        'I saw online that the best thing for vomiting and diarrhea is sweet potato — can’t I just try that first? It’s natural and I’ve already got some at home.',
      difficulty_override: 1,
      persona_override: 'Busy',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: '“Sweet potato fixes it”',
      card_subtitle_override:
        'Meet internet home-remedy advice with respect — then explain what recovery nutrition actually needs.',
      info_modal_title: 'The internet home remedy',
      info_modal_body:
        'A warm-up GI scenario for handling Dr. Google gracefully. Mocking the search result loses the owner; the instinct to help quickly and cheaply is a good one. Strong ACT handling acknowledges that instinct, clarifies what Ziggy has been through and what the owner read, and transforms by explaining why a single ingredient can’t deliver what a recovering gut needs — balanced, highly digestible nutrition with the right fibre — while keeping the tone light and the plan simple for a busy owner.',
      start_button_label: null,
      card_driver_override: 'Energizer',
      breed: 'Jack Russell Terrier',
      life_stage: 'Junior (1-3)',
      pushback_id: 'custom',
      pushback_notes:
        'Wants to try an internet home remedy (sweet potato) instead of the recommended GI diet. Root concerns: online advice feels accessible and natural, desire to act fast and cheap, no understanding yet of what recovery nutrition requires.',
      suggested_driver: 'Energizer',
      weight_kg: 7,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-owner-cost-on-top',
    category: 'gi-owner',
    name: '“Outrageously expensive on top of everything”',
    summary:
      'After an expensive diagnostic workup, the GI diet feels like one bill too many.',
    fields: {
      title_override: null,
      context_override:
        'Gus is a 6-year-old French Bulldog, 12 kg, who has just been through weeks of workup — bloodwork, imaging, a diet history — for chronic vomiting and diarrhea, landing on a diagnosis of chronic enteropathy. The vet recommended a long-term veterinary gastrointestinal diet as the cornerstone of treatment. His owner, already stretched by the diagnostic bills, hears one more expense being added to the pile.',
      opening_line_override:
        'This is outrageously expensive on top of everything else I’ve already paid just to figure out what’s going on with him. Where does it end?',
      difficulty_override: 3,
      persona_override: 'Anxious',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'One bill too many',
      card_subtitle_override:
        'Cost fatigue after a long workup — hold space for the frustration before making the case for the diet.',
      info_modal_title: 'Cost fatigue after the workup',
      info_modal_body:
        'This trains the emotionally loaded cost conversation: the owner isn’t just pricing a bag of food, they’re exhausted and financially bruised. Leading with value maths here reads as tone-deaf. Good ACT handling acknowledges the accumulated strain first, clarifies the total picture and what outcome would make it feel worthwhile, and transforms by positioning the GI diet as the payoff of the workup — the treatment the diagnosis was for — with cost-per-day framing and a defined review point.',
      start_button_label: null,
      card_driver_override: 'Harmonizer',
      breed: 'French Bulldog',
      life_stage: 'Adult (3-7)',
      pushback_id: 'cost',
      pushback_notes:
        'Cost objection amplified by diagnostic-bill fatigue: the GI diet lands as yet another expense after an already costly chronic-enteropathy workup.',
      suggested_driver: 'Harmonizer',
      weight_kg: 12,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-owner-post-op-diet',
    category: 'gi-owner',
    name: '“Why change food just for a few days?”',
    summary:
      'Post-surgery recovery diet objection: the owner already feeds a good diet and sees no point switching after a spay.',
    fields: {
      title_override: null,
      context_override:
        'Pepper is a 1-year-old Standard Poodle, 22 kg, going home today after her spay. The clinic recommended a short course of a highly digestible veterinary recovery diet while she heals — gentle on a post-anaesthesia gut and supportive of tissue repair. Her owner, who researched her regular diet carefully and is proud of it, sees no point in changing a good food for just a few days.',
      opening_line_override:
        'I already feed her a really good diet. I don’t see the point of changing it just for a few days because she’s been spayed.',
      difficulty_override: 2,
      persona_override: 'Skeptical',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: 'Post-op: “why change for a few days?”',
      card_subtitle_override:
        'Make the short-term recovery diet make sense to an owner whose everyday diet genuinely is good.',
      info_modal_title: 'The post-surgery recovery diet',
      info_modal_body:
        'This trains a proportionality argument: the owner isn’t wrong that her regular diet is good — she’s missing why recovery is different. Good ACT handling acknowledges and credits her diet research, clarifies what she knows about how anaesthesia and surgery affect appetite and digestion, and transforms by explaining the recovery diet’s job — easy digestion and energy-dense small meals while the gut restarts — as a short, defined bridge back to the food she’s proud of, not a criticism of it.',
      start_button_label: null,
      card_driver_override: 'Analyzer',
      breed: 'Poodle',
      life_stage: 'Junior (1-3)',
      pushback_id: 'rx-diet',
      pushback_notes:
        'Skeptical that a short-term veterinary recovery diet after a spay is medically necessary when the everyday diet is already high quality.',
      suggested_driver: 'Analyzer',
      weight_kg: 22,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-owner-back-to-own-food',
    category: 'gi-owner',
    name: '“She’ll never go back to her own food”',
    summary:
      'The owner fears the “fancy” GI food will spoil her dog and make returning to the regular diet impossible.',
    fields: {
      title_override: null,
      context_override:
        'Honey is a 4-year-old Golden Retriever, 31 kg, recovering from an acute bout of gastroenteritis. The vet recommended two to three weeks on a veterinary gastrointestinal diet before transitioning back to her regular food. Her owner is worried this will backfire: once Honey tastes “the fancy food,” she’ll refuse her normal diet and mealtimes will become a standoff.',
      opening_line_override:
        'My worry is it’ll be too hard to get her back on her own food after she’s had that fancy food. Then what do I do?',
      difficulty_override: 2,
      persona_override: 'Anxious',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: '“She’ll never go back”',
      card_subtitle_override:
        'A transition-fear objection — the plan back matters as much as the plan onto the diet.',
      info_modal_title: 'Fear of the one-way switch',
      info_modal_body:
        'This trains transition planning as a trust tool. The owner’s fear is concrete and practical, and vague reassurance won’t settle it. Good ACT handling acknowledges the fear as sensible, clarifies what happened during previous food changes, and transforms by laying out the full round trip: the defined weeks on the GI diet, the gradual 7–10 day transition back, and a scheduled check-in — so the owner leaves holding a plan with an exit, not an open-ended change.',
      start_button_label: null,
      card_driver_override: 'Harmonizer',
      breed: 'Golden',
      life_stage: 'Adult (3-7)',
      pushback_id: 'brand-switch',
      pushback_notes:
        'Transition anxiety in reverse: fears the palatable GI diet will make the dog refuse her regular food afterwards.',
      suggested_driver: 'Harmonizer',
      weight_kg: 31,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-owner-cat-hairballs',
    category: 'gi-owner',
    name: '“Hairballs are just normal for her”',
    summary:
      'The owner has normalised years of hairball vomiting and can’t see how a food could possibly help.',
    fields: {
      title_override: null,
      context_override:
        'Clementine is a 6-year-old Domestic Longhair cat, 5 kg, whose owner mentioned in passing that she vomits hairballs “a few times a week — always has.” The vet flagged that this frequency isn’t normal and recommended a veterinary gastrointestinal diet with a fibre profile designed to move ingested hair through the gut. The owner is baffled: hairballs are just what cats do, and Clementine has done it since she was a kitten.',
      opening_line_override:
        'I honestly can’t see how a food would help with her hairballs. She’s been vomiting them up since she was a kitten — that’s just normal for her.',
      difficulty_override: 3,
      persona_override: 'Devoted',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: '“Hairballs are just normal”',
      card_subtitle_override:
        'De-normalise years of hairball vomiting without making a devoted owner feel negligent.',
      info_modal_title: 'De-normalising the “normal”',
      info_modal_body:
        'This trains the gentle art of un-normalising a chronic sign. The owner isn’t careless — she’s watched this since kittenhood, so it reads as personality, not pathology. Good ACT handling acknowledges how reasonable that conclusion was, clarifies frequency, grooming habits, and what the owner would consider “better,” and transforms by explaining how fibre moves ingested hair through the gut instead of back up — with a defined trial period so “normal for her” can be tested rather than argued.',
      start_button_label: null,
      card_driver_override: 'Energizer',
      breed: 'Domestic Longhair (cat)',
      life_stage: 'Adult (3-7)',
      pushback_id: 'custom',
      pushback_notes:
        'Chronic hairball vomiting normalised as feline personality (“since she was a kitten”); disbelief that nutrition — specifically fibre — could change it. Root concerns: years of lived observation, subtle guilt if it turns out to have been a problem all along.',
      suggested_driver: 'Energizer',
      weight_kg: 5,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-owner-anal-glands',
    category: 'gi-owner',
    name: '“All my Cavaliers have scooted — it’s the breed”',
    summary:
      'A lifelong Cavalier owner puts scooting down to the breed and doubts food could touch anal-gland issues.',
    fields: {
      title_override: null,
      context_override:
        'Wilbur is an 8-year-old Cavalier King Charles Spaniel, 9 kg, in for his third anal-gland expression this year. The vet explained that firmer, bulkier stools — driven by the right dietary fibre blend — help the glands empty naturally, and recommended a veterinary gastrointestinal fibre-focused diet. His owner has kept Cavaliers for thirty years, every one of them scooted, and she is certain this is simply how the breed is built.',
      opening_line_override:
        'How could a food make any difference to anal glands? All my Cavaliers have scooted like this — it’s just their breed.',
      difficulty_override: 3,
      persona_override: 'Devoted',
      prompt_prefix: null,
      prompt_suffix: null,
      card_title_override: '“It’s just the breed”',
      card_subtitle_override:
        'Thirty years of Cavalier experience versus a fibre mechanism — respect the expertise, test the belief.',
      info_modal_title: 'Breed-normalised GI signs',
      info_modal_body:
        'This trains handling an owner whose deep breed experience has hardened into fatalism. Dismissing three decades of observation would be both rude and wrong — her pattern recognition is real; her causal explanation isn’t. Good ACT handling honours that experience, clarifies stool quality and how often expressions have been needed, and transforms by walking through the mechanism — bulkier, firmer stools naturally expressing the glands — and proposing a measurable trial: fewer expressions on the diet would be evidence even a veteran breeder can respect.',
      start_button_label: null,
      card_driver_override: 'Analyzer',
      breed: 'Cavalier King Charles Spaniel',
      life_stage: 'Senior (7+)',
      pushback_id: 'custom',
      pushback_notes:
        'Anal-gland problems and scooting attributed to breed destiny after decades of Cavalier ownership; disbelief that dietary fibre could change gland emptying. Root concerns: lifelong observational experience, identity as a breed expert, fatalism about “how they’re built.”',
      suggested_driver: 'Analyzer',
      weight_kg: 9,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Templates — GI, vet professional (4)
// ─────────────────────────────────────────────────────────────
//
// These reframe the roleplay via prompt_prefix: the AI plays a veterinary
// colleague blocking a GI diet inside the clinic — professional register,
// cites training and experience, and moves on evidence and respect rather
// than consumer reassurance. persona_override still has to be a valid
// OwnerPersona enum value, so 'Skeptical' / 'Busy' stand in for the
// colleague's disposition.

const GI_VET_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'gi-vet-owners-wont-bother',
    category: 'gi-vet',
    name: 'Colleague: “owners won’t bother changing diets”',
    summary:
      'A time-pressed senior RVT waves off GI diet recommendations as something owners never follow through on.',
    fields: {
      title_override: null,
      context_override:
        'In the treatment area, you’re preparing discharge notes for Bruno, a 5-year-old Labrador Retriever with chronic colitis, and you’ve recommended he go home on a veterinary gastrointestinal fibre-balanced diet rather than his maintenance food. Sam, the clinic’s senior RVT of fifteen years, is skimming the discharge sheet between appointments and wants the diet section cut — in their experience, owners nod along and never actually switch.',
      opening_line_override:
        'Honestly, why bother changing the diet? Owners don’t want to do that — they nod, they go home, and nothing changes. Let’s keep the discharge simple.',
      difficulty_override: 3,
      persona_override: 'Busy',
      prompt_prefix:
        'ROLEPLAY REFRAME: You are NOT a pet owner in this scenario. You are Sam, a senior Registered Veterinary Technician with 15 years in practice, talking to a colleague in the treatment area between appointments. You are rushed but collegial, and your objection is practical, not clinical: in your experience owners rarely follow through on diet changes, so recommending them feels like wasted discharge time. Speak in professional register — use clinical shorthand, reference your own years of client conversations, and push for efficiency. You respect evidence and respect for your experience: you soften if the trainee acknowledges your experience, clarifies what you’ve actually seen owners do, and makes a concrete case — e.g. that chronic colitis outcomes hinge on the diet’s fibre mix and digestibility, and that different GI diagnoses need different nutrient profiles, so skipping the conversation forfeits the main treatment. You dig in if they lecture you like a consumer or dismiss your experience.',
      prompt_suffix: null,
      card_title_override: '“Owners won’t bother” — RVT pushback',
      card_subtitle_override:
        'Colleague-to-colleague: defend the diet conversation itself against follow-through fatalism.',
      info_modal_title: 'Colleague practice: follow-through fatalism',
      info_modal_body:
        'This is a colleague-to-colleague scenario — you’re practising with a veterinary teammate, not a pet owner. GI recommendations are most often blocked inside the clinic, and this RVT’s objection is experience-based: owners “never” follow through. Good ACT handling acknowledges the real pattern behind the fatigue, clarifies what follow-up has actually looked like, and transforms by connecting the diet to the diagnosis — chronic colitis needs a specific fibre and digestibility profile — and proposing a lighter-lift way to give the recommendation a real chance.',
      start_button_label: null,
      card_driver_override: 'Activator',
      breed: 'Lab',
      life_stage: 'Adult (3-7)',
      pushback_id: 'custom',
      pushback_notes:
        'Veterinary colleague (senior RVT) blocks a GI diet recommendation on practicality: owners supposedly never follow through, so the discharge conversation is wasted time. Root concerns: client-compliance fatigue, time pressure, wanting their floor experience respected.',
      suggested_driver: 'Activator',
      weight_kg: 32,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-vet-post-op-evidence',
    category: 'gi-vet',
    name: 'Colleague: “post-op diet change is risky”',
    summary:
      'An evidence-minded associate DVM argues that changing diet post-operatively can cause more problems than it solves.',
    fields: {
      title_override: null,
      context_override:
        'Rounds discussion: Nala, a 3-year-old German Shepherd, is recovering from an enterotomy for a foreign body, and you’ve proposed sending her home on a highly digestible veterinary gastrointestinal diet during healing. Dr. Okafor, an associate DVM who prides herself on staying current with the literature, disagrees on the record — she’s seen papers suggesting peri-operative diet changes add stress and can trigger GI upset, and she isn’t convinced.',
      opening_line_override:
        'There’s increasing evidence that changing the diet post-op is not a good idea and can cause further problems. I’m not convinced this is what we should be sending her home on.',
      difficulty_override: 4,
      persona_override: 'Skeptical',
      prompt_prefix:
        'ROLEPLAY REFRAME: You are NOT a pet owner. You are Dr. Okafor, an associate DVM in this clinic, disagreeing with a colleague during rounds about post-enterotomy nutrition. You are rigorous, courteous, and evidence-led: you cite your reading in general terms (“there’s literature suggesting…”) without inventing specific studies or statistics, and you challenge reasoning, not people. Your position: switching diets peri-operatively adds a stressor and can itself trigger GI upset, so the familiar maintenance diet seems safer. You respond to substance: if the trainee acknowledges your concern as legitimate, clarifies what evidence or outcomes you’re weighing, and argues mechanism — that a post-enterotomy gut benefits from high digestibility and an appropriate nutrient profile while healing, that different GI cases need different profiles, and that a gradual transition manages the change-stress you’re citing — you engage and can be persuaded toward a monitored compromise. If they appeal to authority, get defensive, or talk to you like a client, you become pointedly more formal.',
      prompt_suffix: null,
      card_title_override: 'Post-op diet debate — associate DVM',
      card_subtitle_override:
        'Colleague-to-colleague: meet an evidence-framed objection with mechanism, not authority.',
      info_modal_title: 'Colleague practice: the evidence objection',
      info_modal_body:
        'A colleague-to-colleague scenario at the hardest difficulty: a peer DVM disputes your post-op GI diet plan on evidence grounds, in front of the team. Consumer-style reassurance will read as condescension. Good ACT handling acknowledges the legitimacy of her caution, clarifies exactly which risk she’s weighing, and transforms with mechanism — digestibility and nutrient profile matched to a healing gut, transition management for the change-stress she cites — landing on a monitored plan you can both stand behind.',
      start_button_label: null,
      card_driver_override: 'Analyzer',
      breed: 'GSD',
      life_stage: 'Junior (1-3)',
      pushback_id: 'custom',
      pushback_notes:
        'Veterinary colleague (associate DVM) opposes a post-operative GI diet change, citing evidence that peri-operative diet switches add stress and can cause GI upset. Root concerns: patient safety, scientific rigour, professional standing in front of the team.',
      suggested_driver: 'Analyzer',
      weight_kg: 29,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-vet-bland-diet-college',
    category: 'gi-vet',
    name: 'Colleague: “chicken and rice was fine in college”',
    summary:
      'A veteran RVT was taught bland home diets for GI upset and has never seen the need for “this stuff.”',
    fields: {
      title_override: null,
      context_override:
        'You’re stocking the dispensary shelf with a veterinary gastrointestinal diet for Peanut, a 4-year-old Beagle with his third bout of acute gastroenteritis this year, when Marie — an RVT with twenty years in practice — questions the plan. She was taught in college that a bland diet of chicken and rice, scrambled egg, or sweet potato was fine for GI upset, has managed hundreds of cases that way, and has never seen the need for formulated GI diets.',
      opening_line_override:
        'I was taught in college that a bland diet — chicken and rice, scrambled egg, or sweet potato — was perfectly fine for GI upset. Twenty years on, I’ve never seen the need for this stuff.',
      difficulty_override: 3,
      persona_override: 'Skeptical',
      prompt_prefix:
        'ROLEPLAY REFRAME: You are NOT a pet owner. You are Marie, a Registered Veterinary Technician with 20 years of experience, talking shop with a colleague at the dispensary shelf. Your objection is rooted in your training and long experience: college taught you bland home diets (chicken and rice, scrambled egg, sweet potato) for GI upset, you’ve managed hundreds of cases that way, and formulated GI diets look like marketing layered on old wisdom. You are warm but firm, proud of your training, and allergic to being talked down to by someone junior. You respond to respect and substance: if the trainee honours your experience, clarifies what outcomes you’ve seen (including the repeat cases), and explains what has changed since college — that different GI diagnoses need different nutrient profiles, fibre mixes, and digestibility, which a bland pot of chicken can’t provide, especially for recurrent cases like this Beagle — you’ll concede ground gracefully. Condescension or “the rep said so” entrenches you.',
      prompt_suffix: null,
      card_title_override: '“Bland diets were fine in college”',
      card_subtitle_override:
        'Colleague-to-colleague: update twenty years of bland-diet training without disrespecting it.',
      info_modal_title: 'Colleague practice: the training objection',
      info_modal_body:
        'A colleague-to-colleague scenario — the pushback comes from a veteran teammate’s own education, which makes it loyalty to her training, not ignorance. Good ACT handling acknowledges that her college teaching was the standard of its day, clarifies the outcomes she’s seen (this patient is on his third episode this year), and transforms by explaining what formulated GI nutrition adds — diagnosis-matched fibre mixes and digestibility a bland pot can’t deliver — inviting her expertise into the new approach rather than replacing it.',
      start_button_label: null,
      card_driver_override: 'Harmonizer',
      breed: 'Beagle',
      life_stage: 'Adult (3-7)',
      pushback_id: 'custom',
      pushback_notes:
        'Veterinary colleague (veteran RVT) rejects formulated GI diets in favour of the bland home diets (chicken and rice, scrambled egg, sweet potato) she was taught in college. Root concerns: loyalty to her training, twenty years of apparent success, suspicion that formulated diets are marketing.',
      suggested_driver: 'Harmonizer',
      weight_kg: 12,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
  {
    id: 'gi-vet-human-bland-logic',
    category: 'gi-vet',
    name: 'Colleague: “if bland works for humans, stop selling”',
    summary:
      'A blunt practice-owner DVM applies human bland-diet logic to pets and accuses the team of selling what isn’t needed.',
    fields: {
      title_override: null,
      context_override:
        'Case discussion with Dr. Brandt, the practice owner: Mochi, a 7-year-old Domestic Shorthair cat with fibre-responsive constipation, keeps re-presenting, and you’ve recommended a veterinary gastrointestinal fibre diet as ongoing management. Dr. Brandt — thirty years in practice, famously blunt, and sensitive about the clinic looking “salesy” — shuts it down: if a bland diet is fine for sick humans, it’s fine for dogs and cats.',
      opening_line_override:
        'If a bland diet is okay for humans when they’re sick, then it’s fine for dogs and cats. Stop trying to sell stuff that’s not needed — it makes us look like a shop.',
      difficulty_override: 4,
      persona_override: 'Busy',
      prompt_prefix:
        'ROLEPLAY REFRAME: You are NOT a pet owner. You are Dr. Brandt, the practice owner and a DVM with 30 years of experience, in a case discussion with a junior colleague. You are blunt, busy, and protective of the clinic’s reputation — your core objection is that recommending special GI diets looks like retail upselling, and your clinical cover is human-medicine analogy: sick people do fine on bland food, so pets will too. You interrupt, you challenge hard, and you have zero patience for scripted enthusiasm. But you are a good clinician underneath: if the trainee stays composed, acknowledges your concern about the clinic’s integrity as legitimate, clarifies what outcome you’d accept for this recurrent case, and argues comparative physiology and mechanism — that cats and dogs are not small humans, that this cat’s fibre-responsive constipation specifically needs a defined fibre mix and digestibility a “bland” approach cannot supply, and that different GI diagnoses need different nutrient profiles — you will grudgingly respect it and allow a monitored trial. Flattery or backing down instantly loses you.',
      prompt_suffix: null,
      card_title_override: '“Stop selling stuff” — practice owner',
      card_subtitle_override:
        'Colleague-to-colleague at full pressure: hold your clinical ground with the boss in the room.',
      info_modal_title: 'Colleague practice: the human-analogy objection',
      info_modal_body:
        'The hardest colleague-to-colleague scenario: the objection comes from the practice owner, wraps a fair worry (not wanting the clinic to look salesy) around a flawed analogy (pets as small humans), and is delivered with rank. Good ACT handling acknowledges the integrity concern as genuinely shared, clarifies what would count as “needed” for a cat re-presenting with constipation, and transforms with comparative physiology — species-specific fibre and digestibility needs that human bland-diet logic can’t cover — proposing a monitored trial that protects both the patient and the clinic’s credibility.',
      start_button_label: null,
      card_driver_override: 'Activator',
      breed: 'Domestic Shorthair (cat)',
      life_stage: 'Senior (7+)',
      pushback_id: 'custom',
      pushback_notes:
        'Veterinary colleague (practice-owner DVM) blocks a GI fibre diet using human bland-diet analogy and accuses the team of upselling. Root concerns: clinic reputation and integrity, cost sensitivity on behalf of clients, over-generalised human-medicine reasoning, seniority asserting itself.',
      suggested_driver: 'Activator',
      weight_kg: 5.5,
      focus_area: 'gi',
      knowledge_slugs: null,
    },
  },
];

// ─────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  ...GENERAL_TEMPLATES,
  ...GI_OWNER_TEMPLATES,
  ...GI_VET_TEMPLATES,
];
