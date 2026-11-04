# Royal Canin feline assets

Cat-specific educational assets (urinary, GI, weight, renal) supplied by Royal
Canin Canada's Veterinary Division for PBT ("Educational Assets_Confident
Conversations", delivered 2026-11-02 through a Box shared folder — that
request is the permission record in `manifest.json`). Spec:
`docs/superpowers/specs/2026-11-04-feline-knowledge-import-design.md`.

> **This repository is public. No asset text, no Box share link and no Royal
> Canin staff name or address lives here.** The reviewed Markdown of every
> document is a row of the service-role table `knowledge_source_snapshots`
> (corpus `feline`); the share link is only in that row's `meta.sourceUrl`.
> Git holds metadata and PINS each document by sha256 (`contentHash`).

## Files

| File | What it is |
| --- | --- |
| `catalogue.json` | Every delivered file (34): file name, folder, pages, words, sha256 and what became of it — the documents it feeds, or why it was excluded. |
| `manifest.json` | The gate (`permission` granted 2026-11-02, `publish` **false** until the owner releases it) and one entry per document: `slug`, `title`, `sourceId` (Box file id), `assetType`, `edition`, `region` (CA / US), `audience` (vet / owner), `focus`, `species` (`["cat"]`), `tools`, the `pages` kept and `pagesExcluded` (with why), `canineBlocksRemoved` (page + size), `transcribedPages`, `reviewNotes`, the pins and the review fields. `excluded` lists files not imported. |

## Scope rules (owner, 2026-11-04)

- **Feline only.** The canine-only calcium oxalate owner guide is excluded;
  canine pages of mixed files are excluded page by page, and canine-only
  passages (a block that names dogs and never cats) are removed by the build
  and counted in `canineBlocksRemoved`.
- **Audience decides who reads it.** Vet-facing material (detailers, the
  Product Guide, sell sheets, bulletins, consult pearls, trial summaries,
  decks, urinalysis tips) → `scoring`, `coach`, `scenario-builder`.
  Owner-facing material (brochures, owner guides) → those plus `roleplay`,
  so the AI cat owner only "knows" what a real owner could have read.
- **US edition** ("Behind the Science") → `region: "US"`, `scoring` + `coach`
  only, "US edition" in its citation. Replace it when the Canadian edition
  arrives.
- Glyco / diabetic material files under `weight` and the senior-cat bulletin
  under `renal` (Royal Canin's own folders); focus `renal` = "Kidney health".
- The Product Guide is one document per feline product family, so a passage
  about one diet never arrives labelled as another.

## Pipeline (accuracy first — no model in the text path)

```bash
npm run feline:extract -- --src <dir of <boxFileId>.bin> --inventory <inventory.jsonl>
      # per page: the text layer (pdftotext -layout) + word boxes; pptx: slide text + notes
FELINE_BOX_SHARE=<the share URL, never committed> npm run feline:build
      # Markdown per document → .cache/feline/build/ ; fidelity check ; pins the manifest
npm run feline:snapshot -- --upload            # or --emit-sql out.sql (keep the parts out of git)
npm run knowledge:sync -- --only feline --dry-run --existing rows.json
```

- **Tables become labelled statements.** Every value carries its column
  header(s) and row label from the text layer by position; a comparison
  table whose columns are products becomes one statement per product.
- **Charts** keep only printed words (rotated axis labels are dropped).
- **Fidelity check (blocking).** Every number, percentage, unit value and
  ®/™ product name in a document must occur in its page's text layer; a
  table whose columns could not be told apart, a value with no header, or a
  page whose words are under 90 % covered is also noted. Any open note holds
  the document (`approved: false`, reason "held"). A reviewer checks the page,
  fixes or accepts it, and sets the note's `status` to `"signed-off"` (the
  build keeps sign-offs) before approving.
- Page-aware chunks: header "<Title> — <Section> (p. N)", citation
  "Royal Canin Canada. <Title> (<asset type>, <edition>[, US edition]). — p. N",
  References not embedded.

## Going live

1. Review the held documents' `reviewNotes` (and spot-check the approved
   ones against the PDFs); sign off or fix.
2. Re-run `feline:build` + `feline:snapshot -- --upload` if anything changed
   (the pins move; the sync refuses a row that does not match its pin).
3. Set `publish: true`, merge, deploy. Check Admin → Knowledge (the "Royal
   Canin asset" pill, type · region, "Open source ↗") and "Try a search".
