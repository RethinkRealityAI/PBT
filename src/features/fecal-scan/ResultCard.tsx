import { motion, useReducedMotion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { COLORS, RADII } from '../../design-system/tokens';
import { useTheme } from '../../app/providers/ThemeProvider';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { formatPercent } from '../../i18n/format';
import { localizedFecalEntry } from '../../i18n/dataL10n/fecalCharts';
import type { CatalogKey } from '../../i18n/catalog';
import { fecalChartEntry } from '../../data/knowledge/fecalCharts';
import type {
  FecalScanResult,
  FecalSpecies,
} from '../../shared/ai/fecalScan';
import { BAND_COLOR, BAND_KEY, Eyebrow, tinted } from './fecalUi';

/**
 * Confidence is how sure the model is, NOT how healthy the stool is: an
 * emphatic 'too soft' reading is a confident one. Colouring it by band made a
 * high-confidence bad result look like a broken meter, so it is always the
 * positive token.
 */
const CONFIDENCE_COLOR = COLORS.score.good;

const OBSERVATION_ROWS: {
  key: keyof FecalScanResult['observations'];
  label: CatalogKey;
}[] = [
  { key: 'form', label: 'fecalScan.result.obs.form' },
  { key: 'moisture', label: 'fecalScan.result.obs.moisture' },
  { key: 'surface', label: 'fecalScan.result.obs.surface' },
  { key: 'residue', label: 'fecalScan.result.obs.residue' },
  { key: 'homogeneity', label: 'fecalScan.result.obs.homogeneity' },
];

export interface ResultCardProps {
  result: FecalScanResult;
  species: FecalSpecies;
  previewUrl: string | null;
}

/**
 * The scored result: the chart match, side by side with the photo it came
 * from. The score numeral is the loudest thing on the screen; everything
 * under it exists to let a technician disagree with it out loud — the chart's
 * own wording, the observations behind it, the runner-up scores, and what a
 * photo simply cannot show.
 */
export function ResultCard({ result, species, previewUrl }: ResultCardProps) {
  const { resolvedTheme } = useTheme();
  const { t, locale } = useLanguage();
  const reduce = useReducedMotion();
  const dark = resolvedTheme === 'dark';

  if (!result.isStool) {
    return (
      <Glass radius={RADII.lg} padding={18} glow={null} style={{ marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: 10 }}>{t('fecalScan.result.noScore')}</Eyebrow>
        <div
          style={{
            padding: '12px 14px',
            borderRadius: RADII.sm,
            fontSize: 13.5,
            lineHeight: 1.55,
            color: 'var(--pbt-text)',
            ...tinted(COLORS.score.ok, dark),
          }}
        >
          {t('fecalScan.result.notStool')}
        </div>
      </Glass>
    );
  }

  const entry = fecalChartEntry(species, result.score);
  const chartText = entry
    ? localizedFecalEntry(locale, species, entry)
    : { label: '', description: '' };
  const bandColor = BAND_COLOR[result.band] ?? COLORS.score.ok;
  const confidencePct = Math.max(0, Math.min(100, Math.round(result.confidence * 100)));

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <Glass
        radius={RADII.hero}
        padding={20}
        glow={CONFIDENCE_COLOR}
        style={{ marginBottom: 14 }}
      >
        <Eyebrow style={{ marginBottom: 14 }}>{t('fecalScan.result.eyebrow')}</Eyebrow>

        {/* ── Hero: numeral + band + confidence ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div
            aria-label={t('fecalScan.result.scoreAria', { score: result.score })}
            style={{
              fontSize: 60,
              lineHeight: 0.92,
              fontWeight: 400,
              letterSpacing: '-0.035em',
              color: 'var(--pbt-text)',
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {result.score}
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingTop: 8 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 12px',
                borderRadius: 9999,
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--pbt-text)',
                ...tinted(bandColor, dark),
              }}
            >
              {t(BAND_KEY[result.band] ?? 'fecalScan.band.acceptable')}
            </span>

            {/* Confidence meter */}
            <div style={{ marginTop: 12 }}>
              <div
                aria-hidden
                style={{
                  height: 4,
                  borderRadius: 9999,
                  overflow: 'hidden',
                  background: `color-mix(in oklab, ${CONFIDENCE_COLOR} 16%, transparent)`,
                }}
              >
                <motion.div
                  style={{
                    height: '100%',
                    borderRadius: 9999,
                    background: CONFIDENCE_COLOR,
                  }}
                  initial={reduce ? false : { width: 0 }}
                  animate={{ width: `${confidencePct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                />
              </div>
              <div
                aria-label={t('fecalScan.result.confidenceAria')}
                style={{
                  marginTop: 6,
                  fontFamily: 'var(--pbt-font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  fontWeight: 700,
                  color: CONFIDENCE_COLOR,
                }}
              >
                {t('fecalScan.result.confidence', {
                  pct: formatPercent(confidencePct, locale),
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Photo ↔ chart reference ── */}
        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          <Pane label={t('fecalScan.result.yourPhoto')}>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt={t('fecalScan.capture.photoAlt')}
                style={squareImage}
              />
            ) : (
              <div style={{ ...squareImage, background: 'rgba(127,127,127,0.12)' }} />
            )}
          </Pane>
          <Pane
            label={t('fecalScan.result.chartReference', { score: result.score })}
          >
            {entry && (
              <img
                src={entry.imagePath}
                alt={t('fecalScan.chartSheet.imageAlt', { score: result.score })}
                style={squareImage}
              />
            )}
          </Pane>
        </div>

        {/* Chart wording, verbatim */}
        {chartText.label && (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                lineHeight: 1.45,
                color: 'var(--pbt-text)',
              }}
            >
              {chartText.label}
            </div>
            {chartText.description && (
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  color: 'var(--pbt-text-muted)',
                }}
              >
                {chartText.description}
              </p>
            )}
          </div>
        )}

        {/* ── Observations ── */}
        <div style={{ marginTop: 18 }}>
          <Eyebrow style={{ marginBottom: 8 }}>
            {t('fecalScan.result.observations')}
          </Eyebrow>
          <dl style={{ margin: 0, display: 'grid', gap: 0 }}>
            {OBSERVATION_ROWS.map(({ key, label }, i) => (
              <div
                key={key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(78px, 26%) 1fr',
                  gap: 10,
                  padding: '7px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--pbt-glass-border)',
                }}
              >
                <dt
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 9.5,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-text-muted)',
                    paddingTop: 2,
                  }}
                >
                  {t(label)}
                </dt>
                <dd
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: 'var(--pbt-text)',
                  }}
                >
                  {result.observations[key]}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── Rationale ── */}
        {result.rationale && (
          <div style={{ marginTop: 16 }}>
            <Eyebrow style={{ marginBottom: 6 }}>
              {t('fecalScan.result.rationale')}
            </Eyebrow>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--pbt-text)',
              }}
            >
              {result.rationale}
            </p>
          </div>
        )}

        {/* ── Alternates ── */}
        {result.alternates.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Eyebrow style={{ marginBottom: 8 }}>
              {t('fecalScan.result.alternates')}
            </Eyebrow>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {result.alternates.slice(0, 2).map((alt) => {
                const altEntry = fecalChartEntry(species, alt.score);
                const altPct = Math.max(0, Math.min(100, Math.round(alt.confidence * 100)));
                return (
                  <div
                    key={alt.score}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: 6,
                      paddingRight: 12,
                      borderRadius: RADII.sm,
                      border: '1px solid var(--pbt-glass-border)',
                      background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {altEntry && (
                      <img
                        src={altEntry.imagePath}
                        alt={t('fecalScan.chartSheet.imageAlt', { score: alt.score })}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    )}
                    <div style={{ lineHeight: 1.25 }}>
                      <div
                        style={{
                          fontFamily: 'var(--pbt-font-mono)',
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--pbt-text)',
                        }}
                      >
                        {t('fecalScan.chartSheet.scoreAria', { score: alt.score })}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--pbt-font-mono)',
                          fontSize: 9.5,
                          letterSpacing: '0.1em',
                          color: 'var(--pbt-text-muted)',
                        }}
                      >
                        {formatPercent(altPct, locale)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Caveats + caution ── */}
        {result.notVisible.length > 0 && (
          <p
            style={{
              margin: '16px 0 0',
              fontSize: 11.5,
              lineHeight: 1.55,
              color: 'var(--pbt-text-muted)',
            }}
          >
            {t('fecalScan.result.notVisible', { items: result.notVisible.join(', ') })}
          </p>
        )}

        {result.caution && (
          <div
            style={{
              marginTop: 14,
              padding: '11px 13px',
              borderRadius: RADII.sm,
              ...tinted(COLORS.score.ok, dark),
            }}
          >
            <Eyebrow style={{ marginBottom: 5 }}>{t('fecalScan.result.caution')}</Eyebrow>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--pbt-text)' }}>
              {result.caution}
            </div>
          </div>
        )}
      </Glass>
    </motion.div>
  );
}

const squareImage: React.CSSProperties = {
  width: '100%',
  aspectRatio: '1 / 1',
  objectFit: 'cover',
  display: 'block',
  borderRadius: RADII.sm,
};

function Pane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--pbt-text-muted)',
          marginBottom: 6,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
