import { useEffect, useMemo, useRef, useState } from 'react';
import { DRIVER_KEYS, type DriverKey } from './tokens';

const WAVE_COLOR: Record<DriverKey, string> = {
  Activator: 'oklch(0.62 0.22 22)',
  Energizer: 'oklch(0.70 0.18 70)',
  Analyzer: 'oklch(0.62 0.16 245)',
  Harmonizer: 'oklch(0.60 0.16 145)',
};

function softenMulticolorStroke(base: string, dark: boolean): string {
  return dark
    ? `color-mix(in oklab, ${base} 54%, oklch(0.88 0.03 270))`
    : `color-mix(in oklab, ${base} 58%, white)`;
}

/**
 * Per-driver "ribbon" config: 4 parallel lines that share an identical wave
 * shape (same amp, freq, phase, speed) and only differ by vertical offset.
 * They are guaranteed to never cross because they sit at fixed yOffsets.
 *
 * The amplitude envelope is stronger toward the right edge, so the ribbon
 * stays nearly flat on the left and crests on the right.
 */
interface DriverRibbonCfg {
  freq: number;
  speedFactor: number;
  amp: number;       // peak amplitude (px) at the right edge of the canvas
  ampSynth: number;  // amplified version when synthwave is on
  envExp: number;    // envelope exponent — higher = flatter start, sharper rise
  yOffsetsFraction: number[]; // 4 vertical offsets as fractions of H
  widths: number[];  // 4 stroke widths
  ops: number[];     // 4 base opacities
}

const DRIVER_RIBBON: Record<DriverKey, DriverRibbonCfg> = {
  // Coral — moderate rolling, broad sweep
  Activator: {
    freq: 1.6,
    speedFactor: 0.75,
    amp: 11,
    ampSynth: 16,
    envExp: 1.4,
    yOffsetsFraction: [-0.10, -0.035, 0.035, 0.10],
    widths: [1.5, 1.4, 1.3, 1.2],
    ops: [0.95, 0.85, 0.78, 0.7],
  },
  // Gold — most dynamic, widest amplitude
  Energizer: {
    freq: 2.0,
    speedFactor: 1.2,
    amp: 18,
    ampSynth: 26,
    envExp: 1.3,
    yOffsetsFraction: [-0.13, -0.045, 0.045, 0.13],
    widths: [1.6, 1.5, 1.4, 1.3],
    ops: [1.0, 0.9, 0.82, 0.74],
  },
  // Blue — tight, calm, precise
  Analyzer: {
    freq: 2.4,
    speedFactor: 0.55,
    amp: 4.5,
    ampSynth: 7,
    envExp: 1.6,
    yOffsetsFraction: [-0.06, -0.022, 0.022, 0.06],
    widths: [1.5, 1.4, 1.3, 1.2],
    ops: [0.95, 0.85, 0.78, 0.7],
  },
  // Green — balanced, rhythmic
  Harmonizer: {
    freq: 1.4,
    speedFactor: 0.65,
    amp: 9,
    ampSynth: 13,
    envExp: 1.5,
    yOffsetsFraction: [-0.085, -0.03, 0.03, 0.085],
    widths: [1.5, 1.4, 1.3, 1.2],
    ops: [0.95, 0.85, 0.78, 0.7],
  },
};

export interface DriverWaveSvgProps {
  driver?: DriverKey | 'all';
  height?: number;
  width?: number;
  amplitude?: number;
  opacity?: number;
  speed?: number;
  synthwave?: boolean;
  forceAnimate?: boolean;
  travelingDot?: boolean;
  dark: boolean;
}

export function DriverWaveSvg({
  driver = 'all',
  height = 80,
  width = 360,
  amplitude = 1,
  opacity = 1,
  speed = 1,
  synthwave = false,
  forceAnimate = false,
  travelingDot = false,
  dark,
}: DriverWaveSvgProps) {
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
  }, [reduced, synthwave, forceAnimate]);

  const W = width;
  const H = height;
  const samples = 96;

  const lines = useMemo(() => {
    if (driver === 'all') {
      // Multi-driver mode: one line per driver, all at center, distinct freq/phase
      return DRIVER_KEYS.map((d, i) => ({
        color: softenMulticolorStroke(WAVE_COLOR[d], dark),
        amp: synthwave ? 18 + (i % 2) * 6 : 12 + (i % 2) * 4,
        freq: 0.9 + i * 0.18,
        speed: (synthwave ? 0.9 + i * 0.22 : 0.7 + i * 0.18) * speed,
        phase: i * 1.3,
        width: synthwave ? 2.0 : 1.5,
        op: synthwave ? 1.0 : 0.85,
        cy: H / 2,
        envExp: 0, // 0 = use sin(πx/W) bell envelope (back-compat)
      }));
    }
    // Single-driver ribbon: 4 PARALLEL lines that never cross.
    // Same freq + phase + speed for every line — only yOffset differs.
    const c = WAVE_COLOR[driver] ?? WAVE_COLOR.Activator;
    const cfg = DRIVER_RIBBON[driver as DriverKey] ?? DRIVER_RIBBON.Activator;
    const lineAmp = synthwave ? cfg.ampSynth : cfg.amp;
    const lineSpeed = cfg.speedFactor * speed;
    return cfg.yOffsetsFraction.map((yOff, i) => ({
      color: c,
      amp: lineAmp,
      freq: cfg.freq,
      speed: lineSpeed,
      phase: 0, // identical phase => parallel
      width: synthwave ? cfg.widths[i] * 1.2 : cfg.widths[i],
      op: cfg.ops[i],
      cy: H / 2 + yOff * H,
      envExp: cfg.envExp,
    }));
  }, [driver, speed, synthwave, dark, H]);

  const idRef = useRef<string | null>(null);
  if (idRef.current === null) {
    idRef.current = 'dw' + Math.random().toString(36).slice(2, 8);
  }
  const uid = idRef.current;

  type Line = (typeof lines)[number];

  const waveYAtSample = (line: Line, tt: number, sampleIdx: number) => {
    const clamped = Math.max(0, Math.min(samples, sampleIdx));
    const u = clamped / samples; // 0 → 1 across the width
    const phase = u * Math.PI * 2 * line.freq + tt * line.speed + line.phase;
    // envExp > 0 → growing envelope (flat left, full right)
    // envExp == 0 → bell envelope (back-compat for 'all' mode)
    const env = line.envExp > 0 ? Math.pow(u, line.envExp) : Math.sin(u * Math.PI);
    return line.cy + Math.sin(phase) * line.amp * amplitude * env;
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
  const dotScan = showDot && primaryLine ? ((t * 0.11) % 1) * samples : 0;
  const dotI0 = Math.floor(dotScan);
  const dotFrac = dotScan - dotI0;
  const dotX = showDot && primaryLine ? (dotScan / samples) * W : 0;
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
            <stop offset="0.12" stopColor={l.color} stopOpacity={l.op * 0.4} />
            <stop offset="0.55" stopColor={l.color} stopOpacity={l.op * 0.85} />
            <stop offset="0.92" stopColor={l.color} stopOpacity={l.op} />
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
          style={{ opacity: synthwave ? 0.7 : 0.4, mixBlendMode: dark ? 'screen' : 'multiply' }}
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
          <circle cx={dotX} cy={dotY} r={synthwave ? 9 : 7} fill={primaryLine.color} opacity={0.22} />
          <circle cx={dotX} cy={dotY} r={synthwave ? 4.2 : 3.4} fill={primaryLine.color} opacity={0.95} />
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
