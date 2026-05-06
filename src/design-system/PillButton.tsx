import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { useTheme } from '../app/providers/ThemeProvider';
import { cn } from '../lib/classNames';

export type PillButtonVariant = 'solid' | 'glass' | 'ghost';
export type PillButtonSize = 'md' | 'lg';

export interface PillButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  variant?: PillButtonVariant;
  size?: PillButtonSize;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export function PillButton({
  children,
  variant = 'solid',
  size = 'md',
  icon,
  fullWidth = false,
  className,
  style,
  type = 'button',
  ...rest
}: PillButtonProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';

  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexDirection: 'row-reverse',
    height: size === 'lg' ? 54 : 48,
    padding: '0 22px',
    borderRadius: 9999,
    fontSize: 15,
    fontWeight: 600,
    fontFamily: 'var(--pbt-font-body)',
    cursor: rest.disabled ? 'not-allowed' : 'pointer',
    border: 'none',
    letterSpacing: '-0.01em',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    width: fullWidth ? '100%' : undefined,
    opacity: rest.disabled ? 0.55 : 1,
  };

  const variants: Record<PillButtonVariant, CSSProperties> = {
    solid: {
      color: '#fff',
      background:
        'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))',
      boxShadow:
        '0 1px 0 rgba(255,255,255,0.4) inset, 0 -1px 0 rgba(0,0,0,0.15) inset, 0 6px 16px -4px color-mix(in oklab, var(--pbt-driver-primary) 52%, transparent), 0 2px 4px color-mix(in oklab, var(--pbt-driver-accent) 38%, transparent)',
    },
    glass: {
      color: dark ? '#fff' : 'oklch(0.30 0.10 20)',
      background: dark
        ? 'rgba(255,255,255,0.08)'
        : 'linear-gradient(165deg, rgba(255,255,255,0.64) 0%, rgba(255,255,255,0.32) 100%)',
      backdropFilter: dark
        ? 'blur(22px) saturate(190%)'
        : 'blur(38px) saturate(235%) brightness(1.02)',
      WebkitBackdropFilter: dark
        ? 'blur(22px) saturate(190%)'
        : 'blur(38px) saturate(235%) brightness(1.02)',
      boxShadow: dark
        ? '0 1px 0 rgba(255,255,255,0.1) inset, 0 -1px 0 rgba(0,0,0,0.2) inset, 0 10px 22px -8px rgba(0,0,0,0.45)'
        : '0 1px 0 rgba(255,255,255,0.92) inset, 0 -1px 0 rgba(255,255,255,0.34) inset, 0 16px 36px -14px rgba(60,20,15,0.09)',
      border: dark
        ? '1px solid rgba(255,255,255,0.18)'
        : '1px solid var(--pbt-glass-border)',
    },
    ghost: {
      color: dark ? '#fff' : 'oklch(0.30 0.10 20)',
      background: 'transparent',
      border: dark
        ? '1px solid rgba(255,255,255,0.2)'
        : '1px solid color-mix(in oklab, var(--pbt-driver-primary) 28%, transparent)',
    },
  };

  return (
    <button
      type={type}
      className={cn('pbt-pill', className)}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.97)')}
      onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
