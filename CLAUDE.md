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
public/        — static assets (audio/pcm-capture-processor.js, studies/*.pdf)
netlify/plugins/ — build plugins (knowledge-sync: auto-seeds the RAG corpus)
scripts/       — knowledge-sync.ts (`npm run knowledge:sync`), build checks
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

**The Gemini key never reaches a browser.** Every Gemini call is made by a
Netlify Function that reads `GEMINI_API_KEY` from the runtime environment; the
consumer and admin bundles contain no key and no `@google/genai` import except
`src/services/voiceSession.ts` (the Live socket must open from the device — it
does so with a single-use ephemeral token minted by `ai-voice-token`, never the
long-lived key). `npm run check:bundle` fails if a key-shaped string
(`AIza…`) appears anywhere in `dist/`.

| Browser entry point (thin client)         | Netlify Function      | Model                                   | Purpose                       |
| ----------------------------------------- | --------------------- | --------------------------------------- | ----------------------------- |
| `generateRoleplayMessage` (geminiService) | `ai-roleplay`         | `gemini-3-flash-preview` (JSON mode)    | Customer turn                 |
| `evaluateConversation` (geminiService)    | `ai-evaluate`         | `gemini-3-flash-preview` (JSON mode)    | ACT-first 5-dim scorecard; **writes the score** for signed-in users |
| `generateCoachHint` (geminiService)       | `ai-hint`             | `gemini-3-flash-preview`                | In-chat coach nudge (text mode, ≤3/session) |
| `analyzePetPhoto` (petVisionService)      | `ai-vision`           | `gemini-3-flash-preview` (multimodal)   | Pet Vision (breed/BCS/derm)   |
| `analyzeStoolPhoto` (fecalScanService)    | `ai-fecal-scan`       | `gemini-3-flash-preview` (multimodal ×2 + `gemini-embedding-001` retrieval) | Fecal Scan (chart score, RAG-grounded) |
| `useVoiceSession` (voiceSession)          | `ai-voice-token` → `ai.live.connect` from the device | `gemini-3.1-flash-live-preview` | Voice mode |
| `suggestField` (admin `scenarioAi`)       | `admin-scenario-ai`   | `gemini-3-flash-preview`                | Scenario Builder wizard (admin, `scenarios.write`) |

Wire contract: `src/shared/ai/contract.ts` (read its header — it states what the
server trusts). Transport: `src/services/aiApi.ts::postAi` attaches the Supabase
bearer when signed in and the `allowTelemetry` / `preview` flags. Shared server
helpers: `netlify/functions/_shared/ai.ts` (caller identity, per-IP rate limit,
payload bounds, `simulation_config` + `scenario_overrides` loaders, server-side
telemetry). Model IDs live in `src/shared/ai/models.ts`.

**Trust boundary — never regress it:**
- The simulation config (scoring weights, rubric prompt, personas) is loaded
  from the database ON THE SERVER. It is never accepted from a request body.
- `score_report` / `score_overall` on `training_sessions` are server-authoritative:
  `ai-evaluate` writes them (after an ownership check on the row) and a database
  trigger (`20260911000000_server_authoritative_scores.sql`) rejects any
  `authenticated`/`anon` write that sets them. The client upsert must not send
  those columns.
- Admin prompt prefix/suffix are loaded server-side by `scenario._overrideId`;
  a request may supply them only with `preview: true` (admin "Test in app"),
  and they wrap the customer turn only — never the scorer.
- Anonymous callers are allowed by design (anonymous-first product); they get
  the same AI behaviour with no persistence.

Local dev: run `netlify dev` (serves the functions); `vite` alone has no AI.

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

**Voice pipeline:** `src/services/voiceSession.ts` — the ordering is load-bearing: mic **permission first** (`acquireMic()` is the first await in `start()`, inside the Begin tap — nothing connects or plays until granted), then playback `AudioContext`, then **`POST ai-voice-token`** (the server builds the voice system prompt with server-loaded config/overrides/RAG and mints a single-use token whose model + system prompt + tools are locked — `uses: 1`, new-session window 2 min, session life 15 min > the 5-min cap), then `ai.live.connect` on a client created with that token and `httpOptions: { apiVersion: 'v1alpha' }`; the capture processor is wired inside `onopen`. The browser never builds or sees the voice system prompt. Re-entrancy guard runs synchronously before any await (double-Begin must not open two sockets). A playback-end watchdog force-exits `aiSpeaking` if `source.onended` is missed — a stuck `aiSpeaking` mutes the mic for the rest of the session. Avoid calling `session.close()` twice (guarded).

### Knowledge scopes (RAG isolation)

Every consumer reads one `knowledge_chunks` table, so scope is a property of
the DOCUMENT. Vocabulary: `src/shared/knowledge/knowledgeScopes.ts`.

- **`tags.tools[]`** — WHO may retrieve it: `roleplay` · `scoring` · `coach` ·
  `scenario-builder` · `fecal-scan`. Default = the four training-session
  tools; **Fecal Scan is never a default** (file it there on purpose).
- **`tags.species[]`** — `dog` · `puppy` · `cat`. Default = all three.
- Both are copied onto every chunk and matched with jsonb containment
  (`tags @> '{"tools":["fecal-scan"]}'` = "array contains").

`netlify/functions/_shared/retrieval.ts`: `tool` + `species` are **HARD** —
present on every RPC call including the zero-row and RPC-error retries.
`focus` is **SOFT** (dropped on a zero-row retry); `docSlugs` replace `focus`
and run *inside* the scope. `retrieveChunksDetailed()` also returns the
applied filter + `focusRelaxed`; `buildScopeFilter()` is the pure builder.

Per-consumer tool: `ai-roleplay` / `ai-voice-token` / browser `useTextChat` →
`roleplay`; `ai-evaluate` → `scoring`; `admin-scenario-ai` →
`scenario-builder`; `ai-fecal-scan` → `fecal-scan` + species (no docSlugs).
The public `rag-retrieve` endpoint (browser `useTextChat`) **forces**
`tool: 'roleplay'` whatever the body says, strips provenance (slug/title)
from its response, and is rate-limited 30/min per IP — a caller cannot use it
to read fecal-scan or scoring-only documents.
Admin tester: `admin-knowledge-search` (permission `knowledge.read`) runs the
same retrieval and echoes the exact filter — that is how you *prove* a cat
document cannot reach a dog scan. Scope is editable per document via
`admin-knowledge { op: 'update', tools, species }` (built-ins too) and set on
seed / ingest.

Migration **`20260922000000_knowledge_scopes.sql`** backfills the tags and
re-creates `match_knowledge_chunks` with `doc_slug` / `doc_title`. **Apply it
with (or before) the deploy** — un-scoped chunks are invisible to scoped
retrieval (fail-open: ungrounded prompts, not errors).

### Knowledge base seeding (automatic — there is no button)

The built-in corpus — driver personas, pushback taxonomy, ACT guide, clinical
reference, the three Royal Canin fecal charts, and the five bundled studies in
`public/studies/` — **seeds itself**. Nobody loads it by hand. One engine,
`netlify/functions/_shared/knowledgeSyncRun.ts` (`runKnowledgeSync`), behind
three triggers:

1. **`knowledge-sync-background` (the one that works in production).** A
   Netlify *background* function (the `-background` suffix buys 202-immediate
   + a 15-minute budget, which a cold sync needs). Fired fire-and-forget by
   `flags-resolve` (every app boot) and by `admin-knowledge` GET, via
   `_shared/knowledgeTrigger.ts` — once per function instance, never awaited
   (`context.waitUntil`), and ALWAYS at the site's primary URL
   (`process.env.URL`), so the code that runs is the published production
   deploy whichever deploy served the boot. **It is not open:** every deploy
   (previews, branch deploys, old production deploys) stays reachable at its
   permalink with the same env vars and the same database, so an open
   endpoint would let an old or preview deploy write ITS corpus into prod.
   Gates, in order: (a) `x-pbt-sync-key` must equal HMAC-SHA256 of a fixed
   label keyed with `SUPABASE_SERVICE_ROLE_KEY` (constant-time; nothing extra
   to configure) → 401; (b) `syncAllowedHere()` — deploy context must be
   `production` AND the published deploy; `dev` only with
   `PBT_ALLOW_DEV_SYNC=1` → 403; (c) 1 call / 5 min per-IP `rateLimit`;
   (d) inside the engine, the single-row **database lease**
   (`knowledge_sync_try_lease`, 15-min TTL, migration
   `20260923000000_knowledge_sync_lease.sql`) so concurrent cold instances
   can't interleave delete-then-insert, plus a **10-minute cooldown** (recent
   `metadata.sync.syncedAt` + a dry-run plan showing nothing to do ⇒ exit).
   The request body is never read — it can only write code-defined content.
   Never throws. PDFs come from the deploy's own origin (`/studies/*`).
   The legacy admin buttons are gone: `admin-knowledge {op:'seed'}` and
   `admin-knowledge-ingest {op:'ingest-bundled'}` answer **410**.
   **Legacy exposure:** the pre-hardening function (POST, no auth) never
   reached production; the only deploy that carried it is PR #23's Deploy
   Preview for commit `eccee53` (earlier previews failed to build). Delete
   that deploy in Netlify → Deploys — or, failing that, rotate the
   service-role key — so its permalink cannot write the prod corpus.
2. **`netlify/plugins/knowledge-sync`** (`[[plugins]]` in `netlify.toml`) —
   belt and braces. `onSuccess`, **`production` context only** (branch deploys
   share the prod database), skipped without the keys, takes the same lease,
   and **can never fail the deploy**.
3. **`npm run knowledge:sync`** (service-role env) — the hands-on one.
   `--dry-run` prints the plan without calling Gemini at all;
   `--only fecal|builtin|studies` narrows it. After a direct sync it runs the
   retrieval proof (the dog probe must rank the Score 3.5 passage first; the
   cat probe must return only `fecal:cat`) and exits non-zero on failure.
   No service key? `-- --emit-sql <file> --existing <rows.json>` runs the same
   plan and the same embeddings and writes idempotent `<file>.001.sql`,
   `…002.sql` parts (~400 KB) to apply in order; the exact `select` that
   produces `rows.json` is in the script header.
- **Idempotent by content hash.** Each document stores `metadata.sync =
  { version, contentHash, sourceHash?, syncedAt }`. Matching hash + non-zero
  chunk count ⇒ skipped (no re-embed); a study PDF with an unchanged
  `sourceHash` is never even extracted. Bump `SYNC_VERSION` in
  `_shared/knowledgeSync.ts` to force a full re-embed.
- **Admin edits survive.** Focus / citation / tools / species edits and
  soft-deletes are carried across by `buildSeedCatalogue` in
  `netlify/functions/_shared/knowledgeSeed.ts` — a soft-deleted built-in has
  its body refreshed but gets no chunks, so a re-sync is never an undelete.
- Shared code, one implementation: `_shared/knowledgeSeed.ts` (documents +
  precedence), `_shared/knowledgeIngest.ts` (`BUNDLED_STUDIES`, `extractPdf`,
  `writeKnowledgeDoc`), `_shared/knowledgeSync.ts` (hashing +
  `planKnowledgeSync`), `_shared/knowledgeSyncRun.ts` (`runKnowledgeSync` —
  the engine; the study PDFs are *injected* so disk and HTTP produce the same
  `sourceHash`), `_shared/knowledgeSql.ts` (SQL emission),
  `_shared/knowledgeTrigger.ts` (the fire-and-forget kick + the HMAC key).

### Tag assistant (AI pre-fill when filing a document)

`netlify/functions/admin-knowledge-analyze` (POST, `knowledge.write`; contract
`src/shared/knowledge/knowledgeAnalyze.ts`) reads a document and proposes
title, summary, category, focus, **Used by** (tools), species, citation,
topics, confidence, one-sentence `reasons` and `warnings` — the admin edits,
then the existing ingest / update ops save. Exactly one input: `pdfBase64`
(≤ `MAX_PDF_BYTES`; `extractPdf` runs ONCE and the result comes back as
`extractedMarkdown` / `extractedCitation`, so the UI ingests as **text** with
the new optional `citation` on `admin-knowledge-ingest` op=ingest — never a
second extraction), `text` (≤ 200k chars) or `slug` (stored content —
"Suggest with AI"; 404 when missing). One `MODEL_TEXT` JSON call whose system
prompt (`_shared/knowledgeAnalyze.ts::buildKnowledgeAnalyzeSystemPrompt`)
lists every focus / tool / species key **with its description** straight from
the vocabularies, so a vocabulary edit is live without touching the prompt.
The answer is normalised back INTO those vocabularies
(`normalizeKnowledgeAnalysis`: unknown tool dropped → defaults, unknown focus
→ null, confidence clamped, ≤ 6 topics); content past ~40k chars is cut for
the model and flagged in `warnings`. Nothing is written and no telemetry is
recorded (mirrors `admin-scenario-ai`). Errors use the admin `{ error }`
shape: 400 / 404 / 502 (Gemini). Tests:
`netlify/functions/__tests__/adminKnowledgeAnalyze.test.ts`.

## Scenario builder (`CreateScreen`)

- **Build / Library** tabs — library lists `SEED_SCENARIOS` with quick Start.
- Pushback: **dropdown** for canned categories; **Other pushback** remains a separate card; optional/required notes placement depends on selection.
- **Difficulty** — four levels with descriptions (`DIFFICULTY_DESCRIPTIONS` in `scenarios.ts`).
- Optional `**weightKg`** on `Scenario` for custom builds.

## Auth (anonymous-first)

- Supabase client lazy-loaded from env vars; missing env = banner hidden, app still works.
- `AccountUpgradeModal` does sign-up (no verification) and sign-in.
- On sign-up: snapshot of `localStorage` profile + sessions uploaded to `profiles` + `training_sessions` tables.
- `useCloudSync` debounce-mirrors profile changes (incl. `theme` + `locale`)
  once signed in; cloud `locale` applies on a fresh device only when no
  explicit local choice exists.
- Email verification UI exists (verify-pending pane + 60s resend cooldown in
  `AccountUpgradeModal`) but is gated behind `FLAGS.EMAIL_VERIFICATION` in
  `src/app/flags.ts` (currently OFF — users sign in immediately).
- **Account deletion** (self-service): `netlify/functions/account-delete.ts`
  (`requireUser()` in `_shared/admin.ts`) — JWT-verified, last-active-admin
  guard, explicit deletes for every `on delete set null` relation before
  `auth.admin.deleteUser`. UI: typed-confirm `DeleteAccountModal` in Settings,
  which wipes local storage and reloads on success.
- **Privacy opt-out** (spec §8.3): `pbt:allow_training_use` read via
  `src/lib/privacy.ts`; gates `logEvent`, AI call/turn telemetry, and RAG
  document assembly. The user's own sessions/feedback/reports are NOT gated.

## Fecal Scan (stool assessment, RAG showcase)

A supportive stool-assessment aid for vet techs — **not a diagnostic**. The
tech picks a chart (Adult dog · Puppy 8 wk+ · Cat), photographs the stool, and
gets the Royal Canin fecal score (1 → 5) with a confidence rating, the chart's
reference photo side by side, and the exact chart passages the answer was
grounded in. Spec: `docs/superpowers/specs/2026-09-21-fecal-scan-design.md`.

The ONLY knowledge the feature uses is the three Royal Canin charts
(`resources/fecal-charts/*.pdf`, VGI/064/0324 + VGI/066/0324), transcribed
verbatim in `src/data/knowledge/fecalCharts.ts` (+ reference photos in
`public/fecal-scan/<species>/<score>.jpg`). Never add outside sources.

Pipeline (`netlify/functions/ai-fecal-scan.ts`, mirrors `ai-vision`):
1. **Observe** — multimodal JSON, chart-free neutral description.
2. **Retrieve** — `retrieveChunks(observationText, { filters: { tool:
   'fecal-scan', species } })` against `knowledge_chunks` (pgvector) — a HARD
   scope, not a slug list, so an admin can add a supplement without opening
   the scan to the rest of the corpus (see "Knowledge scopes"). Each chart
   score is its own chunk (`fecalChartChunks`), so the top-k (k = 8) are the
   nearest *scores*. Any `fecal:<other species>` chunk is dropped whatever
   its tags say.
3. **Ground** — the scorer ALWAYS gets the whole chart: retrieved passages
   verbatim + every score retrieval missed from the code module (one
   `similarity: null` chunk). Retrieval ranks and admits supplements; it
   never narrows the answer (k < chart size once made scores unreachable).
   Passages are labelled chart vs clinic supplement (`kind`); a supplement
   can never add or override a score. `source` = `'rag'` if anything was
   retrieved, else `'bundled'`.
4. **Score** — multimodal JSON, calibrated-confidence prompt;
   `normalizeFecalScanResult` snaps a non-chart answer to the nearest chart
   score (confidence ≤ 0.4) and re-derives the band from the chart (puppy
   score 3 splits by `breedSize`). A missing/NaN score is a 502 `upstream`.
   French: the scorer returns translated observations.
- **Exact-reference shortcut** (`src/shared/ai/imageHash.ts`): a photo that
  IS a chart photo is answered from the chart — needs aspect ±10 %, dHash ≤ 6
  AND 32×32 luma MAD ≤ 2 (dHash alone matched 62/108 plain silhouettes).
- Reference photos load from disk (`[functions."ai-fecal-scan"]
  included_files` in `netlify.toml`), with a guarded HTTP fallback (200 +
  `image/jpeg` + JPEG magic, 4 s timeout, `DEPLOY_URL` origin).
- Telemetry: one `'fecal_scan'` row + one `'retrieval'` row per scan.

Knowledge base: the charts are code-seed documents `fecal:dog|cat|puppy`,
seeded automatically on every deploy (see "Knowledge base seeding"; by hand:
`npm run knowledge:sync`, which also proves retrieval by checking the 3.5
passage ranks first). Netlify masks `SUPABASE_SERVICE_ROLE_KEY` as a secret,
so local `netlify dev` always reports `source: 'bundled'`; `'rag'` needs a
deploy or a real key. Migration `20260921000000_fecal_scan.sql` adds the
`fecal_scan` telemetry call type + the `nav.sidebar.fecalScan.enabled` flag row.

UI: `src/screens/FecalScanScreen.tsx` + `src/features/fecal-scan/*`
(capture card, observe→retrieve→match stepper, result card, grounding panel,
full chart sheet); hook `useFecalScan`; service `fecalScanService.ts`;
image prep shared with Pet Vision in `src/lib/imagePrep.ts`. Entry points:
Home tile, desktop sidebar (`nav.sidebar.fecalScan.enabled`), Pet Analyzer
cross-link. Catalogs `src/i18n/{en,fr}/fecalScan.ts`; FR chart text overlay
`src/i18n/fr/data/fecalCharts.ts` via `dataL10n/fecalCharts.ts`.

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
- `20260801000000_profile_locale.sql` — `profiles.locale` (regex CHECK, not an
  enum — future locales need no migration); applied to prod 2026-08
- `20260805000000_rbac_invites_email.sql` — `admin_roles` (7 system presets +
  custom), `profiles.admin_role` + `permission_overrides` (with triggers that
  keep the legacy `is_admin` flag in lockstep), `admin_invites`,
  `email_settings`, `email_templates`, `email_log`; audit-log entity types
  extended with role/invite/email_settings/email_template. Applied to prod
  2026-08
- `20260911000000_server_authoritative_scores.sql` — trigger on
  `training_sessions` rejecting client (`authenticated`/`anon`) writes to
  `score_report` / `score_overall`; only the service role (`ai-evaluate`)
  may set them. **Must be applied before deploying the server-side AI
  functions** — until it is, the client-side forgery hole stays open (the app
  still works either way)
- `20260923000000_knowledge_sync_lease.sql` — `knowledge_sync_lease`
  (single row, RLS on with no policies) + `knowledge_sync_try_lease` /
  `knowledge_sync_release_lease` (SECURITY DEFINER, execute = service_role
  only) and an explicit `match_knowledge_chunks` grant to service_role. The
  sync fails closed (logs, keeps the stored corpus) until it exists. Applied
  to prod 2026-09-23

June (Phase 2) admin screens: **Feedback** (`admin-feedback` → `session_feedback`),
**Platform Reports** (`admin-reports` → `platform_reports`), and **Simulation**
(`admin-simulation-config` → `simulation_config`). Pet Vision data surfaces in
the existing **Pet Analyzer** screen via `analyzer_events`.

August admin screens: **Team & roles** — members, invitations, and a role /
permission matrix editor backed by `admin-roles` + `admin-invites`; **Email** —
branded transactional templates with a live preview, provider settings
(Resend or SMTP), and a delivery log.

**Admin navigation** (`admin/src/primitives/nav.ts` + `Sidebar.tsx`): a left
rail of 4 sections over 10 destinations, replacing the old 18-link wrapping
pill bar. Related screens are tabs of one destination (Analytics =
insights/traffic/quality, People = users/admins/roles/invites, Library =
scenarios/builder/knowledge/simulation, …). The rail collapses to icons and
becomes a drawer under 900px. Location is in the URL hash (`#/people/roles`) —
still no router library, just a parsed hash. Screens stay unaware of tabs: a
destination publishes them via `SectionTabsProvider` and `ContextBar` renders
the strip. **Adding a screen means adding it to `NAV_SECTIONS` with its
`requires` permission**, not to a flat list.

July admin screens (§3.2): **User & admin management** — the Users screen +
User modal "Manage" tab do account write-ops via `admin-user-actions`
(promote/demote admin, disable/enable, create, delete) with self-lockout +
last-admin guards; `admin-users` now returns `disabled` + `email`. **Insights**
dashboard surfaces scoring trends, ACT-dimension averages, sentiment, and
feedback summaries. **Analytics** — nav_events traffic/engagement + dwell-time
"where users spend time" heatmap. **AI Quality** doubles as the observability
layer: alert-threshold banner (`ALERT_THRESHOLDS`), failure-rate/latency/cost
trends, per-model breakdown. **RAG foundation** — `admin-knowledge` function
(list/upsert/update/delete; the corpus now seeds itself — see "Knowledge base seeding") and per-session
`rag_chunks` written alongside `rag_documents`.

## Access control (RBAC)

`src/shared/access/permissions.ts` is the single source of truth, imported by
BOTH `admin/src/**` and `netlify/functions/**` — keep it dependency-free.

- 28 permissions in 6 logical categories; some declare `requires` dependencies
  (`scenarios.write` needs `scenarios.read`), enforced by
  `withImpliedPermissions` / `withoutDependents` in the editor and by
  `sanitizePermissions` on the server.
- 7 system roles (owner, admin, content_manager, clinical_reviewer, analyst,
  support, comms_manager) + admin-authored custom roles in `admin_roles`.
- `resolveAccess()` merges role permissions with per-user
  `{ grant, revoke }` overrides — **revoke always wins**, and `owner` is
  absolute (holds every permission including ones added later, and cannot be
  partially revoked).
- Every admin Function names its permission: `requireAdmin(req, 'flags.read')`,
  plus `can(ctx, 'flags.write')` for write branches. **Never add an admin
  endpoint without one** — the UI hiding a screen is not a control.
- Escalation guards: you cannot grant a permission you don't hold, only an
  owner may act on an owner, and the active-owner count can never reach zero
  (pre-check + compensating post-check for concurrent demotions).

## Transactional email

`src/shared/email/` — `types.ts` (block model), `render.ts` (branded HTML +
plaintext, pure), `defaults.ts` (shipped templates + their declared variables).
The admin editor and the sender call the same `renderEmail`, so the preview
pane is byte-identical to what ships.

- Providers: Resend (HTTPS) or SMTP (nodemailer, lazily imported).
  `netlify/functions/_shared/mailer.ts` layers `email_settings` over env vars;
  credentials are AES-256-GCM encrypted (`_shared/secretbox.ts`, keyed by
  `EMAIL_SECRET_KEY`) and never returned to the browser.
- Sending never throws: it logs to `email_log` and returns a status, because
  the action that triggered it has already succeeded.
- Email HTML rules: `width:100%;max-width:600px` on the shell (a pixel-width
  table can't shrink below itself and overflows every phone), inline styles
  only, `prefers-color-scheme` block for dark clients, Outlook ghost table.
  Guarded by `src/shared/email/__tests__/render.test.ts`.
- Recovery + invitations go through our own functions (`auth-recover`,
  `admin-invites`, `invite-accept`) rather than Supabase's mailer, so the
  message is branded and admin-editable. Invite tokens are stored as SHA-256
  hashes and rotate on resend.

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
- `pbt:locale` (`'en' | 'fr'` — kept in sync with the `Locale` union; see Translations)
- `pbt:rated_session_ids` (session ids already rated via the feedback tool, capped at 100)
- `pbt:allow_training_use` (privacy opt-out, default `true` — read via `src/lib/privacy.ts`, never directly)
- `pbt:supabase_session` (managed by supabase-js)
- `pbt:admin_session` (admin portal only, managed by supabase-js)

## Adding new content


| Want                     | Edit                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| New pushback category    | `src/data/scenarios.ts` `PUSHBACK_CATEGORIES` + `src/data/knowledge/pushbackTaxonomy.ts`           |
| New scenario in rotation | `src/data/scenarios.ts` `SEED_SCENARIOS`                                                           |
| Tweak driver content     | `src/data/echoDrivers.ts` (UI) + `src/data/knowledge/driverProfiles.ts` (AI)                       |
| Add scoring dimension    | `src/data/knowledge/scoringRubric.ts` (then update `geminiService.ts` schema + `ScoreReport` type) |
| New screen               | Add a `Screen` value in `src/app/routes.ts` and a case in `ScreenSwitch` in `App.tsx`              |
| New admin permission     | `src/shared/access/permissions.ts` (catalog + presets), then gate the endpoint with `requireAdmin(req, '<key>')` |
| New admin screen         | `NAV_SECTIONS` in `admin/src/primitives/nav.ts` (destination or tab, with its `requires`) + a case in `admin/src/App.tsx` |
| New transactional email  | `src/shared/email/defaults.ts` (template + declared variables), then call `sendTemplateEmail` |


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

- No secrets are injected at build time. `GEMINI_API_KEY` is read by Netlify
  Functions at runtime only; there is no `define` for it and no `VITE_GEMINI_*`
  variable — adding one would put the key in the bundle.
- Vendor splitting uses the **function form** of `manualChunks` (path-matched
  buckets: `vendor-react`, `vendor-genai`, `vendor-supabase`, `vendor-motion`,
  `vendor-ui`, `vendor-zxcvbn`, admin-only `vendor-recharts`). Don't revert to
  the object form — it pinned resolved module ids and silently emitted 0-byte
  chunks / dragged recharts onto the consumer path.
- Most screens are behind `React.lazy` (see the loading-strategy note in
  `src/app/App.tsx`); zxcvbn loads via dynamic import
  (`src/features/auth/passwordStrength.ts`); the French catalog rides the lazy
  `import('./fr')` in `src/i18n/translate.ts`.
- **Bundle gate**: `npm run check:bundle` after a build asserts the main entry
  stays < 500 kB gzip (spec §13.9; currently ~66 kB) AND that no Google
  API-key-shaped string (`AIza…`) exists in any `dist/**/*.js`.
- Netlify build command: `npm run build`.
- Build plugin `netlify/plugins/knowledge-sync` seeds the RAG knowledge base
  after a successful **production** deploy (see "Knowledge base seeding"). It
  is fail-open and never blocks or fails a deploy.

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

1. **a11y deep sweep**: aria labels/aria-live/keyboard basics are in; still
   owed: modal focus traps + Escape + `aria-modal` everywhere, CreateScreen
   dropdown arrow-key support, Lighthouse a11y ≥90 on Home + Chat.
2. **French Terms legal review**: `terms` fr-CA catalog was translated
   clause-for-clause but has not been reviewed by counsel.
3. **French live-voice smoke**: `languageCode: 'fr-CA'` + voice `Aoede` is
   untested against the real Gemini Live socket (sandbox has no mic); fr-FR is
   the noted fallback in `voiceSession.ts`.
4. **Email verification**: full UI built (verify-pending pane, resend
   cooldown), `FLAGS.EMAIL_VERIFICATION` stays OFF until product wants it.
5. **Inclusive-writing pass (fr)**: a few quiz options use masculine-default
   adjectives where a neutral rewrite was clumsy (flagged in
   `src/i18n/fr/data/quiz.ts` review notes).

(Done since: coach drawer → `CoachHint.tsx`; Today's-pick rotation →
`dailyPick.ts`; voice scorer sessionId attribution + 5-min cap; saved-pets
list on the Pet Analyzer; privacy opt-out; account deletion; code-split;
full fr-CA localization.)

## Don'ts

- Don't reintroduce the 6-type Echo (`Thinker | Persister | Rebel | Promoter | Harmonizer | Imaginer`). It's been deleted.
- Don't bypass the `<Glass>` primitive — its shadow + tint logic is centralized.
- Don't write to `localStorage` directly — use `readStorage`/`writeStorage`.
- Don't add a router library — the state machine is intentional.
- Don't ship a feature that adds/alters a Supabase relation without applying its
  migration to the target project — run `npm run verify:db` first (see
  "Database migrations & deploy alignment").
- Don't call Gemini from browser code or add a `VITE_GEMINI_*` variable — every
  AI call goes through a Netlify Function (see "AI integration"). The only
  `@google/genai` import allowed under `src/`/`admin/` is the Live socket in
  `voiceSession.ts`, and it connects with an ephemeral token.
- Don't accept a simulation config, rubric, or score from a request body in
  any function — the server loads config from the database and writes scores
  itself.

---

**Status:** Shipped 2026. Voice (Gemini Live + worklet), scenario builder (library tab + dropdown pushback), desktop sidebar layout, Pet Analyzer refresh, glass readability pass. **Phase 2 (June):** ACT-first scoring, Pet Vision Analyzer (multimodal), Simulation Feedback Tool, Platform Reporting Tool + admin surfacing. **July UX pass:** honest scoring pipeline (retry + `scoreUnavailable` + in-place rescore), scorecard reveal (resolution arc, delta chip, focus-next), in-chat coach hints, daily Today's-pick rotation, voice permission-race fixes. **August (SOW completion + French):** Home streak strip, voice 5-min cap + scorer sessionId attribution, privacy opt-out, self-service account deletion, saved-pets list, past-session feedback memory, code-split (main entry 504→66 kB gzip, `npm run check:bundle` gate), and the full **fr-CA platform** — typed catalogs, data overlays, AI-layer French (customer/scorer/coach/vision/voice), persistent EN/FR toggle synced to `profiles.locale`. **September (security hardening):** Gemini key removed from both bundles — all AI calls behind `netlify/functions/ai-*`, voice via server-minted ephemeral tokens, scores server-authoritative (trigger + `ai-evaluate` write), per-IP rate limits, bundle gate scans for key-shaped strings. `**npm test` — 650+ tests** (incl. schema-parity + catalog guards + EN prompt byte-parity + function tests; pre-deploy `npm run verify:db`). Production build: `npm run build`.