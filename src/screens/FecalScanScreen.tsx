import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { Segmented } from '../design-system/Segmented';
import { RADII } from '../design-system/tokens';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useLanguage } from '../app/providers/LanguageProvider';
import { formatScore } from '../i18n/format';
import { useFecalScan } from '../features/fecal-scan/useFecalScan';
import { CaptureCard } from '../features/fecal-scan/CaptureCard';
import { ChartSheet } from '../features/fecal-scan/ChartSheet';
import { GroundingPanel } from '../features/fecal-scan/GroundingPanel';
import { ResultCard } from '../features/fecal-scan/ResultCard';
import { ScanProgress } from '../features/fecal-scan/ScanProgress';
import {
  BAND_KEY,
  ErrorNote,
  Eyebrow,
  FecalPalette,
  subtleSurface,
} from '../features/fecal-scan/fecalUi';
import type { FecalBreedSize, FecalSpecies } from '../shared/ai/fecalScan';

/** Below Tailwind `lg` the screen is one rail and the result lands off-screen. */
const NARROW_QUERY = '(max-width: 1023px)';

function isNarrow(): boolean {
  try {
    return window.matchMedia?.(NARROW_QUERY)?.matches ?? false;
  } catch {
    return false;
  }
}

/**
 * Fecal Scan — photograph a stool sample, get the matching Royal Canin chart
 * score, and see exactly which chart passages the answer was grounded in.
 *
 * Two jobs, in this order:
 *   1. be genuinely useful at the exam table, one-handed (chart picker →
 *      camera → score, with the printed chart one tap away for the owner
 *      conversation);
 *   2. make the grounding VISIBLE in plain language — where the score came
 *      from is the argument that it can be trusted.
 *
 * Colour: the whole screen (TopBar included) sits inside `FecalPalette`, a
 * scoped neutral text palette — the app's warm ink reads as brown next to
 * stool photos. Accent colour is the user's ECHO driver; band colours appear
 * only as small semantic dots.
 *
 * Layout: one rail on mobile (header → picker → capture → result → grounding
 * → chart), a two-column grid from `lg` with the working surfaces on the left
 * and the evidence on the right.
 */
export function FecalScanScreen() {
  const scan = useFecalScan();
  const { t, locale } = useLanguage();
  const reduce = useReducedMotion();
  const [chartOpen, setChartOpen] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const { status, result, retrieval, previewUrl, error, species, breedSize } = scan;
  const busy = status === 'analyzing';
  const done = status === 'done' && result !== null;
  const scrollBehavior: ScrollBehavior = reduce ? 'auto' : 'smooth';

  // When a result lands, bring it into view on the single-rail layout (it
  // renders below the capture card, usually off-screen on a phone) and move
  // focus to it so keyboard / screen-reader users land on the answer.
  useEffect(() => {
    if (!done) return;
    const el = resultRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (isNarrow()) el.scrollIntoView?.({ behavior: scrollBehavior, block: 'start' });
  }, [done, result, scrollBehavior]);

  useEffect(() => {
    if (!chartOpen) return;
    chartRef.current?.scrollIntoView?.({
      behavior: scrollBehavior,
      block: isNarrow() ? 'start' : 'nearest',
    });
  }, [chartOpen, scrollBehavior]);

  const scanAnother = useCallback(() => {
    scan.reset();
    // After the reset re-render: back to the capture card, focus its first
    // action (Take photo, or Upload where there is no camera).
    requestAnimationFrame(() => {
      const card = captureRef.current;
      if (!card) return;
      card.scrollIntoView?.({ behavior: scrollBehavior, block: 'start' });
      card.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({
        preventScroll: true,
      });
    });
  }, [scan, scrollBehavior]);

  const speciesOptions: { value: FecalSpecies; label: string }[] = [
    { value: 'dog', label: t('fecalScan.species.dog') },
    { value: 'puppy', label: t('fecalScan.species.puppy') },
    { value: 'cat', label: t('fecalScan.species.cat') },
  ];

  const breedSizeOptions: { value: FecalBreedSize; label: string }[] = [
    { value: 'small-medium', label: t('fecalScan.breedSize.smallMedium') },
    { value: 'large-giant', label: t('fecalScan.breedSize.largeGiant') },
  ];

  const announcement = done
    ? result.isStool
      ? t('fecalScan.result.announce', {
          score: formatScore(result.score, locale),
          band: t(BAND_KEY[result.band] ?? 'fecalScan.band.acceptable'),
        })
      : t('fecalScan.result.notStool')
    : '';

  return (
    <FecalPalette>
      <TopBar showBack title={t('fecalScan.title')} />
      <Page>
        {/* ── 1. Header ── */}
        <header style={{ marginBottom: 18, maxWidth: 620 }}>
          <Eyebrow style={{ marginBottom: 10 }}>{t('fecalScan.eyebrow')}</Eyebrow>
          <h1
            style={{
              margin: '0 0 10px',
              fontSize: 36,
              fontWeight: 400,
              letterSpacing: '-0.025em',
              lineHeight: 1.05,
              color: 'var(--pbt-text)',
            }}
            className="lg:text-[42px]"
          >
            {t('fecalScan.headline')}
          </h1>
          <p
            style={{
              margin: '0 0 14px',
              fontSize: 14,
              lineHeight: 1.6,
              color: 'var(--pbt-text-muted)',
            }}
          >
            {t('fecalScan.purpose')}
          </p>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 14px 7px 11px',
              borderRadius: 9999,
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text)',
              ...subtleSurface,
            }}
          >
            <Icon.info
              style={{ width: 14, height: 14, color: 'var(--fecal-accent-ink)' }}
              aria-hidden
            />
            {t('fecalScan.notDiagnosis')}
          </span>
        </header>

        <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
          {/* ── Left column: pick a chart, take a photo, read the score ── */}
          <div>
            {/* ── 2. Chart picker ── */}
            <Glass radius={RADII.lg} padding={18} glow={null} style={{ marginBottom: 14 }}>
              <div
                className="flex flex-wrap items-center justify-between"
                style={{ gap: '4px 12px', marginBottom: 8, marginTop: -8 }}
              >
                <Eyebrow accent as="h2">
                  {t('fecalScan.chart.label')}
                </Eyebrow>
                <button
                  type="button"
                  onClick={() => setChartOpen((v) => !v)}
                  aria-expanded={chartOpen}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    minHeight: 44,
                    marginRight: -4,
                    padding: '0 4px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--pbt-font-body)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--pbt-text)',
                  }}
                >
                  <Icon.book
                    aria-hidden
                    style={{ width: 16, height: 16, color: 'var(--fecal-accent-ink)' }}
                  />
                  {chartOpen ? t('fecalScan.chartSheet.close') : t('fecalScan.chartSheet.open')}
                </button>
              </div>
              <Segmented
                options={speciesOptions}
                value={species}
                onChange={scan.setSpecies}
                ariaLabel={t('fecalScan.chart.aria')}
              />

              {species === 'puppy' && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ paddingTop: 16 }}>
                    <Eyebrow style={{ marginBottom: 8 }}>{t('fecalScan.breedSize.label')}</Eyebrow>
                    <Segmented
                      options={breedSizeOptions}
                      value={breedSize}
                      onChange={scan.setBreedSize}
                      ariaLabel={t('fecalScan.breedSize.aria')}
                    />
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: 12,
                        lineHeight: 1.5,
                        color: 'var(--pbt-text-muted)',
                      }}
                    >
                      {t('fecalScan.breedSize.hint')}
                    </p>
                  </div>
                </motion.div>
              )}
            </Glass>

            {/* ── 3. Capture ── */}
            <div ref={captureRef} style={{ scrollMarginTop: 12 }}>
              <CaptureCard
                previewUrl={previewUrl}
                busy={busy}
                onPick={scan.analyzeFile}
                compact={done}
              />
            </div>

            {/* ── 4. Analyzing ── */}
            {busy && <ScanProgress />}

            {/* Result announcement for assistive tech (the card itself is long). */}
            <div role="status" aria-live="polite" className="sr-only">
              {announcement}
            </div>

            {/* ── 5. Result ── */}
            {done && (
              <div
                ref={resultRef}
                tabIndex={-1}
                aria-label={t('fecalScan.result.eyebrow')}
                role="region"
                style={{ outline: 'none', scrollMarginTop: 12 }}
              >
                <ResultCard
                  result={result}
                  species={species}
                  previewUrl={previewUrl}
                  onScanAnother={scanAnother}
                />
              </div>
            )}

            {/* Error state */}
            {status === 'error' && error && (
              <Glass radius={RADII.lg} padding={16} glow={null} style={{ marginBottom: 14 }}>
                <ErrorNote>{error}</ErrorNote>
                <PillButton
                  variant="glass"
                  onClick={scanAnother}
                  style={{ marginTop: 12, color: 'var(--pbt-text)' }}
                >
                  {t('fecalScan.footer.tryAgain')}
                </PillButton>
              </Glass>
            )}
          </div>

          {/* ── Right column: the evidence ── */}
          <div>
            {/* ── 6. Grounding panel ── */}
            <GroundingPanel
              // No score was claimed for a non-stool photo, so there is
              // nothing to explain — keep the panel in its idle state.
              retrieval={done && result.isStool ? retrieval : null}
              confidence={done && result.isStool ? result.confidence : null}
            />

            {/* ── 7. Full chart sheet ── */}
            {chartOpen && (
              <div ref={chartRef} style={{ scrollMarginTop: 12 }}>
                <ChartSheet
                  species={species}
                  breedSize={breedSize}
                  onClose={() => setChartOpen(false)}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── 8. Footer ── */}
        <p
          style={{
            margin: '4px 0 14px',
            maxWidth: 720,
            fontSize: 11.5,
            lineHeight: 1.6,
            color: 'var(--pbt-text-muted)',
          }}
        >
          {t('fecalScan.footer.disclaimer')}
        </p>
      </Page>
    </FecalPalette>
  );
}
