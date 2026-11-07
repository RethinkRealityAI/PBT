# Studio gallery (tags, archive, card actions) + trainee Training library — design spec (2026-11-07)

Owner request, 2026-11-07. Two independent halves: **A. Admin — Scenario
Studio** and **B. Trainee app — Home → Training library**. Decisions the owner
made are marked **(owner)**; everything else is a stated default.

---

## A. Admin — Scenario Studio

### A1. Knowledge step turns green on the recommended choice

Today `studioModel.ts` marks the Knowledge step `done` only when the scenario
picks its own topic or documents; inheriting the category's knowledge (the
default tile, "Use the <Category> knowledge") — or the whole library when the
category has none — stays `optional` (grey). **(owner)** Going Next on the
step means "use the recommended one", so:

- No own knowledge + the category has knowledge → `done`, detail
  "Using the <Category> knowledge (recommended)".
- No own knowledge + the category has none → `done`, detail
  "Using the whole knowledge library".
- Own topic / documents → `done` as today.
- Nothing else changes: the draft stays sparse (no slugs are copied into the
  scenario — inheritance must keep following later category edits), readiness
  warnings stay advisory, publish blockers unchanged. Update the step-status
  unit tests and any rail / readiness copy that implied "not chosen yet".

### A2. Card actions — compact, plus Publish / Unpublish and Archive on the card

The gallery card's long full-width buttons waste space and leave no room for
more actions. Redesign the action row:

- **Primary:** "Open" (edit) — the card body stays the click target for it
  where it is today.
- **Icon buttons** (lucide icons, 32–36 px hit targets ≥ 44 px on touch via
  padding, `aria-label` + visible tooltip on hover/focus): Publish/Unpublish
  (see below), Tags, Duplicate, Archive. Anything that doesn't fit goes into a
  "More" (⋯) menu (keyboard-operable: arrow keys, Escape, focus return).
- Only actions the admin's permissions allow are rendered (`scenarios.write`
  for publish / archive / tags / duplicate); a read-only admin sees Open only.
- **Publish / Unpublish** **(owner)**: the label follows the state
  ("Publish" on a hidden scenario, "Unpublish" on a live one). Always a
  confirmation modal:
  - Publish: runs the same readiness BLOCKERS the editor's Publish step uses
    (one shared function — never a second copy). Blocked → the modal lists
    the blockers and offers "Open in builder", no publish. Advisory warnings
    are shown but don't block.
  - Unpublish: "Trainees will no longer see <title>. Sessions already played
    keep their history." The last-visible guard applies (same rule as the
    editor; refuse to hide the last live scenario).
  - If this admin has unsaved local work for that scenario
    (`localDrafts.ts`), the modal says: "This publishes the last SAVED
    version. You have unsaved changes in the builder." with "Open in builder"
    as the secondary action.
  - Writes go through `admin-scenario-overrides` with `baseUpdatedAt`; a 409
    `stale` re-reads the row and asks again. Library (`seed:`) scenarios keep
    sparse overrides (only `visible` changes). Library scenarios that are
    hidden because their pushback is unresolvable stay unpublishable with an
    explanation.
  - Toast on success, card state updates without a full reload.
- **Archive** **(owner)**: an easy button on the card + an Archived view.
  Semantics:
  - Archive = hidden from trainees (`visible = false`) AND out of the default
    gallery. Stored as `scenario_overrides.archived_at timestamptz` (+
    `archived_by uuid`). Confirm modal ("Archive <title>? It's unpublished and
    moved to Archived. You can restore it any time."). Last-visible guard
    applies when archiving a live scenario.
  - Distinct from delete (soft delete / `deleted_at`, restore via Audit) —
    archive is the everyday "put away"; delete stays where it is.
  - Archived view: a clearly separated "Archived (n)" entry beside the status
    filter (not mixed into Live / Hidden). Archived cards show "Restore"
    (clears `archived_at`; the scenario comes back HIDDEN — publishing is a
    separate, deliberate step) and Open. No Publish button on an archived
    card.
  - Server: an archived row can't be made visible in the same save
    (`visible: true` with `archived_at` set → 400 "restore it first");
    `publicOverrideRows` must not leak `archived_at` / `archived_by` (a hidden
    row is already reduced to `{scenario_id, visible:false, sort_order}` —
    keep it that way and add a test).
  - Audit-log every publish / unpublish / archive / restore like other
    override writes.

### A3. Tags — team tag library with colours

**Model.** Team-wide tags so a colour and name mean the same thing for every
admin:

- `scenario_tags` — `id uuid pk`, `name text` (1–32 chars, unique
  case-insensitive among live tags), `color text` (a key from a fixed palette,
  CHECK), `created_by`, `created_at`, `updated_at`, `deleted_at`. RLS on, no
  policies, no anon/authenticated grants (service role via functions only).
- `scenario_tag_assignments` — `scenario_id text`, `tag_id uuid references
  scenario_tags`, `created_by`, `created_at`, pk `(scenario_id, tag_id)`.
  Same RLS rule. A join table (not a column on `scenario_overrides`) so that
  tagging (a) never creates an override row for a library scenario, and (b)
  never bumps the override's `updated_at` (which would 409 an editor open
  elsewhere).
- Limits: ≤ 100 live tags, ≤ 8 tags per scenario.
- Palette: 8–10 named colours (`slate, red, orange, amber, green, teal, blue,
  indigo, purple, pink`) defined ONCE in `src/shared/scenarios/tags.ts` with
  light + dark fills that pass WCAG AA for the pill text in both themes
  (unit-test the contrast). Never a free hex.
- Tags are ADMIN-ONLY: never in the `flags-resolve` snapshot, never sent to
  any AI prompt.

**Endpoint.** `admin-scenario-tags`: GET (`scenarios.read`) → tags +
assignments; POST (`scenarios.write`) ops `upsert-tag` (create / rename /
recolour; duplicate name → 409), `delete-tag` (soft; removes it from every
scenario after a confirm that shows the count), `set-tags` (`{scenarioId,
tagIds}` — replaces that scenario's assignments; unknown / deleted ids
dropped and listed). Bounded body, audited (`scenario_tag` audit entity — the
audit CHECK migration must include it; NOTE `20261106000100` is not applied,
so write the new constraint to include every entity both files add, and keep
the audit write fail-soft like ECHO's).

**UX — intuitive, fast:**

- On the card: tag pills at the top-right corner of the card's text area
  (not over the preview), small, max 2 visible + "+n" (tooltip lists the
  rest). Clicking a pill filters the gallery by that tag.
- "Tags" icon button → popover: search box that doubles as create ("Create
  tag 'Q1'" row appears when no exact match; Enter creates and assigns), a
  checklist of existing tags with their colour dots, and "Manage tags…" at
  the bottom. New tags get the next unused palette colour; a colour dot next
  to each row opens the palette.
- "Manage tags" modal: rename, recolour, delete (with usage count), and
  create. Reachable from the popover and from the filter bar.
- Optimistic updates with rollback + toast on failure.

### A4. Gallery filters — reorganised, with search

Today status chips, Animal, Category, Objection and the query sit on one line
and read as clutter. New layout, top to bottom:

1. **Animal** — a large pill segmented control **Dog | Cat** **(owner)** at
   the top, each with its count. It is the overarching filter: every facet
   below (categories, objections, tags counts, status counts) is computed for
   the chosen animal. Remembered per admin in localStorage
   (`pbt:admin:studio_species`, via the storage helpers). Shown even while
   the trainee cat switch is off (admins build cat content ahead of launch).
2. **Search + status row** — a search input (matches title, card title,
   objection name, category name, persona, breed, tag names; debounced,
   `/` focuses it, Escape clears) and the status segmented control
   (All · Live · Hidden …, whatever the gallery already supports) with
   counts, then "Archived (n)" set apart at the end.
3. **Refine row** — Category chips (with counts, `ChipScroller`-style
   horizontal scroll with edge fade), Objection select that narrows within a
   chosen category, and a Tags filter (multi-select popover; any-of
   semantics; shows colour dots) + "Manage tags".
4. **Active filter summary** — "Showing 12 of 40 · Clear filters" whenever
   anything beyond the animal is set.

- `galleryFacets` stays the ONE place that computes filtered entries and
  counts — extend it (species-first, search, tags, archived) and its tests.
  `galleryEmpty.ts` keeps offering the scenario that fits the empty filter
  (now animal-aware first) and must ignore search/tags it can't pre-fill.
- From-trainees tab: same animal pill + search; tags/archive don't apply to
  `user:` scenarios.
- Mobile/narrow admin widths (< 900 px): rows wrap cleanly; the animal pill
  stays full width.
- Mock: `npm run dev:admin-mock` fixtures get tags + archived scenarios so
  the gallery can be reviewed offline.

### A5. Migration

`supabase/migrations/20261107000000_scenario_tags_archive.sql` — idempotent:
`scenario_tags`, `scenario_tag_assignments`, `scenario_overrides.archived_at`
/ `archived_by`, an index on assignments by `tag_id`, the audit entity CHECK
extended (`scenario_tag`, plus `echo_quiz` so applying this supersedes
`20261106000100`). Degrade path: if the tables/columns are missing, the
gallery still works (tags hidden, Archive button disabled with a tooltip),
following the existing `capabilities` probe pattern.

---

## B. Trainee app — Home → Training library

### B1. Naming **(owner)**

The bottom tab "Library" (clinical resources) becomes **"Resources"** (fr
"Ressources") everywhere it means the clinical resources: tab bar, desktop
sidebar, the resources screen title, Home's library card aria, any copy that
says "Library" for resources. "Library" from now on means the SCENARIO
library. Keys may keep their names (`tab.library`) — change values, not
keys, unless renaming is trivial.

### B2. Home hero = the Training library card

- The hero no longer shows a specific scenario: remove the scenario
  title/subtitle, the prev / next arrows, and the hero's Dog | Cat switch.
- Copy: eyebrow "Training", title "Training library", body "Pick a
  ready-made scenario or build your own to practise." (refine with the
  `ux-copy` sense of the existing Home tone — lowercase display headline
  convention applies).
- Keep the hero's existing controls the owner asked to keep: the primary
  button (now **"Select scenario"**) and the same text/voice mode control the
  hero already has (whatever "input" control is on it today — keep its
  behaviour and carry the chosen mode into the chat start exactly as now).
- Remove the separate "Build a scenario" action tile from Home (Build lives
  in the modal now). The other tiles (Pet Analyzer, Fecal Scan, …) stay.
- Today's-pick rotation (`dailyPick.ts`) is no longer used by Home. Remove
  dead code and its tests only if nothing else uses it (Chat prev/next walks
  the resolved library — keep that).
- Screen switches still decide what's reachable (`useScreenEnabled`): if the
  create screen is switched off, the modal offers Library only; if there are
  no published scenarios for any visible animal, Library shows its honest
  empty state.

### B3. "Select scenario" modal

- A slick, accessible modal (portal; bottom sheet on phones, centred dialog
  from `sm`; focus trap, Escape, `aria-modal`, focus returns to the button;
  respects reduced motion; themed via `<Glass>` / tokens — never a forced
  light fill).
- Two big choice cards with icons:
  - **Choose from the library** — "Ready-made scenarios written by your
    training team" + count of available scenarios.
  - **Build your own** — "Pick the pet, the pushback and the owner."
- Build your own → the existing Create screen's Build view (unchanged).
- Choose from the library → the new Training library screen (B4).
- Log analytics events for each choice (`ACTION_LABELS` entries required —
  `admin/src/lib/__tests__/labels.test.ts`).

### B4. Training library screen

A new `Screen` (e.g. `SCENARIO_LIBRARY`), reachable from the modal (and
anywhere that linked to the Ready-made view; the hidden `CreateView` library
view can be retired or redirected here — no dead code left behind). Screen
gated with the same switch as the create/train flow per `screenFlags.ts`
(update `flag-parity` expectations only if a new switch is genuinely needed —
prefer none).

- **Animal toggle** **(owner)**: a large Dog | Cat pill at the top, shown only
  when `scenario.cat.enabled` is on AND the resolved library holds published
  scenarios for BOTH animals (the same rule Home's Today's pick used). With
  one animal there is no toggle. Uses `useTrainingSpecies`.
- **Step 1 — focus areas**: big, visual, quick-to-tap category cards (2-up
  grid on phones, 3–4-up on desktop) with an icon, the category name
  (localised: French name when present), and "n scenarios". Only categories
  with ≥ 1 scenario for the chosen animal. "Other pushback" / unresolvable
  team objections share one group, as in the current Ready-made view. Plus
  an "All scenarios" card.
- **Step 2 — scenarios** in that category: reuse the existing Ready-made
  scenario card (whole card starts the scenario, difficulty meter + word,
  "<persona> owner", objection eyebrow when a custom title is set). Objection
  chips to narrow when the category holds > 1 objection. Back returns to the
  category grid (in-screen state + the app back stack — the Android/browser
  back must not skip it).
- Honest empty state per animal.
- Data: `useResolvedLibraryScenarios` + `useObjectionCatalog` (categories) —
  no new fetches.

### B5. Category icons

- Built-in categories get fixed icons (e.g. everyday-nutrition → a bowl /
  utensils icon, weight → scale, prescription-diets → stethoscope / pill,
  other → message bubble). Team categories get an icon chosen by the admin
  in the Studio category editor from a fixed vocabulary (≈ 16 lucide icons:
  bowl, scale, pill, stethoscope, droplet (urinary), kidney/bean (renal),
  sprout (GI/probiotics), heart, bone, sparkles, shield, clock, coins
  (cost), users, message, tag) defined ONCE in
  `src/shared/scenarios/categoryIcons.ts`. When unset, a keyword heuristic
  picks one (urinary → droplet, renal/kidney → kidney, GI/digest/probiotic →
  sprout, weight/obesity → scale, cost/price → coins, …), fallback tag.
- Storage: `scenario_objection_categories.icon text` (nullable, CHECK in
  the vocabulary) — migration
  `supabase/migrations/20261107000100_category_icons.sql`; `admin-objections`
  `upsert-category` accepts and validates it; `flags-resolve` publishes it in
  `snapshot.objectionCategories`; degrade path when the column is missing
  (save retries without it, heuristic icon shown).
- White line icons, never emoji (the admin `noEmoji` test).

### B6. i18n

Every new/changed string in en AND fr; fr via the translator subagent
(`.claude/agents/translator.md`). `catalog.test.ts` must pass.

---

## Cross-cutting

- Tests: unit tests for every new pure function (facets, tags palette
  contrast, step status, category icon heuristic, library grouping), RTL
  tests for the modal (focus, Escape, choice routing) and the library screen
  (toggle visibility rule, category → scenarios → back), function tests for
  the new endpoint ops (permissions, limits, 409s, last-visible guard,
  archived → visible refusal, snapshot leaks none of tags / archived_at).
- `npm test`, `npm run typecheck`, `npm run lint` (if present), `npm run
  build` + `npm run check:bundle` all green.
- Schema parity: new relations declared by the migrations.
- CLAUDE.md is updated once at the end (by the orchestrator).
