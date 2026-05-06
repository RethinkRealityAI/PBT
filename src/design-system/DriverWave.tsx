import { useEffect, useRef, useState } from 'react';
import type { DriverKey } from './tokens';
import { useTheme } from '../app/providers/ThemeProvider';
import { DriverWaveSvg } from './DriverWaveSvg';

export interface DriverWaveProps {
  /** Driver key, or 'all' to render the synthetic multi-driver wave. */
  driver?: DriverKey | 'all';
  height?: number;
  width?: number;
  /** Outer opacity multiplier. */
  opacity?: number;
  /** Kept for API compatibility (ignored — static SVGs have their own animation). */
  amplitude?: number;
  speed?: number;
  synthwave?: boolean;
  forceAnimate?: boolean;
  travelingDot?: boolean;
  videoBackdrop?: 'auto' | 'white' | 'black';
}

/** Pre-exported animated SVGs in /public/frequency-waves/. */
const SVG_PATHS: Record<DriverKey, string> = {
  Activator: '/frequency-waves/activator.svg',
  Analyzer: '/frequency-waves/analyzer.svg',
  Energizer: '/frequency-waves/energizer.svg',
  Harmonizer: '/frequency-waves/harmonizer.svg',
};

export function DriverWave({
  driver = 'all',
  height = 80,
  opacity = 1,
}: DriverWaveProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  // Multi-driver mode falls back to the synthetic SVG renderer
  if (driver === 'all') {
    return (
      <div
        className="relative w-full overflow-hidden"
        style={{
          height: `${height}px`,
          width: '100%',
          maxWidth: '100%',
          borderRadius: 'inherit',
          isolation: 'isolate',
        }}
        aria-hidden
      >
        <div
          className="absolute inset-0"
          style={{
            opacity,
            pointerEvents: 'none',
            maskImage:
              'linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(90deg, transparent 0%, black 5%, black 95%, transparent 100%)',
          }}
        >
          <DriverWaveSvg driver="all" height={height} opacity={1} dark={dark} />
        </div>
      </div>
    );
  }

  return (
    <SvgFrequencyWave
      src={SVG_PATHS[driver]}
      height={height}
      opacity={opacity}
      dark={dark}
    />
  );
}

/**
 * Renders an animated SVG by fetching its source and inlining it as
 * innerHTML. We can't use <object> or <img> because the SVG ships with
 * its own <script> animation — and <img> blocks scripts while <object>
 * doesn't honour CSS sizing reliably across browsers.
 *
 * Inlining puts the SVG into the parent document, so its embedded
 * IntersectionObserver-driven script runs and the SVG scales via CSS.
 */
/**
 * Rewrite every id/url(#…)/pfx reference so multiple instances of the
 * same SVG (e.g. several Activator waves on one screen) don't collide
 * on document.getElementById lookups inside the embedded script.
 */
function namespaceSvg(svgText: string, uid: string): string {
  return svgText
    .replace(/id="([^"]+)"/g, `id="${uid}_$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${uid}_$1)`)
    .replace(/pfx='([^']+)'/g, `pfx='${uid}_$1'`);
}

function SvgFrequencyWave({
  src,
  height,
  opacity,
  dark,
}: {
  src: string;
  height: number;
  opacity: number;
  dark: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const uidRef = useRef<string>('dw' + Math.random().toString(36).slice(2, 8));

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    fetch(src)
      .then((r) => r.text())
      .then((svgText) => {
        if (!alive || !ref.current) return;
        const uid = uidRef.current;
        const rewritten = namespaceSvg(svgText, uid);
        ref.current.innerHTML = rewritten;
        // <script> injected via innerHTML doesn't auto-execute. Pull the
        // text out and run it in the parent document — the script uses
        // document.getElementById, which works against the just-injected
        // (and now uniquely namespaced) SVG nodes.
        const scripts = ref.current.querySelectorAll('script');
        scripts.forEach((scriptEl) => {
          const code = scriptEl.textContent;
          scriptEl.remove();
          if (!code) return;
          try {
            // eslint-disable-next-line no-new-func
            new Function(code)();
          } catch {
            /* swallow — animation just won't run */
          }
        });
        setLoaded(true);
      })
      .catch(() => {
        /* swallow — left blank */
      });
    return () => {
      alive = false;
    };
  }, [src]);

  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: `${height}px`,
        width: '100%',
        maxWidth: '100%',
        borderRadius: 'inherit',
        isolation: 'isolate',
      }}
      aria-hidden
    >
      <div
        ref={ref}
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: loaded ? opacity : 0,
          transition: 'opacity 0.4s ease-out',
          // Soften the harsh edge of the line endings so it blends into
          // surrounding glass cards regardless of light/dark theme.
          maskImage:
            'linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent 0%, black 6%, black 94%, transparent 100%)',
          // SVG strokes ship with their own colors — let dark mode lift them
          // slightly via screen blend, light mode tones them down via multiply.
          mixBlendMode: dark ? 'screen' : 'multiply',
        }}
      />
    </div>
  );
}
