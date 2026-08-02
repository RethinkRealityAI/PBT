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

Services call `@google/genai`:


| Function                  | Model (`MODEL_TEXT` / `MODEL_LIVE`)     | Purpose                       |
| ------------------------- | --------------------------------------- | ----------------------------- |
| `generateRoleplayMessage` | `gemini-3-flash-preview`                | Customer turn                 |
| `evaluateConversation`    | `gemini-3-flash-preview` (JSON mode)    | ACT-first 5-dim scorecard     |
| `generateCoachHint`       | `gemini-3-flash-preview`                | In-chat coach nudge (text mode, ≤3/session) |
| `analyzePetPhoto`         | `gemini-3-flash-preview` (multimodal)   | Pet Vision (breed/BCS/derm)   |
| `ai.live.connect`         | `gemini-3.1-flash-live-preview`         | Voice mode                    |

**Scoring is ACT-first (Phase 2):** 5 dimensions — `acknowledge`, `clarify`,
`transform`, `empathy`, `rapport` (see `scoringRubric.ts`). ACT pillars carry
70% of the weight; empathy + rapport the rest. `normalizeScoreReport` (in
`services/types.ts`) backfills these from pre-Phase-2 records so historic
sessions still render.

**Scoring failure is honest, never fake-zero:** `evaluateConversation` retries
once, then returns a fallback flagged `scoreUnavailable: true` (detect old +
new placeholders via `isScoreUnavailable` in `services/types.ts`). Consumers
must never present it as a real 0/100: StatsScreen offers *Retry scoring*
(`useTextChat.rescore()` re-scores the saved transcript in place), History
shows "—" and excludes it from averages.

**Scorecard insights** (`src/features/scorecard/`): `scorecardInsights.ts`
(delta vs history, weakest dimension, emotion journey — pure + tested) and
`ResolutionJourney.tsx` (red/yellow/green arc strip). Both text and voice AI
turns carry `emotion` on the transcript; keep stamping it or the arc dies.


Use published model IDs that match your API key (AI Studio). Preview aliases may 404.

System prompts are composed in `src/data/knowledge/promptBuilders.ts` from:

- `driverProfiles.ts` (sample customer phrasings, communication style, stress signature)
- `pushbackTaxonomy.ts` (root concerns + recommended ACT response patterns)
- `actGuide.ts` (Acknowledge / Clarify / Transform)
- `clinicalReference.ts` (BCS / MCS / calorie / Royal Canin product anchors)
- `scoringRubric.ts` (7 dimensions with band examples)

Model strings live in `src/services/geminiService.ts` as `MODEL_TEXT` and `MODEL_LIVE`.

**Voice pipeline:** `src/services/voiceSession.ts` — the ordering is load-bearing: mic **permission first** (`acquireMic()` is the first await in `start()`, inside the Begin tap — nothing connects or plays until granted), then playback `AudioContext`, then `ai.live.connect`; the capture processor is wired inside `onopen`. Re-entrancy guard runs synchronously before any await (double-Begin must not open two sockets). A playback-end watchdog force-exits `aiSpeaking` if `source.onended` is missed — a stuck `aiSpeaking` mutes the mic for the rest of the session. Avoid calling `session.close()` twice (guarded).

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

Second Vite entry of the main repo (`admin.html` → `admin/src/main.tsx`),
served at `/admin` from the same Netlify deploy. Auth + cross-user reads are
server-side: `netlify/functions/admin-*` verify the caller's Supabase JWT,
check `profiles.is_admin` via the service role, then query Supabase. The
browser never holds `SUPABASE_SERVICE_ROLE_KEY`.

Migrations:
- `20260507000000_admin_telemetry.sql` — `is_admin`, telemetry tables, view
- `20260507100000_rag_documents.sql` — `rag_documents` table; drops the
  cross-user admin RLS policies (replaced by Netlify Function gating)
- `20260601000000_phase2_june.sql` — Pet Vision columns on `analyzer_events`
  (source/age_estimate/breed_confidence/dermatitis), `session_feedback` +
  `platform_reports` tables (anonymous-safe insert, admin select), and the
  `vision` AI call type
- `20260602000000_simulation_config.sql` — singleton `simulation_config`
  (id='global', jsonb), admin-only RLS; audit-log entity type extended
- `20260701000000_user_management.sql` — `profiles.disabled` (mirrored to a
  Supabase Auth ban); audit-log entity type extended to include `user`
- `20260702000000_rag_foundation.sql` — `knowledge_documents` (ingested
  knowledge base; seeded from the code knowledge modules via
  `admin-knowledge` op=seed) + `rag_chunks` (embedding-ready session
  exchange/coaching chunks with tag filters, written by `ragDocument.ts`)

June (Phase 2) admin screens: **Feedback** (`admin-feedback` → `session_feedback`),
**Platform Reports** (`admin-reports` → `platform_reports`), and **Simulation**
(`admin-simulation-config` → `simulation_config`). Pet Vision data surfaces in
the existing **Pet Analyzer** screen via `analyzer_events`.

July admin screens (§3.2): **User & admin management** — the Users screen +
User modal "Manage" tab do account write-ops via `admin-user-actions`
(promote/demote admin, disable/enable, create, delete) with self-lockout +
last-admin guards; `admin-users` now returns `disabled` + `email`. **Insights**
dashboard surfaces scoring trends, ACT-dimension averages, sentiment, and
feedback summaries. **Analytics** — nav_events traffic/engagement + dwell-time
"where users spend time" heatmap. **AI Quality** doubles as the observability
layer: alert-threshold banner (`ALERT_THRESHOLDS`), failure-rate/latency/cost
trends, per-model breakdown. **RAG foundation** — `admin-knowledge` function
(list/upsert/delete + `seed` from code knowledge modules) and per-session
`rag_chunks` written alongside `rag_documents`.

## Simulation config (admin-tunable prompts + scoring)

`src/data/knowledge/simulationConfig.ts` defines `SimulationConfig` — an
optional, deep-merged layer over the hardcoded scoring rubric / driver profiles
/ pushback taxonomy (code defaults are always the fallback). It lets the admin
**Simulation** screen tune, without a deploy:
- scoring dimension labels/descriptions/**weights** (normalised at runtime) +
  band examples, and a scoring-prompt prefix/suffix
- the 4 ECHO driver personas (`driverProfiles`) and the pushback taxonomy
  (`pushbackTaxonomy`, incl. brand-new pushback ids)
- a global customer-prompt prefix/suffix

Flow: admin edits → `admin-simulation-config` → `simulation_config` table →
`flags-resolve` snapshot → `FlagProvider.getSimulationConfig()` /
`useSimulationConfig()` → `useTextChat` + `voiceSession` pass it into
`promptBuilders` (`buildCustomerSystemPrompt` / `buildScoringSystemPrompt` /
`buildVoiceSystemPrompt`) and `evaluateConversation` (resolved weights). The
dimension KEYS stay fixed (the `ScoreReport` schema is typed); admins re-weight
/ relabel / re-describe them but don't add/remove keys. `normalizeScoreReport`
keeps the config-weighted `overall` authoritative for current records and only
recomputes for legacy ones.

Telemetry capture in the consumer app:
- `src/lib/analytics.ts` — `logEvent()` writes to `nav_events` (anonymous-safe)
- `src/services/aiTelemetry.ts` — `recordCall()` / `recordTurns()` write per-call + per-turn signals
- `src/services/geminiService.ts` — wraps `generateRoleplayMessage` / `evaluateConversation` with timing + tokens + refusal heuristics; takes a `{ sessionId }` option so rows attribute to a `training_sessions` id
- `src/features/chat/useTextChat.ts` — allocates session id at `open()`, persists `completed`/`abandoned` + `rag_documents` row to Supabase, exposes `abandon()` (called by `ChatAbandonWatcher` in `App.tsx` when user leaves chat mid-flight)
- `src/features/scenarios/persistScenario.ts` — writes `user_scenarios` on Save
- `src/features/pet-analyzer/useSavedPets.ts` — writes `analyzer_events` on save (incl. Pet Vision provenance)
- `src/features/pet-analyzer/usePetVision.ts` + `src/services/petVisionService.ts` — multimodal photo analysis (results-only; raw image never stored)
- `src/features/feedback/useSessionFeedback.ts` — writes `session_feedback` (post-session rating)
- `src/features/reporting/usePlatformReport.ts` — writes `platform_reports` (bug/suggestion)
- `src/services/ragDocument.ts` — assembles + upserts `rag_documents` rows on session end

RAG outputs:
- **Table**: `rag_documents` — one row per session, content + structured
  metadata, ready to feed an embedder
- **Export**: `netlify/functions/admin-rag-export` streams `rag_export_v1`
  view rows as JSONL (admin-only)

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


## Translations (MANDATORY)

The platform ships in multiple languages (currently **en** + **fr** — Canadian
French). This is a hard invariant, not a feature:

- **Any change to user-facing text — new, edited, or removed — must update the
  catalogs for EVERY locale** in `src/i18n/<locale>/`. English (`src/i18n/en/`)
  is the source of truth; its keys define the typed `CatalogKey` union, so a
  missing key in another locale fails `tsc`, and
  `src/i18n/__tests__/catalog.test.ts` rejects English stubs, key drift, and
  `{token}` mismatches.
- **Use the translator subagent** (`.claude/agents/translator.md`) for the
  non-English text — it carries the fr-CA register rules and the
  do-not-translate glossary (ECHO driver names, breeds, Royal Canin products,
  BCS/MCS, `[END_SIMULATION]`, enum keys). Don't freehand translations.
- Components read text via `useT()` / `useLanguage()`
  (`src/app/providers/LanguageProvider.tsx`); non-React code calls
  `translate(locale, key)` from `src/i18n/translate.ts`. Never hardcode
  user-visible strings in components.
- AI output language is threaded through the prompt builders'
  `locale` option (`promptBuilders.ts`), NOT the catalogs. Voice speech
  config follows `LOCALE_BCP47`.
- Dates/percentages go through `src/i18n/format.ts` (French uses U+202F
  before `%`), never bare `toLocaleString()`.
- Adding a locale: extend `src/i18n/locales.ts`, create the catalog dir (the
  types force completeness), add the dynamic-import arm in `translate.ts`,
  run the translator agent, done — no migration needed (`profiles.locale`
  uses a pattern CHECK, not an enum).

## Conventions

- All glass surfaces use `<Glass>` — never raw `backdrop-filter` styles inline.
- All design tokens come from `src/design-system/tokens.ts` or the CSS vars in `tokens.css`. Never hardcode brand colors.
- **Modals & overlays — dark mode:** never hardcode a light surface fill (e.g. a
  `linear-gradient(... rgba(255,255,255,…))` or `rgba(255,255,255,…)` background)
  on a surface that carries `--pbt-text`. In dark mode `--pbt-text` is near-white,
  so a forced-light pane makes text blend out (this caused the Report modal
  contrast bug). Branch on theme like the design-system primitives do
  (`const dark = useTheme().resolvedTheme === 'dark'; background: dark ? … : …`),
  or let `<Glass>` provide the themed fill. Route `<input>`/`<textarea>` through
  the theme-aware `.pbt-glass-input` class instead of inline light styles.
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

## Database migrations & deploy alignment (REQUIRED)

Migrations in `supabase/migrations/` are **hand-run SQL** — adding a file does
NOT apply it. A feature can pass every test and still break in production if
its migration was never run against the live Supabase project. (This is exactly
what broke the Platform Reporting + Feedback tools: the
`20260601000000_phase2_june.sql` tables were missing from prod.)

**Whenever a change adds or alters a Supabase relation** (any new `sb.from(...)`
target, column, or RLS policy):

1. **Author the migration** in `supabase/migrations/` (idempotent: `create … if
   not exists`, `add column if not exists`, `drop policy if exists` before
   `create policy`). Migrations may run out of order against a partially-synced
   project, so guard cross-table `alter`s with `to_regclass(...) is not null`.
2. **Apply it** to the target project (Supabase MCP `apply_migration`, the SQL
   editor, or `supabase db push`) and confirm with `list_tables` / a probe.
3. **Update the schema-parity test** is automatic — `src/tests/schema-parity.test.ts`
   scans every `.from('<rel>')` in `src/` + `netlify/` and asserts each relation
   is declared by some migration. It runs in `npm test` (no DB needed) and fails
   the build if code references a relation no migration creates.
4. **Verify the live DB before deploy**: `npm run verify:db` (needs
   `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) probes the target project and
   fails if any code-referenced relation is missing — i.e. a migration wasn't
   applied. Run it (or wire it into CI / the Netlify build) before shipping
   schema-dependent features.

The static test catches "migration file missing"; `verify:db` catches
"migration not applied". Both must pass before a schema-dependent feature ships.

## Outstanding work (v1.x polish)

1. **Email verification**: scaffolded but disabled.
2. **a11y polish**: focus rings exist; sweep for ARIA + keyboard parity on all screens.
3. **Voice scorer telemetry attribution**: `voiceSession.endSession()` calls
   `evaluateConversation` without a `sessionId` (the record id is allocated
   later in `applyVoiceSessionComplete`), so voice scorer telemetry rows are
   unattributed.
4. **Saved pets surfacing**: Pet Analyzer saves pets but never lists them
   (`useSavedPets.savedPets`/`deletePet` unused there); they only appear as
   chips in CreateScreen.

(Done since: coach drawer → `src/features/chat/CoachHint.tsx`; Today's-pick
rotation → `src/lib/dailyPick.ts`.)

## Don'ts

- Don't reintroduce the 6-type Echo (`Thinker | Persister | Rebel | Promoter | Harmonizer | Imaginer`). It's been deleted.
- Don't bypass the `<Glass>` primitive — its shadow + tint logic is centralized.
- Don't write to `localStorage` directly — use `readStorage`/`writeStorage`.
- Don't add a router library — the state machine is intentional.
- Don't ship a feature that adds/alters a Supabase relation without applying its
  migration to the target project — run `npm run verify:db` first (see
  "Database migrations & deploy alignment").

---

**Status:** Shipped 2026. Voice (Gemini Live + worklet), scenario builder (library tab + dropdown pushback), desktop sidebar layout, Pet Analyzer refresh, glass readability pass. **Phase 2 (June):** ACT-first scoring, Pet Vision Analyzer (multimodal), Simulation Feedback Tool, Platform Reporting Tool + admin surfacing. **July UX pass:** honest scoring pipeline (retry + `scoreUnavailable` + in-place rescore), scorecard reveal (resolution arc, delta chip, focus-next), in-chat coach hints, daily Today's-pick rotation, voice permission-race fixes. `**npm test` — 201 tests** (incl. schema-parity guard; pre-deploy `npm run verify:db`). Production build: `npm run build`.