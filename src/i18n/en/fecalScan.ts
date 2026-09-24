/**
 * Fecal Scan namespace — English (source catalog).
 *
 * Keys are flat + dotted so `en/index.ts` can spread every namespace into one
 * lookup table. The chart LABELS and DESCRIPTIONS are not here: they are
 * authored data (`src/data/knowledge/fecalCharts.ts`) localised through
 * `src/i18n/dataL10n/fecalCharts.ts`.
 */
export const fecalScan = {
  // ── Screen chrome ─────────────────────────────────────────
  'fecalScan.title': 'Fecal scan',
  /** Geist Mono eyebrow — rendered all-caps with 0.18em tracking. */
  'fecalScan.eyebrow': 'Stool assessment · AI + knowledge base',
  /** Display headline — lowercase by design, matches the other screens. */
  'fecalScan.headline': 'fecal scan',
  'fecalScan.purpose':
    'Photograph a stool sample and get the matching Royal Canin chart score, with the chart passages the answer came from.',
  'fecalScan.notDiagnosis': 'Supportive tool · not a diagnosis',

  // ── Chart picker ──────────────────────────────────────────
  'fecalScan.chart.label': 'Scoring chart',
  'fecalScan.chart.aria': 'Choose the scoring chart',
  'fecalScan.species.dog': 'Adult dog',
  'fecalScan.species.puppy': 'Puppy (8 wk+)',
  'fecalScan.species.cat': 'Cat',
  'fecalScan.breedSize.label': 'Breed size',
  'fecalScan.breedSize.aria': 'Choose the breed size',
  'fecalScan.breedSize.smallMedium': 'Small / medium',
  'fecalScan.breedSize.largeGiant': 'Large / giant',
  'fecalScan.breedSize.hint':
    'On the puppy chart, score 3 reads differently for small/medium and large/giant breeds.',

  // ── Capture card (opens the capture modal) ──────────────
  'fecalScan.capture.eyebrow': 'Capture',
  'fecalScan.capture.title': 'Photograph the sample',
  'fecalScan.capture.body':
    'The camera opens full screen. You check the photo before anything is scanned, and it is never stored.',
  'fecalScan.capture.tip.background': 'Plain background',
  'fecalScan.capture.tip.light': 'Good light',
  'fecalScan.capture.tip.fill': 'Fill the frame',
  'fecalScan.capture.takePhoto': 'Take photo',
  'fecalScan.capture.chooseFromLibrary': 'Choose from library',
  /** Primary action where the browser has no camera API. */
  'fecalScan.capture.choosePhoto': 'Choose a photo',
  /** Compact card under a result — start the next scan. */
  'fecalScan.capture.newPhoto': 'New photo',
  'fecalScan.capture.library': 'Library',
  'fecalScan.capture.photoAlt': 'The stool photo you selected',

  // ── Capture modal ─────────────────────────────────────────
  'fecalScan.modal.title.camera': 'Take the photo',
  'fecalScan.modal.title.review': 'Check the photo',
  'fecalScan.modal.title.scanning': 'Scanning',
  /** Under the modal title: which chart the photo is scored on. {chart} = species label. */
  'fecalScan.modal.chart': '{chart} chart',
  'fecalScan.modal.close': 'Close',

  // ── In-app camera (inside the modal) ──────────────────────
  'fecalScan.camera.shutterAria': 'Take the photo',
  'fecalScan.camera.flipAria': 'Flip camera',
  'fecalScan.camera.denied':
    'Camera access is blocked. Allow it in your browser settings, or choose a photo from your library.',
  'fecalScan.camera.unavailable': 'No camera found on this device. Choose a photo from your library instead.',
  'fecalScan.camera.failed': 'Could not open the camera. Choose a photo from your library instead.',
  'fecalScan.camera.hint': 'Fill the frame with the stool on a plain background',
  /** Shown over the viewfinder until the first frame arrives (shutter disabled). */
  'fecalScan.camera.starting': 'Starting camera…',

  // ── Review step ───────────────────────────────────────────
  /** Shown while the quality check runs, or where the browser can't run it. */
  'fecalScan.review.prompt': 'Is the stool in focus and filling most of the frame?',
  'fecalScan.review.ok': 'Photo looks sharp. Start the scan when you are ready.',
  'fecalScan.review.issue.blurry':
    'This photo looks blurry. A sharper one gives a more reliable score.',
  'fecalScan.review.issue.dark':
    'This photo looks too dark to read the texture. Try again with more light.',
  'fecalScan.review.retake': 'Retake',
  /** Retake for a photo that came from the library. */
  'fecalScan.review.chooseAnother': 'Choose another',
  'fecalScan.review.start': 'Start scan',
  /** Replaces "Start scan" as the secondary action when the quality check flags the photo. */
  'fecalScan.review.scanAnyway': 'Scan anyway',

  // ── Analyzing stepper ─────────────────────────────────────
  'fecalScan.analyzing.eyebrow': 'Working',
  'fecalScan.analyzing.aria': 'Scoring the photo',
  /** Announced when the stepper completes, just before the result opens. */
  'fecalScan.analyzing.done': 'Done. Opening the result.',
  'fecalScan.analyzing.step.observe': 'Observing the sample',
  'fecalScan.analyzing.step.retrieve': 'Retrieving chart passages',
  'fecalScan.analyzing.step.match': 'Matching the chart score',
  'fecalScan.scanning.cancel': 'Cancel scan',

  // ── Result hero ───────────────────────────────────────────
  'fecalScan.result.eyebrow': 'Fecal score',
  /** Eyebrow for the variant where no score is claimed (not a stool photo). */
  'fecalScan.result.noScore': 'No score',
  'fecalScan.result.scoreAria': 'Fecal score {score} out of 5',
  /** Screen-reader announcement when a result lands. {band} is a band label. */
  'fecalScan.result.announce': 'Fecal score {score} out of 5: {band}.',
  /**
   * Coarse confidence — the model's self-estimate, deliberately NOT shown as
   * a percentage (it would read as measured accuracy). ≥0.75 high, ≥0.5 moderate.
   */
  'fecalScan.result.confidence.high': 'High confidence',
  'fecalScan.result.confidence.moderate': 'Moderate confidence',
  'fecalScan.result.confidence.low': 'Low confidence',
  /** Qualifier next to the confidence label. */
  'fecalScan.result.confidence.qualifier': 'AI estimate',
  'fecalScan.result.yourPhoto': 'Your photo',
  'fecalScan.result.chartReference': 'Chart reference {score}',
  'fecalScan.result.observations': 'What the photo shows',
  'fecalScan.result.obs.form': 'Form',
  'fecalScan.result.obs.moisture': 'Moisture',
  'fecalScan.result.obs.surface': 'Surface',
  'fecalScan.result.obs.residue': 'Residue',
  'fecalScan.result.obs.homogeneity': 'Consistency',
  'fecalScan.result.rationale': 'Why this score',
  'fecalScan.result.alternates': 'Close alternatives',
  'fecalScan.result.notVisibleLabel': "What a photo can't show",
  'fecalScan.result.caution': 'When to involve the veterinarian',
  'fecalScan.result.notStool':
    "That doesn't look like a stool sample. Try a clear, well-lit photo taken straight down onto a plain background.",

  // ── Bands (from the chart, never from the model) ──────────
  'fecalScan.band.tooHard': 'Too hard',
  'fecalScan.band.tooSoft': 'Too soft',
  'fecalScan.band.acceptable': 'Acceptable',
  'fecalScan.band.optimal': 'Optimal',
  'fecalScan.band.normal': 'Normal',
  /** One plain line under the band chip saying what the band means. */
  'fecalScan.band.meaning.tooHard': "Firmer than the chart's ideal range",
  'fecalScan.band.meaning.tooSoft': "Softer than the chart's ideal range",
  'fecalScan.band.meaning.acceptable': 'Acceptable, just outside the ideal range',
  'fecalScan.band.meaning.optimal': "In the chart's ideal range",
  'fecalScan.band.meaning.normal': "In the chart's normal range",

  // ── Grounding panel ("where this score came from") ─────
  'fecalScan.grounding.eyebrow': 'Where this score came from',
  /** Chart reference photos the scorer was shown. Singular form below. */
  'fecalScan.grounding.referencePhotos': 'Compared against {n} chart photos',
  'fecalScan.grounding.referencePhotosOne': 'Compared against 1 chart photo',
  /** Source of each passage, from the chunk's `kind`. */
  'fecalScan.grounding.kind.chart': 'Royal Canin chart',
  'fecalScan.grounding.kind.supplement': 'Clinic supplement',
  /**
   * The trailing chunk with no similarity: the chart scores retrieval did not
   * return, which the scorer still saw. Never labelled as a match strength.
   */
  'fecalScan.grounding.kind.restOfChart': 'Rest of the chart',
  'fecalScan.grounding.match.alsoConsidered': 'Also considered',
  /** Older responses carry no `kind` — a neutral label. */
  'fecalScan.grounding.kind.unknown': 'Passage',
  /** Coarse relevance of each passage (cosine ≥0.75 strong, ≥0.6 good). */
  'fecalScan.grounding.match.strong': 'Strong match',
  'fecalScan.grounding.match.good': 'Good match',
  'fecalScan.grounding.match.partial': 'Partial match',
  'fecalScan.grounding.expand': 'Read more',
  'fecalScan.grounding.collapse': 'Show less',
  'fecalScan.grounding.empty': 'No passages were returned for this scan.',
  'fecalScan.grounding.idle':
    'After a scan, the chart passages behind the score appear here, so you can see exactly what it was based on.',
  // Technical details (collapsed disclosure) — for admins and the curious.
  'fecalScan.grounding.technical': 'Technical details',
  'fecalScan.grounding.tech.retrieval': 'Retrieval',
  /** Technical provenance — the Postgres extension + table the passages came from. */
  'fecalScan.grounding.source.rag': 'Vector search · pgvector · knowledge_chunks',
  'fecalScan.grounding.source.bundled':
    'Bundled chart text (the search returned no passages)',
  /** The hard wall the search ran inside, e.g. "Fecal scan · Adult dog". */
  'fecalScan.grounding.tech.scope': 'Search scope',
  'fecalScan.grounding.queryLabel': 'Search query (embedded)',
  'fecalScan.grounding.docs': 'Source documents',
  'fecalScan.grounding.similarity': 'Match scores (cosine similarity)',
  'fecalScan.grounding.tech.confidence': 'Model confidence (self-estimate, 0–1)',

  // ── Full-chart sheet ──────────────────────────────────────
  'fecalScan.chartSheet.eyebrow': 'Reference chart',
  'fecalScan.chartSheet.open': 'View full chart',
  'fecalScan.chartSheet.close': 'Close the chart',
  'fecalScan.chartSheet.directions': 'Directions for use',
  'fecalScan.chartSheet.imageAlt': 'Royal Canin reference photo for score {score}',
  'fecalScan.chartSheet.scoreAria': 'Score {score}',

  // ── Footer ────────────────────────────────────────────────
  'fecalScan.footer.disclaimer':
    'A supportive reference from the Royal Canin fecal scoring charts — a discussion aid for the clinic and the owner, never a diagnosis and never the source of truth.',
  'fecalScan.footer.scanAnother': 'Scan another',
  /** Action under the "not a stool" message. */
  'fecalScan.footer.tryAnotherPhoto': 'Try another photo',
  'fecalScan.footer.tryAgain': 'Try again',

  // ── Cross-link from the Pet Analyzer ──────────────────────
  'fecalScan.crossLink.fromAnalyzer': 'Need a stool assessment? Open Fecal Scan →',

  // ── Failures (`useFecalScan`) ─────────────────────────────
  'fecalScan.error.notImage': 'Please choose an image file.',
  'fecalScan.error.tooLarge': 'That image is over 5 MB — try a smaller photo.',
  'fecalScan.error.unreadable': 'Could not read that image. Try another photo.',
  'fecalScan.error.failed':
    'Could not score the photo. Check your connection and try again.',
} as const;
