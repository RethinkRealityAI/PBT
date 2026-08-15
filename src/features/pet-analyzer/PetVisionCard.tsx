import { useRef } from 'react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { COLORS } from '../../design-system/tokens';
import { useTheme } from '../../app/providers/ThemeProvider';
import { useLanguage } from '../../app/providers/LanguageProvider';
import { formatPercent } from '../../i18n/format';
import type { CatalogKey } from '../../i18n/catalog';
import type {
  DermatitisSeverity,
  PetVisionResult,
} from '../../services/petVisionService';
import type { UsePetVision } from './usePetVision';

/**
 * Dermatitis severity → catalog key. The enum values themselves are machine
 * values sent to / returned by the model and are never translated.
 */
export const DERM_SEVERITY_KEY: Record<DermatitisSeverity, CatalogKey> = {
  none: 'analyzer.vision.severity.none',
  mild: 'analyzer.vision.severity.mild',
  moderate: 'analyzer.vision.severity.moderate',
  marked: 'analyzer.vision.severity.marked',
};

/**
 * Colour-tinted info chip surface. In light mode the accent is blended into
 * white (pale pastel under dark ink). In dark mode it's blended into a near-
 * transparent dark base so the chip stays dark enough for near-white
 * `--pbt-text` to read — otherwise the pastel + light text blend together.
 */
function tintedChip(color: string, dark: boolean): React.CSSProperties {
  return {
    background: dark
      ? `color-mix(in oklab, ${color} 20%, rgba(255,255,255,0.04))`
      : `color-mix(in oklab, ${color} 12%, rgba(255,255,255,0.4))`,
    border: `1px solid color-mix(in oklab, ${color} ${dark ? 38 : 30}%, transparent)`,
  };
}

/** Eyebrow label — mirrors PetAnalyzerScreen's local Eyebrow. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--pbt-text-muted)',
        marginBottom: 8,
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

const DERM_COLOR: Record<string, string> = {
  none: COLORS.score.good,
  mild: COLORS.score.ok,
  moderate: COLORS.score.poor,
  marked: COLORS.score.poor,
};

/**
 * Pet Vision capture + findings card.
 *
 * Presentational: the parent owns `usePetVision` and decides what to do with a
 * result (apply to the editable fields, offer the scenario handoff, etc.).
 */
export function PetVisionCard({
  vision,
  onPick,
}: {
  vision: UsePetVision;
  /** Fired when the user chooses a file; parent kicks off analysis. */
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { status, result, previewUrl, error } = vision;
  const { resolvedTheme } = useTheme();
  const { t } = useLanguage();
  const dark = resolvedTheme === 'dark';

  return (
    <Glass radius={22} padding={18} style={{ marginBottom: 14 }} glow={null}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
        <Eyebrow>{t('analyzer.vision.eyebrow')}</Eyebrow>
        <span
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            opacity: 0.8,
          }}
        >
          {t('analyzer.vision.estimateTag')}
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          // Reset so re-picking the same file fires onChange again.
          e.target.value = '';
        }}
      />

      {/* Preview / upload zone */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={status === 'analyzing'}
        style={{
          width: '100%',
          minHeight: previewUrl ? undefined : 132,
          padding: previewUrl ? 0 : 16,
          borderRadius: 16,
          border: `1.5px dashed color-mix(in oklab, var(--pbt-driver-primary) 45%, rgba(255,255,255,0.4))`,
          background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.18)',
          cursor: status === 'analyzing' ? 'wait' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          overflow: 'hidden',
          color: 'var(--pbt-text)',
        }}
        aria-label={
          previewUrl
            ? t('analyzer.vision.replaceAria')
            : t('analyzer.vision.uploadAria')
        }
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={t('analyzer.vision.photoAlt')}
            style={{ width: '100%', maxHeight: 260, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <>
            <Icon.paw />
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {t('analyzer.vision.uploadTitle')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)', textAlign: 'center' }}>
              {t('analyzer.vision.uploadBody')}
            </div>
          </>
        )}
      </button>

      {status === 'analyzing' && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--pbt-driver-primary)',
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: '2px solid color-mix(in oklab, var(--pbt-driver-primary) 60%, transparent)',
              borderTopColor: 'var(--pbt-driver-primary)',
              animation: 'pbtSpin 0.8s linear infinite',
            }}
          />
          {t('analyzer.vision.analyzing')}
        </div>
      )}

      {status === 'error' && error && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            fontSize: 13,
            color: 'var(--pbt-text)',
            ...tintedChip(COLORS.score.poor, dark),
          }}
        >
          {error}{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: 'var(--pbt-driver-primary)',
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {t('analyzer.vision.tryAgain')}
          </button>
        </div>
      )}

      {status === 'done' && result && <VisionFindings result={result} />}
    </Glass>
  );
}

function VisionFindings({ result }: { result: PetVisionResult }) {
  const { resolvedTheme } = useTheme();
  const { t, locale } = useLanguage();
  const dark = resolvedTheme === 'dark';
  if (!result.isDog) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: '10px 12px',
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--pbt-text)',
          ...tintedChip(COLORS.score.ok, dark),
        }}
      >
        {t('analyzer.vision.notADog')}
      </div>
    );
  }

  const dermColor = DERM_COLOR[result.dermatitis.severity] ?? COLORS.score.ok;
  const confPct = Math.round(result.breedConfidence * 100);

  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Breed + age */}
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--pbt-text)' }}>
            {result.breed}
          </div>
          <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)' }}>
            {result.ageEstimate}
          </div>
        </div>
        <span
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 10,
            letterSpacing: '0.08em',
            color: 'var(--pbt-text-muted)',
          }}
        >
          {t('analyzer.vision.confidence', {
            pct: formatPercent(confPct, locale),
          })}
        </span>
      </div>

      {result.alternativeBreeds.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--pbt-text-muted)' }}>
          {t('analyzer.vision.alsoPossible', {
            breeds: result.alternativeBreeds.join(', '),
          })}
        </div>
      )}

      {/* BCS rationale */}
      {result.bcsRationale && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--pbt-text)' }}>
          <strong>{t('analyzer.vision.bcsLead', { score: result.bcs })}</strong>{' '}
          {result.bcsRationale}
        </div>
      )}

      {/* Dermatitis */}
      <div
        style={{
          padding: '10px 12px',
          borderRadius: 12,
          ...tintedChip(dermColor, dark),
        }}
      >
        <div
          style={{
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--pbt-text-muted)',
            marginBottom: 4,
          }}
        >
          {t('analyzer.vision.skinLabel', {
            severity: t(
              DERM_SEVERITY_KEY[result.dermatitis.severity] ??
                DERM_SEVERITY_KEY.none,
            ),
          })}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--pbt-text)' }}>
          {result.dermatitis.severity === 'none'
            ? t('analyzer.vision.skinNone')
            : (result.dermatitis.indicators.join('; ') || result.dermatitis.note)}
        </div>
      </div>

      {/* Guidance */}
      {result.guidance && (
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--pbt-text-muted)', fontStyle: 'italic' }}>
          {result.guidance}
        </div>
      )}

      {result.notVisible.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--pbt-text-muted)' }}>
          {t('analyzer.vision.notVisible', {
            items: result.notVisible.join(', '),
          })}
        </div>
      )}
    </div>
  );
}
