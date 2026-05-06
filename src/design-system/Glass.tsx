import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { useTheme } from '../app/providers/ThemeProvider';
import { cn } from '../lib/classNames';
import { RADII } from './tokens';

export interface GlassProps {
  children: ReactNode;
  blur?: number;
  radius?: number;
  /**
   * 0-1 fill opacity for the panel base.
   * Defaults: 0.20 light (very translucent), 0.44 dark (deep glass).
   * Lower = more colour bleed-through from the background.
   */
  tint?: number;
  border?: boolean;
  padding?: number | string;
  /** When set, applies a colored drop shadow (driver glow). Sparingly. */
  glow?: string | null;
  /** Shine + prismatic layers. Default true. */
  shine?: boolean;
  /**
   * Optional `saturate()` percentage for backdrop-filter.
   * Defaults: 320% light / 200% dark so ambient GradientBg hues read through cards.
   * Use lower values (~115–150%) on overlays/modals — otherwise blooms/orbs behind the glass read artificially neon.
   */
  backdropSaturatePct?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLDivElement>;
  role?: string;
  ariaLabel?: string;
}

export function Glass({
  children,
  blur = 36,
  radius = RADII.hero,
  tint,
  border = true,
  padding = 20,
  glow = null,
  shine = true,
  backdropSaturatePct,
  className,
  style,
  onClick,
  role,
  ariaLabel,
}: GlassProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  /**
   * iOS liquid-glass base fill:
   *   Light — 18% warm-neutral white. Pure white at this opacity reads distinctly
   *     as frosted glass: visible as a surface, still transparent enough that the
   *     GradientBg colour and content below show through clearly.
   *     We rely on backdrop saturate(320%) to tint it with ambient hues — no blue fill.
   *   Dark  — 44% neutral dark.
   * Explicit `tint` overrides (e.g. hero card, quiz answers, modals).
   */
  const t = tint ?? (dark ? 0.44 : 0.18);

  /**
   * Blur kept moderate: lower blur → less diffusion → more background colour survives
   * to the Glass surface so saturate() has real saturation to amplify.
   */
  const effectiveBlur = dark ? Math.max(blur, 32) : Math.min(blur, 22);

  const satLight = backdropSaturatePct ?? 320;
  const satDark = backdropSaturatePct ?? 200;
  const backdropLight = `blur(${effectiveBlur}px) saturate(${satLight}%) brightness(1.02)`;
  const backdropDark = `blur(${effectiveBlur}px) saturate(${satDark}%) brightness(0.95)`;

  /**
   * Shadow layers:
   *   var(--pbt-shadow-glass) now includes 4-axis inset rims (see tokens.css).
   *   glow variant adds a subtle colored halo on top.
   */
  const shadow = glow
    ? dark
      ? [
          '0 1px 0 rgba(255,255,255,0.12) inset',
          '1px 0 0 rgba(255,255,255,0.07) inset',
          '-1px 0 0 rgba(255,255,255,0.03) inset',
          '0 -1px 0 rgba(255,255,255,0.05) inset',
          `0 12px 32px -20px color-mix(in oklab, ${glow} 30%, rgba(0,0,0,0.60))`,
          '0 2px 10px -4px rgba(0,0,0,0.36)',
        ].join(', ')
      : [
          'var(--pbt-shadow-glass)',
          `0 16px 42px -22px color-mix(in oklab, ${glow} 18%, rgba(18,18,22,0.06))`,
          `0 6px 18px -12px color-mix(in oklab, ${glow} 10%, rgba(18,18,22,0.04))`,
        ].join(', ')
    : 'var(--pbt-shadow-glass)';

  /**
   * Panel fill:
   *   Light — pure white at tint opacity: backdrop-filter saturate() provides the
   *     colour, pure white ensures no artificial blue/cool cast on neutral backgrounds.
   *   Dark  — neutral near-black.
   */
  const panelBackground = dark
    ? `rgba(10, 10, 14, ${t.toFixed(2)})`
    : `rgba(255, 255, 255, ${t.toFixed(2)})`;

  return (
    <div
      role={role ?? (onClick ? 'button' : undefined)}
      aria-label={ariaLabel}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      className={cn('relative', className)}
      style={{
        borderRadius: radius,
        padding,
        backdropFilter: dark ? backdropDark : backdropLight,
        WebkitBackdropFilter: dark ? backdropDark : backdropLight,
        background: panelBackground,
        boxShadow: shadow,
        border: border ? `1px solid var(--pbt-glass-border)` : 'none',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        ...style,
      }}
    >
      {shine && (
        <>
          {/**
           * Layer 1 — Diagonal specular gradient.
           * Mimics the top-left catchlight of a thick glass slab:
           *   • Light: blazing top-left (0.92), rapid fade to near-invisible centre,
           *     subtle bottom-right corner glint (0.55) — "lit from top-left" illusion.
           *   • Dark: dimmer but same geometry.
           */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: radius,
              background: dark
                ? 'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.04) 22%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.05) 82%, rgba(255,255,255,0.10) 100%)'
                : 'linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.55) 8%, rgba(255,255,255,0.10) 28%, rgba(255,255,255,0.02) 52%, rgba(255,255,255,0.08) 74%, rgba(255,255,255,0.55) 100%)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
          {/**
           * Layer 2 — Prismatic bottom rim.
           * Thin iridescent fringe along the bottom edge — mimics light dispersion
           * through real glass (visible in the reference image as the rainbow stripe).
           * Kept intentionally subtle: it's a detail, not a rainbow flag.
           */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 0,
              left: '6%',
              right: '6%',
              height: 3,
              borderBottomLeftRadius: radius,
              borderBottomRightRadius: radius,
              background: dark
                ? 'linear-gradient(90deg, rgba(255,80,80,0.22) 0%, rgba(255,200,50,0.18) 20%, rgba(80,220,110,0.16) 38%, rgba(80,140,255,0.22) 56%, rgba(180,80,255,0.18) 76%, rgba(255,80,140,0.22) 100%)'
                : 'linear-gradient(90deg, rgba(255,80,80,0.45) 0%, rgba(255,200,50,0.40) 20%, rgba(80,220,110,0.35) 38%, rgba(80,140,255,0.45) 56%, rgba(180,80,255,0.40) 76%, rgba(255,80,140,0.45) 100%)',
              filter: 'blur(1.5px)',
              opacity: dark ? 0.55 : 0,
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
        </>
      )}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
