# Knowledge scopes — design spec (2026-09-21)

Addendum to the RAG pipeline and to the Fecal Scan spec.

## Problem

Every retrieval consumer reads one `knowledge_chunks` table. Isolation today
is incidental:

| Consumer            | Filter today                               | Leak                                             |
| ------------------- | ------------------------------------------ | ------------------------------------------------ |
| Roleplay / voice    | scenario focus (soft) or attached slugs    | fecal charts are `focus: gi` → quotable in GI roleplays; zero-hit focus retries **unfiltered** |
| Scoring             | same as roleplay                           | same                                             |
| Scenario-builder AI | none                                       | everything                                       |
| Fecal Scan          | hard-wired `docSlugs: ['fecal:<species>']` | none — but an admin can never add a supplement   |

An admin has no way to say "this document is for the fecal scan, dogs only"
and no way to see what a search actually returns.

## Model

Two scope tags live on every document (`knowledge_documents.metadata.tags`)
and are copied onto every chunk (`knowledge_chunks.tags`) as jsonb arrays:

- `tools: string[]` — WHO may retrieve it. Vocabulary
  `src/shared/knowledge/knowledgeScopes.ts::KNOWLEDGE_TOOLS`:
  `roleplay` · `scoring` · `coach` · `scenario-builder` · `fecal-scan`.
  Default (admin chose nothing): the four training-session tools. **Fecal
  Scan is never included by default.**
- `species: string[]` — WHICH animals. `dog` (adult) · `puppy` · `cat`.
  Default: all three.
- `focus` (existing) — WHAT clinical topic. Unchanged.

Containment (`tags @> filter`) on arrays means "array contains", so a doc
filed `species: ['dog','puppy']` matches both a dog and a puppy request and
never a cat one.

## Retrieval rules (`netlify/functions/_shared/retrieval.ts`)

`RetrievalFilters` gains `tool` and `species`. The jsonb filter is built as
`{ tools: [tool], species: [species], focus }` (each only when given).

- `tool` and `species` are **HARD**: never relaxed, on any fallback path.
- `focus` is **SOFT**: zero rows with a focus → retry with tool/species only.
- `docSlugs` (explicit scenario attachments) replace `focus`, and still run
  inside the tool/species scope.
- The RPC-error fallback (migration not applied) also keeps tool/species.
- Every production caller passes its tool: `ai-roleplay` / `ai-voice-token`
  → `roleplay`; `ai-evaluate` → `scoring`; `admin-scenario-ai` →
  `scenario-builder`; `ai-fecal-scan` → `fecal-scan` + `species` (no more
  `docSlugs`); the browser (`useTextChat` → `rag-retrieve`) → `roleplay`.
  `rag-retrieve` accepts `tool`/`species` through `sanitizeFilters`.

`match_knowledge_chunks` additionally returns `doc_slug` and `doc_title`
(migration re-creates the function with the same 4-arg signature; the
return type changes so it is dropped first). `RetrievedChunk` carries them
as optional `docSlug` / `docTitle`.

## Data

- Seed docs (`admin-knowledge` op=seed): driver / pushback / act / clinical /
  bundled studies → `tools: DEFAULT_KNOWLEDGE_TOOLS`, `species: all`;
  `fecal:*` → `tools: ['fecal-scan']`, `species: [<chart>]`.
- Ingest (`admin-knowledge-ingest` op=ingest): `tags.tools[]` and
  `tags.species[]` validated against the vocabulary; missing → defaults.
- Update (`admin-knowledge` op=update): `tools` / `species` editable on every
  document (built-ins too, like focus); chunk tags rewritten.
- Migration `20260922000000_knowledge_scopes.sql` (idempotent): backfill
  `tools` + `species` where missing on chunks and document metadata
  (`fecal:*` → fecal-scan + its species; everything else → defaults); promote
  a scalar `species` to an array; re-create the RPC with provenance columns.
  Until it is applied, chunks without `tools` are invisible to scoped
  retrieval — the migration MUST be applied with (or before) the deploy.

## Admin dashboard (Knowledge screen)

- List: new **Used by** column (tool chips) and **Species** chips; filter rows
  for tool and species alongside focus and type.
- Document detail: editable **Used by** (multi-select chips) and **Species**
  (multi-select chips), saved through op=update; built-ins editable too.
- Add document: **Used by** (default training set) and **Species** (default
  all) pickers; copy explains Fecal Scan must be ticked on purpose.
- **Try a search** card: tool (required) · species · focus · query · k →
  `admin-knowledge-search` (permission `knowledge.read`) → ranked passages
  with similarity bar, document title, scope chips, excerpt, plus the exact
  jsonb filter applied and whether focus was relaxed. This is how an admin
  proves a cat document cannot surface for a dog scan.
- Scenario builder attachment picker: only documents scoped to `roleplay`
  are offered (others shown greyed with "not used by roleplay").

## Consumer

Fecal Scan grounding panel shows the scope actually used ("fecal-scan · dog")
and each passage's document title, so admin supplements are visibly
distinguished from the chart.

## Tests

- retrieval: tool/species never relaxed on zero rows or RPC error; focus
  relaxed; docSlugs inside scope; sanitize drops unknown keys.
- seed/ingest/update: tags written on docs and chunks; validation.
- consumers: each function passes its tool (assert the RPC `filter`).
- fecal-scan: filter `{ tools:['fecal-scan'], species:['dog'] }`, no
  docSlugs; a supplement chunk without scores does not restrict
  `allowedScores`.
- admin-knowledge-search: permission, validation, filter echo, relaxed flag.
- admin UI: chips render, filters work, editor saves tools/species, search
  tester renders results and the applied filter.
- schema-parity + catalog parity unchanged.
