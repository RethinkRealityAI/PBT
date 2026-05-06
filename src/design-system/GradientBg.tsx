import { useTheme } from '../app/providers/ThemeProvider';

export type GradientBgDir = 'tl' | 'tr' | 'bl' | 'br' | 'center';

export interface GradientBgProps {
  dir?: GradientBgDir;
  intensity?: number;
  /**
   * Driver colors for the top-two bloom positions (upper-left / upper-right orbs).
   * In multicolor mode these override the palette for those two positions only,
   * keeping the bottom two as soft rainbow — giving "PBT-driver top orbs + rainbow base".
   */
  primaryColor?: string | null;
  secondaryColor?: string | null;
  /**
   * When true, uses the soft 4-driver rainbow wash for the bottom blooms.
   * If primaryColor / secondaryColor are also provided the top two blooms
   * use driver colors so the top "orbs" remain brand-driven.
   */
  multicolor?: boolean;
}

const POSITIONS: Record<GradientBgDir, [string, string, string, string]> = {
  tl:     ['10% 8%',  '88% 18%', '18% 88%', '78% 82%'],
  tr:     ['85% 12%', '15% 25%', '72% 86%', '22% 78%'],
  bl:     ['12% 88%', '85% 22%', '58% 10%', '30% 55%'],
  br:     ['85% 88%', '15% 22%', '50%  8%', '72% 48%'],
  center: ['50% 30%', '15% 80%', '85% 80%', '50% 58%'],
};

/**
 * Bottom two bloom palette — neutral warm+cool, no green.
 * Bottom-left: soft periwinkle-blue (Analyzer adjacent).
 * Bottom-right: soft coral (Activator adjacent).
 * Neither is driver-specific so the canvas feels neutral when scrolling.
 */
const MULTI_LIGHT = [
  'oklch(0.68 0.14 245)',  // (top-left fallback)  Analyzer blue
  'oklch(0.76 0.12 70)',   // (top-right fallback) Energizer amber
  'oklch(0.74 0.10 230)',  // bottom-left — soft periwinkle/blue (was green)
  'oklch(0.74 0.12 22)',   // bottom-right — soft coral
] as const;

const MULTI_DARK = [
  'oklch(0.38 0.12 245)',  // (top-left fallback)  Analyzer blue
  'oklch(0.42 0.10 70)',   // (top-right fallback) Energizer amber
  'oklch(0.38 0.09 230)',  // bottom-left — muted blue (was green)
  'oklch(0.40 0.11 22)',   // bottom-right — muted coral
] as const;

export function GradientBg({
  dir = 'tl',
  intensity = 1,
  primaryColor = null,
  secondaryColor = null,
  multicolor = false,
}: GradientBgProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const positions = POSITIONS[dir] ?? POSITIONS.tl;
  /** Dark base: slightly cooler than the old #0e0306 so the canvas isn't inherently warm-red. */
  const base = dark ? '#090a0d' : '#ffffff';

  if (multicolor) {
    const palette = dark ? MULTI_DARK : MULTI_LIGHT;
    /**
     * Top two blooms: use driver colors when provided (user-visible "orbs"),
     * falling back to palette when no profile is set yet.
     * Bottom two blooms: always rainbow palette for the multicolor base wash.
     */
    const top1 = primaryColor  || palette[0];
    const top2 = secondaryColor || primaryColor || palette[1];

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          minHeight: '100%',
          overflow: 'hidden',
          background: base,
        }}
      >
        {dark ? (
          <>
            {/*
             * Driver washes: top-left (primary), faint upper-mid-right whisper,
             * soft bottom-centre secondary (low intensity).
             */}
            {/* Top-left primary bloom — larger, slightly lower, +5% stronger */}
            <Bloom position="10% 14%" width="118%" height="92%" color={top1} opacity={48} blur={34} />
            {/* Middle-right whisper — subtle depth accent */}
            <Bloom position="82% 36%" width="72%" height="52%" color={top1} opacity={11} blur={52} />
            {/* Bottom bloom — left-shifted bottom-center */}
            <Bloom position="38% 92%" width="84%" height="56%" color={top2} opacity={16} blur={42} />
            <NoiseOverlay />
          </>
        ) : (
          <>
            {/* Top-left primary bloom — larger, slightly lower, +5% stronger */}
            <Bloom position="10% 14%" width="128%" height="96%" color={top1} opacity={Math.round(56 * intensity)} blur={32} />
            {/* Middle-right whisper — subtle depth accent */}
            <Bloom position="82% 36%" width="78%" height="56%" color={top1} opacity={Math.round(13 * intensity)} blur={50} />
            {/* Bottom bloom — left-shifted bottom-center */}
            <Bloom position="38% 92%" width="88%" height="60%" color={top2} opacity={Math.round(22 * intensity)} blur={44} />
            <NoiseOverlay light />
          </>
        )}
      </div>
    );
  }

  /* ─── Driver-specific mode (hero / result screens) ─────────────────────── */
  const primary   = primaryColor  || (dark ? 'oklch(0.50 0.20 18)' : 'oklch(0.65 0.20 22)');
  const secondary = secondaryColor || primaryColor || (dark ? 'oklch(0.50 0.18 22)' : 'oklch(0.75 0.16 30)');
  /** Accent stays within the driver family — no contrasting warm-red blob. */
  const accent    = dark
    ? `color-mix(in oklab, ${primary} 60%, oklch(0.30 0.06 220))`
    : `color-mix(in oklab, ${primary} 35%, oklch(0.92 0.04 80))`;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        minHeight: '100%',
        overflow: 'hidden',
        background: base,
      }}
    >
      {dark ? (
        <>
          <Bloom position={positions[0]} width="112%" height="86%" color={primary}   opacity={Math.round(48 * intensity)} blur={30} />
          <Bloom position={positions[1]} width="86%"  height="66%" color={secondary} opacity={Math.round(24 * intensity)} blur={34} />
          <Bloom position={positions[2]} width="95%"  height="66%" color={accent}    opacity={Math.round(32 * intensity)} blur={26} />
          <NoiseOverlay />
        </>
      ) : (
        <>
          <Bloom position={positions[0]} width="122%" height="90%" color={primary}   opacity={Math.round(44 * intensity)} blur={36} />
          <Bloom position={positions[1]} width="98%"  height="76%" color={secondary} opacity={Math.round(30 * intensity)} blur={40} />
          <Bloom position={positions[2]} width="102%" height="74%" color={accent}    opacity={Math.round(26 * intensity)} blur={30} />
          <NoiseOverlay light />
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
  const [x, y] = position.trim().split(/\s+/);
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        width,
        height,
        left: `calc(${x} - ${parseFloat(width) / 2}%)`,
        top:  `calc(${y} - ${parseFloat(height) / 2}%)`,
        borderRadius: '50%',
        background: `radial-gradient(closest-side, color-mix(in oklab, ${color} ${opacity}%, transparent), transparent 70%)`,
        filter: `blur(${blur}px)`,
        transition: 'background 0.6s ease',
      }}
    />
  );
}

function NoiseOverlay({ light = false }: { light?: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        opacity: light ? 0.05 : 0.15,
        mixBlendMode: light ? 'multiply' : 'overlay',
        pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      }}
    />
  );
}
