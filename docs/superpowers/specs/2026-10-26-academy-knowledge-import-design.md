# Royal Canin Academy knowledge import — design spec (2026-10-26)

Addendum to the knowledge-scopes spec (2026-09-21) and the knowledge-base
seeding rules in `CLAUDE.md`. Brings the Royal Canin Academy's veterinary
library (https://academy.royalcanin.com/en/veterinary — the Vet Focus
articles) into the RAG corpus as a **curated, traceable, verbatim,
code-defined** document group.

## Goal

The AI customer, the scorer and the coach ground what they say in the
Academy's own articles — "weight loss diets", "how I approach pet obesity",
"pricing strategy", "food elimination trial tips" — with every passage
carrying a citation that names the article, its authors, its Vet Focus issue,
its publication date and its URL, so a trainer can open the source in one
click and an admin can prove where a sentence came from.

Non-goals (this release): the French (`/fr/`) library; e-books, infographics
and videos; the per-issue PDFs; a trainee-facing "sources" panel (product
decision — see Follow-ups).

## Findings that shape the design

1. **The site is Sitecore JSS rendered by Next.js.** Every article page
   embeds its whole content model in `<script id="__NEXT_DATA__">` →
   `props.pageProps.layoutData.sitecore.route`. That is the source we read —
   never the rendered HTML, never a model's paraphrase. Fields that matter:

   | Where | Field | Use |
   | --- | --- | --- |
   | `route.fields` | `Title`, `ArticleName` | document title |
   | | `PublicationDate` (ISO) | citation, metadata |
   | | `Species[]` (`Cat` / `Dog`) | **HARD** species scope |
   | | `Lifestage[]` (`Adult`, `Puppy`, …) | metadata; `puppy` scope hint |
   | | `Themes[]` (e.g. `Overweight / Obesity`, `Healthy Weight`) | focus mapping |
   | | `ArticleTopics[]`, `Tags[]`, `MetaKeywords` | metadata, triage |
   | | `ArticleDescription` (HTML) | abstract line |
   | | `ReadingTime`, `EditorialTag` | metadata |
   | `placeholders.jss-main[PageHeader].fields.LeadParagraph` | "Written by *Name*" + lead | authors, lead paragraph |
   | `…[Article].placeholders['article-content'][]` | `TitleAndParagraph.Text` (rich HTML with `<h2>` sections) | body |
   | | `ContentBlocksVariant.Content` | Key points box, Box N tables, author bio (`id="author"`) |
   | | `QuotePanel.QuoteText` / `Author` | pull quote |
   | | `ImageAndCaption.Caption` | "Figure N." captions (text only) |
   | | `ArticleCarousel` "Other articles in this issue" | issue siblings |
   | last `TitleAndParagraph` | `<h2>References</h2><ol>…` + conflict-of-interest table | references (kept, not embedded) |

2. **The sitemap is complete and flat**: `https://academy.royalcanin.com/en/sitemap.xml`
   lists 457 `/en/veterinary/<slug>` articles plus 17 section pages. No
   sitemap index, no sub-sitemaps.
3. **Issue numbers live on the magazine page**, not the article:
   `/en/veterinary-focus-magazine` → `__NEXT_DATA__` holds one
   `ContentBlocksVariant` per issue (`Title` = "36.1 Beyond body condition",
   `Button1.href` = the issue PDF on the Mars CDN, `Content` = links to the
   issue's articles). Parse it once to map slug → `{ issue, issueTitle, issuePdf }`.
4. **Bot policy.** `robots.txt` allows `/en/veterinary/*` and disallows
   `/api/`, `/*/api/`, `/*/*/api/`. A default `curl` UA gets 403; a
   **truthfully identified** fetcher (`PBT-KnowledgeFetcher/<version>
   (+contact email)`) is served 200. We fetch HTML pages and the sitemap only
   — never the faceted-search API the listing page uses, never a spoofed
   browser UA. One request at a time, ≥ 1.5 s apart, retries with backoff on
   429/5xx, and a local response cache so a re-run costs the site nothing.
5. **Licensing.** The articles are © Royal Canin SAS / Mars. The product is a
   Royal Canin-branded trainer and the corpus already carries Royal Canin
   material (fecal charts), but reproducing ~100 Vet Focus articles in a
   retrieval corpus needs **written permission from Royal Canin**. The
   pipeline is built so nothing reaches production until that is recorded
   (see "Publish gate").
6. **Today's corpus is small** (29 live documents, 55 chunks, ~65 KB). The
   import multiplies chunk count by ~10. Retrieval takes `k: 3` passages per
   prompt, so each chunk must stand alone and precision matters more than
   recall — hence section-aware chunks with a title/section header, HARD
   species scope from the site's own taxonomy, and a focus tag per article.

## Model

### Files (all checked in, all reviewable in a PR)

```
knowledge/academy/
  README.md                 — how to run, what the fields mean, the permission note
  catalogue.json            — EVERY article in the sitemap (457): metadata only, no bodies
  manifest.json             — the curated set: permission + publish gate + one entry per approved slug
  articles/<slug>.md        — verbatim snapshot of each approved article (front-matter + markdown)
scripts/academy/
  fetch.ts                  — HTTP client (honest UA, rate limit, cache, retries)
  sitecore.ts               — route JSON → ArticleModel (pure, fixture-tested)
  toMarkdown.ts             — ArticleModel → front-matter + markdown (pure, deterministic)
  catalogue.ts              — `npm run academy:catalogue`
  snapshot.ts               — `npm run academy:snapshot [--only slug,…]`
  verify.ts                 — `npm run academy:verify` (re-fetch approved, report drift)
  triage.ts                 — Themes/Species/keywords → proposed focus/species/approved (pure)
  __tests__/                — fixtures: one saved route JSON + expected .md; manifest guards
netlify/functions/_shared/knowledgeAcademy.ts
                            — reads the snapshots into ResolvedDoc[] for the sync (group 'academy')
```

Raw HTTP responses are cached under `.cache/academy/` (gitignored). They are
untrusted data: nothing executes from that directory.

### `catalogue.json` (metadata for all 457)

One entry per sitemap URL: `slug`, `url`, `title`, `publicationDate`,
`species[]`, `lifestage[]`, `themes[]`, `topics[]`, `keywords[]`,
`description` (plain text), `authors[]`, `issue`, `issueTitle`, `readingTime`,
`wordCount`, `sourceHash`, `fetchedAt`, `proposed: { focus, species, approved, reason }`.
It is the audit trail of what was considered and why each article was in or
out. Regenerating it is idempotent.

### `manifest.json` (the curated corpus)

```jsonc
{
  "permission": { "status": "pending" | "granted", "reference": "", "grantedBy": "", "date": "" },
  "publish": false,                      // the one switch that lets the sync write
  "fetcher": { "userAgent": "PBT-KnowledgeFetcher/1.0 (+dapo@rethinkreality.ai)", "minDelayMs": 1500 },
  "articles": [
    {
      "slug": "how-i-approach-pet-obesity",
      "approved": true,
      "focus": "weight",                 // FOCUS_AREAS key or null
      "species": ["dog", "puppy", "cat"], // KNOWLEDGE_SPECIES keys — from the site's Species[]
      "tools": ["roleplay", "scoring", "coach", "scenario-builder"],
      "reason": "Themes: Overweight / Obesity, Healthy Weight; client-conversation focus",
      "reviewedBy": "triage",            // "triage" until a human edits it
      "reviewedAt": "2026-10-26"
    }
  ]
}
```

Rules: every approved slug has a snapshot file whose front-matter `sourceHash`
matches the catalogue; `focus` ∈ `FOCUS_AREAS` or null; `species` ⊆
`KNOWLEDGE_SPECIES_KEYS` and non-empty; `tools` ⊆ `KNOWLEDGE_TOOL_KEYS`,
never `fecal-scan`. A unit test enforces all of it.

### Snapshot file `articles/<slug>.md`

```markdown
---
slug: how-i-approach-pet-obesity
url: https://academy.royalcanin.com/en/veterinary/how-i-approach-pet-obesity
title: "How I approach... Pet obesity"
authors: ["Kirsten M. Graham, DVM, MSc, BScH — Graham Mobile Veterinary Weight Management Services, Ontario, Canada"]
publicationDate: 2026-08-10
issue: "36.1"
issueTitle: "Beyond body condition"
species: [Cat, Dog]          # as the site says it
lifestage: [Adult]
themes: ["Overweight / Obesity", "Healthy Weight"]
keywords: [...]
readingTime: "5 - 15 min"
fetchedAt: 2026-10-26T16:15:00Z
sourceHash: sha256 of the canonicalised route JSON (stable key order, volatile fields dropped)
contentHash: sha256 of everything below this front-matter
license: "© Royal Canin SAS. Reproduced for PBT's training corpus under <permission.reference>."
---

> Addressing the topic of pet obesity with an owner requires optimism, … (lead paragraph)

## Key points
- …

## Introduction
"Progress, not perfection." …

> **Box 1. Gamifying BCS assessment.** …   (boxes become blockquotes; tables become markdown tables)

*Figure 1. Involving the client in the BCS assessment …*   (caption only; images are not fetched)

## Weight loss diets
…

## Conclusion
…

## References
1. Montoya M, Péron F, Hookey T, et al. Overweight and obese body condition in ~4.9 million dogs … doi: 10.1016/j.prevetmed.2024.106398
2. …
```

Conversion is deterministic HTML → Markdown (own small converter over the
Sitecore rich text, or `turndown` as a devDependency — the agent's call;
either way a fixture test pins the output). Dropped on purpose: SVG icons,
`&nbsp;` padding, the author bio paragraph (goes to front-matter `authorBio`),
the conflict-of-interest table (front-matter `conflictOfInterest`), social
share, "Other articles in this issue", cookie banner. Entities are decoded
(`&ldquo;` → “). Nothing is reworded; no model touches the text.

### Document + chunk shape in Supabase

No migration. Documents are `source: 'code-seed'` (the manifest and snapshots
ARE code: the sync owns, refreshes and retires them like every other seed,
and admin focus / scope / citation edits and soft-deletes survive through
`buildSeedCatalogue`), `category: 'clinical'`, slug `academy:<site-slug>`.

`metadata`:

```jsonc
{
  "citation": "Graham KM. How I approach... Pet obesity. Vet Focus 36.1 (Royal Canin Academy), 2026. https://academy.royalcanin.com/en/veterinary/how-i-approach-pet-obesity",
  "tags": { "focus": "weight", "tools": [...], "species": [...], "origin": "academy" },
  "source": { "kind": "academy", "url": "…", "publicationDate": "2026-08-10", "issue": "36.1", "issueTitle": "…", "authors": [...], "fetchedAt": "…", "sourceHash": "…", "license": "…" },
  "sync": { … }                          // as today
}
```

Chunks: **section-aware**. Split the body at `##` headings (Key points, each
section); within a section pack paragraphs greedily to ~500 tokens, splitting a
long section at paragraph boundaries; prefix every chunk with one header line
`"<Title> — <Section>"` so a passage read alone (k = 3) still says what it is
about. The `## References` section is NOT embedded (it stays in `content` for
the admin reader). Chunk `citation` = the document citation + ` — "<Section>"`.
Chunk tags = `{ category, focus, tools, species, origin: 'academy', section }`
(extra keys are harmless to containment matching). The document's `content`
column holds the full markdown without front-matter.

Note: an admin's "rebuild the search index" (`admin-knowledge-ingest
op: 're-embed'`) uses the generic paragraph chunker on `content` — that is
acceptable (the next sync restores the section chunks when the body hash
differs… it won't, so document it: the sync skips a body-unchanged document;
the admin re-embed loses the section headers until `SYNC_VERSION` is bumped).
Simplest honest answer: have `re-embed` detect `metadata.source.kind ===
'academy'` and use the same section chunker (export it from `ragShared.ts`).

### Scope mapping (site taxonomy → PBT vocabulary)

- `Species[]`: `Dog` → `['dog', 'puppy']`, `Cat` → `['cat']`, both → all
  three. (A puppy is a dog; `Lifestage` is recorded but never narrows — the
  scorer for a puppy scenario should still read adult-dog nutrition.)
- `Themes[]` → `focus` (first match wins; the full table lives in
  `triage.ts` and is a unit-tested pure function):
  `Overweight / Obesity`, `Healthy Weight`, `Weight management` → `weight`;
  `Digestive…`, `Gastrointestinal…`, `Diarrhoea`, `Microbiome` → `gi`;
  `Dermatology`, `Skin…`, `Allergy`, `Atopic`, `Pruritus` → `dermatitis`;
  `Urinary…`, `Lower urinary tract`, `Urolith…` → `urinary`;
  `Senior`, `Ageing/Aging`, `Geriatric`, `Cognitive` → `aging`;
  `Client communication`, `Practice management`, `Pet owner`, `Pricing`,
  `Nurse/Technician` → `communication`; else `null`.
  The real theme vocabulary is only known after the catalogue run — the
  implementer extends the table from the observed values and records every
  unmapped theme in the catalogue so the mapping can be reviewed.
- `tools`: the four training-session defaults. Never `fecal-scan`.

### Triage (what gets approved)

PBT trains **nutrition pushback** conversations (cost, breeder advice, raw
food, brand switch, weight denial, prescription diets, team-authored
objections) for dogs and cats. Approve an article when it is about: weight /
obesity / body condition; nutrition (diets, feeding, kibble, life-stage
nutrition, milk replacers); GI, dermatology, urinary or renal **diet**
management; senior care; client communication, pet-owner experience, practice
management, pricing, the veterinary nurse's role; kitten / puppy consults.
Reject: surgery, cytology/haematology, oncology, neurology, cardiology,
emergency medicine, imaging, infectious disease, genetics (unless obesity),
sustainability, AI, careers. Expected yield: roughly 100–150 of 457.

`triage.ts` proposes (deterministic: themes + keyword rules over title /
description / keywords); the implementer reviews the proposal list by hand,
fixes mis-sorts, and writes a one-line `reason` per approved article. The
catalogue keeps the rejected ones with their reason too.

### Publish gate (production safety)

The sync's `academy` group yields documents **only when**
`manifest.permission.status === 'granted'` AND `manifest.publish === true`.
Otherwise the group contributes nothing and `owns('academy:*')` returns
`false` for it, so existing rows (if any) are left untouched and nothing is
retired. `npm run knowledge:sync -- --only academy --dry-run` prints the plan
either way (with a loud "NOT PUBLISHED: permission pending" line). The PR
ships with `pending` / `false`; going live is a two-field edit after Royal
Canin's written OK, and the first production deploy after that writes the
corpus through `knowledge-sync-background` exactly like the studies.

### Sync integration

- `KnowledgeGroup` gains `'academy'`; `groupOfSlug('academy:…') → 'academy'`.
- `knowledgeAcademy.ts::academyDocs(readSnapshot)` → `ResolvedDoc[]` with
  explicit `chunks` (section chunker), `contentHash` = snapshot
  `contentHash`, `sourceHash` = snapshot `sourceHash`, `scopeHash` from the
  tag defaults, `baseMetadata.source`, `citationDefault`.
- Snapshots are injected like the study PDFs: the CLI reads
  `knowledge/academy/**` from disk; the background function gets them through
  `[functions."knowledge-sync-background"] included_files = ["knowledge/academy/**"]`
  (the `ai-fecal-scan` on-disk pattern: resolve from `process.cwd()`, log once
  if missing). If the files are unreadable the group is **skipped with a
  warning** — never retired.
- `SYNC_VERSION` is not bumped (existing documents are untouched).
- Proof: when published, the CLI's post-sync proof adds academy probes —
  a dog-scoped `roleplay` query about an owner who denies their Labrador is
  overweight must return at least one `academy:` or `clinical:` passage with
  `focus: weight`; a cat-scoped query must never return a dog-only academy
  document; a `fecal-scan`-scoped query must return zero `academy:` chunks.

### Admin surfaces (minimal, this release)

- Knowledge screen: documents with `metadata.source.kind === 'academy'` show
  a "Royal Canin Academy" pill and an "Open source ↗" link (new tab) in the
  row and the detail panel; the citation line already renders. The body is
  read-only like every built-in (it is).
- Studio KnowledgePreview and the inspector already show `citation` per
  passage — the new citation format carries the URL, so nothing else is
  needed for traceability from a prompt back to the page.
- `admin-knowledge-analyze` / the tag assistant: untouched.

### Accuracy and verification

1. **Verbatim by construction**: text comes from the CMS JSON, converted
   deterministically; no LLM in the text path.
2. **Fixture test**: one real route JSON (saved under `scripts/academy/__tests__/fixtures/`)
   → expected markdown, byte-compared. Covers headings, boxes/tables, figure
   captions, quotes, entities, references, author/COI extraction.
3. **Coverage check** in `snapshot.ts`: words in the markdown body vs words
   in the stripped CMS rich text ≥ 0.95 and ≤ 1.05, else the article is
   written with `"check": "coverage"` in the catalogue and listed in the run
   summary for a human look.
4. **Drift**: `academy:verify` re-fetches approved articles (cache-busting),
   recomputes `sourceHash`, and reports `unchanged | changed | gone`. A
   changed article is re-snapshotted only with `--update`, so the PR diff
   shows exactly what Royal Canin changed.
5. **Manifest guards** (unit test, runs in `npm test`): schema, vocab,
   snapshot presence, hash agreement, no `fecal-scan`, no duplicate slug,
   every approved slug in the catalogue.
6. **Spot-check table in the PR**: five sampled articles with URL, word
   count on site vs snapshot, and section list.

## Rollout

1. Merge this PR (`publish: false`). Nothing changes in production.
2. Obtain Royal Canin's written permission; record it in `manifest.permission`.
3. Flip `publish: true`; deploy. `knowledge-sync-background` writes the group
   on the first boot; confirm in Admin → Knowledge (count, pills, links) and
   with Admin → Knowledge search ("my dog isn't fat").
4. Refresh cadence: quarterly `npm run academy:catalogue` (new articles) +
   `academy:verify` (drift); each refresh is a PR.

## Follow-ups (not this release)

- Trainee-facing "Grounded in" sources on the scorecard / coach hint (product).
- French library (`/fr/`) as a locale-scoped group — retrieval has no locale
  scope today, and multilingual embeddings would mix FR and EN hits.
- Per-issue PDFs as an alternative source (page numbers; 4 MB extraction cap
  is the blocker).
- Retrieval quality eval set (golden queries) once the corpus is live.
