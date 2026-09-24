import type { CSSProperties, ReactNode } from 'react';
import { COLORS } from '../../design-system/tokens';
import { useTheme } from '../../app/providers/ThemeProvider';
import type { CatalogKey } from '../../i18n/catalog';
import type { FecalBand } from '../../shared/ai/fecalScan';

/**
 * Small shared primitives for the Fecal Scan surfaces.
 *
 * Deliberately tiny: everything structural comes from `<Glass>` and the
 * design tokens. These encode what every card here repeats — the scoped
 * neutral palette, the Geist Mono eyebrow, the band chip and the coarse
 * three-step meter.
 */

/**
 * Scoped neutral text palette for the Fecal Scan screen ONLY.
 *
 * The app's global ink is deliberately warm (`--pbt-ink: oklch(0.22 0.04 20)`,
 * `--pbt-mute: oklch(0.50 0.04 20)`). Everywhere else that reads as a warm
 * grey; next to photographs of stool the same hue reads as BROWN, so every
 * eyebrow, body line and secondary button on this screen looked brown. Here
 * the text is a near-neutral, faintly cool grey instead, and colour is left
 * to the user's ECHO driver accent.
 *
 * The global tokens are untouched (that is an app-wide brand decision). The
 * values are applied on a `display: contents` wrapper, so layout is unchanged
 * and the custom properties still inherit through the DOM.
 *
 * Contrast (WCAG): light text ≈ 16:1 and muted ≈ 5.3:1 on white; dark text
 * ≈ 18:1 and muted ≈ 8.9:1 on the dark canvas — body copy clears 4.5:1 on
 * either theme even over the translucent glass.
 *
 * `--pbt-ink` / `--pbt-mute` are overridden alongside `--pbt-text*` because
 * `--pbt-text` is resolved at `:root` (overriding `--pbt-ink` alone would not
 * reach it) and some primitives (e.g. `Segmented`) read `--pbt-ink` directly.
 * The `--fecal-*` values are the neutral surfaces used inside the cards.
 */
export const FECAL_NEUTRAL_PALETTE = {
  light: {
    '--pbt-ink': 'oklch(0.21 0.006 260)',
    '--pbt-mute': 'oklch(0.50 0.012 260)',
    '--pbt-text': 'oklch(0.21 0.006 260)',
    '--pbt-text-muted': 'oklch(0.50 0.012 260)',
    /** Hairline between rows — the global glass border is white-on-white here. */
    '--fecal-hairline': 'oklch(0.21 0.006 260 / 0.09)',
    /** Nested neutral sub-panel (chips, notes, details) on top of a Glass card. */
    '--fecal-fill': 'rgba(255, 255, 255, 0.62)',
    '--fecal-fill-border': 'oklch(0.21 0.006 260 / 0.08)',
    /** Unfilled meter segments / empty tracks. */
    '--fecal-track': 'oklch(0.21 0.006 260 / 0.10)',
    /**
     * Driver colour for SMALL marks (icons, link underlines). On light
     * surfaces the darker `accent` stop — the light primaries (Energizer
     * yellow, Harmonizer green) wash out at 14–16px.
     */
    '--fecal-accent-ink': 'var(--pbt-driver-accent)',
    /** Error text — the app's standard `--pbt-score-poor`. */
    '--fecal-error-ink': 'var(--pbt-score-poor)',
  },
  dark: {
    '--pbt-ink': 'oklch(0.97 0.004 260)',
    '--pbt-mute': 'oklch(0.74 0.012 260)',
    '--pbt-text': 'oklch(0.97 0.004 260)',
    '--pbt-text-muted': 'oklch(0.74 0.012 260)',
    '--fecal-hairline': 'rgba(255, 255, 255, 0.09)',
    '--fecal-fill': 'rgba(255, 255, 255, 0.055)',
    '--fecal-fill-border': 'rgba(255, 255, 255, 0.10)',
    '--fecal-track': 'rgba(255, 255, 255, 0.13)',
    '--fecal-accent-ink': 'var(--pbt-driver-primary)',
    /**
     * `--pbt-score-poor` is ~3.9:1 on the dark canvas; lifted toward white
     * it clears 4.5:1 while staying the same red.
     */
    '--fecal-error-ink': 'color-mix(in oklab, var(--pbt-score-poor) 68%, white)',
  },
} as const;

/** Applies `FECAL_NEUTRAL_PALETTE` to everything inside it, layout-neutral. */
export function FecalPalette({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const vars = FECAL_NEUTRAL_PALETTE[resolvedTheme === 'dark' ? 'dark' : 'light'];
  return (
    <div
      data-fecal-palette
      style={{
        display: 'contents',
        ...(vars as unknown as CSSProperties),
        // `color` must be re-declared here: the app rail sets
        // `color: var(--pbt-text)`, which resolves (warm) at the rail and is
        // inherited as a computed value — every currentColor icon below
        // (TopBar back arrow, theme toggle) would otherwise stay warm.
        color: 'var(--pbt-text)',
      }}
    >
      {children}
    </div>
  );
}

/** The driver accent as a gradient — primary → accent, like the solid pills. */
export const DRIVER_GRADIENT =
  'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))';

/** Chart band → semantic dot colour. The chart decides; the model never does. */
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

/** Chart band → one plain-language line saying what the band means. */
export const BAND_MEANING_KEY: Record<FecalBand, CatalogKey> = {
  tooHard: 'fecalScan.band.meaning.tooHard',
  tooSoft: 'fecalScan.band.meaning.tooSoft',
  acceptable: 'fecalScan.band.meaning.acceptable',
  optimal: 'fecalScan.band.meaning.optimal',
  normal: 'fecalScan.band.meaning.normal',
};

/** Neutral nested surface — a sub-panel inside a Glass card. */
export const subtleSurface: CSSProperties = {
  background: 'var(--fecal-fill)',
  border: '1px solid var(--fecal-fill-border)',
};

/**
 * Mono eyebrow — all-caps, 0.18em tracking, per the house convention.
 *
 * `accent` marks a SECTION eyebrow: a short driver-coloured rule sits before
 * neutral text. The text itself stays neutral on purpose — the driver
 * primaries are mid-lightness (Harmonizer green, Analyzer blue, Energizer
 * yellow), so as 10px text on a light surface they fall well under 4.5:1;
 * as a graphic mark they carry the colour without costing legibility.
 */
export function Eyebrow({
  children,
  accent = false,
  color,
  style,
  as: Tag = 'div',
  id,
}: {
  children: ReactNode;
  accent?: boolean;
  color?: string;
  style?: CSSProperties;
  as?: 'div' | 'h2' | 'h3' | 'span';
  id?: string;
}) {
  return (
    <Tag
      id={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        margin: 0,
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 10,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: color ?? (accent ? 'var(--pbt-text)' : 'var(--pbt-text-muted)'),
        fontWeight: 700,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {accent && (
        <span
          aria-hidden
          style={{
            width: 14,
            height: 3,
            flexShrink: 0,
            borderRadius: 9999,
            background:
              'linear-gradient(90deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
          }}
        />
      )}
      <span style={{ minWidth: 0 }}>{children}</span>
    </Tag>
  );
}

/**
 * Band chip — a neutral pill with a small solid dot in the band's semantic
 * colour. The LABEL carries the meaning (colour-blind safe); the dot only
 * reinforces it. No tinted surface: band colours washed into a background at
 * low opacity turned tan/brown next to the photos.
 */
export function BandChip({
  band,
  label,
  size = 'md',
}: {
  band: FecalBand;
  label: string;
  size?: 'sm' | 'md';
}) {
  const sm = size === 'sm';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: sm ? 6 : 7,
        padding: sm ? '3px 9px 3px 8px' : '5px 12px 5px 10px',
        borderRadius: 9999,
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: sm ? 9 : 10,
        fontWeight: 700,
        letterSpacing: '0.13em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        color: 'var(--pbt-text)',
        ...subtleSurface,
      }}
    >
      <span
        aria-hidden
        style={{
          width: sm ? 6 : 7,
          height: sm ? 6 : 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: BAND_COLOR[band] ?? COLORS.score.ok,
        }}
      />
      {label}
    </span>
  );
}

/** Small neutral mono pill (e.g. "Score 2" on a passage). */
export function MonoPill({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 9px',
        borderRadius: 9999,
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        color: 'var(--pbt-text)',
        ...subtleSurface,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export type Level = 1 | 2 | 3;

/**
 * Coarse three-step meter in the driver accent. Used for the model's
 * confidence and for passage relevance: both are estimates, and a precise
 * "86%" reads as measured accuracy, which neither is.
 */
export function LevelMeter({ level }: { level: Level }) {
  return (
    <span aria-hidden style={{ display: 'inline-flex', gap: 3, flexShrink: 0 }}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          data-filled={i <= level ? 'true' : 'false'}
          style={{
            width: 16,
            height: 5,
            borderRadius: 9999,
            background:
              i <= level
                ? 'linear-gradient(90deg, var(--pbt-driver-primary), var(--pbt-driver-accent))'
                : 'var(--fecal-track)',
          }}
        />
      ))}
    </span>
  );
}

/** Model self-estimate (0–1) → coarse level. ≥0.75 high, ≥0.5 moderate. */
export function confidenceLevel(confidence: number): Level {
  if (confidence >= 0.75) return 3;
  if (confidence >= 0.5) return 2;
  return 1;
}

/** Cosine similarity → coarse match level. ≥0.75 strong, ≥0.6 good. */
export function relevanceLevel(similarity: number): Level {
  if (similarity >= 0.75) return 3;
  if (similarity >= 0.6) return 2;
  return 1;
}

/** The standard app error treatment (see `ReportModal`), dark-mode text lifted for AA. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        padding: '11px 13px',
        borderRadius: 12,
        fontSize: 13,
        lineHeight: 1.55,
        fontWeight: 600,
        color: 'var(--fecal-error-ink, var(--pbt-score-poor))',
        background: 'color-mix(in oklab, var(--pbt-score-poor) 14%, transparent)',
      }}
    >
      {children}
    </div>
  );
}
