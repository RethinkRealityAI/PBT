import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTheme } from '../app/providers/ThemeProvider';
import { cn } from '../lib/classNames';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  active?: boolean;
}

export function Chip({
  children,
  active = false,
  className,
  type = 'button',
  ...rest
}: ChipProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <button
      type={type}
      className={cn('pbt-chip', className)}
      style={{
        height: 32,
        padding: '0 14px',
        borderRadius: 9999,
        border: active
          ? 'none'
          : dark
            ? '0.5px solid rgba(255,255,255,0.18)'
            : '0.5px solid rgba(255,255,255,0.7)',
        background: active
          ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
          : dark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(255,255,255,0.55)',
        color: active ? '#fff' : dark ? '#fff' : 'var(--pbt-ink)',
        fontFamily: 'var(--pbt-font-mono)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
      }}
      aria-pressed={active}
      {...rest}
    >
      {children}
    </button>
  );
}
