// PBT Admin — design tokens.
// Driver palette mirrors the main app (src/design-system/tokens.ts)
// so chips and accents read identically across surfaces.

export type DriverKey = 'Activator' | 'Energizer' | 'Analyzer' | 'Harmonizer';

export interface DriverToken {
  key: DriverKey;
  glyph: string;
  color: string;
  soft: string;
  wave: string;
}

export const DRIVERS: Record<DriverKey, DriverToken> = {
  Activator:  { key: 'Activator',  glyph: 'A', color: 'oklch(0.55 0.24 22)',  soft: 'oklch(0.92 0.06 22)',  wave: 'oklch(0.66 0.22 22)' },
  Energizer:  { key: 'Energizer',  glyph: 'E', color: 'oklch(0.72 0.18 70)',  soft: 'oklch(0.94 0.06 70)',  wave: 'oklch(0.78 0.18 70)' },
  Analyzer:   { key: 'Analyzer',   glyph: 'A', color: 'oklch(0.55 0.16 250)', soft: 'oklch(0.93 0.04 250)', wave: 'oklch(0.65 0.16 250)' },
  Harmonizer: { key: 'Harmonizer', glyph: 'H', color: 'oklch(0.62 0.14 155)', soft: 'oklch(0.93 0.05 155)', wave: 'oklch(0.72 0.14 155)' },
};

export const DRIVER_KEYS: DriverKey[] = ['Activator', 'Energizer', 'Analyzer', 'Harmonizer'];

export const COLOR = {
  ink: 'oklch(0.18 0.04 20)',
  inkSoft: 'oklch(0.40 0.04 20)',
  inkMute: 'oklch(0.55 0.04 20)',
  surface: '#fcf9f7',
  border: 'rgba(60,20,15,0.08)',
  borderSoft: 'rgba(60,20,15,0.04)',
  brand: 'oklch(0.55 0.24 22)',
  brandSoft: 'oklch(0.92 0.06 22)',
  success: 'oklch(0.55 0.16 145)',
  successSoft: 'oklch(0.94 0.06 145)',
  warn: 'oklch(0.62 0.18 70)',
  warnSoft: 'oklch(0.95 0.07 70)',
  danger: 'oklch(0.58 0.20 25)',
  dangerSoft: 'oklch(0.93 0.07 25)',
  info: 'oklch(0.55 0.16 250)',
  infoSoft: 'oklch(0.93 0.04 250)',
} as const;

export const RADIUS = { sm: 8, md: 12, lg: 16, xl: 20, hero: 24 } as const;
