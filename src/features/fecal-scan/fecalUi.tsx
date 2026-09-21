import type { CSSProperties, ReactNode } from 'react';
import { COLORS } from '../../design-system/tokens';
import type { CatalogKey } from '../../i18n/catalog';
import type { FecalBand } from '../../shared/ai/fecalScan';

/**
 * Small shared primitives for the Fecal Scan surfaces.
 *
 * Deliberately tiny: everything structural comes from `<Glass>` and the
 * design tokens. These only encode the two things every card here repeats —
 * the Geist Mono eyebrow and the band-tinted surface.
 */

/** Chart band → score token. The chart decides; the model never does. */
export const BAND_COLOR: Record<FecalBand, string> = {
  tooHard: COLORS.score.poor,
  tooSoft: COLORS.score.poor,
  acceptable: COLORS.score.ok,
  optimal: COLORS.score.good,
  normal: COLORS.score.good,
};

/** Chart band → catalog key for its label. */
export const BAND_KEY: Record<FecalBand, CatalogKey> = {
  tooHard: 'fecalScan.band.tooHard',
  tooSoft: 'fecalScan.band.tooSoft',
  acceptable: 'fecalScan.band.acceptable',
  optimal: 'fecalScan.band.optimal',
  normal: 'fecalScan.band.normal',
};

/**
 * Colour-tinted surface. Light mode blends the accent into white (pale
 * pastel under dark ink); dark mode blends it into a near-transparent dark
 * base so near-white `--pbt-text` still reads on top.
 * Mirrors `PetVisionCard#tintedChip` so the two AI screens feel like one app.
 */
export function tinted(color: string, dark: boolean): CSSProperties {
  return {
    background: dark
      ? `color-mix(in oklab, ${color} 20%, rgba(255,255,255,0.04))`
      : `color-mix(in oklab, ${color} 12%, rgba(255,255,255,0.4))`,
    border: `1px solid color-mix(in oklab, ${color} ${dark ? 38 : 30}%, transparent)`,
  };
}

/** Mono eyebrow — all-caps, 0.18em tracking, per the house convention. */
export function Eyebrow({
  children,
  color,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: color ?? 'var(--pbt-text-muted)',
        fontWeight: 700,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Small mono pill used for provenance / score chips. */
export function MonoPill({
  children,
  color,
  dark,
  style,
}: {
  children: ReactNode;
  color: string;
  dark: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 9999,
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        color: 'var(--pbt-text)',
        ...tinted(color, dark),
        ...style,
      }}
    >
      {children}
    </span>
  );
}
