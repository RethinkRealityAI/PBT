import { useEffect, useMemo, useRef, useState } from 'react';
import { DRIVER_KEYS, type DriverKey } from './tokens';
import { useTheme } from '../app/providers/ThemeProvider';

const WAVE_COLOR: Record<DriverKey, string> = {
  Activator: 'oklch(0.62 0.22 22)',
  Energizer: 'oklch(0.70 0.18 70)',
  Analyzer: 'oklch(0.62 0.16 245)',
  Harmonizer: 'oklch(0.60 0.16 145)',
};

export interface DriverWaveProps {
  /** Driver key, or 'all' to render one line per driver in their color. */
  driver?: DriverKey | 'all';
  height?: number;
  width?: number;
  amplitude?: number;
  opacity?: number;
  speed?: number;
  /** Synthwave mode: stronger neon glow, higher blur, more dramatic lines. Also bypasses prefers-reduced-motion. */
  synthwave?: boolean;
  /** Force animation even when prefers-reduced-motion is set. */
  forceAnimate?: boolean;
  /**
   * Glowing dot that travels along the primary wave (same phase math as the top path).
   * Hidden when prefers-reduced-motion (unless synthwave/forceAnimate already bypass).
   */
  travelingDot?: boolean;
}

interface Line {
  color: string;
  amp: number;
  freq: number;
  speed: number;
  phase: number;
  width: number;
  op: number;
}

export function DriverWave({
  driver = 'all',
  height = 80,
  width = 360,
  amplitude = 1,
  opacity = 1,
  speed = 1,
  synthwave = false,
  forceAnimate = false,
  travelingDot = false,
}: DriverWaveProps) {
  const [t, setT] = useState(0);
  const reduced = usePrefersReducedMotion();
  const showDot = travelingDot && (!reduced || synthwave || forceAnimate);
  useEffect(() => {
    if (reduced && !synthwave && !forceAnimate) return;
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      setT((ts - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);

  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  const lines: Line[] = useMemo(() => {
    if (driver === 'all') {
      return DRIVER_KEYS.map((d, i) => ({
        color: WAVE_COLOR[d],
        amp: synthwave ? 18 + (i % 2) * 6 : 12 + (i % 2) * 4,
        freq: 0.9 + i * 0.18,
        speed: (synthwave ? 0.9 + i * 0.22 : 0.7 + i * 0.18) * speed,
        phase: i * 1.3,
        width: synthwave ? 2.0 : 1.5,
        op: synthwave ? 1.0 : 0.85,
      }));
    }
    const c = WAVE_COLOR[driver] ?? WAVE_COLOR.Activator;
    if (synthwave) {
      return [
        { color: c, amp: 20, freq: 1.0, speed: 1.0 * speed, phase: 0.0, width: 2.4, op: 1.0 },
        { color: c, amp: 14, freq: 1.5, speed: 1.3 * speed, phase: 1.4, width: 1.8, op: 0.75 },
        { color: c, amp: 9, freq: 1.9, speed: 0.7 * speed, phase: 2.7, width: 1.2, op: 0.55 },
      ];
    }
    return [
      { color: c, amp: 16, freq: 1.0, speed: 0.8 * speed, phase: 0.0, width: 2.0, op: 0.95 },
      { color: c, amp: 11, freq: 1.45, speed: 1.05 * speed, phase: 1.4, width: 1.4, op: 0.55 },
      { color: c, amp: 7, freq: 1.85, speed: 0.55 * speed, phase: 2.7, width: 1.0, op: 0.4 },
    ];
  }, [driver, speed, synthwave]);

  const W = width;
  const H = height;
  const cy = H / 2;
  const samples = 64;

  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    idRef.current = 'dw' + Math.random().toString(36).slice(2, 8);
  }
  const uid = idRef.current;

  const waveYAtSample = (line: Line, tt: number, sampleIdx: number) => {
    const clamped = Math.max(0, Math.min(samples, sampleIdx));
    const phase =
      (clamped / samples) * Math.PI * 2 * line.freq + tt * line.speed + line.phase;
    const env = Math.sin((clamped / samples) * Math.PI);
    return cy + Math.sin(phase) * line.amp * amplitude * env;
  };

  const buildPath = (line: Line, tt: number) => {
    let d = '';
    for (let i = 0; i <= samples; i++) {
      const x = (i / samples) * W;
      const y = waveYAtSample(line, tt, i);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
    }
    return d;
  };

  const primaryLine = lines[0];
  /** Loops 0→W along the wave once per ~9s at speed 1 */
  const dotScan = showDot && primaryLine ? ((t * 0.11) % 1) * samples : 0;
  const dotI0 = Math.floor(dotScan);
  const dotFrac = dotScan - dotI0;
  const dotX =
    showDot && primaryLine ? (dotScan / samples) * W : 0;
  const dotY =
    showDot && primaryLine
      ? waveYAtSample(primaryLine, t, dotI0) +
        (waveYAtSample(primaryLine, t, Math.min(samples, dotI0 + 1)) -
          waveYAtSample(primaryLine, t, dotI0)) *
          dotFrac
      : 0;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ overflow: 'visible', opacity }}
      aria-hidden
    >
      <defs>
        {lines.map((l, i) => (
          <linearGradient key={i} id={`${uid}-fade-${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={l.color} stopOpacity="0" />
            <stop offset="0.15" stopColor={l.color} stopOpacity={l.op} />
            <stop offset="0.85" stopColor={l.color} stopOpacity={l.op} />
            <stop offset="1" stopColor={l.color} stopOpacity="0" />
          </linearGradient>
        ))}
        <filter id={`${uid}-glow`} x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation={synthwave ? '3.2' : '1.4'} />
        </filter>
      </defs>

      {lines.map((l, i) => (
        <path
          key={`g-${i}`}
          d={buildPath(l, t)}
          fill="none"
          stroke={`url(#${uid}-fade-${i})`}
          strokeWidth={l.width * 3}
          strokeLinecap="round"
          filter={`url(#${uid}-glow)`}
          style={{ opacity: synthwave ? 0.75 : 0.45, mixBlendMode: dark ? 'screen' : 'multiply' }}
        />
      ))}
      {lines.map((l, i) => (
        <path
          key={`l-${i}`}
          d={buildPath(l, t)}
          fill="none"
          stroke={`url(#${uid}-fade-${i})`}
          strokeWidth={l.width}
          strokeLinecap="round"
        />
      ))}
      {showDot && primaryLine && (
        <g filter={`url(#${uid}-glow)`}>
          <circle
            cx={dotX}
            cy={dotY}
            r={synthwave ? 9 : 7}
            fill={primaryLine.color}
            opacity={0.22}
          />
          <circle
            cx={dotX}
            cy={dotY}
            r={synthwave ? 4.2 : 3.4}
            fill={primaryLine.color}
            opacity={0.95}
          />
        </g>
      )}
    </svg>
  );
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', listener);
    return () => mq.removeEventListener?.('change', listener);
  }, []);
  return reduced;
}
