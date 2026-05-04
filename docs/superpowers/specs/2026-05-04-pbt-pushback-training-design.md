# PBT — Pushback Training: Rebuild Design Spec

**Status:** Draft for user review
**Date:** 2026-05-04
**Owner:** RethinkReality (Dapo)
**Source app:** Royal Canin Objection Trainer (this repo)
**Target app:** PBT (Pushback Training)

---

## 1. Goal

Rebuild this app end-to-end against the design handoff in `resources/design_handoff_pbt/`, while preserving the existing Gemini AI roleplay + scoring behavior. Replace the current 6-type Echo personality system with the design-handoff 4-driver ECHO system. Switch from authenticated-first to anonymous-first usage, with optional account upgrade. Add a knowledge-base layer that grounds the AI in the source training materials in `resources/`.

## 2. Non-goals

- No native iOS/Android shell. Web only (PWA) for v1.
- No real-time collaborative training (single user per session).
- No vector database / embedding-based RAG. Knowledge base is in-context only.
- No email verification flow live. Scaffold present but disabled by feature flag.
- No payment / billing. Training is free.
- No multilingual UI. English only for v1.

## 3. Constraints inherited from current app

| Constraint | Source | Why preserve |
|---|---|---|
| `@google/genai ^1.38.0` SDK | `package.json` | The existing AI integration uses this SDK and a specific bidirectional `ai.live.connect()` API for voice. Migrating to a different SDK is out of scope. |
| Model strings `gemini-3.1-flash-preview` (text) and `gemini-3.1-flash-live-preview` (voice) | `services/geminiService.ts`, `components/LiveVoiceChat.tsx` | User-confirmed: 2.5 family is deprecated; 3.1 is the working live model. Keep as-is. |
| `process.env.GEMINI_API_KEY` injected via Vite `define` block | `vite.config.ts` (commit c7e80ef) | Build pipeline already handles this. |
| AI contract: `generateRoleplayMessage(scenario, history, userInput?)` and `evaluateObjectionResponse(scenario, transcriptString)` | `services/geminiService.ts` | The chat screen and scoring screen both rely on these exact signatures. |
| Voice tool calls: `updateEmotion({emotion: 'red'\|'yellow'\|'green'})` and `endSimulation({...})` | `components/LiveVoiceChat.tsx` | The live model is configured with these as function declarations. The new voice screen must implement the same handler logic. |
| `ScriptProcessorNode` 16 kHz mic capture / 24 kHz speaker playback | `LiveVoiceChat.tsx` | Works today. Migration to `AudioWorkletNode` is a separate cleanup, not in scope. |

## 4. Architecture

### 4.1 Stack

- **React 19** + TypeScript ~5.8 (already present)
- **Vite 6** with `@vitejs/plugin-react` (already present)
- **Tailwind CSS 4** via `@tailwindcss/vite` (already present)
- **Framer Motion** (`motion ^12.38.0`, already present) for screen transitions and the design's named keyframes
- **shadcn/ui** for primitives (Dialog, Tabs, Slider, Switch, Toast)
- **`@supabase/supabase-js`** (NEW) for the optional account upgrade
- **`vitest` + `@testing-library/react` + `@testing-library/user-event` + `jsdom`** (NEW) for TDD
- **`zod`** (NEW, optional) for runtime validation of localStorage contents
- Routing: keep the current single-state-machine pattern from `App.tsx`. No React Router. The design only needs ~11 screens and a tab bar; an enum-keyed switch is enough and avoids a router dependency. (See §4.4.)

### 4.2 Folder layout

```
src/                              # NEW — move components/services/data here
├── app/
│   ├── App.tsx                   # Top-level state machine + theme provider
│   ├── routes.ts                 # Screen enum + route → component map
│   ├── providers/
│   │   ├── ThemeProvider.tsx     # Light/dark, prefers-color-scheme aware
│   │   ├── ProfileProvider.tsx   # ECHO profile + locked driver tint
│   │   ├── SessionProvider.tsx   # Anonymous session + optional Supabase user
│   │   └── ToastProvider.tsx
│   └── flags.ts                  # EMAIL_VERIFICATION_ENABLED, etc.
├── design-system/
│   ├── tokens.ts                 # OKLCH palette, spacing, radii, blurs
│   ├── tokens.css                # CSS vars wired from tokens.ts
│   ├── Glass.tsx
│   ├── PillButton.tsx
│   ├── Orb.tsx
│   ├── Icon.tsx                  # 22-key custom line icon map
│   ├── DriverWave.tsx            # Animated SVG sinusoidal lines
│   ├── GradientBg.tsx            # Canvas with driver-tinted halo
│   ├── ScoreChip.tsx
│   ├── ScoreRing.tsx
│   ├── Chip.tsx
│   ├── Segmented.tsx
│   ├── keyframes.ts              # pbtPulse, pbtFadeUp, pbtBarWave, etc.
│   └── index.ts
├── shell/
│   ├── AppFrame.tsx              # Phone-frame max-width column
│   ├── TopBar.tsx
│   ├── TabBar.tsx                # 4 tabs: Train · History · Library · You
│   └── Page.tsx                  # Standard page padding + scroll
├── screens/
│   ├── OnboardingScreen.tsx      # 3-slide carousel + T&C modal first run
│   ├── QuizScreen.tsx            # 15 Qs + tie-breaker
│   ├── ResultScreen.tsx
│   ├── HomeScreen.tsx
│   ├── CreateScreen.tsx
│   ├── ChatScreen.tsx            # Text + voice modes — wraps existing AI service
│   ├── StatsScreen.tsx           # 7-dimension scorecard
│   ├── HistoryScreen.tsx
│   ├── PetAnalyzerScreen.tsx
│   ├── ResourcesScreen.tsx       # Library
│   └── SettingsScreen.tsx
├── features/
│   ├── auth/
│   │   ├── supabaseClient.ts
│   │   ├── useAccountUpgrade.ts
│   │   ├── SaveProgressBanner.tsx
│   │   └── AccountUpgradeModal.tsx
│   ├── chat/
│   │   ├── useTextChat.ts        # Wraps generateRoleplayMessage
│   │   ├── useVoiceChat.ts       # Wraps ai.live.connect — extracted from LiveVoiceChat.tsx
│   │   ├── ChatComposer.tsx
│   │   ├── ChatBubble.tsx
│   │   ├── CoachDrawer.tsx
│   │   └── VoiceMode.tsx
│   ├── quiz/
│   │   ├── useQuiz.ts            # 15 Qs + tie-break logic, returns Driver
│   │   └── QuizOption.tsx
│   ├── pet-analyzer/
│   │   ├── usePetAnalyzer.ts     # BCS/MCS/calorie verdict
│   │   └── BcsScale.tsx
│   └── scoring/
│       ├── useScoring.ts         # 7-dimension scoring orchestrator
│       └── DimensionBar.tsx
├── services/
│   ├── geminiService.ts          # MOVED — preserved API; extended scoring schema
│   └── voiceSession.ts           # NEW — extracted from LiveVoiceChat.tsx
├── data/
│   ├── echoDrivers.ts            # NEW — 4 drivers (Activator/Energizer/Analyzer/Harmonizer)
│   ├── quizQuestions.ts          # NEW — 15 verbatim Qs + tie-breaker
│   ├── scenarios.ts              # REWRITTEN — design-handoff Scenario shape
│   ├── personas.ts               # 5 owner personas
│   ├── pushbackCategories.ts     # 5 objection categories
│   ├── bcsLevels.ts              # 9 BCS entries verbatim from prototype
│   ├── mcsLevels.ts              # 4 MCS entries
│   ├── calorieTable.ts           # 49-row WSAVA table
│   ├── actMethod.ts              # PRESERVED with tweaks
│   └── knowledge/                # NEW — RAG-lite
│       ├── driverProfiles.ts     # Verbatim trait/stress/style content per driver
│       ├── pushbackTaxonomy.ts   # Categorized objections + ACT response patterns
│       ├── scenarioTranscripts.ts # Distilled examples from training transcripts
│       ├── actGuide.ts
│       ├── clinicalReference.ts  # WSAVA, BCS, MCS, calorie formula
│       ├── scoringRubric.ts      # 7-dimension rubric, 4 bands, examples
│       └── promptBuilders.ts     # buildCustomerSystemPrompt, buildScoringSystemPrompt
├── lib/
│   ├── storage.ts                # localStorage wrapper, namespaced keys, JSON safe
│   ├── id.ts                     # uuid generator
│   ├── classNames.ts
│   └── format.ts
└── tests/
    ├── setup.ts
    ├── design-system/*.test.tsx
    ├── features/*.test.tsx
    ├── data/*.test.ts
    └── e2e/*.test.tsx            # Full-flow tests w/ mocked Gemini

resources/                        # KEPT as-is — source of truth for knowledge data
docs/superpowers/specs/           # This spec
```

### 4.3 State model

```ts
type AppState = {
  profile: Profile | null;          // null until quiz completed
  profileLocked: boolean;
  scenario: Scenario | null;        // active scenario when /chat
  pet: PetRecord | null;            // last analyzer record
  sessions: SessionRecord[];        // chat history (capped at 50; FIFO)
  theme: 'light' | 'dark' | 'system';
  voiceModeDefault: boolean;
  termsAcceptedAt: string | null;   // ISO timestamp
  user: SupabaseUser | null;        // null = anonymous
  bannerDismissedUntil: string | null;
};

type DriverKey = 'Activator' | 'Energizer' | 'Analyzer' | 'Harmonizer';

type Profile = {
  primary: DriverKey;
  secondary: DriverKey;
  tally: Record<DriverKey, number>;
  answers: DriverKey[];
  takenAt: string;
};
```

State persists to `localStorage` under namespaced keys: `pbt:profile`, `pbt:sessions`, `pbt:theme`, `pbt:terms`, `pbt:pet`, `pbt:banner`. All reads validated; corruption → reset that slice and continue. The session-id is generated on first load (`pbt:session_id` UUID). Total quota target < 200 KB.

### 4.4 Routing

Single state machine (`useReducer`) keyed by `Screen` enum. Tab bar visibility is a property of each screen entry. Stack-based history allowed for back navigation (max depth 8).

```ts
type Screen =
  | 'onboarding' | 'quiz' | 'result'
  | 'home' | 'create' | 'chat' | 'stats'
  | 'history' | 'analyzer' | 'resources' | 'settings';
```

Cold-start logic:
1. No `pbt:terms` → Onboarding (first slide is T&C ack)
2. No `profile` → Quiz
3. Else → Home

### 4.5 The Glass design system

Implement primitives strictly to the prototype API but in production-idiomatic form (no inline styles for static values; CSS vars + Tailwind). Components and their public props/contracts are documented in `design-system/*.tsx` JSDoc; the README's specs are the source of truth.

- `<Glass blur tint radius padding glow shine border>` — base translucent surface
- `<PillButton variant=solid|glass|ghost size=md|lg icon onClick>`
- `<Orb size intensity pulse>` — three-layer mascot
- `<Icon name>` — 22-key custom line set (verbatim from `glass.jsx`)
- `<DriverWave driver|all>` — animated SVG, honors `prefers-reduced-motion`
- `<GradientBg dir intensity primaryColor secondaryColor>` — canvas halo
- `<Chip>`, `<Segmented>`, `<ScoreRing>`, `<ScoreChip>`

All four ECHO driver palettes ship as CSS vars; the `ProfileProvider` writes `--pbt-driver-primary`, `--pbt-driver-accent`, `--pbt-driver-soft`, `--pbt-driver-wave` to `:root` once a profile is locked.

### 4.6 Theme

Three modes: `light` (default new), `dark`, `system` (follows `prefers-color-scheme`). Toggle accessible from:
- Settings screen (full row with three-state segmented control)
- Home top bar (icon button — quick light/dark flip)

Persisted to `pbt:theme`. Applied via `data-theme="light|dark"` attribute on `<html>`. CSS vars switch by attribute.

## 5. Personality system migration

### 5.1 Drop the 6-type Echo
Old `EchoProfile` union (`Thinker|Persister|Rebel|Promoter|Harmonizer|Imaginer`) is removed. The current Bella scenario currently sets `suggestedEchoProfile: 'Harmonizer'`. The new `Scenario.suggestedDriver` field uses the 4-driver union.

### 5.2 Adopt the 4-driver ECHO

```ts
type DriverKey = 'Activator' | 'Energizer' | 'Analyzer' | 'Harmonizer';

interface DriverDefinition {
  key: DriverKey;
  name: string;                    // "The Activator"
  motto: string;                   // verbatim from prototype
  tagline: string;                 // 14px italic on result hero
  blurb: string;                   // 4 lines max
  traits: { name: string; description: string }[]; // 5 verbatim
  growthEdge: string;              // one paragraph
  // From source training materials in resources/Echo Personality Drivers/:
  motivation: string;
  communicationStyle: string[];
  strengths: string[];
  stressSignature: string;
  recognitionCues: string[];       // how to spot them in customers
  flexingTips: string[];           // how to adapt YOUR style toward them
  customerSamplePhrasings: string[]; // 5–10 verbatim pushback lines they'd use
  colors: { primary: string; accent: string; soft: string; wave: string };
}
```

The trait content + 15 verbatim quiz questions are sourced from `resources/design_handoff_pbt/design_files/screens/quiz.jsx`. The behavioural depth (motivation, stress signature, etc.) is sourced from `resources/Echo Personality Drivers/` PDFs and `resources/Echo Training Video Transcripts/` .docx files. Both are normalized into `data/echoDrivers.ts` and the deeper material is also exported from `data/knowledge/driverProfiles.ts` for AI prompt injection.

### 5.3 Quiz: 15 questions + tie-breaker

Verbatim from prototype `QUIZ` array. Each question has 4 options keyed `Activator|Energizer|Analyzer|Harmonizer`. Tally answers; sort descending; if top two tie → show `TIE_BREAKER` once. Final result has `primary, secondary, tally, answers`.

Persist to `localStorage` (`pbt:profile`). Locking the profile triggers the canvas halo to driver-tint.

## 6. AI integration — preserved + extended

### 6.1 Service contract (preserved verbatim)

```ts
// services/geminiService.ts

generateRoleplayMessage(
  scenario: Scenario,
  chatHistory: SimulationMessage[],
  userMessage?: string
): Promise<SimulationMessage>;

evaluateObjectionResponse(
  scenario: Scenario,
  conversationTranscript: string
): Promise<ScoreReport>;     // EXTENDED — see 6.3
```

The new chat screen calls these directly via a `useTextChat()` hook. The voice screen calls a thin `voiceSession.ts` extraction of the existing live-connect logic. Both functions continue to use `process.env.GEMINI_API_KEY`.

### 6.2 Knowledge-base injection (RAG-lite)

A single `buildCustomerSystemPrompt(scenario, profile?)` builder composes the system prompt from:
1. The base "you are a Royal Canin customer" frame
2. The scenario specifics (breed, age, persona, difficulty, pushback category, optional context)
3. The driver block from `driverProfiles.ts` for `scenario.suggestedDriver` (motivation, communication style, sample phrasings)
4. The matching pushback-category block from `pushbackTaxonomy.ts` (root concerns, what NOT to fall for)
5. A short clinical-reference snippet only if the scenario references a body-condition / nutrition concern

Token budget: target ≤ 3,000 tokens added per call. Acceptable given current scenario prompts are ~800 tokens.

A second builder `buildScoringSystemPrompt(scenario)` composes:
1. The Royal Canin Sales Coach frame (current)
2. The 7-dimension scoring rubric verbatim from `scoringRubric.ts` (band descriptions + example user lines per band)
3. The ACT method guide from `actGuide.ts`
4. The scenario-specific success criteria

Both builders are pure functions with snapshot tests so prompt drift is caught in CI.

### 6.3 7-dimension scoring (extended `ACTFeedback` → `ScoreReport`)

```ts
interface ScoreReport {
  // 7 dimensions, 0–100 each
  empathyTone: number;
  activeListening: number;
  productKnowledge: number;
  objectionHandling: number;
  confidence: number;
  closingEffectiveness: number;
  pacing: number;

  overall: number;                // weighted avg, see weights below
  band: 'good' | 'ok' | 'poor';   // ≥85 / 70-84 / <70

  // Preserved 3-step ACT scores (1-10) — internal scaffolding
  acknowledgeScore: number;
  clarifyScore: number;
  takeActionScore: number;

  // Coaching content
  critique: string;               // multi-paragraph
  betterAlternative: string;
  keyMoments: { ts: string; type: 'win'|'miss'; label: string; quote: string }[];
  perDimensionNotes: Record<DimensionKey, string>;
}
```

Weights for `overall` (justified by training emphasis): empathyTone 0.18, activeListening 0.16, productKnowledge 0.14, objectionHandling 0.20, confidence 0.10, closingEffectiveness 0.14, pacing 0.08. Adjustable in `data/knowledge/scoringRubric.ts`.

The Gemini call uses `responseMimeType: "application/json"` with a `responseSchema` matching `ScoreReport`. The voice mode `endSimulation` tool's schema is updated to return the same 7-dimension shape (so text and voice sessions produce identical scorecards).

### 6.4 When scoring fires

- **Text mode:** explicit "End session" press (replaces current "after 3 turns" trigger). Plus an auto-trigger after 8 user turns to keep pacing reasonable.
- **Voice mode:** the AI calls `endSimulation` (existing behavior) OR the user taps "End" on the Stats screen.

### 6.5 Coach drawer

The chat screen has a "Coach hints" sparkle icon (per design). Tapping triggers a separate Gemini call `getCoachHints(scenario, lastNTurns)` that returns 3 numbered next-best-action hints. This is a new addition, low priority — can ship as a stub returning canned hints in v1, real LLM call in v1.1.

## 7. Anonymous-first auth

### 7.1 Flow

1. First load → no `pbt:session_id` → generate UUID → set
2. Onboarding shows T&C/Privacy modal (must accept) → quiz → result → home
3. Home shows persistent "Save your progress" glass banner. Two actions: "Create account" / "Maybe later" (dismisses for 7 days).
4. Account creation modal: email + password (zxcvbn score ≥ 3), no email verification, Supabase `signUp` with `data: { display_name }`. On success: bulk-upload `localStorage` snapshot to a `profiles` row → toast → banner removes.
5. Sign-in path: separate modal, also email+password.
6. Once signed in, future `localStorage` writes also debounce-mirror to Supabase (1500ms).

### 7.2 Supabase schema

```sql
-- profiles: 1:1 with auth.users
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  echo_primary text,
  echo_secondary text,
  echo_tally jsonb,
  theme text default 'system',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- sessions: chat history
create table training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scenario jsonb not null,
  transcript jsonb not null,
  score_report jsonb,
  duration_seconds int,
  mode text check (mode in ('text','voice')),
  created_at timestamptz default now()
);

-- pets: analyzer history
create table pet_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text, breed text, weight_kg numeric,
  bcs int, mcs text, activity text,
  created_at timestamptz default now()
);

-- RLS: users can only see/edit their own rows
alter table profiles enable row level security;
alter table training_sessions enable row level security;
alter table pet_records enable row level security;
create policy "own_profile" on profiles for all using (auth.uid() = user_id);
create policy "own_sessions" on training_sessions for all using (auth.uid() = user_id);
create policy "own_pets" on pet_records for all using (auth.uid() = user_id);
```

### 7.3 Env

```
VITE_SUPABASE_URL=https://jryjftpojfczsbxlmgjp.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_-E9psRr8xfbEy3KmziKojw_kaZGzxuA
GEMINI_API_KEY=...
```

### 7.4 Feature flag for email verification

`src/app/flags.ts`:
```ts
export const FLAGS = {
  EMAIL_VERIFICATION: false,    // off for v1; AccountUpgradeModal short-circuits the verify step
};
```

When flipped on later, Supabase project settings will need email confirmations enabled (manual dashboard step).

## 8. Terms & Conditions

Modal shown on first load, before onboarding carousel. Content (drafted in spec, refinable in copy review):

1. **What this is** — training simulator, not real veterinary advice
2. **How AI works** — Gemini-backed, may produce errors, do not act on AI output as fact
3. **Knowledge base & data use** — anonymized session transcripts may be used to refine the rubric and knowledge base; user can opt out from Settings → Privacy → "Allow training data use"
4. **No medical advice** — clinical references are educational
5. **Standard privacy** — anonymous by default; account creation collects email only; no third-party sharing
6. **Acceptance** — checkbox + "I agree" CTA. Stored as `pbt:terms = ISO timestamp + version`.

## 9. Screen-by-screen scope

For each screen: source of truth is the corresponding JSX in `resources/design_handoff_pbt/design_files/screens/`. The README §"Screens — Detailed Spec" describes intent. Implementation reproduces layout, copy, and behavior; Tailwind + design-system primitives replace inline styles.

| # | Screen | Source file | Notes |
|---|---|---|---|
| 1 | Onboarding | `onboarding.jsx` | + T&C modal on first slide. "I already have an account · Sign in" wired to AccountUpgradeModal in sign-in mode. |
| 2 | Quiz | `quiz.jsx` | 15 Qs verbatim + tie-breaker. Persists profile. |
| 3 | Result | `result.jsx` | Hero + driver mix bars + traits + growth edge + secondary card + sticky "Start training" → Home. |
| 4 | Home | `home.jsx` | Greeting, streak strip (computed from sessions), today's pick (deterministic from profile primary), 2×2 quick actions, library promo, recent sessions. + SaveProgressBanner. |
| 5 | Create | `create.jsx` | Breed search, life stage 2×2, pushback radio, persona chips, difficulty slider, optional context. Sticky "Generate scenario" → Chat. |
| 6 | Chat | `chat.jsx` | Two modes (text/voice). Text wraps `useTextChat()`; voice wraps `useVoiceChat()`. Coach drawer. End → Stats. |
| 7 | Stats | `stats.jsx` | ScoreRing with `overall`. 7 dimension cards (vs design's 7). Key moments. Sticky Home + Run again. |
| 8 | History | `misc.jsx` | Filter chips by pushback category. Grouped by date. Tap → Stats (read-only). |
| 9 | Pet Analyzer | `misc.jsx` | Live-computed BCS/MCS/calorie verdict. Saves to `pbt:pet`. |
| 10 | Resources/Library | `misc.jsx` | 4 expandable accordions, each tied to a driver color. Sources footer. |
| 11 | Settings | `misc.jsx` | Profile hero, Account / Practice / About groups. Theme toggle. Retake quiz. Manage account (sign in / sign out / delete). |

## 10. Testing strategy (TDD)

Test categories and tools:

| Category | Tool | Where |
|---|---|---|
| Unit — pure functions (calorieFor, scoring weights, driver tally, prompt builders) | Vitest | `src/**/*.test.ts` |
| Component — design-system primitives (Glass, PillButton, Orb, ScoreRing) | Vitest + RTL | `src/design-system/__tests__/` |
| Hook — `useTextChat`, `useVoiceChat`, `useQuiz`, `usePetAnalyzer` | Vitest + RTL | `src/features/**/*.test.tsx` |
| Screen — render + key interactions per screen | Vitest + RTL + jsdom | `src/screens/__tests__/` |
| AI service — Gemini SDK calls mocked | Vitest with `vi.mock('@google/genai')` | `src/services/__tests__/` |
| End-to-end flow — onboard → quiz → home → chat → stats | Vitest + RTL with mocked services | `src/tests/e2e/` |
| Snapshot — system prompt builders | Vitest snapshot | `src/data/knowledge/__tests__/` |

TDD discipline (per superpowers TDD skill):
- Red → Green → Refactor for every new function/component
- AI service mocks are first-class fixtures (`tests/fixtures/gemini/*.json`)
- Visual styling deltas verified in browser via Vite preview, not in test (RTL won't catch glass blur look)

Coverage target: ≥80% for `lib/`, `features/`, `services/`, `data/knowledge/`. UI-only files (screens, design system) get behavioral tests but no coverage threshold.

## 11. Migration plan (high level)

1. **Phase 0** — install deps, scaffold `src/`, set up Vitest, port all assets and resources
2. **Phase 1** — design system primitives + tokens + theme provider (TDD; visible via Storybook-like sandbox route)
3. **Phase 2** — data layer (drivers, quiz Qs, scenarios, knowledge base) + lib/storage
4. **Phase 3** — screens 1-3 (onboarding, quiz, result) + T&C
5. **Phase 4** — screens 4-7 (home, create, chat, stats) + AI service rewrite + voice extraction
6. **Phase 5** — screens 8-11 (history, analyzer, resources, settings)
7. **Phase 6** — Supabase auth + SaveProgressBanner + sync
8. **Phase 7** — accessibility, reduced motion, perf, build
9. **Phase 8** — delete old `components/`, `App.tsx`, README rewrite

Detailed plan with task-sized chunks lives in `docs/superpowers/plans/2026-05-04-pbt-implementation.md` (next step after spec approval).

## 12. Risks & open questions

1. **Gemini model strings** — user confirmed `gemini-3.1-flash-preview` and `gemini-3.1-flash-live-preview` are working. We honor that, but the existing app should be smoke-tested against the API once before we lock the rewrite to the same strings.
2. **Voice live API quota** — `ai.live.connect()` is a metered streaming API. No usage limits enforced in the app today. Add a 5-minute hard cap per voice session to prevent runaway billing.
3. **Knowledge base size** — preliminary estimate: 8-12 KB of structured TS data, well below context limits. If it grows past 5 K tokens, we trim per-call by selecting only the relevant driver + pushback category slice.
4. **Glass on low-end Android** — `backdrop-filter` performance is unpredictable. Add a `prefers-reduced-transparency` fallback that switches glass tint to solid.
5. **Supabase schema migrations** — until MCP access to "Be Human" org is restored, migrations are hand-written SQL files committed to `supabase/migrations/` and run by the user via the Supabase dashboard SQL editor.
6. **localStorage quota** — bulk-storing transcripts could hit 5 MB on Chrome. Cap session history at 50, transcript length at 200 messages, lazy-load older from Supabase when signed in.

## 13. Success criteria

1. All 11 screens visually match the prototype JSX in light + dark
2. The 15-question quiz correctly determines primary + secondary drivers; tie-breaker fires when needed
3. Text chat: AI customer responds in-character per driver; scoring returns 7 dimensions matching the rubric
4. Voice chat: emotion orb transitions; `endSimulation` produces the same 7-dim ScoreReport
5. Anonymous user can complete: T&C → quiz → 1 chat → see scorecard, all without an account
6. Account upgrade preserves all `localStorage` state and continues to sync going forward
7. Theme switches light/dark/system without flicker; respects `prefers-color-scheme` on first load
8. `npm test` passes with ≥80% coverage on logic layers
9. `npm run build` produces a bundle under 500 KB gzipped (excluding fonts)
10. Lighthouse a11y ≥ 90 on Home and Chat screens

---

## Open items requiring user input

None blocking. Awaiting:
- (When MCP access to "Be Human" org is restored) Permission to run schema migrations against the Supabase project automatically. Until then, migration SQL files are checked in and run manually.
- (Optional) Copy review for the T&C content during Phase 3.
