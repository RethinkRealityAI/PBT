import { useCallback, useRef, useState } from 'react';
import { Glass } from '../../design-system/Glass';
import { Icon } from '../../design-system/Icon';
import { PillButton } from '../../design-system/PillButton';
import { RADII } from '../../design-system/tokens';
import { useTheme } from '../../app/providers/ThemeProvider';
import { useT } from '../../i18n/useT';
import { CameraCapture, isCameraSupported } from './CameraCapture';
import { Eyebrow } from './fecalUi';

export interface CaptureCardProps {
  previewUrl: string | null;
  busy: boolean;
  onPick: (file: File) => void;
}

/**
 * Photo capture, camera-first.
 *
 * The primary path is the in-app camera (this is used beside the animal, on a
 * phone); upload is the secondary path and also carries drag-and-drop for
 * desktop. The upload input deliberately carries NO `capture` attribute —
 * with it, iOS forces the camera for "upload" too, which makes choosing an
 * existing photo impossible.
 */
export function CaptureCard({ previewUrl, busy, onPick }: CaptureCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(isCameraSupported);
  const { resolvedTheme } = useTheme();
  const t = useT();
  const dark = resolvedTheme === 'dark';

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

  return (
    <Glass radius={RADII.lg} padding={18} glow={null} style={{ marginBottom: 14 }}>
      <Eyebrow style={{ marginBottom: 10 }}>{t('fecalScan.capture.eyebrow')}</Eyebrow>

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
      ) : (
        <>
          <div
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
              width: '100%',
              minHeight: previewUrl ? undefined : 168,
              padding: previewUrl ? 0 : '22px 18px',
              borderRadius: RADII.md,
              border: `1.5px dashed color-mix(in oklab, var(--pbt-driver-primary) ${dragging ? 85 : 45}%, rgba(255,255,255,0.4))`,
              background: dragging
                ? 'color-mix(in oklab, var(--pbt-driver-primary) 10%, transparent)'
                : dark
                  ? 'rgba(255,255,255,0.05)'
                  : 'rgba(255,255,255,0.18)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              overflow: 'hidden',
              color: 'var(--pbt-text)',
              transition: 'border-color 0.2s ease, background 0.2s ease',
            }}
          >
            {previewUrl ? (
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
            ) : (
              <>
                <span
                  aria-hidden
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--pbt-driver-primary)',
                    background:
                      'color-mix(in oklab, var(--pbt-driver-primary) 14%, transparent)',
                    border:
                      '1px solid color-mix(in oklab, var(--pbt-driver-primary) 28%, transparent)',
                  }}
                >
                  <Icon.scan style={{ width: 22, height: 22 }} />
                </span>
                <span style={{ fontSize: 14.5, fontWeight: 600 }}>
                  {dragging
                    ? t('fecalScan.capture.dropActive')
                    : t('fecalScan.capture.title')}
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
                <span
                  style={{
                    fontFamily: 'var(--pbt-font-mono)',
                    fontSize: 9.5,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--pbt-text-muted)',
                    opacity: 0.8,
                    textAlign: 'center',
                  }}
                >
                  {t('fecalScan.capture.hint')}
                </span>
              </>
            )}
          </div>

          <div
            className="flex flex-wrap items-center gap-2"
            style={{ marginTop: 12 }}
          >
            {cameraSupported && (
              <PillButton
                onClick={() => setCameraOpen(true)}
                disabled={busy}
                icon={<Icon.camera style={{ width: 17, height: 17 }} />}
              >
                {previewUrl
                  ? t('fecalScan.capture.retake')
                  : t('fecalScan.capture.takePhoto')}
              </PillButton>
            )}
            <PillButton variant="glass" onClick={openUpload} disabled={busy}>
              {previewUrl
                ? t('fecalScan.capture.replace')
                : t('fecalScan.capture.uploadPhoto')}
            </PillButton>
          </div>
        </>
      )}
    </Glass>
  );
}
