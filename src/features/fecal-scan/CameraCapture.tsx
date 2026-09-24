import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Icon } from '../../design-system/Icon';
import { useT } from '../../i18n/useT';
import type { CatalogKey } from '../../i18n/catalog';
import { DRIVER_GRADIENT } from './fecalUi';

/** Longest edge of the captured frame — matches `lib/imagePrep`'s target. */
const MAX_EDGE_PX = 1600;
const JPEG_QUALITY = 0.9;

export interface CameraCaptureProps {
  /** A fresh JPEG File from the current frame. The camera is already released. */
  onCapture: (file: File) => void;
  /** Opens the photo library instead (always offered, error or not). */
  onChooseLibrary: () => void;
  /**
   * The device has no camera at all (`NotFoundError`, or no `mediaDevices`).
   * The parent hides its camera entry point — a button that can never work is
   * worse than no button.
   */
  onUnavailable?: () => void;
}

/**
 * The part of the camera frame the viewfinder actually shows.
 *
 * The preview is `object-fit: cover`, so a landscape sensor frame in a
 * portrait viewfinder loses its sides. Capturing the full frame would put
 * things in the photo the tech never saw (and framed out on purpose), so the
 * shot is cropped to what was on screen — what you frame is what gets scored.
 * Falls back to the full frame when the element has no layout size.
 */
export function visibleRegion(video: {
  videoWidth: number;
  videoHeight: number;
  clientWidth: number;
  clientHeight: number;
}): { sx: number; sy: number; sw: number; sh: number } {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  if (!cw || !ch) return { sx: 0, sy: 0, sw: vw, sh: vh };
  const scale = Math.max(cw / vw, ch / vh);
  const sw = Math.min(vw, cw / scale);
  const sh = Math.min(vh, ch / scale);
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh };
}

/** True when this browser exposes a camera API at all. */
export function isCameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/**
 * Full-bleed in-app camera — the first step of the capture modal.
 *
 * The tool is used on a phone, beside the animal, so the viewfinder takes
 * every pixel the modal has and the controls sit in the thumb zone: library
 * (left), shutter (centre), flip (right) — the layout of every phone camera.
 *
 * The stream is released on capture, on unmount and before every restart: a
 * camera light left on after the user walked away is a bug you only find out
 * about from the client.
 */
export function CameraCapture({ onCapture, onChooseLibrary, onUnavailable }: CameraCaptureProps) {
  const t = useT();
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [errorKey, setErrorKey] = useState<CatalogKey | null>(null);
  const [ready, setReady] = useState(false);
  // The stream can be live before the first frame is decoded (videoWidth 0).
  // Shooting then would send a blank JPEG — a wasted scan that comes back as
  // "not a stool" — so the shutter waits for real pixels.
  const [hasFrame, setHasFrame] = useState(false);
  const [flash, setFlash] = useState(0);
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
    const { sx, sy, sw, sh } = visibleRegion(video);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(sw, sh));

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    let drawn = false;
    try {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        drawn = true;
      }
    } catch {
      drawn = false;
    }
    if (!drawn) {
      // No 2D context (very old WebView): a blank JPEG would still cost a
      // scan and come back as "not a stool". Say so; the library still works.
      setErrorKey('fecalScan.camera.failed');
      stopStream();
      return;
    }
    setFlash((n) => n + 1);

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

  const libraryButton = (
    <RoundButton onClick={onChooseLibrary} label={t('fecalScan.capture.chooseFromLibrary')}>
      <Icon.image style={{ width: 21, height: 21 }} />
    </RoundButton>
  );

  if (errorKey) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: '24px 28px',
          textAlign: 'center',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.9)',
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <Icon.camera style={{ width: 26, height: 26 }} />
        </span>
        <p
          role="alert"
          style={{ margin: 0, maxWidth: 320, fontSize: 15, lineHeight: 1.55, color: '#fff' }}
        >
          {t(errorKey)}
        </p>
        <button type="button" onClick={onChooseLibrary} style={primaryStyle}>
          <Icon.image aria-hidden style={{ width: 18, height: 18 }} />
          {t('fecalScan.capture.chooseFromLibrary')}
        </button>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          margin: '0 12px',
          borderRadius: 22,
          overflow: 'hidden',
          background: '#000',
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
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            // Selfie cameras are mirrored in every other app; matching that
            // makes framing feel right.
            transform: facing === 'user' ? 'scaleX(-1)' : undefined,
            opacity: canShoot ? 1 : 0.35,
            transition: 'opacity 0.3s ease',
          }}
        />

        {/* Framing guide — four driver-coloured corners around the target area. */}
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: '12% 10% 16%',
            pointerEvents: 'none',
            filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.5))',
          }}
        >
          {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <span
              key={c}
              style={{
                position: 'absolute',
                width: 30,
                height: 30,
                borderColor: 'var(--pbt-driver-primary)',
                borderStyle: 'solid',
                borderWidth: 0,
                ...(c[0] === 't' ? { top: 0, borderTopWidth: 3.5 } : { bottom: 0, borderBottomWidth: 3.5 }),
                ...(c[1] === 'l' ? { left: 0, borderLeftWidth: 3.5 } : { right: 0, borderRightWidth: 3.5 }),
                borderTopLeftRadius: c === 'tl' ? 12 : 0,
                borderTopRightRadius: c === 'tr' ? 12 : 0,
                borderBottomLeftRadius: c === 'bl' ? 12 : 0,
                borderBottomRightRadius: c === 'br' ? 12 : 0,
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
              fontSize: 10.5,
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
            left: 16,
            right: 16,
            bottom: 14,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              padding: '7px 13px',
              borderRadius: 9999,
              fontSize: 12.5,
              fontWeight: 500,
              lineHeight: 1.35,
              textAlign: 'center',
              color: '#fff',
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            {t('fecalScan.camera.hint')}
          </span>
        </span>

        {/* Shutter flash — the "it took" moment, without sound. */}
        {flash > 0 && !reduce && (
          <motion.span
            key={flash}
            aria-hidden
            initial={{ opacity: 0.85 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, background: '#fff', pointerEvents: 'none' }}
          />
        )}
      </div>

      {/* Thumb-zone controls. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '18px 24px 8px',
        }}
      >
        <div style={{ justifySelf: 'start' }}>{libraryButton}</div>

        <button
          type="button"
          onClick={shoot}
          disabled={!canShoot}
          aria-label={t('fecalScan.camera.shutterAria')}
          style={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            padding: 5,
            border: '3px solid rgba(255,255,255,0.92)',
            background: 'transparent',
            cursor: canShoot ? 'pointer' : 'not-allowed',
            opacity: canShoot ? 1 : 0.45,
            transition: 'opacity 0.25s ease, transform 0.12s ease',
          }}
          onPointerDown={(e) => (e.currentTarget.style.transform = 'scale(0.93)')}
          onPointerUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          onPointerLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <span
            aria-hidden
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              background: DRIVER_GRADIENT,
              boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset',
            }}
          />
        </button>

        <div style={{ justifySelf: 'end' }}>
          <RoundButton
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            label={t('fecalScan.camera.flipAria')}
          >
            <Icon.flipCamera style={{ width: 20, height: 20 }} />
          </RoundButton>
        </div>
      </div>
    </div>
  );
}

/** The one primary action on the dark capture surface (driver gradient, white text). */
export const primaryStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  // Grows to two lines rather than clipping: French labels run ~40 % longer
  // and these buttons sit two-up on a 360 px phone.
  minHeight: 52,
  padding: '8px 18px',
  lineHeight: 1.2,
  textAlign: 'center',
  borderRadius: 9999,
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--pbt-font-body)',
  fontSize: 15.5,
  fontWeight: 600,
  letterSpacing: '-0.01em',
  color: '#fff',
  background: DRIVER_GRADIENT,
  boxShadow:
    '0 1px 0 rgba(255,255,255,0.4) inset, 0 8px 20px -8px color-mix(in oklab, var(--pbt-driver-primary) 70%, transparent)',
};

function RoundButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 52,
        height: 52,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: '#fff',
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.16)',
      }}
    >
      {children}
    </button>
  );
}
