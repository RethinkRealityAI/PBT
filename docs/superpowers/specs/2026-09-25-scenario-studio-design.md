# Scenario Studio — design (2026-09-25)

Owner ask (paraphrased): make scenario building its own menu item and page;
guide a non-technical admin one step at a time; describe the scenario in
plain words OR pick dog/cat + breed; an AI assistant (A2UI widgets + free
text, with starter prompts) like PhotoBoothAR's Concierge/Copilot; show which
data source the AI uses (existing RAG documents, or upload); edit the AI's
internal prompt; test it in a real simulated conversation before publishing.
Some admins will ONLY build scenarios. DB migrations: write, don't apply.

## 1. Information architecture

Before: `Content → Library [scenarios | builder | knowledge | simulation]` —
four unrelated jobs behind one icon; the builder was a tab.

After (`admin/src/primitives/nav.ts`):

| Destination | Key | Tabs | Permission |
|---|---|---|---|
| **Scenario Studio** | `scenarios` | Studio · Trainee-built | `scenarios.read` |
| **Knowledge** | `knowledge` | — | `knowledge.read` |
| **AI tuning** (was "Simulation") | `tuning` | — | `simulation.read` |
| Feedback | `feedback` | unchanged | unchanged |

Old hashes (`#/library/builder`, `#/library/knowledge`, …) are rewritten to
their new homes by `legacyRoute()` so bookmarks keep working.

**Scenario Author** — new system role (`scenario_author`): `scenarios.read/
write`, `knowledge.read/write`, `preview.read`. Self-installs via
`admin-roles::ensureSystemRoles` (no migration needed). Because Monitor
screens are not granted, a Scenario Author lands straight on the Studio.

## 2. The Studio page

**Home** (nothing open):
1. A hero composer — "What should your team practise?" — with a species
   toggle (Dog / Cat / Let the assistant decide), starter-prompt chips, and
   two ways in: **Build it with the assistant** (opens a new draft and sends
   the description as the first assistant turn) or **Start step by step**.
2. A gallery of every scenario (built-in, written here, trainee-built) as
   cards tinted by driver, with Live / Draft status, species, difficulty and
   filters (All · Live · Drafts · Built-in · From trainees).

**Editor** — three columns on wide screens, collapsing gracefully:

```
┌ header: ← Studio · title · Draft/Live · Unsaved · [Save draft] [Publish] ┐
│ stepper rail │  one step at a time (Continue →)  │  ✦ Assistant (chat +  │
│ 1 Pet ✓      │                                   │  widget cards,        │
│ 2 Pushback ✓ │                                   │  starter chips per    │
│ 3 Owner      │                                   │  step)                │
│ 4 Knowledge  │                                   │                       │
│ 5 AI brief   │                                   │                       │
│ 6 Test drive │                                   │                       │
│ 7 Publish    │                                   │                       │
└──────────────┴───────────────────────────────────┴───────────────────────┘
```

Steps (every editable `scenario_overrides` column belongs to exactly one —
unit-tested):

1. **Pet** — species tiles, breed (typed, with per-species suggestions),
   life stage (species-aware labels: Kitten/Puppy), optional weight.
2. **Pushback** — category tiles with the owner's example quote, "in the
   owner's words", backstory/clinical context.
3. **Owner** — ECHO driver tiles, persona, difficulty (four described
   levels), opening line.
4. **Knowledge** — *where the AI gets its facts*: Whole library / One topic /
   Specific documents; document list with searchable/indexed status; inline
   **Upload a document** (PDF or pasted text → tag assistant → ingest, auto-
   attached, scoped to roleplay + scoring); **Preview what the AI will read**
   (server runs the exact roleplay retrieval and returns the passages).
5. **AI brief** — the admin's opening notes + final reminders, with
   one-tap examples, and **See the full briefing**: the exact system prompt
   the server would send (server-built, simulation config included), with the
   admin's own text highlighted. The canonical brief is wrapped, never
   replaced — that is the product's safety rail (scoring, [END_SIMULATION],
   ACT arc) and is explained in the UI.
6. **Test drive** — a native simulator inside the admin: real `ai-roleplay`
   turns with `preview: true` (nothing recorded), the unsaved draft's notes,
   the customer's mood per turn, End & score (real `ai-evaluate`, preview),
   and a compact scorecard. Plus **Open in the trainee app** (the existing
   `/?pbt_preview=1` iframe in a phone frame) for voice.
7. **Publish** — live card preview + card text, info modal, sort order,
   readiness checklist (required fields, knowledge health, tested this
   session), **Save as draft** / **Publish to trainees** / **Unpublish**.

Unsaved drafts (and the assistant transcript) persist locally per scenario
(`pbt:admin:studio_drafts`) so navigating away or a refresh never loses work.

## 3. The assistant (A2UI orchestration, ported from PhotoBoothAR)

Rule carried over verbatim in spirit: **the model never writes UI and never
writes data.** Gemini returns `{ reply, actionsJson, suggestionsJson }`
(string-encoded JSON — the PhotoBoothAR lesson: ARRAY-of-OBJECT response
schemas hung constrained decoding). The server parses and normalises; the
client normalises again, then *trusted builders* turn each action into an
A2UI v0.9.1 surface rendered by our own catalog. Applying a card only patches
the on-screen draft — saving/publishing is always the admin's explicit click.

Actions (`src/shared/ai/scenarioAgent.ts`):

| tool | card | on confirm |
|---|---|---|
| `update_fields {fields}` | "Suggested changes" — each field editable, old → new | patch draft |
| `set_ai_notes {prompt_prefix?, prompt_suffix?}` | two editable notes | patch draft |
| `attach_knowledge {mode, focus_area?, slugs?}` | documents with checkboxes | patch draft |
| `ask {question, field?, options[]}` | clarifying question as buttons | set field (if any) + answer as a user turn |
| `offer_options {field, options[]}` | pick one of 2–4 (opening lines, titles…) | patch that field |
| `go_to_step {step}` | a single "Open <step> →" button | navigate |

Normalisation (both sides): unknown tools dropped, ≤ 3 actions, every enum
checked against the shared vocabularies, prose capped, weights bounded,
document slugs must exist in the live roleplay-usable library (server: DB;
client: loaded list). Confirm re-validates the (editable) card data.

Server: `netlify/functions/admin-scenario-agent.ts` — `scenarios.write`,
30/min/IP, `MODEL_TEXT` JSON mode, low thinking. Prompt: static rules first,
fenced DATA blocks last (current draft, the step the admin is on, the
roleplay-usable document catalogue, the documents retrieval ranks most
relevant to the conversation, research grounding). Clarify-when-ambiguous:
ask ONE question (as an `ask` card), never re-ask what was given, "you pick"
means choose. Nothing written, no telemetry (mirrors `admin-scenario-ai`).

## 4. Inspect endpoint

`netlify/functions/admin-scenario-inspect.ts` — `scenarios.read`. Body:
`{ draft }`. Builds the runtime `Scenario` from the draft
(`src/shared/scenarios/draftToScenario.ts`, parity-tested against the
consumer's `adminOverrideToScenario`), loads the server simulation config,
runs `retrieveForScenario(scenario, 'roleplay')`, and returns the exact
`buildCustomerSystemPrompt(...)` text + the retrieved passages (title, slug,
citation, snippet) + the applied filter. Read-only.

## 5. Species (dog / cat)

- `Scenario.species?: 'dog' | 'cat'` (absent = dog, for every legacy row).
- Prompt builders swap *dog* nouns for *cat* only when `species === 'cat'`;
  the English dog prompt stays byte-identical (parity fixtures).
- Retrieval passes a species scope when a scenario declares one (dog +
  Puppy life stage → `puppy`), so a cat scenario never grounds on dog-only
  documents.
- Life stage stays one stored vocabulary; `Puppy (<1)` *displays* as
  "Kitten (<1)" for cats (admin + consumer, en + fr).
- **Deferred migration** `20260925000000_scenario_species.sql` adds
  `scenario_overrides.species`. Until it is applied, the overrides function
  retries the save without the column and tells the admin the species was
  not stored (it degrades to today's dog behaviour — never a failed save).

## 6. Out of scope / follow-ups

- A narrower "upload only" knowledge permission for Scenario Authors
  (today they need `knowledge.write`, which also allows editing/deleting).
- Versioned drafts separate from the live row (today: `visible` = published).
- Voice inside the native simulator (voice stays in the trainee-app frame).
