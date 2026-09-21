import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../design-system/Icon';
import { COLORS, RADII } from '../../design-system/tokens';
import { useTheme } from '../../app/providers/ThemeProvider';
import { useT } from '../../i18n/useT';
import type { CatalogKey } from '../../i18n/catalog';
import { tinted } from './fecalUi';

/** Longest edge of the captured frame — matches `lib/imagePrep`'s target. */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.9;

export interface CameraCaptureProps {
  /** A fresh JPEG File from the current frame. The camera is already released. */
  onCapture: (file: File) => void;
  onCancel: () => void;
  /**
   * The device has no camera at all (`NotFoundError`, or no `mediaDevices`).
   * The parent hides its camera entry point — a button that can never work is
   * worse than no button.
   */
  onUnavailable?: () => void;
}

/** True when this browser exposes a camera API at all. */
export function isCameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/**
 * In-app camera for the exam table.
 *
 * The tool is used on a phone, beside the animal — a file picker is the
 * fallback, not the main path. The live preview, shutter and flip live inside
 * the same dashed frame the upload zone uses, so the card never jumps.
 *
 * The stream is released on capture, on cancel, on unmount and before every
 * restart: a camera light left on after the user walked away is a bug you
 * only find out about from the client.
 */
export function CameraCapture({
  onCapture,
  onCancel,
  onUnavailable,
}: CameraCaptureProps) {
  const t = useT();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [errorKey, setErrorKey] = useState<CatalogKey | null>(null);
  const [ready, setReady] = useState(false);

  const stopStream = useCallback(() => {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!isCameraSupported()) {
      setErrorKey('fecalScan.camera.unavailable');
      onUnavailable?.();
      return;
    }

    setErrorKey(null);
    setReady(false);

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: MAX_EDGE_PX },
          },
          audio: false,
        });
        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        // Release whatever was running before adopting the new stream (flip).
        stopStream();
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {
            /* autoplay policies — the frame still renders */
          });
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setErrorKey('fecalScan.camera.denied');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setErrorKey('fecalScan.camera.unavailable');
          onUnavailable?.();
        } else {
          setErrorKey('fecalScan.camera.failed');
        }
      }
    })();

    return () => {
      cancelled = true;
      stopStream();
    };
    // `onUnavailable` is a parent callback; re-running on its identity would
    // restart the camera on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, stopStream]);

  const shoot = useCallback(() => {
    const video = videoRef.current;
    const width = video?.videoWidth || 1280;
    const height = video?.videoHeight || 720;
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    try {
      const ctx = canvas.getContext('2d');
      if (ctx && video) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      /* no 2D context (very old WebView) — toBlob still yields a frame-less
         JPEG rather than dropping the user's tap on the floor */
    }

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorKey('fecalScan.camera.failed');
          return;
        }
        const file = new File([blob], `stool-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        });
        stopStream();
        onCapture(file);
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  }, [onCapture, stopStream]);

  const cancel = useCallback(() => {
    stopStream();
    onCancel();
  }, [onCancel, stopStream]);

  if (errorKey) {
    return (
      <div>
        <div
          role="alert"
          style={{
            padding: '11px 13px',
            borderRadius: RADII.sm,
            fontSize: 13,
            lineHeight: 1.55,
            color: 'var(--pbt-text)',
            ...tinted(COLORS.score.ok, dark),
          }}
        >
          {t(errorKey)}
        </div>
        <div style={{ marginTop: 10 }}>
          <GhostButton onClick={cancel}>{t('fecalScan.camera.cancel')}</GhostButton>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          borderRadius: RADII.md,
          overflow: 'hidden',
          background: '#0b0b0f',
          border: `1.5px dashed color-mix(in oklab, var(--pbt-driver-primary) 45%, rgba(255,255,255,0.4))`,
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-label={t('fecalScan.camera.hint')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            // Selfie cameras are mirrored in every other app; matching that
            // makes framing feel right.
            transform: facing === 'user' ? 'scaleX(-1)' : undefined,
            opacity: ready ? 1 : 0.4,
            transition: 'opacity 0.3s ease',
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: 10,
            textAlign: 'center',
            fontFamily: 'var(--pbt-font-mono)',
            fontSize: 9,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.82)',
            textShadow: '0 1px 6px rgba(0,0,0,0.7)',
            pointerEvents: 'none',
          }}
        >
          {t('fecalScan.camera.hint')}
        </span>
      </div>

      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <GhostButton onClick={cancel}>{t('fecalScan.camera.cancel')}</GhostButton>

        {/* Shutter — the one thing a thumb should be able to hit blind. */}
        <button
          type="button"
          onClick={shoot}
          aria-label={t('fecalScan.camera.shutterAria')}
          style={{
            width: 56,
            height: 56,
            flexShrink: 0,
            borderRadius: '50%',
            border: '3px solid rgba(255,255,255,0.9)',
            cursor: 'pointer',
            background:
              'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
            boxShadow:
              '0 6px 18px -6px color-mix(in oklab, var(--pbt-driver-primary) 60%, transparent), 0 1px 0 rgba(255,255,255,0.4) inset',
          }}
        />

        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          aria-label={t('fecalScan.camera.flipAria')}
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
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
          <Icon.flipCamera style={{ width: 17, height: 17 }} />
        </button>
      </div>
    </div>
  );
}

function GhostButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 38,
        padding: '0 16px',
        borderRadius: 9999,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'var(--pbt-font-body)',
        letterSpacing: '-0.01em',
        color: dark ? '#fff' : 'oklch(0.30 0.10 20)',
        background: 'transparent',
        border: dark
          ? '1px solid rgba(255,255,255,0.2)'
          : '1px solid color-mix(in oklab, var(--pbt-driver-primary) 28%, transparent)',
      }}
    >
      {children}
    </button>
  );
}
