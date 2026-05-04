import { scoreBandColor } from './tokens';

export interface ScoreChipProps {
  score: number;
  size?: number;
}

/**
 * 44×44 circle (default) showing a score number, color-coded by band.
 */
export function ScoreChip({ score, size = 44 }: ScoreChipProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const color = scoreBandColor(clamped);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `color-mix(in oklab, ${color} 18%, transparent)`,
        border: `1.5px solid ${color}`,
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--pbt-font-mono)',
        fontWeight: 700,
        fontSize: size * 0.32,
      }}
      role="img"
      aria-label={`Score ${clamped}`}
    >
      {clamped}
    </div>
  );
}
