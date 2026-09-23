import type { CSSProperties, ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { PillButton } from '../../design-system/PillButton';
import { RADII } from '../../design-system/tokens';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { formatScore } from '../../i18n/format';
import { localizedFecalEntry } from '../../i18n/dataL10n/fecalCharts';
import type { CatalogKey } from '../../i18n/catalog';
import { fecalChartEntry } from '../../data/knowledge/fecalCharts';
import type { FecalScanResult, FecalSpecies } from '../../shared/ai/fecalScan';
import {
  BAND_KEY,
  BAND_MEANING_KEY,
  BandChip,
  Eyebrow,
  LevelMeter,
  confidenceLevel,
  subtleSurface,
  type Level,
} from './fecalUi';

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

const CONFIDENCE_KEY: Record<Level, CatalogKey> = {
  3: 'fecalScan.result.confidence.high',
  2: 'fecalScan.result.confidence.moderate',
  1: 'fecalScan.result.confidence.low',
};

const SPECIES_KEY: Record<FecalSpecies, CatalogKey> = {
  dog: 'fecalScan.species.dog',
  puppy: 'fecalScan.species.puppy',
  cat: 'fecalScan.species.cat',
};

export interface ResultCardProps {
  result: FecalScanResult;
  species: FecalSpecies;
  previewUrl: string | null;
  /** Clears this result and returns to capture. */
  onScanAnother?: () => void;
}

/**
 * The scored result, built to be read in one glance at the exam table:
 *
 *   score · band · what the band means · how sure the AI is
 *
 * then the photo beside the chart's own reference photo, then — quieter — the
 * reasoning a technician needs to disagree with it out loud: the chart's
 * wording, the observations, the runner-up scores, and what a photo simply
 * cannot show.
 *
 * Colour: the band is a small semantic dot on a neutral chip (the label
 * carries the meaning); everything else accents in the user's ECHO driver
 * colour. Confidence is a coarse three-step estimate, never "86%": the number
 * is the model's self-assessment, not a measured accuracy.
 */
export function ResultCard({ result, species, previewUrl, onScanAnother }: ResultCardProps) {
  const { t, locale } = useLanguage();
  const reduce = useReducedMotion();

  const enter = {
    initial: reduce ? false : ({ opacity: 0, y: 10 } as const),
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: 'easeOut' as const },
  };

  if (!result.isStool) {
    return (
      <motion.div {...enter}>
        <Glass radius={RADII.lg} padding={18} glow={null} style={{ marginBottom: 14 }}>
          <Eyebrow accent as="h2" style={{ marginBottom: 12 }}>
            {t('fecalScan.result.noScore')}
          </Eyebrow>
          <Note icon={<Icon.info style={iconStyle} aria-hidden />}>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--pbt-text)' }}>
              {t('fecalScan.result.notStool')}
            </div>
          </Note>
          {onScanAnother && (
            <PillButton
              fullWidth
              onClick={onScanAnother}
              icon={<Icon.camera style={{ width: 17, height: 17 }} />}
              style={{ marginTop: 14 }}
            >
              {t('fecalScan.footer.tryAnotherPhoto')}
            </PillButton>
          )}
        </Glass>
      </motion.div>
    );
  }

  const entry = fecalChartEntry(species, result.score);
  const chartText = entry
    ? localizedFecalEntry(locale, species, entry)
    : { label: '', description: '' };
  const level = confidenceLevel(result.confidence);

  return (
    <motion.div {...enter}>
      <Glass
        radius={RADII.hero}
        padding={20}
        glow="var(--pbt-driver-primary)"
        style={{ marginBottom: 14 }}
      >
        <div
          className="flex items-center justify-between gap-3"
          style={{ marginBottom: 14 }}
        >
          <Eyebrow accent as="h2">
            {t('fecalScan.result.eyebrow')}
          </Eyebrow>
          <Eyebrow as="span" style={{ fontSize: 9.5, letterSpacing: '0.14em', textAlign: 'right' }}>
            {t(SPECIES_KEY[species] ?? 'fecalScan.species.dog')}
          </Eyebrow>
        </div>

        {/* ── Hero: the one-glance answer ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            role="img"
            aria-label={t('fecalScan.result.scoreAria', { score: formatScore(result.score, locale) })}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              flexShrink: 0,
              color: 'var(--pbt-text)',
            }}
          >
            <span
              data-testid="fecal-score"
              style={{
                fontSize: 68,
                lineHeight: 0.9,
                fontWeight: 400,
                letterSpacing: '-0.04em',
                color: 'var(--pbt-text)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatScore(result.score, locale)}
            </span>
            {/* Numeric scale suffix, not prose — every chart runs 1–5. */}
            <span
              aria-hidden
              style={{
                marginLeft: 4,
                fontSize: 18,
                fontWeight: 400,
                color: 'var(--pbt-text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              /5
            </span>
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <BandChip
              band={result.band}
              label={t(BAND_KEY[result.band] ?? 'fecalScan.band.acceptable')}
            />
            <div
              style={{
                marginTop: 8,
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.35,
                letterSpacing: '-0.01em',
                color: 'var(--pbt-text)',
              }}
            >
              {t(BAND_MEANING_KEY[result.band] ?? 'fecalScan.band.meaning.acceptable')}
            </div>
            <div
              style={{
                marginTop: 9,
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '4px 8px',
              }}
            >
              <LevelMeter level={level} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--pbt-text)' }}>
                {t(CONFIDENCE_KEY[level])}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--pbt-text-muted)' }}>
                {t('fecalScan.result.confidence.qualifier')}
              </span>
            </div>
          </div>
        </div>

        {/* ── Photo ↔ chart reference ── */}
        <div
          style={{
            marginTop: 20,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
          }}
        >
          <Pane label={t('fecalScan.result.yourPhoto')}>
            {previewUrl ? (
              <img src={previewUrl} alt={t('fecalScan.capture.photoAlt')} style={squareImage} />
            ) : (
              <div style={squareImage} />
            )}
          </Pane>
          <Pane label={t('fecalScan.result.chartReference', { score: formatScore(result.score, locale) })}>
            {entry ? (
              <img
                src={entry.imagePath}
                alt={t('fecalScan.chartSheet.imageAlt', { score: formatScore(result.score, locale) })}
                style={squareImage}
              />
            ) : (
              <div style={squareImage} />
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
                  margin: '5px 0 0',
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

        {/* ── Rationale ── */}
        {result.rationale && (
          <Section label={t('fecalScan.result.rationale')}>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--pbt-text)' }}>
              {result.rationale}
            </p>
          </Section>
        )}

        {/* ── Observations ── */}
        <Section label={t('fecalScan.result.observations')}>
          <dl style={{ margin: 0, display: 'grid', gap: 0 }}>
            {OBSERVATION_ROWS.map(({ key, label }, i) => (
              <div
                key={key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(84px, 28%) 1fr',
                  gap: 10,
                  padding: '8px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--fecal-hairline)',
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
                <dd style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--pbt-text)' }}>
                  {result.observations[key]}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* ── Alternates ── */}
        {result.alternates.length > 0 && (
          <Section label={t('fecalScan.result.alternates')}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {result.alternates.slice(0, 2).map((alt) => {
                const altEntry = fecalChartEntry(species, alt.score);
                return (
                  <div
                    key={alt.score}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 9,
                      padding: 5,
                      paddingRight: 12,
                      borderRadius: RADII.sm,
                      ...subtleSurface,
                    }}
                  >
                    {altEntry && (
                      <img
                        src={altEntry.imagePath}
                        alt={t('fecalScan.chartSheet.imageAlt', { score: formatScore(alt.score, locale) })}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 9,
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontFamily: 'var(--pbt-font-mono)',
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: 'var(--pbt-text)',
                      }}
                    >
                      {t('fecalScan.chartSheet.scoreAria', { score: formatScore(alt.score, locale) })}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── What a photo can't show ── */}
        {result.notVisible.length > 0 && (
          <Section label={t('fecalScan.result.notVisibleLabel')}>
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {result.notVisible.map((item) => (
                <li
                  key={item}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 9999,
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: 'var(--pbt-text-muted)',
                    ...subtleSurface,
                  }}
                >
                  {item}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── When to involve the veterinarian ── */}
        {result.caution && (
          <div style={{ marginTop: 18 }}>
            <Note icon={<Icon.info style={iconStyle} aria-hidden />}>
              <Eyebrow style={{ marginBottom: 4 }}>{t('fecalScan.result.caution')}</Eyebrow>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--pbt-text)' }}>
                {result.caution}
              </div>
            </Note>
          </div>
        )}

        {onScanAnother && (
          <PillButton
            fullWidth
            onClick={onScanAnother}
            icon={<Icon.camera style={{ width: 17, height: 17 }} />}
            style={{ marginTop: 18 }}
          >
            {t('fecalScan.footer.scanAnother')}
          </PillButton>
        )}
      </Glass>
    </motion.div>
  );
}

const iconStyle: CSSProperties = {
  width: 16,
  height: 16,
  flexShrink: 0,
  color: 'var(--fecal-accent-ink)',
  marginTop: 1,
};

const squareImage: CSSProperties = {
  width: '100%',
  aspectRatio: '1 / 1',
  objectFit: 'cover',
  display: 'block',
  borderRadius: RADII.sm,
  ...subtleSurface,
};

/** Secondary block: hairline above, muted eyebrow, content. */
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 14,
        borderTop: '1px solid var(--fecal-hairline)',
      }}
    >
      <Eyebrow as="h3" style={{ marginBottom: 8 }}>
        {label}
      </Eyebrow>
      {children}
    </div>
  );
}

/** Neutral note with a driver-coloured icon. */
function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        padding: '12px 14px',
        borderRadius: RADII.sm,
        ...subtleSurface,
      }}
    >
      {icon}
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Pane({ label, children }: { label: string; children: ReactNode }) {
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
