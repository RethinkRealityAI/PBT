# Fecal Scan — design spec (2026-09-21)

## Purpose

A supportive stool-assessment tool for veterinary technicians. The tech
photographs a stool sample (or uploads one), picks the species/life-stage
chart, and gets back a Royal Canin fecal score (1 → 5) with a confidence
rating, the matching reference photo from the chart, and the chart passages
the answer was grounded in. It is a discussion aid for the tech ↔ owner
conversation — explicitly **not** a diagnosis and never the source of truth.

The second goal is demonstrative: the feature must make the platform's RAG
loop visible and verifiable. Every result shows what was retrieved, from
which document, with what similarity — and the tests prove the model only
ever answers from the Royal Canin chart for the chosen species.

> **Revised 2026-09-23 (logic audit).** The first build let retrieval decide
> which scores the model could pick (top-k = 6 passages). The adult-dog chart
> has 8 scores, so 1–2 scores were unreachable on every scan. The scorer now
> always receives the WHOLE chart for the species; retrieval ranks passages
> for the grounding trail and admits admin supplements, but never narrows the
> answer. The sections below describe the revised design.

## Source data (the only knowledge the feature uses)

`public/FecalScan/` — Royal Canin "Fecal Scoring System" charts (VGI/064/0324
and VGI/066/0324, © Royal Canin SAS 2024):

| Chart                      | Scores                        | Bands                                                     |
| -------------------------- | ----------------------------- | --------------------------------------------------------- |
| Dogs (adult)               | 1, 2, 2.5, 3, 3.5, 4, 4.5, 5  | too hard/too soft · acceptable · optimal                  |
| Cats                       | 1, 2, 2.5, 3, 4, 5            | too hard/too soft · acceptable · optimal                  |
| Puppies (8 weeks +), EN+FR | 1, 2, 2.5, 3, 4, 4.5, 5       | too hard/too soft · normal (score 3 splits by breed size) |

Directions on every chart: score stools individually from 1 (formed and dry)
to 5 (liquid); when consistency is not homogenous, record the higher score.

The user brief named puppy + adult dog charts; the adult PDF also carries the
cat chart. **Assumption:** include cats — it is in the supplied data and costs
one extra segment. No external sources are consulted, ever.

Per-score reference photos are the JPEGs embedded in the PDFs, extracted
once (scripted) to `public/fecal-scan/<species>/<score>.jpg` and composited on
white. The raw TIF/PSD masters in `public/FecalScan/**/Links` are design
sources and are not served; `public/FecalScan/` is moved out of `public/`
(to `resources/fecal-charts/`) so 83 MB of print masters do not ship in the
bundle.

## Architecture

Mirrors Pet Vision (`ai-vision`), plus a retrieval stage.

```
FecalScanScreen ── useFecalScan ── fecalScanService.postAi('ai-fecal-scan')
                                          │
                       netlify/functions/ai-fecal-scan.ts
                         1. validate image (jpeg/png/webp, ≤ AI_LIMITS), species
                         2. OBSERVE   Gemini (multimodal, JSON) → neutral visual
                                       observations: form, moisture, surface,
                                       residue, homogeneity, notVisible[]
                         3. RETRIEVE  retrieveChunks(observationText, {
                                         k: 8, filters: { tool: 'fecal-scan',
                                         species } })  — HARD scope (tags)
                                       → chunks from knowledge_chunks (pgvector);
                                       any fecal:<other species> chunk dropped
                         4. GROUND    retrieved chart passages verbatim + every
                                       chart score retrieval missed, filled from
                                       the code module (one null-similarity
                                       chunk). source 'rag' if anything was
                                       retrieved, else 'bundled'. Each passage
                                       labelled ROYAL CANIN CHART or CLINIC
                                       SUPPLEMENT (lower authority)
                         5. SCORE     Gemini (multimodal, JSON) with the image +
                                       observations + the whole chart (scale
                                       order) + every chart photo; returns
                                       score, calibrated confidence, rationale,
                                       alternates, caution (+ translated
                                       observations for fr)
                         (0. EXACT    a byte-for-byte chart photo — aspect,
                                       dHash ≤ 6 AND 32×32 pixel MAD ≤ 2 — is
                                       answered from the chart, species-scoped)
                         6. respond { result, retrieval } + telemetry
```

### Knowledge base

`src/data/knowledge/fecalCharts.ts` is the canonical, typed transcription of
the three charts (species, score, label, description, band, image path,
directions). It feeds:

- the UI (reference images, labels, full-chart sheet),
- the code-seed knowledge documents `fecal:dog`, `fecal:cat`, `fecal:puppy`
  (added to `buildSeedDocs()` in `admin-knowledge`, category `clinical`,
  tags `{ focus: 'gi', topic: 'fecal-scoring', species }`, citation
  "Royal Canin — Fecal Scoring System for <Species>, VGI/06x/0324"), one
  paragraph per score so each score becomes its own retrievable chunk,
- the bundled fallback in the function.

Seeding is automatic: `netlify/plugins/knowledge-sync` runs
`scripts/knowledge-sync.ts` after every production / branch deploy, so the
corpus exists without an admin login and without a button. By hand:
`npm run knowledge:sync` (service role + Gemini key), which also proves
retrieval. `admin-knowledge { op: 'seed' }` remains as a JWT-only fallback.
(Superseded the one-off `scripts/seed-fecal-knowledge.ts` this spec
originally called for.)

### Wire contract (`src/shared/ai/contract.ts`)

```ts
AI_ENDPOINTS.fecalScan = '/.netlify/functions/ai-fecal-scan'

interface FecalScanRequest extends AiRequestMeta {
  imageBase64: string; mimeType: string;
  species: 'dog' | 'cat' | 'puppy';
  breedSize?: 'small-medium' | 'large-giant';   // puppies only (score 3 band)
}
interface FecalScanResponse { result: FecalScanResult; retrieval: FecalScanRetrieval }
```

`src/shared/ai/fecalScan.ts` (shared browser + function):

```ts
interface FecalScanResult {
  isStool: boolean;                 // false → gentle retry, everything else defaulted
  score: FecalScore;                // one of the chart's scores
  band: 'tooHard' | 'tooSoft' | 'acceptable' | 'optimal' | 'normal';
  confidence: number;               // 0–1
  rationale: string;                // cites chart wording
  observations: { form; moisture; surface; residue; homogeneity }: string
  alternates: Array<{ score: FecalScore; confidence: number }>;  // ≤ 2
  notVisible: string[];
  caution: string;                  // when to escalate (from chart context only)
}
interface FecalScanRetrieval {
  source: 'rag' | 'bundled';
  query: string;                    // the observation text that was embedded
  docSlugs: string[];
  chunks: Array<{ citation: string | null; similarity: number | null;
                  excerpt: string; scores: FecalScore[] }>;
}
```

`normalizeFecalScanResult()` clamps the score onto the chosen chart, derives
`band` from the chart (never trusts the model's band; puppy score 3 uses
`breedSize`), clamps confidence, filters alternates to chart scores.

### Grounding guarantee

The scoring prompt contains the whole chart for the species (retrieved
passages verbatim, the rest from the code module) and the rule that a clinic
supplement can never add or override a score. `allowedScores` is the full
chart; an answer that is not a chart score (e.g. 3.2) is snapped to the
nearest one with confidence capped at 0.4, and a missing or non-numeric
score is a 502 `upstream` — never a defaulted answer. Confidence is
calibrated: ambiguity between neighbouring scores, poor framing or lighting
must lower it. Tests pin all of this (see Testing).

### Failure posture

- Retrieval failure → `bundled` fallback (never model prior knowledge), the UI
  labels the source honestly ("Reference passages · bundled chart").
- Gemini failure → 502 `upstream`, UI retry (as Pet Vision).
- Not a stool photo → `isStool:false`, UI asks for a clearer photo.
- Rate limit 8/min per IP (as vision). Image never persisted.

### Telemetry

`ai_call_telemetry.call_type` gains `'fecal_scan'` via
`supabase/migrations/20260921000000_fecal_scan.sql` (CHECK extended). Until
applied, `recordCallServer` fails soft (warn) — the feature still works.
`ai-fecal-scan` also records one `'retrieval'` row per scan (the embed + search: `gemini-embedding-001`, latency, estimated tokens, and the error if retrieval threw), gated on `allowTelemetry` / `preview` exactly like the `'fecal_scan'` row.

## UI / UX

New screen `fecalScan` (state-machine route; tab bar hidden; TopBar back).
Entry points: Home quick-action tile (grid becomes 3 tiles: Build · Pet
Analyzer · Fecal Scan), desktop Sidebar item (flag
`nav.sidebar.fecalScan.enabled`, default on), and a cross-link on the Pet
Analyzer.

Screen anatomy (mobile-first, `Glass` surfaces, Geist Mono eyebrows, display
headline "fecal scan"):

1. **Header** — eyebrow `STOOL ASSESSMENT · AI + KNOWLEDGE BASE`, headline,
   one-line purpose, a persistent chip "Supportive tool · not a diagnosis".
2. **Chart picker** — `Segmented` control: Adult dog · Puppy (8 wk+) · Cat.
   Puppy reveals a second segmented: Small/medium · Large/giant.
3. **Capture card** (launcher, no drop zone — this is used on a phone) —
   tips (plain background · good light · fill the frame), one big **Take
   photo** and a quieter **Choose from library** (the library input has NO
   `capture` attribute: on iOS it would force the camera). No camera API →
   the library is the primary action. Under a result it folds to a
   thumbnail + New photo / Library.
4. **Capture modal** (`CaptureModal.tsx`; full screen on a phone, a
   560 px dialog from `sm`; always dark — it is a camera surface) — one
   flow, nothing sent until the tech says so:
   - **Camera** — full-bleed viewfinder, library · shutter · flip in the
     thumb zone, shutter flash. The shot is cropped to what the viewfinder
     showed (`visibleRegion`: the preview is `object-fit: cover`).
     Blocked / missing camera → message + Choose from library.
   - **Review** — the whole photo (`contain`), the chart it will be scored
     on, Retake (or Choose another for a library pick) and **Start scan**.
     `photoQuality.ts` measures sharpness (90th-percentile tile Laplacian
     variance at 256 px) and brightness; a clearly blurry or dark photo
     swaps the buttons (Retake primary, **Scan anyway** secondary). Advisory,
     never blocking; thresholds pinned against the 21 chart photos.
   - **Scanning** — the photo with a sweep + the stepper (Observing →
     Retrieving chart passages → Matching score; time-driven, settles on
     completion). Cancel scan. On success the steps settle, the modal
     closes after ~0.75 s and focus lands on the result. On an error the
     photo is kept: Try again re-sends it, Retake starts over.
   - Closing mid-scan or on an error cancels (the page never shows a scan
     nobody is watching); closing with a result behind it keeps the result.
     "Scan another" goes straight back to the camera.
   - Analytics: the `fecal_scan` event also carries `photoIssue` (the
     review verdict) and `retakes`.
5. **Result** — hero card: big score numeral (display font) + band chip
   colored by band (red / amber / green from `COLORS`); confidence meter;
   side-by-side "Your photo" / "Chart reference {score}" with the chart
   label + description verbatim; observations list; rationale; alternates as
   two small reference thumbnails; not-visible caveats; caution line.
6. **Grounding panel** (the RAG showcase) — eyebrow `RETRIEVED FROM KNOWLEDGE
   BASE`, source pill (`pgvector · knowledge_chunks` vs `bundled chart`),
   the citation, N passages with similarity bars, expandable excerpts, and
   the embedded query text.
7. **Full chart sheet** — button opens an in-screen sheet listing every score
   of the selected chart with image + label + description (also usable
   standalone during an owner conversation).
8. **Footer** — disclaimer + "Scan another".

Dark mode via existing tokens; desktop uses a two-column grid (capture/result
left, grounding panel + chart sheet right) inside the `Page` rail.

i18n: EN + FR catalogs (`src/i18n/{en,fr}/fecalScan.ts`), FR data overlay for
chart labels/descriptions (`src/i18n/fr/data/fecalCharts.ts`; puppy text is
verbatim from the FR chart, dog/cat translated in the same register). The
model's free-text output follows the locale addendum pattern from Pet Vision.

## Testing (TDD — failing tests first, then green)

- `src/data/knowledge/__tests__/fecalCharts.test.ts` — every chart score has
  an image that exists on disk, bands are valid, seed markdown contains one
  paragraph per score with the score number.
- `src/shared/ai/__tests__/fecalScan.test.ts` — normaliser: clamps to chart
  scores, derives band (incl. puppy breed-size split), caps confidence when
  the score is not in the grounded passages.
- `netlify/functions/__tests__/fecalScan.test.ts` — handler: 405/400/413
  paths; happy path calls `retrieveChunks` with `{ tool: 'fecal-scan',
  species }` and the observation text; the scoring prompt contains the
  retrieved chunk text AND every other chart score (all 8 dog scores
  reachable when retrieval returns 6); supplement-only retrieval still
  carries the chart; cross-species chunks dropped; French observations
  localized; missing/NaN score → 502; reference-photo loader refuses SPA
  HTML / non-JPEG and never caches a failure; telemetry rows
  `'fecal_scan'` + `'retrieval'`.
- `src/features/fecal-scan/__tests__/useFecalScan.test.ts` — status machine,
  not-image / too-large errors, stale-request guard.
- `src/features/fecal-scan/__tests__/CaptureModal.test.tsx` — camera →
  review → scan → close; retake counted; a blurry verdict swaps the
  buttons; a stale `done` never closes the modal; error keeps the photo;
  Escape / close; blocked camera offers the library.
- `src/features/fecal-scan/__tests__/photoQuality.test.ts` — no sharp chart
  photo warns (>10× margin); every strongly blurred one does; dark wins
  over blurry.
- `src/features/fecal-scan/__tests__/CameraCapture.test.tsx` — stream
  lifecycle, frame gate, viewfinder crop, launcher (no drop zone).
- `src/screens/__tests__/FecalScanScreen.test.tsx` — renders picker, result
  with reference image path, grounding panel with similarity, disclaimer.
- i18n parity + schema-parity tests pass unchanged.
- **Live RAG verification**: `npm run knowledge:sync` runs the retrieval
  proof after a sync (the dog probe must rank the Score 3.5 passage first;
  the cat probe must return only `fecal:cat`), and the admin Knowledge
  **search tester** (`admin-knowledge-search`) runs the same scoped retrieval
  and echoes the filter. (`rag-retrieve` is forced to the `roleplay` tool and
  cannot see fecal documents — by design.)

## Out of scope

Saving scans, owner-facing PDF export, product recommendations, any
species not on the supplied charts.
