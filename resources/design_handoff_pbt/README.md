# Handoff: PBT — Pushback Training

## Overview
PBT (Pushback Training) is a mobile-first web/app product that helps veterinary professionals — vets, vet techs, and front-of-house staff — rehearse the awkward, high-stakes client conversations that decide whether a pet owner trusts a recommendation. The user practices against AI-driven "owner" personas who push back on cost, ingredients, prescription diets, and folk advice. Sessions are scored on tone, listening, knowledge, objection handling, confidence, closing, and pacing, and tied to an ECHO personality profile so feedback is personalized to how that user naturally leads conversations.

The app pairs **conversational practice** (text + voice scenarios with an AI client) with **clinical reference tools** (Pet Analyzer for body/muscle scoring + calorie targets, and a WSAVA-grounded library), all tied together by a personality system (ECHO) that tints the UI to the user's primary driver.

## About the Design Files
The files in `design_files/` are **design references created in HTML/JSX prototypes** — they show intended look, layout, copy, and behavior. They are **not** production code to copy directly. The task is to **recreate these designs in the target codebase's environment** (React Native, Next.js, SwiftUI, etc.) using its existing patterns, libraries, and conventions. If no environment exists yet, choose the most appropriate framework (recommended: **React Native + Expo** for cross-platform mobile, or **Next.js + Tailwind** for a web-first PWA) and implement there.

The prototypes use plain React 18 with Babel-in-browser and inline styles. Don't carry that pattern into production — port the design language into your stack's idiomatic styling layer (StyleSheet for RN, Tailwind/CSS Modules for web, etc.).

## Fidelity
**High-fidelity (hifi).** All colors, typography, spacing, radii, motion, and interactions are intentional and should be preserved closely. Where the design uses `oklch()` color values, use them directly if your stack supports it (modern browsers, RN via a polyfill, or convert to hex/RGB equivalents). The "liquid glass" aesthetic — translucent blurred surfaces over a warm-white canvas with a soft driver-color halo — is the signature of the brand and should be carried through.

---

## Design System

### Brand Voice
- **Tone**: Direct, warm, slightly literary. Headlines are sentence-form ("Train the awkward moments.", "What pushback are you ready for today?"). Subheads are plainspoken.
- **Eyebrows / labels**: Geist Mono, all-caps, letter-spaced 0.18em — used as section labels, status tags, metadata.
- **Body**: Conversational, second person, contraction-friendly ("we'll cue this", "you'd rather…").
- **Avoid**: corporate wellness clichés, motivational filler, emoji.

### Typography
Three families. All loaded from Google Fonts.

| Role | Family | Weights | Notes |
|---|---|---|---|
| **Body / UI** | Mulish | 400, 500, 600, 700, 800 | Default; switchable to Nunito or Geist via Tweaks. Driven by CSS var `--pbt-font`. |
| **Display** | Mulish (light, weight 400, tight tracking `-0.025em`) | 400 | Used at 26–48px for headlines. Lowercase sentences, no period. |
| **Mono / labels** | Geist Mono | 500, 600, 700 | All eyebrows, timestamps, scores, tags. Tracked 0.10–0.18em. |

**Type scale (px):**
- 9–11: mono labels, timestamps, micro-captions
- 12–13: secondary body, helper text, metadata
- 14–15: primary body, list items, button labels
- 16–18: section titles, list emphasis
- 22–28: card titles, secondary headlines
- 32–48: hero headlines (weight 400, tight letter-spacing)

Headlines should always use `font-weight: 400` with `letter-spacing: -0.02em` to `-0.025em` and `line-height: 1.0–1.1`. Body uses `text-wrap: pretty` where supported.

### Color System

All colors are defined in **OKLCH** for perceptual consistency. Convert to your platform's color space if needed.

#### Brand reds (the driver — Activator family)
| Token | Value | Use |
|---|---|---|
| `cherry` | `oklch(0.62 0.22 22)` | Primary brand red |
| `crimson` | `oklch(0.55 0.24 18)` | Deep red — gradient bottom |
| `coral` | `oklch(0.74 0.18 28)` | Highlight / gradient top |
| `blush` | `oklch(0.94 0.05 20)` | Soft red wash for selection states |
| `cream` | `oklch(0.985 0.012 60)` | Canvas warm white (light theme: `#fff7f5`) |
| `ink` | `oklch(0.22 0.04 20)` | Primary text on light |
| `mute` | `oklch(0.50 0.04 20)` | Secondary text on light |

#### ECHO driver colors
Each driver has a primary color, a darker accent, a soft tint, and a wave-animation color. These tint the canvas halo, score chips, profile cards, and library section headers.

| Driver | Color | Accent | Soft | Wave |
|---|---|---|---|---|
| **Activator** | `oklch(0.62 0.22 25)` (cherry red) | `oklch(0.52 0.24 22)` | `oklch(0.92 0.06 22)` | `oklch(0.62 0.22 22)` |
| **Energizer** | `oklch(0.85 0.16 95)` (yellow) | `oklch(0.65 0.16 80)` | `oklch(0.96 0.08 95)` | `oklch(0.70 0.18 70)` (amber) |
| **Analyzer** | `oklch(0.72 0.14 235)` (blue) | `oklch(0.55 0.18 245)` | `oklch(0.94 0.05 235)` | `oklch(0.62 0.16 245)` (indigo) |
| **Harmonizer** | `oklch(0.70 0.18 145)` (green) | `oklch(0.55 0.18 145)` | `oklch(0.94 0.06 145)` | `oklch(0.60 0.16 145)` (sage) |

#### Semantic colors
| Use | Light | Dark |
|---|---|---|
| Background canvas | `#ffffff` (with halo) | `#0e0306` |
| Outer page bg | `#fff7f5` | `#070203` |
| Glass tint (default) | `rgba(255,255,255,0.18)` | `rgba(28,12,14,0.22)` |
| Glass border | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.14)` |
| Score: good (≥85) | `oklch(0.55 0.18 145)` (green) | same |
| Score: ok (70–84) | `oklch(0.65 0.18 60)` (amber) | same |
| Score: poor (<70) | `oklch(0.55 0.24 18)` (red) | same |

### Spacing & Radii
- **Spacing scale (px):** 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40
- **Border radii (px):** 8 (chips inner), 12 (small icons), 14 (small buttons), 16–18 (list cards), 20–22 (medium cards), 26–28 (hero cards, composers), 32 (phone frame), 9999 (pills, segmented controls)
- **Standard padding** for glass cards: 14px (compact list items), 18–20px (medium), 22–26px (hero)

### The Glass System

The signature surface is "liquid glass" — semi-transparent white over a soft warm-color halo, with a diagonal inner-shine gradient and a thin bright top-edge inset shadow. Every surface that the user can interact with is a `Glass` component.

**`Glass` props (light-theme defaults):**
- `blur`: 28–36px (heavy backdrop blur with `saturate(200%)`)
- `tint`: 0.18 default; bump to 0.22–0.32 for opaque-ish surfaces (tab bar, coach drawer)
- `radius`: 18–28
- `padding`: 14–22
- `glow`: optional driver-color value — adds a colored drop shadow only when set (use sparingly: hero cards, streak strip, profile, library section heads)
- `shine`: bool, default true — adds a 135° linear-gradient highlight overlay
- `border`: 0.5px white at 0.7 opacity (light) / white at 0.14 (dark)

**Shadow recipe (default, neutral):**
```
0 1px 0 rgba(255,255,255,0.95) inset,
0 -1px 0 rgba(255,255,255,0.5) inset,
0 6px 18px -10px rgba(60,20,15,0.18),
0 1px 2px rgba(60,20,15,0.06)
```

**Shadow recipe (with `glow={driverColor}`):**
```
0 1px 0 rgba(255,255,255,0.95) inset,
0 -1px 0 rgba(255,255,255,0.5) inset,
0 14px 36px -14px color-mix(in oklab, {color} 35%, transparent),
0 1px 3px -1px rgba(60,20,15,0.10)
```

**Critical:** in production, only opt the genuine "hero" surfaces into the colored glow (start card, streak, result hero, library section heads, profile card). Default cards stay neutral. Earlier iterations red-glowed everything and the canvas felt overwhelming.

### Background Canvas

A pure white (light) or near-black (dark) base with one or more soft circular gradients ("blooms") radial-painted on top, blurred 40–50px in light mode. The bloom color comes from the user's driver color once the quiz is locked, so the canvas subtly hue-shifts to match their profile.

- **Light theme:** flat `#ffffff` + ONE quiet driver-color halo at ~14% opacity, top-third position. Glass cards mid-screen pick up gentle refraction.
- **Dark theme:** `#0e0306` + three-orb bloom (primary 85%, secondary 38%, accent 60%) + fractal-noise overlay at 18% opacity with `mix-blend-mode: overlay`.
- Direction (`dir`): `tl`, `tr`, `bl`, `br`, `center` — sets which corner the primary bloom sits in.

### Driver Wave Animation

A signature interactive element — animated SVG sinusoidal lines, one per driver, that "breathe" and serve as ambient texture in the quiz, profile cards, library sections, and settings header.

- 3–4 stacked sine paths per render, each with its own amplitude, frequency, speed, phase, and color
- "All-drivers" mode renders one line per driver in their respective colors
- Single-driver mode renders 3 stacked harmonics in that driver's wave color
- Wrapped in `requestAnimationFrame`; `feGaussianBlur stdDeviation=1.4` glow filter behind the crisp lines
- Linear-gradient `stop-opacity` fades both ends to 0 so the wave appears to taper into the card edges
- Light theme uses `mix-blend-mode: multiply` on the wave; dark uses `screen`

### Iconography

Custom 22–24px line icons (stroke-width 2, stroke-linecap round). Stored in a single `Icon` map (see `screens/glass.jsx`). All icons inherit `currentColor`. **Do not** use a generic icon library — these match the system's quiet-line aesthetic. Keys used: `arrow, back, close, mic, send, plus, bell, user, chat, spark, paw, book, history, trophy, settings, search, flame, star, check, voice, text`.

### Buttons

**`PillButton`** is the primary CTA. Three variants:
- **`solid`** (default): height 48 (54 for sticky CTAs), red gradient `linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))`, white text, dropped shadow with red tint, inset white highlight on top edge. The icon goes on the trailing side via `flex-direction: row-reverse`.
- **`glass`**: white-translucent with backdrop-blur — for secondary actions next to a solid primary.
- **`ghost`**: transparent with thin red-tinted border — used rarely.

Pill buttons have a press affordance: `transform: scale(0.97)` on mousedown.

**Other button patterns:**
- **Icon button** (top bar / chrome): 36×36 round, glass tint, soft border. See `iconBtn(dark)` helper.
- **Chip**: 8×14 padding pill, white-translucent. Active state = solid red gradient, white text.
- **Segmented control** (mode toggles): 3px-padded pill container with inner pills that activate to red gradient.
- **List card with onClick**: any `Glass` with an `onClick` becomes pressable; cursor changes to pointer.

### Motion

Defined as keyframes in `glass.jsx`. Use these consistently — avoid inventing new motion.

- `pbtPulse` — 3.2s ease, scale 1 → 1.06, opacity 0.9 → 1 (Orb)
- `pbtFloat` — 6px Y oscillation
- `pbtFadeUp` — 0.3–0.4s ease, opacity + 8px Y on entry (used on every list item, every quiz option, every chat message)
- `pbtSlideIn` — 20px X on entry
- `pbtTypingDot` — staggered 1.4s, three dots with 0.2s delays
- `pbtRingBreath` — 2.4s, scale 1 → 1.2, opacity 0.5 → 0 (voice mode listening rings)
- `pbtBarWave` — 0.8–1.3s scaleY oscillation (voice waveform)

**Standard transitions:**
- Glass press: `transform 0.15s ease`
- Selection states: `all 0.2s`
- Progress bars / fills: `width 0.6s ease`, score rings `stroke-dashoffset 1s ease`
- Typing dot fade-in/out: 0.3s

### The Orb

A reusable "AI" object — the brand mascot. Three layers:
1. Outer glow: radial gradient at 0.5 × intensity, blur 8px, optional pulse animation
2. Core sphere: radial gradient at 30% 28% (white → light red → cherry → deep crimson), inset shadows for depth (top-left highlight, bottom-right shadow), drop shadow with red tint
3. Specular highlight: small white blur at top-left + tiny pinpoint dot at top-right

Used at 32px (brand mark in onboarding), 42px (chat header avatar), 84px (today's pick card), 120–180px (hero / voice mode listening indicator).

---

## App Architecture

### State Model
The prototype uses local React state. In production, externalize to Redux/Zustand/RTK or your platform's state pattern.

```ts
type AppState = {
  // ECHO profile (set after quiz, retake-able from settings)
  profile: {
    primary: 'Activator' | 'Energizer' | 'Analyzer' | 'Harmonizer';
    secondary: 'Activator' | 'Energizer' | 'Analyzer' | 'Harmonizer';
    tally: Record<DriverKey, number>;
    answers: DriverKey[];
  } | null;
  profileLocked: boolean;          // flips true after quiz; tints canvas

  // Active scenario (set when launching from create or "today's pick")
  scenario: {
    breed: string;
    age: 'Puppy (<1)' | 'Junior (1-3)' | 'Adult (3-7)' | 'Senior (7+)';
    objection: string;             // category title
    persona: 'Skeptical' | 'Anxious' | 'Busy' | 'Bargain-hunter' | 'Devoted';
    difficulty: 1 | 2 | 3 | 4;     // Coachable → Combative
    context: string;               // optional freeform
  } | null;

  // Pet analyzer (independent, persistable as a record)
  pet: {
    name: string;
    breed: string;
    weightKg: number;
    bcs: 1..9;
    mcs: 'normal' | 'mild' | 'moderate' | 'severe';
    activity: 'active' | 'inactive';
  } | null;

  // Session history
  sessions: Session[];

  // Theme + UI prefs
  theme: 'light' | 'dark';
  voiceModeDefault: boolean;
};
```

### Routing / Screens
All screens are mobile-first, designed for a 414×896 viewport (iPhone Pro Max-class). On wider screens the prototype centers a 440px-max column; in production this should be a real responsive breakpoint or a native phone layout.

| Route | Component | Has Tab Bar |
|---|---|---|
| `/onboarding` | OnboardingScreen | no |
| `/quiz` | QuizScreen | no |
| `/result` | ResultScreen | no |
| `/home` | HomeScreen | **yes** |
| `/create` | CreateScreen | no |
| `/chat` | ChatScreen | no |
| `/stats` | StatsScreen | no |
| `/history` | HistoryScreen | **yes** |
| `/analyzer` | PetAnalyzerScreen | no |
| `/resources` | ResourcesScreen | **yes** |
| `/settings` | SettingsScreen | **yes** |

**Tab bar** lives at the bottom 14px from the safe area, floats over the gradient as a glass pill. Four tabs: **Train** (home), **History**, **Library** (resources), **You** (settings). Active tab uses red gradient fill + white text + small drop shadow.

**Top bar** is sticky, transparent by default. Optional back button (round 36×36 glass), centered title (16px / weight 600), and trailing slot for icons (notification bell, search, end-session, avatar).

### Navigation Flows

```
Cold start
  Onboarding (3-slide carousel)
    → Quiz (15 questions, 4 options each)
      → [tie? +1 tie-breaker question]
      → Result (driver profile)
        → Home

Home
  ├─ Today's pick → Chat → Stats → Home
  ├─ Build a scenario → Create → Chat → Stats → Home
  ├─ Pet Analyzer → (live computation, no submit)
  ├─ Library → Resources (expandable accordions)
  └─ Recent sessions → Stats (read-only review)

Tabs: Train · History · Library · You
  History → Stats (read-only)
  You → Retake quiz → Quiz (returns to Result)
```

---

## Screens — Detailed Spec

> For exact layout, copy, and component mapping, treat the JSX in `design_files/screens/` as the source of truth. The descriptions below summarize intent and the parts a developer might miss.

### 1. Onboarding (`screens/onboarding.jsx`)
3-slide vertical carousel, manually advanced. Each slide: brand mark (Orb 32 + "PBT" + "PUSHBACK TRAINING" eyebrow) → hero Orb 180px → 42px sentence headline (weight 400, line breaks intentional, e.g. "Train the\nawkward moments.") → 15px paragraph → progress dots (active = 2× width, red gradient) → "Continue" / "Take the ECHO Quiz" pill button → "I already have an account · Sign in" ghost link.

**Behavior:** No persistence in prototype; in production, persist a `seenOnboarding` flag and skip on subsequent launches. Sign-in flow is unbuilt — wire to your auth provider.

### 2. ECHO Driver Quiz (`screens/quiz.jsx`)
**15 multiple-choice questions in 3 parts** (5 each: Workplace dynamics, Communication & interaction, Personal style & values), each with **4 options keyed to the four drivers**. Then a **golden tie-breaker question** if the top two driver scores tie.

Top: Back button + "ECHO Driver Quiz" title + counter ("3 / 15"). Below: animated `QuizWave` (4-line driver-tinted SVG waveform with a progress dot riding the wave). Below: thin progress bar (red gradient fill).

Each question: eyebrow ("Part 1 · Workplace dynamics") + 26px question (weight 400) + 4 stacked Glass option cards. Each option has a 28×28 letter circle (A/B/C/D), a 14.5px option label. On select: chosen card scales to 0.98, gets red border + soft red gradient bg; others fade to opacity 0.4. After 280ms, advance.

**Scoring:** Tally answers per driver. Sort descending. If top two tied, show the single `TIE_BREAKER` question. Final result has `primary`, `secondary`, full `tally`, and the answer log.

**Question content:** All 15 questions and all 4-option mappings are in `QUIZ` and the per-driver descriptions are in `ECHO_DRIVERS` in `screens/quiz.jsx`. Do not paraphrase — use them verbatim.

### 3. Quiz Result (`screens/result.jsx`)
**Hero card** (Glass, glow=primary.color, overflow:hidden):
- Driver-color radial bloom anchored bottom-right (-80, -60), 280×280, opacity 0.45, blur 14
- "PRIMARY DRIVER · 87% MATCH" mono pill in driver gradient
- 48px headline "The {Driver}" in driver color
- Italic 14px tagline
- 15px blurb (4 lines max)
- `DriverWave` for primary driver across the lower 110px band (does not overlap text)

**Driver mix card**: Out-of-N answers, four labeled bars per driver (color dot + name + count/percent + horizontal fill bar with driver gradient + glow).

**"The {Driver} leader · in practice" section**: 5 trait cards (Glass, glow=primary.color), each = check-icon circle + 14px trait name + 13px description. Trait list is per-driver in `ECHO_DRIVERS[driver].traits`.

**Growth Edge callout**: Glass with a 3px left border in driver.accent. "GROWTH EDGE" eyebrow in driver.accent + 14px copy from `ECHO_DRIVERS[driver].growth`.

**Support driver card**: Smaller version of the hero, with the secondary driver's wave below the info block.

**Sticky bottom CTA**: "Start training" pill button.

### 4. Home (`screens/home.jsx`)
- Top bar: bell icon + 36×36 avatar circle (red gradient, "SR" initials) → tapping avatar goes to Settings.
- Greeting: "Good morning, Sam" (14px) + "What pushback are\nyou ready for today?" (36px headline)
- Driver tag: small mono row with a glowing dot — "Driver · The {primary}"
- **Streak strip** (Glass + glow=primary.color): flame icon → "12-day streak" + "3 scenarios · 84% avg score this week" → 7 day-of-week pills (M T W T F S S) with first 5 in red gradient, rest dimmed.
- **Today's pick card** (Glass + glow + minHeight 200): "TODAY'S PICK" eyebrow → 26px scenario title ("Cost objection\non a Rx diet") → 13px context line → "Start scenario" pill + "Skip" glass pill. Floating Orb 84px in top-right.
- **2×2 quick actions**: "Build a scenario" (plus icon) and "Pet Analyzer" (paw icon) — each is a small Glass tile with a 36×36 glass icon backing.
- **Library promo strip**: full-width Glass with the all-drivers wave background at 0.5 opacity. Book icon + "Clinical library" + subline.
- **Recent sessions list**: title row with "See all →" → 3 list rows, each Glass with chat icon, title + breed + time, and a `ScoreChip` (44×44 circle, color-coded by score band).

### 5. Create Scenario (`screens/create.jsx`)
Form-style screen with section headers. Each section has a mono eyebrow label.

- **Breed** — search input (Glass with `Icon.search` prefix) + chip row of common breeds.
- **Life stage** — 2×2 grid of Glass cards: Puppy, Junior, Adult, Senior. Selected = red border + soft red bg.
- **The pushback** — 5 stacked radio-style Glass cards, each with circle indicator (filled red gradient + check on select), title + italic example quote.
- **Owner persona** — chip row: Skeptical, Anxious, Busy, Bargain-hunter, Devoted.
- **Difficulty** — 4-stop slider (Coachable → Skeptical → Hostile → Combative). Tap labels to set; bar fills in red gradient by step × 25%.
- **What actually happened (optional)** — 90px-min textarea inside a Glass.

**Sticky bottom**: "Generate scenario" pill (red, full-width, sparkle icon, scenario object passed to chat on launch).

### 6. Chat / Live Scenario (`screens/chat.jsx`)
Two-mode screen — text or voice. Toggled with a segmented control in the scenario header.

**Header (Glass strip)**: Pulsing Orb 42 → "Maria · Lab owner, 7yr" + green-dot "LIVE · 02:14" + segmented mode toggle (text/voice icons). Right of top bar: "Coach hints" sparkle icon (opens drawer) + "End" pill (goes to Stats).

**Text mode:**
- Scrollable message list, gap 10
- System message = centered red mono pill ("SCENARIO · Cost objection on a Rx diet")
- AI message = left-aligned Glass bubble, ink text on translucent white, 78% max width
- User message = right-aligned solid red gradient bubble, white text, no shine
- Each message gets a Geist Mono caption beneath: "MARIA · 02:13" / "YOU · 02:15"
- Typing indicator = Glass bubble with 3 staggered red dots (`pbtTypingDot`)
- **Composer**: Glass strip — plus icon + transparent input + send button (red gradient when input has text, glass when empty)
- **Quick chips** below composer: scrollable row of suggested response openers ("Acknowledge cost", "Reframe value", "Ask about her day", "Cite the GI study"). Tap inserts as input prefix.

**Voice mode:**
- 3 nested breathing rings around an Orb 140 with intensity 1.4
- "LISTENING" red mono eyebrow
- 22px live transcription text, ink color, centered
- 10-bar animated waveform below (`pbtBarWave` with staggered durations)
- Bottom controls: 56 close (mute) + 76 mic primary (red gradient) + 56 sparkle (coach)

**Coach drawer** (modal from bottom): Glass with backdrop blur, "COACH HINTS · LIVE" eyebrow + 22px insight headline + numbered list of 3 actionable hints. Tap outside to dismiss.

### 7. Session Stats / Scorecard (`screens/stats.jsx`)
- **Hero**: ScoreRing (120px SVG circle, red-gradient arc) + 28px "Strong session.\nOne thing to fix." + meta line "3:24 · 11 turns · Cost objection"
- **Breakdown** section: 7 dimension cards, each = label + numeric score (color-coded green/amber/red) + horizontal red gradient bar + 12px coaching note. Dimensions: Empathy & tone, Active listening, Product knowledge, Objection handling, Confidence, Closing effectiveness, Response speed.
- **Key moments** section: 3 cards with 3px left border (green for wins, red for misses) — timestamp + label + italic quote/note.
- **Sticky bottom**: "Home" glass + "Run it again" red pill.

### 8. History (`screens/misc.jsx`)
- "Every conversation,\ntracked and tagged." 32px headline + meta "27 sessions · 81% avg score"
- Filter chip row (All, Cost, Trend beliefs, Breeder advice, Rx diets, Brand switch)
- Sessions grouped by day (`Today`, `This week`, `Earlier`) with mono group labels
- Each row: same `ScoreChip` pattern as Home recents, full-tap goes to Stats

### 9. Pet Analyzer (`screens/misc.jsx`)
Live calculator screen — no submit button, all values update the verdict in real time.

- **Pet header card**: editable name + breed inputs, paw icon avatar
- **Weight & activity card**: kg slider (2–49) + dual pill toggle (Active 130×kg^0.75 / Inactive 95×kg^0.75)
- **Body Condition Score (BCS) 1–9**: row of 9 score buttons; selected = colored gradient (color comes from per-score `BCS_LEVELS[i].color`); active label + description below in tinted box
- **Muscle Condition Score (MCS)**: 2×2 grid — Normal (green) / Mild (yellow) / Moderate (amber) / Severe (red), each card showing label + 11px description
- **Calorie target & verdict** card: Big 38px target kcal/day + "BCS X/9" pill in BCS color; verdict tone box (good/warn/ok) with mono eyebrow + 13.5px advice
- **Reference table card**: book icon + closest-row lookup from the 49-row WSAVA calorie table
- Footer source line: "WSAVA · 2006 NRC DAILY MAINTENANCE ENERGY REQUIREMENT"

**Calorie math:**
- Active: `Math.round(130 * Math.pow(kg, 0.75))`
- Inactive: `Math.round(95 * Math.pow(kg, 0.75))`

**Verdict logic** (see `verdict` block in `PetAnalyzerScreen`):
- BCS 4–6 + MCS normal → "good"
- BCS 7–9 → "warn — caloric deficit + re-weigh in 4 weeks"
- BCS 1–3 → "warn — rule out medical, increase nutrient density"
- MCS not normal → "warn — geriatric / chronic disease screen"
- otherwise → "ok"

### 10. Library / Resources (`screens/misc.jsx`)
4 expandable section cards — Nutrition assessment, Body condition score, Muscle condition score, Calorie targets. Each has a mono eyebrow in the section's color, 22px title, 12.5px summary, an animated background `DriverWave` in the section's tied driver color, and on tap expands to show 3–5 sub-topic detail blocks. The driver tie-in is intentional: each clinical topic is housed under the driver who'd naturally lead with it (Harmonizer = nutrition assessment, Energizer = BCS visuals, Analyzer = MCS palpation, Activator = calorie math).

Footer card lists sources: WSAVA Global Nutrition Toolkit, Body & Muscle Scoring Charts (2020), Tufts Univ. MCS chart (2013), 2006 NRC DMER.

### 11. Settings / You (`screens/misc.jsx`)
- Profile hero card (Glass + glow=primary.color) with the user's primary `DriverWave` as background, 64×64 red-gradient initials avatar, name, role, and "The {Driver}" tag
- 3 settings groups (Account / Practice / About), each = mono eyebrow + Glass card with rows. Rows: label left, value or "→" right, optional `onClick` for navigations. "Retake ECHO Quiz" routes back to `/quiz`.

---

## Tweaks (Internal Tool — not in the shipped app)
The prototype includes a developer "Tweaks" panel (toolbar-toggled) for live-tuning theme/dir/blur intensity/font/start-screen. This is design-tooling only and should not ship.

---

## Design Tokens — Quick Reference

```ts
// Brand
const colors = {
  brand: {
    cherry:  'oklch(0.62 0.22 22)',
    crimson: 'oklch(0.55 0.24 18)',
    coral:   'oklch(0.74 0.18 28)',
    blush:   'oklch(0.94 0.05 20)',
    cream:   'oklch(0.985 0.012 60)',
    ink:     'oklch(0.22 0.04 20)',
    mute:    'oklch(0.50 0.04 20)',
  },
  drivers: {
    Activator:  { primary: 'oklch(0.62 0.22 25)', accent: 'oklch(0.52 0.24 22)', soft: 'oklch(0.92 0.06 22)', wave: 'oklch(0.62 0.22 22)' },
    Energizer:  { primary: 'oklch(0.85 0.16 95)', accent: 'oklch(0.65 0.16 80)', soft: 'oklch(0.96 0.08 95)', wave: 'oklch(0.70 0.18 70)' },
    Analyzer:   { primary: 'oklch(0.72 0.14 235)', accent: 'oklch(0.55 0.18 245)', soft: 'oklch(0.94 0.05 235)', wave: 'oklch(0.62 0.16 245)' },
    Harmonizer: { primary: 'oklch(0.70 0.18 145)', accent: 'oklch(0.55 0.18 145)', soft: 'oklch(0.94 0.06 145)', wave: 'oklch(0.60 0.16 145)' },
  },
  surface: {
    canvasLight: '#ffffff',
    canvasOuterLight: '#fff7f5',
    canvasDark: '#0e0306',
    canvasOuterDark: '#070203',
    glassLight: 'rgba(255,255,255,0.18)',
    glassDark:  'rgba(28,12,14,0.22)',
    glassBorderLight: 'rgba(255,255,255,0.7)',
    glassBorderDark:  'rgba(255,255,255,0.14)',
  },
  score: {
    good: 'oklch(0.55 0.18 145)',
    ok:   'oklch(0.65 0.18 60)',
    poor: 'oklch(0.55 0.24 18)',
  },
};

const radii = { sm: 12, md: 16, lg: 20, xl: 26, hero: 28, phone: 32, pill: 9999 };
const blurs = { compact: 24, medium: 28, heavy: 36, page: 40 };
```

---

## Implementation Notes

1. **`backdrop-filter` on React Native**: not supported natively — use `@react-native-community/blur` (`<BlurView>`) or `expo-blur`. iOS quality is much better than Android; on Android, fall back to a solid translucent fill.
2. **OKLCH on iOS Safari**: supported in 15.4+. For broader support, pre-compile to hex/RGB using `culori` or similar at build time.
3. **Animated SVG waves**: in RN, use `react-native-svg` + `react-native-reanimated` for the `requestAnimationFrame`-driven path mutations. On web, the inline JSX pattern in `glass.jsx`'s `DriverWave` translates directly.
4. **Voice mode**: the prototype only mocks the listening UI. Wire up your real voice pipeline (Web Speech API for web, on-device STT for native).
5. **AI client**: scenarios in `chat.jsx` are scripted. Replace with your conversational LLM endpoint, passing `{ scenario, persona, difficulty, userMessages }` and streaming the response.
6. **Scoring**: the dimensions (Empathy, Listening, Product knowledge, Objection handling, Confidence, Closing, Pacing) are stable; the rubric and the LLM-derived sub-scores are not yet defined — flag this to the eval/AI team.
7. **Persistence**: profile, sessions, pets, settings need a backend. The data shapes above are a starting contract.
8. **Accessibility**: glass cards have low contrast against busy backgrounds — all interactive surfaces need a `:focus-visible` ring (use `currentColor` accent at 0.4 opacity, 2px outline-offset). Add `aria-label` to icon-only buttons. Honor `prefers-reduced-motion` by short-circuiting `pbtPulse`, `pbtRingBreath`, `DriverWave`, and the voice waveform.

---

## Files in this Bundle

```
design_handoff_pbt/
├── README.md                        ← this file
└── design_files/
    ├── PBT.html                     ← entry point (also includes Tweaks panel + font loading)
    ├── app.jsx                      ← root router + state
    ├── tweaks-panel.jsx             ← dev-only Tweaks UI
    ├── screens/
    │   ├── glass.jsx                ← THE design system: PBT, GradientBg, Glass,
    │   │                              PillButton, Orb, Icon, DriverWave, keyframes
    │   ├── shell.jsx                ← AppFrame, TopBar, TabBar, Page
    │   ├── onboarding.jsx           ← OnboardingScreen
    │   ├── quiz.jsx                 ← ECHO_DRIVERS, QUIZ (15 Qs), TIE_BREAKER, QuizScreen
    │   ├── result.jsx               ← ResultScreen
    │   ├── home.jsx                 ← HomeScreen, ScoreChip, iconBtn
    │   ├── chat.jsx                 ← ChatScreen (text + voice)
    │   ├── create.jsx               ← CreateScreen, Section, Chip
    │   ├── stats.jsx                ← StatsScreen, ScoreRing
    │   └── misc.jsx                 ← HistoryScreen, PetAnalyzerScreen
    │                                  (incl. CAL_TABLE, BCS_LEVELS, MCS_LEVELS,
    │                                  calorieFor), ResourcesScreen, SettingsScreen
    └── assets/
        ├── wave-activator.png       ← static fallback waves (the live SVG version
        ├── wave-energizer.png         in DriverWave is preferred; PNGs are kept
        ├── wave-analyzer.png          for reference/print only)
        ├── wave-harmonizer.png
        └── wave-all.png
```

**Recommended reading order for the implementing developer:**
1. `screens/glass.jsx` — design system primitives
2. `screens/shell.jsx` — app frame + chrome
3. `app.jsx` — routing
4. `screens/quiz.jsx` — driver definitions, the most content-heavy file
5. The remaining screens, in any order

Good luck. Ship the system honestly — translucent surfaces, warm canvas, ECHO at the center, copy that respects the user.
