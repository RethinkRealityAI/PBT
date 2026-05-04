import { useTheme } from '../app/providers/ThemeProvider';

export type GradientBgDir = 'tl' | 'tr' | 'bl' | 'br' | 'center';

export interface GradientBgProps {
  dir?: GradientBgDir;
  intensity?: number;
  /** When set, overrides the cherry-default driver tint (e.g. profile primary). */
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

const POSITIONS: Record<GradientBgDir, [string, string, string]> = {
  tl: ['10% 8%', '88% 18%', '60% 92%'],
  tr: ['85% 12%', '15% 25%', '50% 92%'],
  bl: ['12% 88%', '85% 22%', '55% 8%'],
  br: ['85% 88%', '15% 22%', '50% 8%'],
  center: ['50% 30%', '15% 80%', '85% 80%'],
};

export function GradientBg({
  dir = 'tl',
  intensity = 1,
  primaryColor = null,
  secondaryColor = null,
}: GradientBgProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const positions = POSITIONS[dir] ?? POSITIONS.tl;
  const base = dark ? '#0e0306' : '#ffffff';

  const primary =
    primaryColor || (dark ? 'oklch(0.55 0.24 18)' : 'oklch(0.68 0.22 22)');
  const secondary =
    secondaryColor ||
    primaryColor ||
    (dark ? 'oklch(0.55 0.20 22)' : 'oklch(0.78 0.18 30)');
  const accent = dark ? 'oklch(0.45 0.18 12)' : 'oklch(0.92 0.06 20)';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: base,
      }}
    >
      {dark ? (
        <>
          <Bloom
            position={positions[0]}
            width="120%"
            height="90%"
            color={primary}
            opacity={Math.round(85 * intensity)}
            blur={24}
          />
          <Bloom
            position={positions[1]}
            width="90%"
            height="70%"
            color={secondary}
            opacity={Math.round(38 * intensity)}
            blur={28}
          />
          <Bloom
            position={positions[2]}
            width="100%"
            height="70%"
            color={accent}
            opacity={Math.round(60 * intensity)}
            blur={20}
          />
          <NoiseOverlay />
        </>
      ) : (
        <>
          <Bloom
            position={positions[0]}
            width="110%"
            height="80%"
            color={primary}
            opacity={Math.round(14 * intensity)}
            blur={40}
          />
          <Bloom
            position={positions[2]}
            width="90%"
            height="70%"
            color={secondary}
            opacity={Math.round(8 * intensity)}
            blur={50}
          />
        </>
      )}
    </div>
  );
}

interface BloomProps {
  position: string;
  width: string;
  height: string;
  color: string;
  opacity: number;
  blur: number;
}

function Bloom({ position, width, height, color, opacity, blur }: BloomProps) {
  const [x, y] = position.split(' ');
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        width,
        height,
        left: `calc(${x} - ${parseFloat(width) / 2}%)`,
        top: `calc(${y} - ${parseFloat(height) / 2}%)`,
        borderRadius: '50%',
        background: `radial-gradient(closest-side, color-mix(in oklab, ${color} ${opacity}%, transparent), transparent 70%)`,
        filter: `blur(${blur}px)`,
        transition: 'background 0.6s ease',
      }}
    />
  );
}

function NoiseOverlay() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.18,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      }}
    />
  );
}
