import { DRIVER_COLORS, type DriverKey } from './tokens';

export interface OrbProps {
  size?: number;
  pulse?: boolean;
  intensity?: number;
  /** When set, orb hues follow the user’s ECHO driver (home / profile contexts). */
  driver?: DriverKey;
}

export function Orb({ size = 120, pulse = true, intensity = 1, driver }: OrbProps) {
  const dc = driver ? DRIVER_COLORS[driver] : null;
  const halo = dc?.primary ?? 'oklch(0.65 0.24 22)';
  const sphereGradient = dc
    ? `radial-gradient(circle at 30% 28%, #fff 0%, ${dc.soft} 18%, ${dc.primary} 52%, ${dc.accent} 100%)`
    : 'radial-gradient(circle at 30% 28%, #fff 0%, oklch(0.92 0.08 22) 18%, oklch(0.70 0.20 22) 55%, oklch(0.48 0.22 18) 100%)';
  const outerGlow = dc
    ? `0 8px 24px -6px color-mix(in oklab, ${dc.primary} 50%, transparent)`
    : '0 8px 24px -6px oklch(0.55 0.22 18 / 0.5)';

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-hidden
    >
      <div
        style={{
          position: 'absolute',
          inset: -size * 0.3,
          borderRadius: '50%',
          background: `radial-gradient(closest-side, color-mix(in oklab, ${halo} ${
            0.5 * intensity
          }, transparent), transparent 70%)`,
          filter: 'blur(8px)',
          animation: pulse ? 'pbtPulse 3.2s ease-in-out infinite' : 'none',
        }}
      />
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: sphereGradient,
          boxShadow: [
            'inset -6px -10px 20px color-mix(in oklab, rgba(40,20,24,0.55), transparent)',
            'inset 6px 8px 18px rgba(255,255,255,0.6)',
            outerGlow,
          ].join(', '),
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '8%',
            left: '14%',
            width: '38%',
            height: '28%',
            borderRadius: '50%',
            background:
              'radial-gradient(closest-side, rgba(255,255,255,0.85), transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '20%',
            right: '22%',
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.9)',
          }}
        />
      </div>
    </div>
  );
}
