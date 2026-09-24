import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../design-system/Icon';
import { RADII } from '../../design-system/tokens';
import { useT } from '../../i18n/useT';
import type { CatalogKey } from '../../i18n/catalog';
import { DRIVER_GRADIENT, ErrorNote, subtleSurface } from './fecalUi';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [errorKey, setErrorKey] = useState<CatalogKey | null>(null);
  const [ready, setReady] = useState(false);
  // The stream can be live before the first frame is decoded (videoWidth 0).
  // Shooting then would send a blank JPEG — a wasted scan that comes back as
  // "not a stool" — so the shutter waits for real pixels.
  const [hasFrame, setHasFrame] = useState(false);
  const canShoot = ready && hasFrame;

  const checkFrame = useCallback(() => {
    const video = videoRef.current;
    setHasFrame(Boolean(video && video.videoWidth > 0 && video.videoHeight > 0));
  }, []);

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
    setHasFrame(false);

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
        checkFrame();
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
  }, [facing, stopStream, checkFrame]);

  const shoot = useCallback(() => {
    const video = videoRef.current;
    // Never send a frame-less image: no decoded frame means no photo.
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    let drawn = false;
    try {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        drawn = true;
      }
    } catch {
      drawn = false;
    }
    if (!drawn) {
      // No 2D context (very old WebView): a blank JPEG would still cost a
      // scan and come back as "not a stool". Say so; upload still works.
      setErrorKey('fecalScan.camera.failed');
      stopStream();
      return;
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
        <ErrorNote>{t(errorKey)}</ErrorNote>
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
          border: '2px solid color-mix(in oklab, var(--pbt-driver-primary) 70%, transparent)',
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedData={checkFrame}
          onPlaying={checkFrame}
          onResize={checkFrame}
          aria-label={t('fecalScan.camera.hint')}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            // Selfie cameras are mirrored in every other app; matching that
            // makes framing feel right.
            transform: facing === 'user' ? 'scaleX(-1)' : undefined,
            opacity: canShoot ? 1 : 0.4,
            transition: 'opacity 0.3s ease',
          }}
        />
        {/* Framing guide — four driver-coloured corners. */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: '16px 16px 34px',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.45))',
          }}
        >
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <span
              key={c}
              style={{
                position: 'absolute',
                width: 22,
                height: 22,
                borderColor: 'var(--pbt-driver-primary)',
                borderStyle: 'solid',
                borderWidth: 0,
                ...(c[0] === 't' ? { top: 0, borderTopWidth: 3 } : { bottom: 0, borderBottomWidth: 3 }),
                ...(c[1] === 'l' ? { left: 0, borderLeftWidth: 3 } : { right: 0, borderRightWidth: 3 }),
                borderTopLeftRadius: c === 'tl' ? 8 : 0,
                borderTopRightRadius: c === 'tr' ? 8 : 0,
                borderBottomLeftRadius: c === 'bl' ? 8 : 0,
                borderBottomRightRadius: c === 'br' ? 8 : 0,
              }}
            />
          ))}
        </span>
        {!canShoot && (
          <span
            role="status"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 10,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.85)',
              pointerEvents: 'none',
            }}
          >
            {t('fecalScan.camera.starting')}
          </span>
        )}
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
          disabled={!canShoot}
          aria-label={t('fecalScan.camera.shutterAria')}
          style={{
            width: 64,
            height: 64,
            flexShrink: 0,
            borderRadius: '50%',
            border: '4px solid var(--fecal-fill)',
            outline: '2px solid color-mix(in oklab, var(--pbt-driver-primary) 55%, transparent)',
            outlineOffset: 0,
            cursor: canShoot ? 'pointer' : 'not-allowed',
            opacity: canShoot ? 1 : 0.45,
            background: DRIVER_GRADIENT,
            boxShadow:
              '0 8px 20px -8px color-mix(in oklab, var(--pbt-driver-primary) 65%, transparent), 0 1px 0 rgba(255,255,255,0.4) inset',
            transition: 'opacity 0.25s ease, transform 0.15s ease',
          }}
        />

        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
          aria-label={t('fecalScan.camera.flipAria')}
          style={{
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--pbt-text)',
            ...subtleSurface,
          }}
        >
          <Icon.flipCamera style={{ width: 19, height: 19 }} />
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
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 48,
        minWidth: 96,
        padding: '0 18px',
        borderRadius: 9999,
        cursor: 'pointer',
        fontSize: 14,
        fontWeight: 600,
        fontFamily: 'var(--pbt-font-body)',
        letterSpacing: '-0.01em',
        color: 'var(--pbt-text)',
        ...subtleSurface,
      }}
    >
      {children}
    </button>
  );
}
