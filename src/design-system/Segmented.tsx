import type { ReactNode } from 'react';
import { useTheme } from '../app/providers/ThemeProvider';

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  /**
   * Optional decorative icon drawn before the label (e.g. `SpeciesIcon`). It
   * should paint in `currentColor`: white on the active gradient, muted on an
   * inactive option. Hidden from assistive tech — the label names the tab.
   */
  icon?: ReactNode;
}

export interface SegmentedProps<V extends string> {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
  /**
   * `lg` — the big animal pill at the top of a screen (Training library):
   * taller targets, larger type. Default `md`.
   */
  size?: 'md' | 'lg';
  /** Stretch to the container's width, options sharing it equally. */
  fullWidth?: boolean;
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = 'md',
  fullWidth = false,
}: SegmentedProps<V>) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const lg = size === 'lg';
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: fullWidth ? 'flex' : 'inline-flex',
        width: fullWidth ? '100%' : undefined,
        padding: lg ? 4 : 3,
        borderRadius: 9999,
        background: dark
          ? 'rgba(255,255,255,0.06)'
          : 'linear-gradient(165deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.3) 100%)',
        backdropFilter: dark ? 'blur(18px) saturate(185%)' : 'blur(34px) saturate(235%) brightness(1.02)',
        WebkitBackdropFilter: dark ? 'blur(18px) saturate(185%)' : 'blur(34px) saturate(235%) brightness(1.02)',
        border: dark
          ? '1px solid rgba(255,255,255,0.14)'
          : '1px solid var(--pbt-glass-border)',
        boxShadow: dark
          ? '0 1px 0 rgba(255,255,255,0.08) inset'
          : '0 1px 0 rgba(255,255,255,0.9) inset, 0 12px 28px -12px rgba(60,20,15,0.07)',
        gap: 2,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            style={{
              border: 'none',
              padding: lg ? '8px 22px' : '6px 14px',
              height: lg ? 42 : 30,
              flex: fullWidth ? 1 : undefined,
              justifyContent: 'center',
              borderRadius: 9999,
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: lg ? 12.5 : 11,
              fontWeight: 600,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              background: active
                ? 'linear-gradient(180deg, var(--pbt-driver-primary), var(--pbt-driver-accent))'
                : 'transparent',
              color: active ? '#fff' : dark ? '#fff' : 'var(--pbt-ink)',
              transition: 'all 0.2s',
              boxShadow: active
                ? '0 4px 10px -4px color-mix(in oklab, var(--pbt-driver-primary) 42%, transparent)'
                : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {opt.icon != null && (
              <span
                aria-hidden
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: active ? 'inherit' : 'var(--pbt-text-muted)',
                  transition: 'color 0.2s',
                }}
              >
                {opt.icon}
              </span>
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
