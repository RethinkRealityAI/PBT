import { useEffect, useRef, useState } from 'react';
import { scoreBandColor } from './tokens';

export interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  /**
   * Count the number and sweep the arc up from 0 on mount — the score
   * "reveal" moment on the live scorecard. Off by default so history and
   * list surfaces render instantly. Automatically disabled when the user
   * prefers reduced motion.
   */
  animate?: boolean;
}

const REVEAL_MS = 1100;
const revealEase = (t: number) => 1 - Math.pow(1 - t, 3);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Circular score arc with gradient red fill (or band-tinted).
 */
export function ScoreRing({
  score,
  size = 120,
  strokeWidth = 10,
  label,
  animate = false,
}: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const revealing = animate && !prefersReducedMotion();
  const [shown, setShown] = useState(revealing ? 0 : clamped);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!revealing) {
      setShown(clamped);
      return;
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / REVEAL_MS);
      setShown(Math.round(revealEase(t) * clamped));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [clamped, revealing]);

  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (shown / 100) * c;
  // Band color follows the FINAL score so the ring doesn't flash
  // red→amber→green while counting up.
  const color = scoreBandColor(clamped);

  return (
    <div
      style={{ position: 'relative', width: size, height: size }}
      role="img"
      aria-label={`Score ${clamped} out of 100${label ? ` — ${label}` : ''}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.12}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: '50% 50%',
            transition: revealing ? undefined : 'stroke-dashoffset 1s ease',
          }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontFamily: 'var(--pbt-font-mono)',
          fontWeight: 700,
        }}
      >
        <span style={{ fontSize: size * 0.32, lineHeight: 1 }}>{shown}</span>
        {label && (
          <span
            style={{
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--pbt-text-muted)',
              marginTop: 4,
            }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
