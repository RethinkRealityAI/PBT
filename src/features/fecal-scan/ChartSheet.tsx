import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { RADII } from '../../design-system/tokens';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { formatScore } from '../../i18n/format';
import {
  FECAL_CHARTS,
  fecalBandFor,
  fecalChartCitation,
} from '../../data/knowledge/fecalCharts';
import {
  localizedFecalChartMeta,
  localizedFecalEntry,
} from '../../i18n/dataL10n/fecalCharts';
import type {
  FecalBreedSize,
  FecalSpecies,
} from '../../shared/ai/fecalScan';
import { BAND_KEY, BandChip, Eyebrow, subtleSurface } from './fecalUi';

export interface ChartSheetProps {
  species: FecalSpecies;
  breedSize: FecalBreedSize;
  onClose: () => void;
}

/**
 * The full Royal Canin chart for the selected species — every score with its
 * reference photo, band, heading and description.
 *
 * Usable before a scan: during an owner conversation the technician can open
 * it and point at a row, which is the whole reason the charts are printed in
 * the first place.
 */
export function ChartSheet({ species, breedSize, onClose }: ChartSheetProps) {
  const { t, locale } = useLanguage();
  const chart = FECAL_CHARTS[species];
  const meta = localizedFecalChartMeta(locale, species);

  return (
    <Glass
      radius={RADII.lg}
      padding={18}
      glow={null}
      role="region"
      ariaLabel={t('fecalScan.chartSheet.eyebrow')}
      style={{ marginBottom: 14 }}
    >
      <div className="flex items-start justify-between gap-3" style={{ marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow accent as="h2" style={{ marginBottom: 8 }}>
            {t('fecalScan.chartSheet.eyebrow')}
          </Eyebrow>
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '-0.015em',
              color: 'var(--pbt-text)',
              lineHeight: 1.3,
            }}
          >
            {meta.title}
          </div>
          {meta.subtitle && (
            <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)', marginTop: 2 }}>
              {meta.subtitle}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('fecalScan.chartSheet.close')}
          style={{
            flexShrink: 0,
            width: 44,
            height: 44,
            marginTop: -6,
            marginRight: -6,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--pbt-text)',
            ...subtleSurface,
          }}
        >
          <Icon.close style={{ width: 15, height: 15 }} />
        </button>
      </div>

      {/* Directions for use — verbatim from the chart. */}
      <div
        style={{
          padding: '10px 12px',
          borderRadius: RADII.sm,
          marginBottom: 12,
          ...subtleSurface,
        }}
      >
        <Eyebrow style={{ marginBottom: 4 }}>
          {t('fecalScan.chartSheet.directions')}
        </Eyebrow>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--pbt-text)' }}>
          {meta.directions}
        </div>
      </div>

      <ol
        className="pbt-scroll"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          maxHeight: 460,
          overflowY: 'auto',
        }}
      >
        {chart.entries.map((entry, i) => {
          const text = localizedFecalEntry(locale, species, entry);
          const band = fecalBandFor(species, entry.score, breedSize);
          return (
            <li
              key={entry.score}
              style={{
                display: 'flex',
                gap: 12,
                padding: '12px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--fecal-hairline)',
              }}
            >
              <img
                src={entry.imagePath}
                alt={t('fecalScan.chartSheet.imageAlt', { score: formatScore(entry.score, locale) })}
                loading="lazy"
                style={{
                  width: 66,
                  height: 66,
                  flexShrink: 0,
                  borderRadius: RADII.sm,
                  objectFit: 'cover',
                  display: 'block',
                  ...subtleSurface,
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 5 }}>
                  <span
                    aria-label={t('fecalScan.chartSheet.scoreAria', { score: formatScore(entry.score, locale) })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 30,
                      height: 22,
                      padding: '0 8px',
                      borderRadius: 8,
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 12,
                      fontWeight: 700,
                      color: 'var(--pbt-text)',
                      fontVariantNumeric: 'tabular-nums',
                      ...subtleSurface,
                    }}
                  >
                    {formatScore(entry.score, locale)}
                  </span>
                  <BandChip band={band} label={t(BAND_KEY[band])} size="sm" />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    lineHeight: 1.45,
                    color: 'var(--pbt-text)',
                  }}
                >
                  {text.label}
                </div>
                {text.description && (
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: 'var(--pbt-text-muted)',
                    }}
                  >
                    {text.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid var(--fecal-hairline)',
          fontFamily: 'var(--pbt-font-mono)',
          fontSize: 9,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--pbt-text-muted)',
          lineHeight: 1.5,
        }}
      >
        {fecalChartCitation(species)}
      </div>
    </Glass>
  );
}
