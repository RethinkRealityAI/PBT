import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { useTheme } from '../app/providers/ThemeProvider';
import { cn } from '../lib/classNames';
import { RADII } from './tokens';

export interface GlassProps {
  children: ReactNode;
  blur?: number;
  radius?: number;
  /** 0-1 background tint over the canvas. Defaults: ~0.14 light, 0.22 dark. */
  tint?: number;
  border?: boolean;
  padding?: number | string;
  /** When set, applies a colored drop shadow (driver glow). Sparingly. */
  glow?: string | null;
  /** 135deg linear-gradient highlight overlay. Default true. */
  shine?: boolean;
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
  className,
  style,
  onClick,
  role,
  ariaLabel,
}: GlassProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const t = tint ?? (dark ? 0.20 : 0.04);
  /*
   * Light: cap blur at 18px — GradientBg blooms already have filter:blur(24-32px);
   * stacking another high blur washes colour to white. Lower blur = more signal.
   * Dark: floor at 32px for the deep-space frosted look.
   */
  const effectiveBlur = dark ? Math.max(blur, 32) : Math.min(blur, 22);

  const shadow = glow
    ? dark
      ? `0 1px 0 rgba(255,255,255,0.08) inset, 0 10px 30px -12px color-mix(in oklab, ${glow} 55%, black), 0 2px 6px -2px rgba(0,0,0,0.25)`
      : `var(--pbt-shadow-glass), 0 22px 52px -18px color-mix(in oklab, ${glow} 38%, rgba(60,20,15,0.08)), 0 6px 18px -8px color-mix(in oklab, ${glow} 28%, rgba(60,20,15,0.06))`
    : 'var(--pbt-shadow-glass)';

  /**
   * Light: low-opacity stops so backdrop-blur + GradientBg blooms show through
   * as true liquid glass. First stop is the specular peak; mid/bottom let the
   * gradient colours bleed through vividly.
   */
  const panelBackground = dark
    ? `rgba(28,12,14,${t})`
    : `linear-gradient(165deg,
        rgba(255,255,255,${(0.14 + t * 0.4).toFixed(2)}) 0%,
        rgba(255,255,255,${(0.04 + t * 0.5).toFixed(2)}) 38%,
        rgba(255,255,255,${(0.06 + t * 0.4).toFixed(2)}) 100%)`;

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
        backdropFilter: dark
          ? `blur(${effectiveBlur}px) saturate(220%)`
          : `blur(${effectiveBlur}px) saturate(260%) brightness(1.03)`,
        WebkitBackdropFilter: dark
          ? `blur(${effectiveBlur}px) saturate(220%)`
          : `blur(${effectiveBlur}px) saturate(260%) brightness(1.03)`,
        background: panelBackground,
        boxShadow: shadow,
        border: border ? `1px solid var(--pbt-glass-border)` : 'none',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        ...style,
      }}
    >
      {shine && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius,
            background: dark
              ? 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 32%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.05) 100%)'
              : 'linear-gradient(135deg, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.22) 20%, rgba(255,255,255,0.01) 48%, rgba(255,255,255,0.04) 70%, rgba(255,255,255,0.38) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
