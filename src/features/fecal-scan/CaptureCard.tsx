import { useCallback, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { PillButton } from '../../design-system/PillButton';
import { RADII } from '../../design-system/tokens';
import { useT } from '../../i18n/useT';
import { CameraCapture, isCameraSupported } from './CameraCapture';
import { Eyebrow, subtleSurface } from './fecalUi';

export interface CaptureCardProps {
  previewUrl: string | null;
  busy: boolean;
  onPick: (file: File) => void;
  /**
   * A result is on screen. The result card already shows the photo beside
   * the chart reference, so the capture card folds down to a thumbnail and
   * the retake actions instead of repeating a 300px preview above it.
   */
  compact?: boolean;
}

/** Secondary pill: the glass variant with the neutral ink of this screen. */
const neutralPill = { color: 'var(--pbt-text)' } as const;

/**
 * Photo capture, camera-first.
 *
 * The primary path is the in-app camera (this is used beside the animal, on a
 * phone); upload is the secondary path and also carries drag-and-drop for
 * desktop. The upload input deliberately carries NO `capture` attribute —
 * with it, iOS forces the camera for "upload" too, which makes choosing an
 * existing photo impossible.
 */
export function CaptureCard({ previewUrl, busy, onPick, compact = false }: CaptureCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(isCameraSupported);
  const t = useT();
  const reduce = useReducedMotion();

  const openUpload = () => {
    if (!busy) inputRef.current?.click();
  };

  const handleCapture = useCallback(
    (file: File) => {
      setCameraOpen(false);
      onPick(file);
    },
    [onPick],
  );

  const handleUnavailable = useCallback(() => {
    setCameraSupported(false);
  }, []);

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {cameraSupported && (
        <PillButton
          onClick={() => setCameraOpen(true)}
          disabled={busy}
          icon={<Icon.camera style={{ width: 17, height: 17 }} />}
          style={{ flex: '1 1 auto' }}
        >
          {previewUrl ? t('fecalScan.capture.retake') : t('fecalScan.capture.takePhoto')}
        </PillButton>
      )}
      <PillButton
        variant="glass"
        onClick={openUpload}
        disabled={busy}
        style={{ ...neutralPill, flex: '1 1 auto' }}
      >
        {previewUrl ? t('fecalScan.capture.replace') : t('fecalScan.capture.uploadPhoto')}
      </PillButton>
    </div>
  );

  const showCompact = compact && previewUrl && !cameraOpen;

  return (
    <Glass radius={RADII.lg} padding={18} glow={null} style={{ marginBottom: 14 }}>
      <Eyebrow accent as="h2" style={{ marginBottom: 12 }}>
        {t('fecalScan.capture.eyebrow')}
      </Eyebrow>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          // Reset so re-picking the same file fires onChange again.
          e.target.value = '';
        }}
      />

      {cameraOpen ? (
        <CameraCapture
          onCapture={handleCapture}
          onCancel={() => setCameraOpen(false)}
          onUnavailable={handleUnavailable}
        />
      ) : showCompact ? (
        <div className="flex flex-wrap items-center gap-3">
          <img
            src={previewUrl}
            alt={t('fecalScan.capture.photoAlt')}
            style={{
              width: 64,
              height: 64,
              flexShrink: 0,
              borderRadius: RADII.sm,
              objectFit: 'cover',
              display: 'block',
              ...subtleSurface,
            }}
          />
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>{actions}</div>
        </div>
      ) : (
        <>
          <div
            onClick={previewUrl ? undefined : openUpload}
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (busy) return;
              const file = e.dataTransfer.files?.[0];
              if (file) onPick(file);
            }}
            style={{
              position: 'relative',
              width: '100%',
              minHeight: previewUrl ? undefined : 176,
              padding: previewUrl ? 0 : '24px 18px',
              borderRadius: RADII.md,
              border: previewUrl
                ? '1px solid var(--fecal-fill-border)'
                : `1.5px dashed color-mix(in oklab, var(--pbt-driver-primary) ${dragging ? 90 : 55}%, transparent)`,
              background: dragging
                ? 'color-mix(in oklab, var(--pbt-driver-primary) 10%, var(--fecal-fill))'
                : 'var(--fecal-fill)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              overflow: 'hidden',
              cursor: previewUrl || busy ? 'default' : 'pointer',
              color: 'var(--pbt-text)',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
          >
            {previewUrl ? (
              <>
                <img
                  src={previewUrl}
                  alt={t('fecalScan.capture.photoAlt')}
                  style={{
                    width: '100%',
                    maxHeight: 300,
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                {/* Scanning sweep while the photo is being scored. */}
                {busy && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      background:
                        'linear-gradient(180deg, transparent, color-mix(in oklab, var(--pbt-driver-primary) 10%, transparent))',
                    }}
                  >
                    {!reduce && (
                      <motion.span
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          height: 3,
                          borderRadius: 9999,
                          background:
                            'linear-gradient(90deg, transparent, var(--pbt-driver-primary), transparent)',
                          boxShadow:
                            '0 0 18px 4px color-mix(in oklab, var(--pbt-driver-primary) 45%, transparent)',
                        }}
                        initial={{ top: '0%' }}
                        animate={{ top: ['4%', '94%', '4%'] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    )}
                  </span>
                )}
              </>
            ) : (
              <>
                <span
                  aria-hidden
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 15,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    background:
                      'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
                    boxShadow:
                      '0 8px 18px -8px color-mix(in oklab, var(--pbt-driver-primary) 70%, transparent)',
                  }}
                >
                  <Icon.scan style={{ width: 23, height: 23 }} />
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>
                  {dragging ? t('fecalScan.capture.dropActive') : t('fecalScan.capture.title')}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: 'var(--pbt-text-muted)',
                    textAlign: 'center',
                    maxWidth: 320,
                  }}
                >
                  {t('fecalScan.capture.body')}
                </span>
              </>
            )}
          </div>

          <div style={{ marginTop: 12 }}>{actions}</div>
        </>
      )}
    </Glass>
  );
}
