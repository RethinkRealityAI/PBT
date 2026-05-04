# PBT — Pushback Training

AI-driven training simulator for veterinary teams. Practice the awkward client conversations — cost objections, breeder advice, raw-food evangelism, prescription-diet skepticism — against an AI roleplay customer whose personality and difficulty you can dial in. Score yourself across seven dimensions; track improvement over time.

Built for vets, vet techs, and front-of-house staff. Personality system based on the ECHO 4-driver model (Activator · Energizer · Analyzer · Harmonizer). Clinical references grounded in WSAVA and 2006 NRC. AI roleplay + scoring powered by Google Gemini.

## Quick start

```bash
npm install
# create .env.local with your keys (see below)
npm run dev
```

Required env vars in `.env.local`:

```
GEMINI_API_KEY=...                     # Google Gemini API key
VITE_SUPABASE_URL=...                  # Optional — enables account upgrade
VITE_SUPABASE_PUBLISHABLE_KEY=...      # Optional — enables account upgrade
```

The Gemini key is injected at build time via Vite's `define` block. Supabase is optional — without it, all state stays in `localStorage`.

## Scripts

```
npm run dev          # Vite dev server on :3000
npm run build        # Production bundle to dist/
npm run preview      # Preview the production bundle
npm test             # Vitest, single run
npm run test:watch   # Vitest in watch mode
npm run typecheck    # tsc --noEmit
```

## Architecture

```
src/
├── app/                        # App shell + providers + routing
├── design-system/              # Glass · PillButton · Orb · Icon · DriverWave · GradientBg · ScoreRing · ScoreChip · Chip · Segmented + tokens
├── shell/                      # AppFrame · TopBar · TabBar · Page
├── screens/                    # 11 screens — onboarding, quiz, result, home, create, chat, stats, history, analyzer, resources, settings + TermsModal
├── features/
│   ├── auth/                   # Supabase client · AccountUpgradeModal · SaveProgressBanner · useCloudSync · password strength
│   ├── chat/                   # useTextChat hook
│   ├── quiz/                   # useQuiz hook with 15-question + tie-breaker logic
│   └── pet-analyzer/           # usePetAnalyzer hook (BCS / MCS / kcal verdict)
├── services/                   # geminiService (text chat + 7-dim scoring) + types
├── data/
│   ├── echoDrivers.ts          # 4 ECHO drivers with traits + growth-edge content
│   ├── quizQuestions.ts        # 15 verbatim questions + tie-breaker
│   ├── scenarios.ts            # PUSHBACK_CATEGORIES, BREEDS, LIFE_STAGES, etc.
│   ├── bcsLevels.ts            # 9 BCS entries
│   ├── mcsLevels.ts            # 4 MCS entries
│   ├── calorieTable.ts         # 48-row WSAVA table + calorieFor()
│   └── knowledge/              # AI-only RAG-lite knowledge base
│       ├── driverProfiles.ts
│       ├── pushbackTaxonomy.ts
│       ├── actGuide.ts
│       ├── clinicalReference.ts
│       ├── scoringRubric.ts
│       └── promptBuilders.ts
├── lib/                        # storage, classNames, id
└── tests/                      # setup
supabase/migrations/            # Hand-applied SQL via Supabase dashboard
docs/superpowers/specs/         # Design spec
resources/                      # Design handoff prototype + ECHO knowledge sources
```

## The ECHO driver system

Replaces the older 6-type Echo. Four drivers from the design handoff:

- **Activator** — results-first, blunt, fast pace
- **Energizer** — warmth, stories, animated
- **Analyzer** — evidence, precision, measured
- **Harmonizer** — connection, validation, gentle

Quiz: 15 questions in 3 parts (workplace dynamics · communication · personal style), 4 options each. Tally → primary + secondary. Tie at the top → one tie-breaker.

The user's primary driver becomes the canvas tint via CSS variables written by `ProfileProvider`. Glass surfaces, glow shadows, and the wave animations all pick this up.

## AI integration

Two functions in `src/services/geminiService.ts` consume `process.env.GEMINI_API_KEY`:

- `generateRoleplayMessage(scenario, history, userMessage?)` — customer voice. `gemini-3.1-flash-preview`. System prompt composed by `buildCustomerSystemPrompt()` from the knowledge base.
- `evaluateConversation(scenario, transcript)` — 7-dim scoring. Same model, JSON mode. System prompt composed by `buildScoringSystemPrompt()`.

Voice mode uses `gemini-3.1-flash-live-preview` via `ai.live.connect()`. The voice tab in ChatScreen is currently a stub; full extraction of the live-session pipeline (mic capture, tool calls, tension orb) is a follow-up task.

The seven scoring dimensions and their weights:

| Dimension | Weight |
|---|---|
| Empathy & tone | 0.18 |
| Active listening | 0.16 |
| Product knowledge | 0.14 |
| Objection handling | 0.20 |
| Confidence | 0.10 |
| Closing effectiveness | 0.14 |
| Pacing | 0.08 |

Bands: ≥85 good, 70–84 ok, <70 poor.

## Anonymous-first auth

- First launch → T&C modal → onboarding → quiz → home. No account required.
- All state lives in `localStorage` under `pbt:` namespace.
- A glass banner on Home offers `Save your progress` (signs up via Supabase).
- Sign-up is **frictionless**: no email verification (`FLAGS.EMAIL_VERIFICATION = false`). Strong password policy (zxcvbn ≥ 3, ≥ 10 chars).
- On sign-up, existing localStorage is uploaded to `profiles` + `training_sessions`. After that, `useCloudSync` debounce-mirrors changes.
- `Reset all local data` in Settings clears everything and reloads.

## Adding a new pushback category

Edit `src/data/scenarios.ts` to extend `PUSHBACK_CATEGORIES` and `SEED_SCENARIOS`. Teach the AI by adding a `PushbackKnowledge` entry to `src/data/knowledge/pushbackTaxonomy.ts`. The prompt builder picks it up automatically.

## Adding a new scenario

Either build one through the in-app `Build a scenario` flow (Home → Build), or extend `SEED_SCENARIOS` in `src/data/scenarios.ts` if you want a permanent default in the rotation.

## Testing

```
npm test
```

Vitest + React Testing Library. The Gemini SDK is mocked at the module boundary (`@google/genai`) — see `src/services/__tests__/geminiService.test.ts`. Coverage thresholds enforced for `lib/`, `features/`, `services/`, `data/`.

## Deployment

Netlify. `netlify.toml` build command is `npm run build`. Set `GEMINI_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_PUBLISHABLE_KEY` in Netlify → Site configuration → Environment variables.

## Status

v1 — feature-complete except for full voice mode (text chat + 7-dim scoring + all 11 screens shipped). See `docs/superpowers/specs/2026-05-04-pbt-pushback-training-design.md` for the full spec.
