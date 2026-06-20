# Royal Canin Scenario Template — Update Spec (ACT-first scoring)

**Purpose:** Bring `royalcanin-scenario-template` (the Netlify site, `index.html` + the
`get-scenario` / `list-scenarios` / `submit-scenario` functions) in line with the
platform's current **ACT-first scoring model** and taxonomy. This file is the source of
truth for the edit — apply it to `index.html` (and any copy/labels in the functions or
seed data), then redeploy the **whole** folder so the 3 functions + DB stay intact.

Source of truth in the main app: `src/data/knowledge/scoringRubric.ts`,
`src/data/knowledge/actGuide.ts`, `src/data/scenarios.ts`.

---

## 1. The headline change

The platform moved **away from "general sales acumen"** scoring toward **empathy + the ACT
method**. Anywhere the template still shows the **old 7-dimension sales rubric** or the old
3-score (1–10) ACT panel, replace it with the **new 5-dimension ACT-first rubric** below.

**OLD rubric (remove):** Empathy & tone, Active listening, Product knowledge, Objection
handling, Confidence, Closing effectiveness, Pacing — plus the legacy 1–10
Acknowledge/Clarify/TakeAction sub-scores.

**NEW rubric (use):** 5 dimensions, each scored **0–100**. The three ACT pillars carry
**70%** of the weight; empathy + rapport make up the rest.

---

## 2. The new scoring rubric (verbatim)

| # | Key | Label | Weight | What it measures |
|---|-----|-------|:------:|------------------|
| 1 | `acknowledge` | **Acknowledge** | **0.24** | Did the staff member validate the client's feeling FIRST — before clarifying or recommending — without minimising or arguing? |
| 2 | `clarify` | **Clarify** | **0.24** | Did the staff ask open questions and reflect back what they heard to surface the real concern before pivoting? |
| 3 | `transform` | **Transform** | **0.22** | Did the staff reframe the objection and guide the client toward a specific, credible next step (a bounded trial, a recheck, a written plan) rather than retreating or steamrolling? |
| 4 | `empathy` | **Empathy & warmth** | **0.18** | Across the whole conversation, was the tone warm, non-judgmental, and attuned to the client — not clinical, defensive, or shaming? |
| 5 | `rapport` | **Rapport & pacing** | **0.12** | Did the staff match the client's energy and build trust — neither rushing nor stalling — so the conversation felt collaborative? |

Weights sum to **1.00**. (If the template lets an admin re-weight, note that weights are
normalised at runtime, so only their *relative* size matters.)

### Band thresholds (same for every dimension and for the overall)
- **Good** ≥ 85
- **OK** 70–84
- **Poor** < 70

### Overall score
`overall = round(Σ dimensionScore × weight)`, then banded with the thresholds above.

### Per-dimension anchor examples (use these in any "what good/bad looks like" UI)

**Acknowledge**
- Excellent (≥85): *"It's clear how much Bella means to you — and changing her routine after 8 years is genuinely hard."*
- Needs work (<70): *"You shouldn't feel bad — but your dog really is overweight."* (skips/negates the acknowledge)

**Clarify**
- Excellent: *"Walk me through her day — and you mentioned the stairs are tougher; tell me more about that."*
- Needs work: jumps straight into a product recommendation with no questions.

**Transform**
- Excellent: *"Per day, with portion control, it works out to less than a coffee — let's try 4 weeks and I'll see Bella back at week two for a weigh-in."*
- Needs work: *"Okay, never mind then."* or *"You're wrong about the price."* (caves or argues; no next step)

**Empathy & warmth**
- Excellent: uses the dog's name, softens delivery, never makes the owner feel judged.
- Needs work: *"Well, this is what happens when a dog is overfed."*

**Rapport & pacing**
- Excellent: mirrors a Harmonizer's slower pace; cuts straight to the outcome with an Activator.
- Needs work: talks past the client or freezes when they push back.

---

## 3. The ACT method (the spine of the rubric)

The scoring is built on **ACT — Acknowledge → Clarify → Transform**:

- **Acknowledge** — Validate the client's feelings without agreeing or disagreeing. (Reflect
  the feeling, use the dog's name, hold space. Do **not** say "I understand, but…".)
- **Clarify** — Ask open questions ("What…", "How…", "Walk me through…") to surface the
  dog's real context, then reflect back what you heard before pivoting.
- **Transform** — Propose a specific, credible Royal Canin next step with concrete benefits
  and a **bounded** trial + follow-up checkpoint (e.g. a 4-week trial, recheck at week 2).

---

## 4. How scenarios should behave (so they're resolvable under ACT)

The AI customer's **resolution arc now mirrors the three ACT pillars** — make any
template copy that describes "how the scenario plays out / how to win" match this:

1. **Stays guarded** until the trainee genuinely **acknowledges** the feeling (without
   immediately countering it). Real acknowledgement earns the first visible softening.
2. **Opens up** once the trainee **clarifies** — asks a real question and listens; the
   customer shares one honest detail and becomes more receptive.
3. **Accepts** only once the trainee **transforms** — ties it to a specific, credible,
   low-pressure next step. A pitch that lands *before* the client feels heard does **not**
   resolve the scenario and scores low on `transform`.

The customer should **push back harder** against pitch-first / no-listening handling.

### Difficulty levels (1–4)
| Level | Label | Behaviour |
|---|---|---|
| 1 | **Coachable** | Open-minded; pushes back once, yields to genuine listening. |
| 2 | **Skeptical** | Questions advice; needs clear, evidence-backed reasoning. |
| 3 | **Hostile** | Frustrated/defensive; needs empathy + persistence to reach resolution. |
| 4 | **Combative** | Highly resistant, emotionally charged; tests composure; softens only after multiple strong, evidence-backed turns. |

---

## 5. Platform taxonomy the template should reflect

Make dropdowns / labels / seed data match these exactly.

**ECHO drivers (4 — this replaced the old 6-type system):**
`Activator` · `Energizer` · `Analyzer` · `Harmonizer`
> Do **not** use the retired 6-type set (Thinker/Persister/Rebel/Promoter/Harmonizer/Imaginer).

**Owner personas (5):** `Skeptical` · `Anxious` · `Busy` · `Bargain-hunter` · `Devoted`

**Life stages (4):** `Puppy (<1)` · `Junior (1-3)` · `Adult (3-7)` · `Senior (7+)`

**Pushback categories (7)** — id → title → example lead line:
- `cost` — *Cost / price pushback* — "It's too expensive for what it is."
- `breeder-advice` — *Friend / breeder said…* — "My breeder told me to feed something else."
- `raw-food` — *Grain-free / trend belief* — "Grain-free is healthier, right?"
- `rx-diet` — *Skepticism on Rx diet* — "Is this really medically necessary?"
- `brand-switch` — *Switching brands hesitation* — "My dog already eats fine — why change?"
- `weight-denial` — *Weight / obesity denial* — "He's not fat — all Labs look like that."
- `custom` — *Other pushback* — (free-text topic the author supplies)

---

## 6. Other platform features now live (reflect in any "what the platform does" copy)

If the template markets/describes the platform, it should now mention:
- **ACT-first scoring** (above) for text **and** voice roleplay.
- **Pet Vision Analyzer** — upload a dog photo for an AI estimate of breed + life stage,
  Body Condition Score (1–9), and visible dermatitis indicators, with manual override; the
  analyzed pet can be handed straight into a training scenario. (No branded product
  recommendations — generic clinical guidance only.)
- **Simulation Feedback Tool** — post-session rating (scenario realism, AI response quality,
  comfort) + comment.
- **Platform Reporting Tool** — in-app bug reports + suggestions routed to admin triage.
- **Admin Simulation control** — admins can tune the scoring weights/labels/descriptions,
  the scoring + customer prompts, the 4 driver personas, and the pushback taxonomy (and add
  brand-new pushback categories) live, without a deploy.

---

## 7. Concrete edit checklist for `index.html`

- [ ] Replace any **7-dimension** scoring list with the **5 ACT-first** dimensions (§2),
      including weights and the good/needs-work anchor examples.
- [ ] Remove the legacy **1–10 Acknowledge/Clarify/TakeAction** panel; ACT is now the three
      0–100 dimensions `acknowledge` / `clarify` / `transform`.
- [ ] Update band thresholds anywhere they appear: **≥85 good, 70–84 ok, <70 poor**.
- [ ] Replace "sales acumen / closing / product-knowledge" framing with **empathy + ACT**
      framing.
- [ ] Update the "how the scenario resolves" copy to the **acknowledge → clarify →
      transform** arc (§4).
- [ ] Confirm driver / persona / life-stage / pushback / difficulty options match §5.
- [ ] If the JSON keys are used by the functions or seed data, use the exact dimension keys:
      `acknowledge`, `clarify`, `transform`, `empathy`, `rapport`.

## 8. Deploy safely
The live site bundles **3 Netlify Functions** (`get-scenario`, `list-scenarios`,
`submit-scenario`) + a database. Deploy the **entire project folder** (HTML + functions +
`netlify.toml`/headers) — a static-only redeploy would drop the functions. Confirm the
functions still respond (`/api/list-scenarios`) after deploying.
