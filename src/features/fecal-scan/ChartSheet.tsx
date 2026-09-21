import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { COLORS, RADII } from '../../design-system/tokens';
import { useTheme } from '../../app/providers/ThemeProvider';
import { useLanguage } from '../../app/providers/LanguageProvider';
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
import { BAND_COLOR, BAND_KEY, Eyebrow, tinted } from './fecalUi';

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
  const { resolvedTheme } = useTheme();
  const { t, locale } = useLanguage();
  const dark = resolvedTheme === 'dark';
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
          <Eyebrow style={{ marginBottom: 6 }}>
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
            width: 32,
            height: 32,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--pbt-text)',
            background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.38)',
            border: '1px solid var(--pbt-glass-border)',
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
          ...tinted(COLORS.score.ok, dark),
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
          const bandColor = BAND_COLOR[band];
          return (
            <li
              key={entry.score}
              style={{
                display: 'flex',
                gap: 12,
                padding: '12px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--pbt-glass-border)',
              }}
            >
              <img
                src={entry.imagePath}
                alt={t('fecalScan.chartSheet.imageAlt', { score: entry.score })}
                loading="lazy"
                style={{
                  width: 66,
                  height: 66,
                  flexShrink: 0,
                  borderRadius: RADII.sm,
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 5 }}>
                  <span
                    aria-label={t('fecalScan.chartSheet.scoreAria', { score: entry.score })}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 30,
                      height: 22,
                      padding: '0 8px',
                      borderRadius: 8,
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      color: '#fff',
                      background: bandColor,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {entry.score}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '3px 9px',
                      borderRadius: 9999,
                      fontFamily: 'var(--pbt-font-mono)',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.13em',
                      textTransform: 'uppercase',
                      color: 'var(--pbt-text)',
                      ...tinted(bandColor, dark),
                    }}
                  >
                    {t(BAND_KEY[band])}
                  </span>
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
          borderTop: '1px solid var(--pbt-glass-border)',
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
