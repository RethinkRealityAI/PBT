# CLAUDE.md — PBT (Pushback Training)

## What this is

PBT is a mobile-first PWA that trains veterinary teams to handle client pushback. AI customer roleplay → 7-dimension scoring → ECHO personality-driven UI. Frictionless: anonymous use is the default; account upgrade is optional.

This file is loaded into Claude Code's context for every session in this repo. Keep it lean and current.

## Stack

- **React 19** + TypeScript ~5.8
- **Vite 6** + `@tailwindcss/vite` 4
- **Vitest** + RTL for tests (run with `npm test`)
- **Framer Motion** (`motion`) for animations
- `**@google/genai`** for Gemini text + live voice
- **Supabase** (optional, lazy-init) for auth + cloud sync

## Architecture quick reference

```
src/
  app/         — App.tsx, providers (Theme, Profile, Session, Scenario, Chat, Navigation), routes.ts, flags.ts
  design-system/ — Glass, PillButton, Orb, Icon, DriverWave, GradientBg, ScoreRing, Chip, Segmented + tokens
  shell/       — AppFrame, Sidebar (desktop), TopBar, TabBar, Page, ThemeToggle
  screens/     — onboarding, terms, quiz, result, home, create, chat, stats, history, analyzer, resources, settings, actGuide (+ modals)
  features/    — auth, chat (useTextChat), pet-analyzer (usePetAnalyzer)
  services/    — geminiService (text + scoring), voiceSession.ts (Live voice + AudioWorklet), types
  data/        — echoDrivers, quizQuestions, scenarios, BCS/MCS, calorieTable
  data/knowledge/ — driverProfiles, pushbackTaxonomy, actGuide, clinicalReference, scoringRubric, promptBuilders
  lib/         — storage (namespaced localStorage), classNames, id
  tests/       — setup
public/        — static assets (e.g. audio/pcm-capture-processor.js for voice capture)
supabase/migrations/  — hand-run SQL
docs/superpowers/specs/ — design spec
resources/   — design handoff prototype + ECHO source PDFs/transcripts
```

## Routing

State-machine routing (no React Router). `Screen` enum in `src/app/routes.ts`. Tab-bar visibility is per-screen; back stack is depth-8.

Tab bar (mobile): Train · History · Library · You — see `SCREENS_WITH_TAB_BAR` and `TABS` in `routes.ts`.

Initial screen logic in `App.tsx::getInitialScreen()`:

1. No `pbt:terms_accepted_at` → onboarding (T&C blocks)
2. No `pbt:profile` → quiz (RouteResolver effect handles redirect)
3. Else → home

## Responsive layout

- **Mobile / tablet** (`< lg`): Single centered content rail (`--pbt-layout-max`, typically 440px), bottom tab bar, sticky `TopBar`.
- **Desktop** (`lg+` in Tailwind): `Sidebar` (~240px) with primary nav + driver wave + theme toggle; main column fills remaining width; `TopBar` and `TabBar` hidden (`lg:hidden`). Key screens use two-column grids where specified (Home, Create, Chat max-width rail, Stats, Pet Analyzer).

## ECHO driver system (4-driver, replaces old 6-type)

Drivers: Activator · Energizer · Analyzer · Harmonizer.

- Quiz: 15 questions × 4 options + tie-breaker. Verbatim from design handoff prototype.
- Locked profile sets CSS vars `--pbt-driver-{primary,accent,soft,wave}` on `<html>`.
- All Glass `glow` props default to neutral; only hero surfaces opt into colored glow.

## AI integration (CRITICAL — preserve)

Two services, both call `@google/genai`:


| Function                  | Model                          | Purpose         |
| ------------------------- | ------------------------------ | --------------- |
| `generateRoleplayMessage` | `gemini-2.5-flash`             | Customer turn   |
| `evaluateConversation`    | `gemini-2.5-flash` (JSON mode) | 7-dim scorecard |
| `ai.live.connect`         | `gemini-2.0-flash-live-001`    | Voice mode      |


Use published model IDs that match your API key (AI Studio). Preview aliases may 404.

System prompts are composed in `src/data/knowledge/promptBuilders.ts` from:

- `driverProfiles.ts` (sample customer phrasings, communication style, stress signature)
- `pushbackTaxonomy.ts` (root concerns + recommended ACT response patterns)
- `actGuide.ts` (Acknowledge / Clarify / Transform)
- `clinicalReference.ts` (BCS / MCS / calorie / Royal Canin product anchors)
- `scoringRubric.ts` (7 dimensions with band examples)

Model strings live in `src/services/geminiService.ts` as `MODEL_TEXT` and `MODEL_LIVE`.

**Voice pipeline:** `src/services/voiceSession.ts` — mic first (`getUserMedia`), playback + capture `AudioContext`, `**/audio/pcm-capture-processor.js`** worklet, then `ai.live.connect`. User gesture starts session (Begin simulation). Avoid calling `session.close()` twice (guarded).

## Scenario builder (`CreateScreen`)

- **Build / Library** tabs — library lists `SEED_SCENARIOS` with quick Start.
- Pushback: **dropdown** for canned categories; **Other pushback** remains a separate card; optional/required notes placement depends on selection.
- **Difficulty** — four levels with descriptions (`DIFFICULTY_DESCRIPTIONS` in `scenarios.ts`).
- Optional `**weightKg`** on `Scenario` for custom builds.

## Auth (anonymous-first)

- Supabase client lazy-loaded from env vars; missing env = banner hidden, app still works.
- `AccountUpgradeModal` does sign-up (no verification) and sign-in.
- On sign-up: snapshot of `localStorage` profile + sessions uploaded to `profiles` + `training_sessions` tables.
- `useCloudSync` debounce-mirrors profile changes once signed in.
- Email verification gated behind `FLAGS.EMAIL_VERIFICATION` in `src/app/flags.ts`.

## Admin dashboard (admin/)

Standalone Vite app at `admin/`, deployed as `admin.<your-domain>`. Reads telemetry directly from Supabase; admin gating enforced server-side via `profiles.is_admin` + admin RLS policies (migration `20260507000000_admin_telemetry.sql`).

Telemetry capture in the consumer app:
- `src/lib/analytics.ts` — `logEvent()` writes to `nav_events` (anonymous-safe)
- `src/services/aiTelemetry.ts` — `recordCall()` / `recordTurns()` write per-call + per-turn signals
- `src/services/geminiService.ts` — wraps `generateRoleplayMessage` / `evaluateConversation` with timing + tokens + refusal heuristics; takes a `{ sessionId }` option so rows attribute to a `training_sessions` id
- `src/features/chat/useTextChat.ts` — allocates session id at `open()`, persists `completed`/`abandoned` to Supabase, exposes `abandon()` (called by `ChatAbandonWatcher` in `App.tsx` when user leaves chat mid-flight)
- `src/features/scenarios/persistScenario.ts` — writes `user_scenarios` on Save
- `src/features/pet-analyzer/useSavedPets.ts` — writes `analyzer_events` on save

RAG export: `supabase/functions/rag-export` streams `rag_export_v1` view rows as JSONL. Admin-only via RLS.

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


| Want                     | Edit                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| New pushback category    | `src/data/scenarios.ts` `PUSHBACK_CATEGORIES` + `src/data/knowledge/pushbackTaxonomy.ts`           |
| New scenario in rotation | `src/data/scenarios.ts` `SEED_SCENARIOS`                                                           |
| Tweak driver content     | `src/data/echoDrivers.ts` (UI) + `src/data/knowledge/driverProfiles.ts` (AI)                       |
| Add scoring dimension    | `src/data/knowledge/scoringRubric.ts` (then update `geminiService.ts` schema + `ScoreReport` type) |
| New screen               | Add a `Screen` value in `src/app/routes.ts` and a case in `ScreenSwitch` in `App.tsx`              |


## Conventions

- All glass surfaces use `<Glass>` — never raw `backdrop-filter` styles inline.
- All design tokens come from `src/design-system/tokens.ts` or the CSS vars in `tokens.css`. Never hardcode brand colors.
- Mono labels (eyebrows, scores, timestamps): `Geist Mono`, all-caps, letter-spacing 0.18em.
- Display headlines: weight 400, tight letter-spacing −0.025em, lowercase sentences with `\n` line breaks where the prototype has them.
- Test files colocate as `__tests__/Subject.test.ts(x)`. Vitest globals are on (no need to import `describe`/`it`/`expect`).
- Mock `@google/genai` in tests using `vi.hoisted` + a class-based mock — see `src/services/__tests__/geminiService.test.ts`.

## Knowledge graph (Graphify)

This repo includes [Graphify](https://graphify.net/) outputs under `graphify-out/`:

| File              | Purpose                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `GRAPH_REPORT.md` | God nodes, communities, suggested questions                                                  |
| `graph.json`      | Queryable graph for `py -3 -m graphify query "..."`                                          |
| `graph.html`      | Interactive visualization (open in browser)                                                  |

**MANDATORY — use the graph before grep/read searches:**

1. **At session start**: Read `graphify-out/GRAPH_REPORT.md` in full before exploring the codebase.
2. **Before any grep or multi-file read**: Run `py -3 -m graphify query "<topic>"` first. Use the returned node/file list to target reads directly — skip blind glob/grep unless the query returns nothing.
3. **After editing code**: Run `py -3 -m graphify update .` (no API cost, <5s) to keep the graph current.

The graph has 230 nodes / 310 edges. A single query replaces 3–8 grep calls and saves significant context. There is no excuse for skipping it.

**Install (Python 3.10+):** `py -3 -m pip install graphifyy` (CLI is `py -3 -m graphify`).

**Build from scratch (no LLM):** `py -3 scripts/graphify_ast_only.py`

Cursor loads `.cursor/rules/graphify.mdc` automatically.

## Build pipeline

- Vite injects `process.env.GEMINI_API_KEY` via the `define` block in `vite.config.ts`.
- Bundle is split into `vendor-react`, `vendor-genai`, `vendor-supabase`, `vendor-motion`, plus the main app.
- Netlify build command: `npm run build`.

## Outstanding work (v1.x polish)

1. **Coach drawer**: in-chat hints — designed; needs LLM call wired up.
2. **Today's pick rotation**: Home scenario index — rotate by date + driver (not only index 0).
3. **Email verification**: scaffolded but disabled.
4. **a11y polish**: focus rings exist; sweep for ARIA + keyboard parity on all screens.

## Don'ts

- Don't reintroduce the 6-type Echo (`Thinker | Persister | Rebel | Promoter | Harmonizer | Imaginer`). It's been deleted.
- Don't bypass the `<Glass>` primitive — its shadow + tint logic is centralized.
- Don't write to `localStorage` directly — use `readStorage`/`writeStorage`.
- Don't add a router library — the state machine is intentional.

---

**Status:** Shipped 2026. Voice (Gemini Live + worklet), scenario builder (library tab + dropdown pushback), desktop sidebar layout, Pet Analyzer refresh, glass readability pass. `**npm test` — 110 tests.** Production build: `npm run build`.