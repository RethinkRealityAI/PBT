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

  // ── Capture card ──────────────────────────────────────────
  'fecalScan.capture.eyebrow': 'Capture',
  'fecalScan.capture.title': 'Take or upload a photo',
  'fecalScan.capture.body':
    'Photograph the stool on a plain background in good light. The photo is never stored.',
  'fecalScan.capture.hint': 'Fill the frame with the stool on a plain background.',
  'fecalScan.capture.takePhoto': 'Take photo',
  'fecalScan.capture.uploadPhoto': 'Upload photo',
  'fecalScan.capture.retake': 'Retake',
  'fecalScan.capture.dropActive': 'Drop the photo to scan it',
  'fecalScan.capture.replace': 'Replace',
  'fecalScan.capture.photoAlt': 'The stool photo you selected',

  // ── In-app camera ─────────────────────────────────────────
  'fecalScan.camera.shutterAria': 'Take the photo',
  'fecalScan.camera.flipAria': 'Flip camera',
  'fecalScan.camera.cancel': 'Cancel',
  'fecalScan.camera.denied':
    'Camera permission was denied — you can still upload a photo.',
  'fecalScan.camera.unavailable': 'No camera on this device — upload a photo instead.',
  'fecalScan.camera.failed': 'Could not open the camera. Upload a photo instead.',
  'fecalScan.camera.hint': 'Fill the frame with the stool on a plain background.',

  // ── Analyzing stepper ─────────────────────────────────────
  'fecalScan.analyzing.eyebrow': 'Working',
  'fecalScan.analyzing.aria': 'Scoring the photo',
  'fecalScan.analyzing.step.observe': 'Observing the sample',
  'fecalScan.analyzing.step.retrieve': 'Retrieving chart passages',
  'fecalScan.analyzing.step.match': 'Matching the chart score',

  // ── Result hero ───────────────────────────────────────────
  'fecalScan.result.eyebrow': 'Fecal score',
  /** Eyebrow for the variant where no score is claimed (not a stool photo). */
  'fecalScan.result.noScore': 'No score',
  'fecalScan.result.scoreAria': 'Fecal score {score} out of 5',
  /** {pct} is pre-formatted by `src/i18n/format.ts#formatPercent`. */
  'fecalScan.result.confidence': '{pct} confident',
  'fecalScan.result.confidenceAria': 'Model confidence',
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
  'fecalScan.result.notVisible': "A photo can't show: {items}.",
  'fecalScan.result.caution': 'When to involve the veterinarian',
  'fecalScan.result.notStool':
    "That doesn't look like a stool sample. Try a clear, well-lit photo taken straight down onto a plain background.",

  // ── Bands (from the chart, never from the model) ──────────
  'fecalScan.band.tooHard': 'Too hard',
  'fecalScan.band.tooSoft': 'Too soft',
  'fecalScan.band.acceptable': 'Acceptable',
  'fecalScan.band.optimal': 'Optimal',
  'fecalScan.band.normal': 'Normal',

  // ── Grounding panel (the RAG trail) ───────────────────────
  'fecalScan.grounding.eyebrow': 'Retrieved from knowledge base',
  /** Technical provenance label — the pgvector table the chunks came from. */
  'fecalScan.grounding.source.rag': 'pgvector · knowledge_chunks',
  'fecalScan.grounding.source.bundled': 'bundled chart',
  'fecalScan.grounding.sourceAria': 'Where the passages came from',
  /** Chart reference photos the scorer was shown. Singular form below. */
  'fecalScan.grounding.referencePhotos': 'Compared against {n} chart photos',
  'fecalScan.grounding.referencePhotosOne': 'Compared against 1 chart photo',
  'fecalScan.grounding.passage': 'Passage {n}',
  'fecalScan.grounding.similarity': 'Similarity',
  'fecalScan.grounding.similarityNone': 'Not scored',
  'fecalScan.grounding.scores': 'Scores cited',
  'fecalScan.grounding.expand': 'Read the full passage',
  'fecalScan.grounding.collapse': 'Collapse the passage',
  'fecalScan.grounding.queryLabel': 'Embedded query',
  'fecalScan.grounding.docs': 'Documents searched',
  'fecalScan.grounding.empty': 'No passages were returned for this scan.',
  'fecalScan.grounding.idle':
    'Scan a photo and the chart passages the score was grounded in appear here.',

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
