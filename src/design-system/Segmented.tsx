import type { ReactNode } from 'react';
import { useTheme } from '../app/providers/ThemeProvider';

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
}

export interface SegmentedProps<V extends string> {
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<V>) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: 'inline-flex',
        padding: 3,
        borderRadius: 9999,
        background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)',
        border: dark
          ? '0.5px solid rgba(255,255,255,0.14)'
          : '0.5px solid rgba(255,255,255,0.7)',
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
              padding: '6px 14px',
              height: 30,
              borderRadius: 9999,
              fontFamily: 'var(--pbt-font-mono)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              background: active
                ? 'linear-gradient(180deg, oklch(0.66 0.22 22), oklch(0.56 0.24 18))'
                : 'transparent',
              color: active ? '#fff' : dark ? '#fff' : 'var(--pbt-ink)',
              transition: 'all 0.2s',
              boxShadow: active
                ? '0 4px 10px -4px oklch(0.55 0.22 18 / 0.4)'
                : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
