import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { useTheme } from '../app/providers/ThemeProvider';
import { cn } from '../lib/classNames';

export interface GlassProps {
  children: ReactNode;
  blur?: number;
  radius?: number;
  /** 0–1 background tint over the canvas. Defaults: 0.18 light, 0.22 dark. */
  tint?: number;
  border?: boolean;
  padding?: number | string;
  /** When set, applies a colored drop shadow (driver glow). Sparingly. */
  glow?: string | null;
  /** 135° linear-gradient highlight overlay. Default true. */
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
  radius = 28,
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
  const t = tint ?? (dark ? 0.22 : 0.18);

  const shadow = glow
    ? dark
      ? `0 1px 0 rgba(255,255,255,0.08) inset, 0 10px 30px -12px color-mix(in oklab, ${glow} 55%, black), 0 2px 6px -2px rgba(0,0,0,0.25)`
      : `0 1px 0 rgba(255,255,255,0.95) inset, 0 -1px 0 rgba(255,255,255,0.5) inset, 0 14px 36px -14px color-mix(in oklab, ${glow} 35%, transparent), 0 1px 3px -1px rgba(60,20,15,0.10)`
    : dark
      ? `0 1px 0 rgba(255,255,255,0.08) inset, 0 -1px 0 rgba(255,255,255,0.03) inset, 0 8px 24px -10px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.25)`
      : `0 1px 0 rgba(255,255,255,0.95) inset, 0 -1px 0 rgba(255,255,255,0.5) inset, 0 6px 18px -10px rgba(60,20,15,0.18), 0 1px 2px rgba(60,20,15,0.06)`;

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
        backdropFilter: `blur(${blur}px) saturate(200%)`,
        WebkitBackdropFilter: `blur(${blur}px) saturate(200%)`,
        background: dark ? `rgba(28,12,14,${t})` : `rgba(255,255,255,${t})`,
        boxShadow: shadow,
        border: border
          ? dark
            ? '0.5px solid rgba(255,255,255,0.14)'
            : '0.5px solid rgba(255,255,255,0.7)'
          : 'none',
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
              : 'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,0.20) 100%)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
