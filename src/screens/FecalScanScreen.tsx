import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Glass } from '../design-system/Glass';
import { Icon } from '../design-system/Icon';
import { PillButton } from '../design-system/PillButton';
import { Segmented } from '../design-system/Segmented';
import { COLORS, RADII } from '../design-system/tokens';
import { TopBar } from '../shell/TopBar';
import { Page } from '../shell/Page';
import { useTheme } from '../app/providers/ThemeProvider';
import { useT } from '../i18n/useT';
import { useFecalScan } from '../features/fecal-scan/useFecalScan';
import { CaptureCard } from '../features/fecal-scan/CaptureCard';
import { ChartSheet } from '../features/fecal-scan/ChartSheet';
import { GroundingPanel } from '../features/fecal-scan/GroundingPanel';
import { ResultCard } from '../features/fecal-scan/ResultCard';
import { ScanProgress } from '../features/fecal-scan/ScanProgress';
import { Eyebrow, tinted } from '../features/fecal-scan/fecalUi';
import type {
  FecalBreedSize,
  FecalSpecies,
} from '../shared/ai/fecalScan';

/**
 * Fecal Scan — photograph a stool sample, get the matching Royal Canin chart
 * score, and see exactly which chart passages the answer was grounded in.
 *
 * Two jobs, in this order:
 *   1. be genuinely useful at the exam table (chart picker → camera → score,
 *      with the printed chart one tap away for the owner conversation);
 *   2. make the retrieval loop VISIBLE — the grounding panel is not a debug
 *      view, it is the argument that the number can be trusted.
 *
 * Layout: one rail on mobile (header → picker → capture → result → grounding
 * → chart), a two-column grid from `lg` with the working surfaces on the left
 * and the evidence on the right.
 */
export function FecalScanScreen() {
  const scan = useFecalScan();
  const { resolvedTheme } = useTheme();
  const t = useT();
  const reduce = useReducedMotion();
  const [chartOpen, setChartOpen] = useState(false);
  const dark = resolvedTheme === 'dark';

  const { status, result, retrieval, previewUrl, error, species, breedSize } = scan;
  const busy = status === 'analyzing';

  const speciesOptions: { value: FecalSpecies; label: string }[] = [
    { value: 'dog', label: t('fecalScan.species.dog') },
    { value: 'puppy', label: t('fecalScan.species.puppy') },
    { value: 'cat', label: t('fecalScan.species.cat') },
  ];

  const breedSizeOptions: { value: FecalBreedSize; label: string }[] = [
    { value: 'small-medium', label: t('fecalScan.breedSize.smallMedium') },
    { value: 'large-giant', label: t('fecalScan.breedSize.largeGiant') },
  ];

  return (
    <>
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
              margin: '0 0 12px',
              fontSize: 13.5,
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
              gap: 7,
              padding: '6px 13px',
              borderRadius: 9999,
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text)',
              ...tinted(COLORS.score.ok, dark),
            }}
          >
            <Icon.info style={{ width: 13, height: 13 }} aria-hidden />
            {t('fecalScan.notDiagnosis')}
          </span>
        </header>

        <div className="lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
          {/* ── Left column: pick a chart, take a photo, read the score ── */}
          <div>
            {/* ── 2. Chart picker ── */}
            <Glass radius={RADII.lg} padding={18} glow={null} style={{ marginBottom: 14 }}>
              <Eyebrow style={{ marginBottom: 10 }}>{t('fecalScan.chart.label')}</Eyebrow>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Segmented
                  options={speciesOptions}
                  value={species}
                  onChange={scan.setSpecies}
                  ariaLabel={t('fecalScan.chart.aria')}
                />
              </div>

              {species === 'puppy' && (
                <motion.div
                  initial={reduce ? false : { opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ paddingTop: 14 }}>
                    <Eyebrow style={{ marginBottom: 8 }}>
                      {t('fecalScan.breedSize.label')}
                    </Eyebrow>
                    <Segmented
                      options={breedSizeOptions}
                      value={breedSize}
                      onChange={scan.setBreedSize}
                      ariaLabel={t('fecalScan.breedSize.aria')}
                    />
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: 11.5,
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
            <CaptureCard previewUrl={previewUrl} busy={busy} onPick={scan.analyzeFile} />

            {/* ── 4. Analyzing ── */}
            {busy && <ScanProgress />}

            {/* ── 5. Result ── */}
            {status === 'done' && result && (
              <ResultCard result={result} species={species} previewUrl={previewUrl} />
            )}

            {/* Error state */}
            {status === 'error' && error && (
              <Glass radius={RADII.lg} padding={16} glow={null} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    padding: '11px 13px',
                    borderRadius: RADII.sm,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: 'var(--pbt-text)',
                    marginBottom: 12,
                    ...tinted(COLORS.score.poor, dark),
                  }}
                >
                  {error}
                </div>
                <PillButton variant="glass" onClick={scan.reset}>
                  {t('fecalScan.footer.tryAgain')}
                </PillButton>
              </Glass>
            )}

            {/* ── 8. Footer ── */}
            <div style={{ marginBottom: 14 }}>
              <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 12 }}>
                <PillButton
                  variant="glass"
                  onClick={() => setChartOpen((v) => !v)}
                  icon={<Icon.book style={{ width: 17, height: 17 }} />}
                >
                  {chartOpen
                    ? t('fecalScan.chartSheet.close')
                    : t('fecalScan.chartSheet.open')}
                </PillButton>
                {(status === 'done' || status === 'error') && (
                  <PillButton variant="ghost" onClick={scan.reset}>
                    {t('fecalScan.footer.scanAnother')}
                  </PillButton>
                )}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  lineHeight: 1.6,
                  color: 'var(--pbt-text-muted)',
                }}
              >
                {t('fecalScan.footer.disclaimer')}
              </p>
            </div>
          </div>

          {/* ── Right column: the evidence ── */}
          <div>
            {/* ── 6. Grounding panel ── */}
            <GroundingPanel retrieval={status === 'done' ? retrieval : null} />

            {/* ── 7. Full chart sheet ── */}
            {chartOpen && (
              <ChartSheet
                species={species}
                breedSize={breedSize}
                onClose={() => setChartOpen(false)}
              />
            )}
          </div>
        </div>
      </Page>
    </>
  );
}
