import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Icon } from '../../design-system/Icon';
import { useT } from '../../i18n/useT';
import { useDialog } from '../../lib/useDialog';
import { CameraCapture, primaryStyle } from './CameraCapture';
import { ScanProgress } from './ScanProgress';
import { FECAL_NEUTRAL_PALETTE } from './fecalUi';
import { assessPhotoQuality, type PhotoQuality } from './photoQuality';
import type { FecalScanStatus } from './useFecalScan';
import type { PhotoIssue } from './photoQuality';

/** How long the finished stepper stays on screen before the result opens. */
const DONE_HOLD_MS = 750;
const DONE_HOLD_REDUCED_MS = 250;

export type CaptureStart = { mode: 'camera' } | { mode: 'review'; file: File };

export interface CaptureModalProps {
  /** Open on the live camera, or straight on the review of a library pick. */
  start: CaptureStart;
  /** Species chart label ("Adult dog") — which chart this photo will be scored on. */
  chartLabel: string;
  status: FecalScanStatus;
  error: string | null;
  cameraSupported: boolean;
  onCameraUnavailable: () => void;
  onScan: (file: File, meta: { photoIssue: PhotoIssue | null; retakes: number }) => void;
  /** The scan finished (a result or "not a stool"): close and show the result. */
  onFinished: () => void;
  /** The user dismissed the modal (the parent cancels a scan in flight). */
  onClose: () => void;
}

type Phase = 'camera' | 'review' | 'scanning';

/**
 * The capture flow, in one full-screen modal (a large dialog from `sm`):
 *
 *   camera ──shutter──▶ review ──Start scan──▶ scanning ──done──▶ (closes)
 *      ▲                  │  Retake                │ error: Try again / Retake
 *      └──────────────────┘                        ▼
 *
 * The review step exists because a blurry, accidental or badly framed photo
 * used to go straight to the scorer — the tech only found out when a
 * low-confidence answer came back. Now they see the photo first, the
 * quality check flags an obviously soft or dark one, and nothing is sent
 * until they tap Start scan.
 *
 * Always dark, whatever the app theme: this is a camera surface — photos
 * are judged best on near-black, and the viewfinder must not pick up the
 * app's warm tints. The neutral dark palette is applied explicitly (a portal
 * does not inherit the screen's `FecalPalette`), so every child reads
 * `--pbt-text` as near-white here.
 */
export function CaptureModal({
  start,
  chartLabel,
  status,
  error,
  cameraSupported,
  onCameraUnavailable,
  onScan,
  onFinished,
  onClose,
}: CaptureModalProps) {
  const t = useT();
  const reduce = useReducedMotion();
  const titleId = useId();
  const libraryRef = useRef<HTMLInputElement>(null);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  const [phase, setPhase] = useState<Phase>(start.mode);
  const [file, setFile] = useState<File | null>(start.mode === 'review' ? start.file : null);
  const [origin, setOrigin] = useState<'camera' | 'library'>(
    start.mode === 'review' ? 'library' : 'camera',
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [quality, setQuality] = useState<PhotoQuality | null>(null);
  const [retakes, setRetakes] = useState(0);
  // The parent's status can still read 'done' from the PREVIOUS scan when
  // this modal opens over a result. Only a status seen after this modal
  // started a scan may close it.
  const [sawAnalyzing, setSawAnalyzing] = useState(false);

  // Page behind the modal must not scroll (the one part of the dialog
  // contract that lives outside the dialog element).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Preview URL + quality verdict follow the photo in hand.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      setQuality(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setQuality(null);
    let cancelled = false;
    void assessPhotoQuality(file).then((q) => {
      if (!cancelled) setQuality(q);
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (phase === 'scanning' && status === 'analyzing') setSawAnalyzing(true);
  }, [phase, status]);

  const finished = phase === 'scanning' && sawAnalyzing && status === 'done';
  const failed = phase === 'scanning' && status === 'error';

  // Let the settled stepper register for a beat, then open the result.
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  useEffect(() => {
    if (!finished) return;
    const id = setTimeout(
      () => onFinishedRef.current(),
      reduce ? DONE_HOLD_REDUCED_MS : DONE_HOLD_MS,
    );
    return () => clearTimeout(id);
  }, [finished, reduce]);

  const acceptPhoto = useCallback((next: File, from: 'camera' | 'library') => {
    setFile(next);
    setOrigin(from);
    setPhase('review');
  }, []);

  const openLibrary = useCallback(() => {
    libraryRef.current?.click();
  }, []);

  const retake = useCallback(() => {
    setRetakes((n) => n + 1);
    setSawAnalyzing(false);
    if (origin === 'library' || !cameraSupported) {
      openLibrary();
      return;
    }
    setFile(null);
    setPhase('camera');
  }, [cameraSupported, openLibrary, origin]);

  const startScan = useCallback(() => {
    if (!file) return;
    setSawAnalyzing(false);
    setPhase('scanning');
    onScan(file, { photoIssue: quality?.issue ?? null, retakes });
  }, [file, onScan, quality, retakes]);

  const issue = quality?.issue ?? null;

  // The control that had focus (shutter, Start scan) unmounts on every step
  // change; without this, focus falls to <body> — outside the dialog, where
  // the Tab trap no longer sees it. Land on the step's main action instead.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>('[data-autofocus]')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [phase, failed, issue, dialogRef]);

  const phaseTitle =
    phase === 'camera'
      ? t('fecalScan.modal.title.camera')
      : phase === 'review'
        ? t('fecalScan.modal.title.review')
        : t('fecalScan.modal.title.scanning');

  const palette = FECAL_NEUTRAL_PALETTE.dark as unknown as CSSProperties;

  return createPortal(
    <div
      className="flex items-stretch justify-center sm:items-center sm:p-6"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(4, 5, 8, 0.72)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-fecal-capture
        className="flex h-[100dvh] w-full flex-col sm:h-[min(820px,calc(100dvh-48px))] sm:max-w-[560px] sm:rounded-[30px]"
        initial={reduce ? false : { opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        style={{
          ...palette,
          overflow: 'hidden',
          color: '#fff',
          background: 'oklch(0.155 0.006 260)',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
          outline: 'none',
        }}
      >
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          // No `capture` attribute: on iOS it forces the camera and makes
          // choosing an existing photo impossible.
          style={{ display: 'none' }}
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = '';
            if (picked) acceptPhoto(picked, 'library');
          }}
        />

        {/* ── Header: close · step title · chart ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '52px 1fr 52px',
            alignItems: 'center',
            padding: '10px 12px 12px',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t('fecalScan.modal.close')}
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <Icon.close aria-hidden />
          </button>
          <div style={{ textAlign: 'center', minWidth: 0 }}>
            <h2
              id={titleId}
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: '#fff',
              }}
            >
              {phaseTitle}
            </h2>
            <div
              style={{
                marginTop: 3,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'var(--pbt-font-mono)',
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--pbt-driver-primary)',
                }}
              />
              {t('fecalScan.modal.chart', { chart: chartLabel })}
            </div>
          </div>
          <span />
        </div>

        {/* ── Body ── */}
        {phase === 'camera' && (
          <CameraCapture
            onCapture={(f) => acceptPhoto(f, 'camera')}
            onChooseLibrary={openLibrary}
            onUnavailable={onCameraUnavailable}
          />
        )}

        {phase !== 'camera' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <PhotoStage
              src={previewUrl}
              alt={t('fecalScan.capture.photoAlt')}
              scanning={phase === 'scanning' && !failed}
              reduce={Boolean(reduce)}
            />

            <div style={{ padding: '16px 20px 6px' }}>
              {phase === 'review' && (
                <>
                  <QualityNote quality={quality} />
                  <div
                    className="grid grid-cols-2"
                    style={{ gap: 10, marginTop: 14 }}
                  >
                    {issue ? (
                      <>
                        <button type="button" onClick={startScan} style={secondaryStyle}>
                          {t('fecalScan.review.scanAnyway')}
                        </button>
                        <button type="button" onClick={retake} style={primaryStyle} data-autofocus>
                          <Icon.retake aria-hidden style={{ width: 18, height: 18 }} />
                          {origin === 'library'
                            ? t('fecalScan.review.chooseAnother')
                            : t('fecalScan.review.retake')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={retake} style={secondaryStyle}>
                          <Icon.retake aria-hidden style={{ width: 18, height: 18 }} />
                          {origin === 'library'
                            ? t('fecalScan.review.chooseAnother')
                            : t('fecalScan.review.retake')}
                        </button>
                        <button type="button" onClick={startScan} style={primaryStyle} data-autofocus>
                          <Icon.scan aria-hidden style={{ width: 18, height: 18 }} />
                          {t('fecalScan.review.start')}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {phase === 'scanning' && !failed && (
                <>
                  <ScanProgress settled={finished} />
                  {!finished && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
                      <button type="button" onClick={onClose} style={textButtonStyle} data-autofocus>
                        {t('fecalScan.scanning.cancel')}
                      </button>
                    </div>
                  )}
                </>
              )}

              {failed && (
                <>
                  <div
                    role="alert"
                    style={{
                      padding: '12px 14px',
                      borderRadius: 14,
                      fontSize: 14,
                      lineHeight: 1.55,
                      fontWeight: 600,
                      color: 'var(--fecal-error-ink)',
                      background: 'color-mix(in oklab, var(--pbt-score-poor) 16%, transparent)',
                    }}
                  >
                    {error ?? t('fecalScan.error.failed')}
                  </div>
                  <div className="grid grid-cols-2" style={{ gap: 10, marginTop: 14 }}>
                    <button type="button" onClick={retake} style={secondaryStyle}>
                      <Icon.retake aria-hidden style={{ width: 18, height: 18 }} />
                      {origin === 'library'
                        ? t('fecalScan.review.chooseAnother')
                        : t('fecalScan.review.retake')}
                    </button>
                    <button type="button" onClick={startScan} style={primaryStyle} data-autofocus>
                      {t('fecalScan.footer.tryAgain')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}

/** The photo, as large as the modal allows, with the scanning sweep over it. */
function PhotoStage({
  src,
  alt,
  scanning,
  reduce,
}: {
  src: string | null;
  alt: string;
  scanning: boolean;
  reduce: boolean;
}) {
  return (
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
      {src && (
        <img
          src={src}
          alt={alt}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            // The whole photo, never cropped: this is where the tech judges it.
            objectFit: 'contain',
            display: 'block',
          }}
        />
      )}
      {scanning && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(180deg, transparent 40%, color-mix(in oklab, var(--pbt-driver-primary) 16%, transparent))',
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
                  '0 0 22px 5px color-mix(in oklab, var(--pbt-driver-primary) 50%, transparent)',
              }}
              initial={{ top: '0%' }}
              animate={{ top: ['4%', '94%', '4%'] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </span>
      )}
    </div>
  );
}

/** Quality verdict: a quiet confirmation, or the one thing to fix. */
function QualityNote({ quality }: { quality: PhotoQuality | null }) {
  const t = useT();
  // No verdict (still measuring, or the browser can't read pixels): the
  // prompt alone — never a guessed "looks good".
  const issue = quality?.issue ?? null;
  const tone = !quality ? 'neutral' : issue ? 'warn' : 'ok';
  const text = !quality
    ? t('fecalScan.review.prompt')
    : issue === 'blurry'
      ? t('fecalScan.review.issue.blurry')
      : issue === 'dark'
        ? t('fecalScan.review.issue.dark')
        : t('fecalScan.review.ok');
  return (
    <div
      role={issue ? 'alert' : 'status'}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '11px 13px',
        borderRadius: 14,
        fontSize: 13.5,
        lineHeight: 1.5,
        color: '#fff',
        // Neutral fill even for the warning: amber washed into near-black
        // reads as brown next to the photo. The amber lives in the border
        // and the icon only.
        background: 'rgba(255,255,255,0.07)',
        border:
          tone === 'warn'
            ? '1px solid color-mix(in oklab, var(--pbt-score-ok) 60%, transparent)'
            : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 20,
          height: 20,
          flexShrink: 0,
          marginTop: 1,
          borderRadius: '50%',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: tone === 'warn' ? '#1a1406' : '#fff',
          background:
            tone === 'warn'
              ? 'var(--pbt-score-ok)'
              : tone === 'ok'
                ? 'var(--pbt-score-good)'
                : 'rgba(255,255,255,0.16)',
        }}
      >
        {tone === 'warn' ? (
          <span style={{ fontSize: 12, fontWeight: 800, lineHeight: 1 }}>!</span>
        ) : tone === 'ok' ? (
          <Icon.check style={{ width: 12, height: 12 }} />
        ) : (
          <Icon.info style={{ width: 12, height: 12 }} />
        )}
      </span>
      <span>{text}</span>
    </div>
  );
}

const secondaryStyle: CSSProperties = {
  ...primaryStyle,
  color: '#fff',
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.16)',
  boxShadow: 'none',
};

const textButtonStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 16px',
  border: 'none',
  background: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--pbt-font-body)',
  fontSize: 14,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.78)',
};
