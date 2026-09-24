import { useRef } from 'react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { PillButton } from '../../design-system/PillButton';
import { RADII } from '../../design-system/tokens';
import { useT } from '../../i18n/useT';
import { DRIVER_GRADIENT, Eyebrow, subtleSurface } from './fecalUi';

export interface CaptureCardProps {
  /** The last scanned photo, when a result is on screen. */
  previewUrl: string | null;
  cameraSupported: boolean;
  onTakePhoto: () => void;
  /** A photo chosen from the library — the parent opens it in review. */
  onPickFile: (file: File) => void;
  /**
   * A result is on screen. The result card already shows the photo beside
   * the chart reference, so this card folds down to a thumbnail and the
   * "new photo" actions.
   */
  compact?: boolean;
}

const TIP_KEYS = [
  'fecalScan.capture.tip.background',
  'fecalScan.capture.tip.light',
  'fecalScan.capture.tip.fill',
] as const;

/**
 * The entry point to the capture modal.
 *
 * Mobile-first: this is used on a phone beside the animal, so there is no
 * drop zone — one big "Take photo" (the modal opens on the live camera) and
 * a quieter "Choose from library" for a photo already on the phone. Where
 * the browser has no camera API, the library is the primary action.
 *
 * The library input carries NO `capture` attribute — with it, iOS forces the
 * camera and choosing an existing photo becomes impossible.
 */
export function CaptureCard({
  previewUrl,
  cameraSupported,
  onTakePhoto,
  onPickFile,
  compact = false,
}: CaptureCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();
  const openLibrary = () => inputRef.current?.click();

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      style={{ display: 'none' }}
      onChange={(e) => {
        const file = e.target.files?.[0];
        // Reset so re-picking the same file fires onChange again.
        e.target.value = '';
        if (file) onPickFile(file);
      }}
    />
  );

  if (compact && previewUrl) {
    return (
      <Glass radius={RADII.lg} padding={14} glow={null} style={{ marginBottom: 14 }}>
        {input}
        <div className="flex items-center" style={{ gap: 12 }}>
          <img
            src={previewUrl}
            alt={t('fecalScan.capture.photoAlt')}
            style={{
              width: 56,
              height: 56,
              flexShrink: 0,
              borderRadius: RADII.sm,
              objectFit: 'cover',
              display: 'block',
              ...subtleSurface,
            }}
          />
          <div className="flex flex-1 flex-wrap items-center" style={{ gap: 8, minWidth: 0 }}>
            {cameraSupported && (
              <PillButton
                onClick={onTakePhoto}
                icon={<Icon.camera style={{ width: 17, height: 17 }} />}
                style={{ flex: '1 1 auto' }}
              >
                {t('fecalScan.capture.newPhoto')}
              </PillButton>
            )}
            <PillButton
              variant="glass"
              onClick={openLibrary}
              icon={<Icon.image style={{ width: 17, height: 17 }} />}
              style={{ flex: '1 1 auto', color: 'var(--pbt-text)' }}
            >
              {t('fecalScan.capture.library')}
            </PillButton>
          </div>
        </div>
      </Glass>
    );
  }

  return (
    <Glass radius={RADII.lg} padding={18} glow={null} style={{ marginBottom: 14 }}>
      {input}
      <Eyebrow accent as="h2" style={{ marginBottom: 14 }}>
        {t('fecalScan.capture.eyebrow')}
      </Eyebrow>

      <div className="flex items-start" style={{ gap: 14, marginBottom: 14 }}>
        <span
          aria-hidden
          style={{
            width: 52,
            height: 52,
            flexShrink: 0,
            borderRadius: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            background: DRIVER_GRADIENT,
            boxShadow:
              '0 8px 18px -8px color-mix(in oklab, var(--pbt-driver-primary) 70%, transparent)',
          }}
        >
          <Icon.scan style={{ width: 25, height: 25 }} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 17,
              fontWeight: 600,
              letterSpacing: '-0.015em',
              lineHeight: 1.3,
              color: 'var(--pbt-text)',
            }}
          >
            {t('fecalScan.capture.title')}
          </div>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 13,
              lineHeight: 1.55,
              color: 'var(--pbt-text-muted)',
            }}
          >
            {t('fecalScan.capture.body')}
          </p>
        </div>
      </div>

      <ul
        className="flex flex-wrap"
        style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, gap: 6 }}
      >
        {TIP_KEYS.map((key) => (
          <li
            key={key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 11px 6px 8px',
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 500,
              color: 'var(--pbt-text)',
              ...subtleSurface,
            }}
          >
            <Icon.check
              aria-hidden
              style={{ width: 13, height: 13, color: 'var(--fecal-accent-ink)' }}
            />
            {t(key)}
          </li>
        ))}
      </ul>

      {cameraSupported ? (
        <>
          <PillButton
            size="lg"
            fullWidth
            onClick={onTakePhoto}
            icon={<Icon.camera style={{ width: 19, height: 19 }} />}
          >
            {t('fecalScan.capture.takePhoto')}
          </PillButton>
          <button
            type="button"
            onClick={openLibrary}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              minHeight: 44,
              marginTop: 6,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--pbt-font-body)',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--pbt-text)',
            }}
          >
            <Icon.image
              aria-hidden
              style={{ width: 17, height: 17, color: 'var(--fecal-accent-ink)' }}
            />
            {t('fecalScan.capture.chooseFromLibrary')}
          </button>
        </>
      ) : (
        <PillButton
          size="lg"
          fullWidth
          onClick={openLibrary}
          icon={<Icon.image style={{ width: 19, height: 19 }} />}
        >
          {t('fecalScan.capture.choosePhoto')}
        </PillButton>
      )}
    </Glass>
  );
}
