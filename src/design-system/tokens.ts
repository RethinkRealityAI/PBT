/**
 * PBT design tokens — single source of truth.
 * Values are in OKLCH (perceptual color space) per the design handoff.
 */

export const COLORS = {
  brand: {
    cherry: 'oklch(0.62 0.22 22)',
    crimson: 'oklch(0.55 0.24 18)',
    coral: 'oklch(0.74 0.18 28)',
    blush: 'oklch(0.94 0.05 20)',
    cream: 'oklch(0.985 0.012 60)',
    ink: 'oklch(0.22 0.04 20)',
    mute: 'oklch(0.50 0.04 20)',
  },
  surface: {
    canvasLight: '#ffffff',
    canvasOuterLight: '#fff7f5',
    canvasDark: '#0e0306',
    canvasOuterDark: '#070203',
    glassLight: 'rgba(255,255,255,0.18)',
    glassDark: 'rgba(28,12,14,0.22)',
    glassBorderLight: 'rgba(255,255,255,0.7)',
    glassBorderDark: 'rgba(255,255,255,0.14)',
  },
  score: {
    good: 'oklch(0.55 0.18 145)',
    ok: 'oklch(0.65 0.18 60)',
    poor: 'oklch(0.55 0.24 18)',
  },
} as const;

export const DRIVER_KEYS = [
  'Activator',
  'Energizer',
  'Analyzer',
  'Harmonizer',
] as const;
export type DriverKey = (typeof DRIVER_KEYS)[number];

export interface DriverColors {
  primary: string;
  accent: string;
  soft: string;
  wave: string;
}

export const DRIVER_COLORS: Record<DriverKey, DriverColors> = {
  Activator: {
    primary: 'oklch(0.62 0.22 25)',
    accent: 'oklch(0.52 0.24 22)',
    soft: 'oklch(0.92 0.06 22)',
    wave: 'oklch(0.62 0.22 22)',
  },
  Energizer: {
    primary: 'oklch(0.85 0.16 95)',
    accent: 'oklch(0.65 0.16 80)',
    soft: 'oklch(0.96 0.08 95)',
    wave: 'oklch(0.70 0.18 70)',
  },
  Analyzer: {
    primary: 'oklch(0.72 0.14 235)',
    accent: 'oklch(0.55 0.18 245)',
    soft: 'oklch(0.94 0.05 235)',
    wave: 'oklch(0.62 0.16 245)',
  },
  Harmonizer: {
    primary: 'oklch(0.70 0.18 145)',
    accent: 'oklch(0.55 0.18 145)',
    soft: 'oklch(0.94 0.06 145)',
    wave: 'oklch(0.60 0.16 145)',
  },
};

export const RADII = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  hero: 28,
  phone: 32,
  pill: 9999,
} as const;

export const BLURS = {
  compact: 24,
  medium: 28,
  heavy: 36,
  page: 40,
} as const;

export const SPACING = [
  4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40,
] as const;

/**
 * Score band → color token resolver.
 * Bands: good ≥85, ok 70-84, poor <70.
 */
export function scoreBand(score: number): 'good' | 'ok' | 'poor' {
  if (score >= 85) return 'good';
  if (score >= 70) return 'ok';
  return 'poor';
}

export function scoreBandColor(score: number): string {
  return COLORS.score[scoreBand(score)];
}
