# Royal Canin Academy corpus

Verbatim snapshots of selected Vet Focus articles from the Royal Canin Academy
veterinary library (<https://academy.royalcanin.com/en/veterinary>), curated
for PBT's retrieval corpus. Spec:
`docs/superpowers/specs/2026-10-26-academy-knowledge-import-design.md`.

> **Licensing.** The articles are © Royal Canin SAS. Nothing here reaches the
> production corpus until Royal Canin's **written permission** is recorded in
> `manifest.json` and `publish` is set to `true` (see "Going live").

## Files

| File | What it is |
| --- | --- |
| `catalogue.json` | Every article in the English sitemap (457): metadata only, the deterministic triage proposal (`proposed`) and the reviewed outcome (`decision`), word counts and the coverage figure. The audit trail of what was considered and why each article is in or out. `unmappedThemes` lists site themes with no PBT focus mapping. |
| `manifest.json` | The publish gate (`permission`, `publish`) and the reviewed decisions: one entry per approved article (`approved: true`, `focus`, `species`, `tools`, one-line `reason`, `reviewedBy`, `reviewedAt`) plus the triage proposals a reviewer rejected (`approved: false`), so a later catalogue run does not propose them again. |
| `articles/<slug>.md` | One snapshot per approved article: `key: <JSON>` front-matter (valid YAML) + the article as Markdown, converted deterministically from the CMS JSON. No model touches the text. |

Front-matter fields: `slug`, `url`, `title`, `authors` (name — credentials,
affiliation), `authorBio`, `conflictOfInterest`, `publicationDate`, `issue` /
`issueTitle` / `issuePdf` (from the Vet Focus magazine page), the site's own
`species` / `lifestage` / `themes` / `topics` / `keywords`, `readingTime`,
`fetchedAt`, `sourceHash` (sha256 of the canonicalised CMS content — drift
detection), `contentHash` (sha256 of everything below the front-matter — what
the sync stores and fingerprints) and `license`.

**Do not edit a snapshot by hand.** The sync refuses an article whose body no
longer matches its `contentHash` (the group is skipped, nothing is written).
Change the converter and re-snapshot instead.

## Scripts

```bash
npm run academy:catalogue            # sitemap + every article + magazine → catalogue.json; merges new
                                     # approved proposals into manifest.json (never overwrites a reviewed entry)
npm run academy:snapshot             # writes articles/<slug>.md for every approved article
npm run academy:snapshot -- --only a,b
npm run academy:verify               # re-fetches approved articles: unchanged | changed | gone | missing
npm run academy:verify -- --update   # …and re-snapshots the changed ones (review the diff)
npm run knowledge:sync -- --only academy --dry-run --existing rows.json   # the sync plan, no keys needed
```

Fetching (`scripts/academy/fetch.ts`) identifies itself truthfully
(`PBT-KnowledgeFetcher/1.0 (…; contact …)`), sends one request at a time at
least 1.5 s apart, backs off on 429 / 5xx, never calls a path robots.txt
disallows (`/api/` at any depth), and caches every response under
`.cache/academy/` (gitignored, untrusted data) so a re-run costs the site
nothing; `--refresh` bypasses the cache. A cold catalogue run is ~460
requests, about 15 minutes.

## How an article is chosen

`scripts/academy/triage.ts` proposes, deterministically, from the site's
Themes / Species and the title / description / keyword wording: weight,
nutrition, diet-managed GI / skin / urinary / renal conditions, senior care,
client communication, pricing and the nurse's role are in; surgery, imaging,
cytology, oncology, cardiology, neurology, emergency medicine, infectious
disease, reproduction, sustainability, AI and careers are out. A reviewer then
edits `manifest.json` by hand — every approved article carries a one-line
reason — and changes `reviewedBy` to their name. Species come from the
site's own `Species[]` (Dog → dog + puppy, Cat → cat) and are a HARD
retrieval scope; `tools` are the four training-session tools, never
`fecal-scan`.

## How it reaches the corpus

The knowledge sync's `academy` group (`netlify/functions/_shared/knowledgeAcademy.ts`)
turns each approved snapshot into a `code-seed` document `academy:<slug>`
(category `clinical`) with section-aware chunks — one header line
"<Title> — <Section>" per chunk, References not embedded — and a citation
naming authors, title, Vet Focus issue, year and URL. The background sync
reads these files from its bundle (`included_files` in `netlify.toml`); the
CLI reads them from the working tree. While the gate is closed the group
writes nothing and owns nothing: stored rows are never touched or retired.

## Going live

1. Obtain Royal Canin's written permission. Record it in `manifest.json`:
   `permission: { status: "granted", reference: "<their reference>", grantedBy: "<name, role>", date: "YYYY-MM-DD" }`.
2. Set `publish: true`, open a PR (the manifest guard test requires all four
   permission fields), merge, deploy.
3. The first production boot after the deploy runs `knowledge-sync-background`,
   which embeds and writes the group (~130 documents, ~1,300 chunks). Check
   Admin → Knowledge (the "Royal Canin Academy" pill and "Open source ↗"
   links) and Admin → Knowledge → Try a search ("my dog isn't fat").

To take it down again, set `publish: false` — that stops further writes but
leaves stored rows as they are; delete them in Admin → Knowledge (or remove
articles from the manifest while published, which retires them).

## Refresh cadence

Quarterly: `npm run academy:catalogue` (new articles get a proposal) and
`npm run academy:verify` (drift). Each refresh is a PR, so the diff shows
exactly what Royal Canin added or changed.
