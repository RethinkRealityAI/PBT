# Royal Canin feline assets + private source storage — design spec (2026-11-04)

Second external corpus after the Royal Canin Academy import
(`2026-10-26-academy-knowledge-import-design.md`), and an amendment to it: the
repository is **public**, so no Royal Canin text is stored in git any more —
for either corpus.

## Source

Royal Canin Canada's Veterinary Division assembled "Educational
Assets_Confident Conversations" for PBT at their marketing team's request
(cat-specific educational assets for urinary, GI, weight and renal health, plus
anything else useful for the AI conversations), delivered through a Box
shared folder on 2026-11-02. That request is the
permission record: `permission.status = "granted"`, reference "Royal Canin
Canada Veterinary Division, Educational Assets_Confident Conversations,
2026-11-02". Staff names and email addresses are never written to git.

34 files, 118 MB, ~92,600 words:

| Folder | Files | Notes |
| --- | --- | --- |
| (top) | 2 | 2027 Vet Health Nutrition Product Guide (80 pp: Urinary 1–20, Weight 21–36, GI 37–60, Vital Support/Renal 61–80; feline product pages with nutrient tables, calorie content, indications, feeding guides, reference lists); 2027 Feline Sell Sheet |
| Urinary | 9 | US "Behind the Science" detailer (20 pp), CVUC detailer, urinalysis tips, RSS lunch-and-learn deck (pptx, 25 slides + notes), Jeopardy training game (pptx, 28 slides), owner brochures, CaOx owner guides (canine + feline) |
| GI | 12 | Feline GI HP detailer (20 pp), consumer brochure, sell sheets, probiotic clinical trial summary, chronic enteropathy / microbiome / fibre-response bulletins; one image-only draft ("GI Sell Sheet 2025_JC Edits", no text layer) |
| Weight | 7 | 2026 detailer (16 pp), obesity bulletin, Satiety sell sheet (canine + feline), owner brochure, Glyco diabetic detailer / sell sheet / brochure |
| Renal | 4 | Vital Support detailer (canine + feline), renal diet guide, CKD consult pearls, senior-cat bulletin |

The Box share link grants anyone who holds it access to Royal Canin's
folder: it lives only in admin-only database metadata, never in git, never
in a trainee-facing response.

## Decisions (owner, 2026-11-04)

1. **Repo stays public; Royal Canin text leaves git.** Applies to the
   Academy snapshots, catalogue descriptions/keywords and the real-article
   test fixtures as well. PR #32's branch history is rewritten so no commit
   carries Royal Canin text or the owner's email address.
2. **Audience scoping.** Vet-facing material (detailers, product guide,
   sell sheets, technical bulletins, consult pearls, clinical trial
   summaries, lunch-and-learn and training decks, urinalysis tips) →
   `tools: ['scoring','coach','scenario-builder']`. Owner-facing material
   (owner brochures, pet-owner guides) → those three **plus `roleplay`**, so
   the AI cat owner can only "know" what a real owner could have read.
3. **Feline only.** `species: ['cat']` everywhere. The canine-only CaOx owner
   guide is excluded; canine pages and canine-only passages of mixed
   documents are filtered out (page level where the layout allows, else
   section level, with the exclusion recorded). Dog scenarios do not change.
4. **US detailer included, labelled.** "Urinary – Behind the Science (US
   version)": `region: 'US'`, `tools: ['scoring','coach']` only, citation
   says "US edition"; replaced when the Canadian version arrives. Every
   other document is `region: 'CA'`.
5. **Gate closed.** `publish: false` until the owner releases it (same switch
   as the Academy).

Assumptions (stated, not asked): Glyco/diabetic material files under
`weight` (Royal Canin's own folder); a new focus area **`renal`** ("Kidney
health") is added to `FOCUS_AREAS` (no migration); the image-only
"JC Edits" draft is excluded as a draft unless rendering shows it is final
and not superseded by the v8 GI sell sheet.

## Storage model (both corpora)

```
git (public)                               Supabase (private)
─────────────────────────────────────      ─────────────────────────────────────────────
knowledge/<corpus>/manifest.json           public.knowledge_source_snapshots
  gate + permission (no personal data)       corpus  text  ('academy' | 'feline')
  per document: slug, approved, focus,       slug    text  (pk with corpus)
  species, tools, region, audience,          content text  (markdown body, front-matter
  reason, sourceId, contentHash,                            as JSON in `meta`)
  sourceHash, pages kept/excluded            content_hash text   (sha256 of content)
knowledge/<corpus>/catalogue.json            source_hash  text   (sha256 of source bytes)
  metadata only — no prose from the          meta    jsonb (title, authors, edition,
  source (no descriptions, keywords,                       pages, sourceUrl, box ids…)
  bios, quotes)                              updated_at timestamptz
                                             RLS on, no policies, no anon/authenticated
                                             grants — service role only
```

- **Git pins, the table holds.** The sync reads the approved list and each
  `contentHash` from the manifest, fetches the rows from
  `knowledge_source_snapshots`, and accepts a row only when
  `sha256(content) === manifest.contentHash`. A missing row, a hash mismatch
  or an unreadable table **skips the group with a loud line and never
  retires** (exactly the Academy gate's fail-safe). So a PR still shows
  every change to the corpus (hash moves), and nobody can alter the text in
  the table without the next sync refusing it.
- **Migration** `20261104000000_knowledge_source_snapshots.sql` (idempotent,
  RLS on, revoke from anon/authenticated, comment on table). Applied to
  production before the release that reads it; `verify:db` covers it.
- **Writers.** `npm run academy:snapshot -- --upload` / `feline:snapshot --
  --upload` upsert rows with the service-role key; `--emit-sql <file>`
  writes idempotent SQL parts for an environment without it. Uploading a
  row never makes it retrievable: only the sync (gate open) writes
  `knowledge_documents` + chunks.
- `included_files = ["knowledge/academy/**"]` is removed from
  `knowledge-sync-background` — the snapshots no longer ship in the bundle.
- **Tests** use synthetic fixtures written for the test (shaped like the real
  Sitecore JSON / PDF text, containing no Royal Canin prose). The existing
  real-article fixtures are deleted.

## Feline extraction (accuracy first)

Designed collateral is multi-column, chart-heavy and table-dense, so a raw
text dump would misattribute values (a 5-product nutrient table chunked at
k = 3 invites a wrong-column answer). Extraction is per page and produces a
reviewed markdown snapshot per document:

1. **Text layer first.** `pdftotext -layout` / pdfplumber per page; pptx via
   python-pptx (slide text + speaker notes; Jeopardy as Q/A pairs per
   category). Prose blocks are kept verbatim (line-wrap reflow only).
2. **Tables → one statement per product.** "Urinary SO dry (feline) — per
   1000 kcal: protein 88.6 g; … (dry matter 36.5 %)". Values come from the
   page's text layer by column position; a row whose columns can't be
   aligned confidently is transcribed from the page image and flagged.
3. **Charts and graphics** keep only what is printed: title, axis labels,
   data labels, footnoted claims. No interpretation of a chart's shape.
   Unreadable art (rotated breed-name axes, decorative figures) is dropped
   and noted.
4. **Fidelity check (mechanical, blocking).** For every snapshot, every
   number, percentage, unit value and ® / ™ product name in the markdown
   must occur in that source page's text layer (normalised for whitespace,
   hyphenation and superscript footnote digits). Any token that doesn't is
   listed for human review and the document is not approved until the list
   is empty or each item is signed off in the manifest (`reviewNotes`).
5. **Claims keep their footnotes.** A claim's reference markers stay
   attached; each document's reference list is kept in `content` but not
   embedded (same rule as Academy "References").
6. **No model output enters the corpus unchecked.** Where an agent
   transcribes from a page image (no text layer), the snapshot carries
   `meta.transcribed: true` and the review list includes every value on
   that page.

**Document granularity.** One document per source file, except the Product
Guide: one document per feline product family page group (e.g. "Urinary SO
— dry / loaf / morsels"), each with its own focus, so a passage about Renal
Support never arrives labelled "Urinary". Section references pages stay in
`content`, not embedded.

**Chunks.** Page-aware variant of `chunkSectionedMarkdown`: split at
headings and page boundaries, ~500 tokens, header line
`"<Document title> — <Section> (p. N)"`, tags `{ category, focus, tools,
species, origin: 'feline', region, audience, section, pages }`, chunk
citation `"<Document citation> — p. N"`.

**Citation.** `Royal Canin Canada. <Title> (<asset type>, <edition>[, US
edition]). p. N`. `metadata.source = { kind: 'royal-canin-asset', corpus:
'feline', assetType, edition, region, audience, boxFileId, sourceUrl
(DB only), sha256, pages, pagesExcluded, permission }`. Admin → Knowledge
shows a "Royal Canin asset" pill, the asset type and region, and "Open
source ↗" (host must be `*.box.com`, https) read from the DB.

## Sync

Group `feline` beside `academy`, sharing one implementation for "external
corpus behind a gate, text from the snapshot table" (`_shared/
knowledgeExternal.ts` or equivalent). `--only feline` in the CLI. The CLI
proof gains feline probes when published: a cat `scoring` query about
struvite dissolution must return a `feline:` urinary chunk; a cat
`roleplay` query must return only owner-facing feline documents; a dog
query must return no `feline:` chunk; a `fecal-scan` query none.

## Rollout

1. Rewrite PR #32's branch, push the private-storage + feline work, apply
   the migration, upload both corpora's snapshot rows. Gates closed.
2. Owner reviews the feline manifest and the fidelity report; records
   Academy permission when obtained.
3. Flip `publish: true` per corpus; deploy; confirm in Admin → Knowledge
   and with "Try a search".
4. Scenarios built on this corpus (Studio categories for Urinary, GI,
   Weight, Renal; cat scenarios) are a separate release.

## Follow-ups

- Canadian "Behind the Science" urinary detailer replaces the US edition.
- The WSAVA feline BCS chart in `resources/` (CLAUDE.md outstanding item 11).
- GitHub keeps unreachable commits reachable by SHA until garbage
  collection: ask GitHub Support to purge PR #32's old commits if the
  exposure matters.
