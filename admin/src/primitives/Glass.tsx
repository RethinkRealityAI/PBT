import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { RADIUS } from '../lib/tokens';

interface GlassProps {
  children: ReactNode;
  padding?: number | string;
  radius?: number;
  /** Liquid-glass shine layer; off for compact rows. */
  shine?: boolean;
  hover?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  style?: CSSProperties;
  className?: string;
}

/**
 * Adapted from src/design-system/Glass.tsx for the standalone admin app.
 * Same iOS-liquid-glass language, lighter blur (admin runs on light bg).
 */
export function Glass({
  children,
  padding = 22,
  radius = RADIUS.xl,
  shine = true,
  hover = false,
  onClick,
  style,
  className,
}: GlassProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      style={{
        position: 'relative',
        borderRadius: radius,
        padding,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.58) 100%)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        border: '0.5px solid rgba(255,255,255,0.9)',
        boxShadow: [
          '0 1px 0 rgba(255,255,255,0.95) inset',
          '0 -1px 0 rgba(255,255,255,0.4) inset',
          '0 1px 2px rgba(60,20,15,0.04)',
          '0 8px 24px -10px rgba(60,20,15,0.10)',
          '0 24px 60px -24px rgba(60,20,15,0.12)',
        ].join(', '),
        cursor: onClick ? 'pointer' : 'default',
        transition: hover
          ? 'transform 0.18s ease, box-shadow 0.18s ease'
          : 'none',
        ...style,
      }}
      onMouseEnter={
        hover
          ? (e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          : undefined
      }
      onMouseLeave={
        hover
          ? (e) => {
              e.currentTarget.style.transform = 'translateY(0)';
            }
          : undefined
      }
    >
      {shine && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius,
            pointerEvents: 'none',
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 28%, rgba(255,255,255,0) 72%, rgba(255,255,255,0.18) 100%)',
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}
