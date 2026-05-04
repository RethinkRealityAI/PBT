# CLAUDE.md — PBT (Pushback Training)

## What this is

PBT is a mobile-first PWA that trains veterinary teams to handle client pushback. AI customer roleplay → 7-dimension scoring → ECHO personality-driven UI. Frictionless: anonymous use is the default; account upgrade is optional.

This file is loaded into Claude Code's context for every session in this repo. Keep it lean and current.

## Stack

- **React 19** + TypeScript ~5.8
- **Vite 6** + `@tailwindcss/vite` 4
- **Vitest** + RTL for tests (run with `npm test`)
- **Framer Motion** (`motion`) for animations
- **`@google/genai`** for Gemini text + live voice
- **Supabase** (optional, lazy-init) for auth + cloud sync

## Architecture quick reference

```
src/
  app/         — App.tsx, providers (Theme, Profile, Session, Scenario, Chat, Navigation), routes.ts, flags.ts
  design-system/ — Glass, PillButton, Orb, Icon, DriverWave, GradientBg, ScoreRing, ScoreChip, Chip, Segmented + tokens
  shell/       — AppFrame, TopBar, TabBar, Page
  screens/     — 11 screens + TermsModal
  features/    — auth, chat (useTextChat), quiz (useQuiz), pet-analyzer (usePetAnalyzer)
  services/    — geminiService (text + scoring), types
  data/        — echoDrivers, quizQuestions, scenarios, BCS/MCS, calorieTable
  data/knowledge/ — driverProfiles, pushbackTaxonomy, actGuide, clinicalReference, scoringRubric, promptBuilders
  lib/         — storage (namespaced localStorage), classNames, id
  tests/       — setup
supabase/migrations/  — hand-run SQL
docs/superpowers/specs/ — design spec
resources/   — design handoff prototype + ECHO source PDFs/transcripts
```

## Routing

State-machine routing (no React Router). `Screen` enum in `src/app/routes.ts`. Tab-bar visibility is per-screen; back stack is depth-8.

Initial screen logic in `App.tsx::getInitialScreen()`:
1. No `pbt:terms_accepted_at` → onboarding (T&C blocks)
2. No `pbt:profile` → quiz (RouteResolver effect handles redirect)
3. Else → home

## ECHO driver system (4-driver, replaces old 6-type)

Drivers: Activator · Energizer · Analyzer · Harmonizer.

- Quiz: 15 questions × 4 options + tie-breaker. Verbatim from design handoff prototype.
- Locked profile sets CSS vars `--pbt-driver-{primary,accent,soft,wave}` on `<html>`.
- All Glass `glow` props default to neutral; only hero surfaces opt into colored glow.

## AI integration (CRITICAL — preserve)

Two services, both call `@google/genai`:

| Function | Model | Purpose |
|---|---|---|
| `generateRoleplayMessage` | `gemini-2.5-flash` | Customer turn |
| `evaluateConversation` | `gemini-2.5-flash` (JSON mode) | 7-dim scorecard |
| `ai.live.connect` | `gemini-2.0-flash-live-001` | Voice mode |

System prompts are composed in `src/data/knowledge/promptBuilders.ts` from:
- `driverProfiles.ts` (sample customer phrasings, communication style, stress signature)
- `pushbackTaxonomy.ts` (root concerns + recommended ACT response patterns)
- `actGuide.ts` (Acknowledge / Clarify / Take Action)
- `clinicalReference.ts` (BCS / MCS / calorie / Royal Canin product anchors)
- `scoringRubric.ts` (7 dimensions with band examples)

Model strings live in `src/services/geminiService.ts` as `MODEL_TEXT` and `MODEL_LIVE`.

## Auth (anonymous-first)

- Supabase client lazy-loaded from env vars; missing env = banner hidden, app still works.
- `AccountUpgradeModal` does sign-up (no verification) and sign-in.
- On sign-up: snapshot of `localStorage` profile + sessions uploaded to `profiles` + `training_sessions` tables.
- `useCloudSync` debounce-mirrors profile changes once signed in.
- Email verification gated behind `FLAGS.EMAIL_VERIFICATION` in `src/app/flags.ts`.

## State storage

All `localStorage` keys are namespaced `pbt:` (see `src/lib/storage.ts`). Validators reject corrupt values and reset the slot.

Active keys:
- `pbt:terms_accepted_at`, `pbt:terms_version`
- `pbt:theme` (`'light' | 'dark' | 'system'`)
- `pbt:session_id` (uuid)
- `pbt:profile` (Profile object)
- `pbt:sessions` (array of SessionRecord, capped at 50)
- `pbt:banner_dismissed_until`
- `pbt:supabase_session` (managed by supabase-js)

## Adding new content

| Want | Edit |
|---|---|
| New pushback category | `src/data/scenarios.ts` `PUSHBACK_CATEGORIES` + `src/data/knowledge/pushbackTaxonomy.ts` |
| New scenario in rotation | `src/data/scenarios.ts` `SEED_SCENARIOS` |
| Tweak driver content | `src/data/echoDrivers.ts` (UI) + `src/data/knowledge/driverProfiles.ts` (AI) |
| Add scoring dimension | `src/data/knowledge/scoringRubric.ts` (then update `geminiService.ts` schema + `ScoreReport` type) |
| New screen | Add a `Screen` value in `src/app/routes.ts` and a case in `ScreenSwitch` in `App.tsx` |

## Conventions

- All glass surfaces use `<Glass>` — never raw `backdrop-filter` styles inline.
- All design tokens come from `src/design-system/tokens.ts` or the CSS vars in `tokens.css`. Never hardcode brand colors.
- Mono labels (eyebrows, scores, timestamps): `Geist Mono`, all-caps, letter-spacing 0.18em.
- Display headlines: weight 400, tight letter-spacing −0.025em, lowercase sentences with `\n` line breaks where the prototype has them.
- Test files colocate as `__tests__/Subject.test.ts(x)`. Vitest globals are on (no need to import `describe`/`it`/`expect`).
- Mock `@google/genai` in tests using `vi.hoisted` + a class-based mock — see `src/services/__tests__/geminiService.test.ts`.

## Build pipeline

- Vite injects `process.env.GEMINI_API_KEY` via the `define` block in `vite.config.ts`.
- Bundle is split into `vendor-react`, `vendor-genai`, `vendor-supabase`, `vendor-motion`, plus the main app.
- Netlify build command: `npm run build`.

## Outstanding work (v1 → v1.1)

1. **Voice mode**: ChatScreen has a stub. Extract the live-session pipeline into `src/services/voiceSession.ts`, wire to the Chat screen with the 7-dim `endSimulation` schema.
2. **Coach drawer**: in-chat hints. Designed; needs LLM call wired up.
3. **Today's pick rotation**: currently always `SEED_SCENARIOS[0]`. Should rotate based on date + driver.
4. **Email verification**: scaffolded but disabled.
5. **a11y polish**: focus rings exist; need a sweep for ARIA + keyboard parity on all screens.

## Don'ts

- Don't reintroduce the 6-type Echo (`Thinker | Persister | Rebel | Promoter | Harmonizer | Imaginer`). It's been deleted.
- Don't bypass the `<Glass>` primitive — its shadow + tint logic is centralized.
- Don't write to `localStorage` directly — use `readStorage`/`writeStorage`.
- Don't add a router library — the state machine is intentional.

---

**Status:** v1 shipped 2026-05-04. Feature-complete except voice mode. 106 tests passing. Production build clean.
