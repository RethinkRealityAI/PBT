/**
 * Shared form + button vocabulary for the admin portal.
 *
 * `Field`, `inputStyle`, `textareaStyle`, `btnPrimary` and `btnSecondary`
 * grew inside FlagsScreen and were then imported from there by six other
 * screens, which made a screen the de-facto design system. They live here now;
 * FlagsScreen re-exports them so those imports keep working untouched.
 *
 * `Button` is the forward path: same visual weight as the style objects, but
 * with the hover / focus-visible / disabled states the inline objects can't
 * express (see `.pbt-btn` in ./index.tsx). Screens can migrate one control at
 * a time — the two vocabularies are deliberately style-compatible.
 */
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { COLOR, RADIUS } from '../lib/tokens';

// ── Field ─────────────────────────────────────────────────────
export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.10em',
          color: COLOR.inkMute,
          fontFamily: 'var(--pbt-mono)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
      {help && (
        <div style={{ fontSize: 11, color: COLOR.inkMute, marginTop: 4 }}>
          {help}
        </div>
      )}
    </div>
  );
}

// ── Style objects (legacy vocabulary, still widely imported) ──
export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid rgba(60,20,15,0.12)',
  background: 'rgba(255,255,255,0.7)',
  fontSize: 13,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: 'var(--pbt-mono)',
  resize: 'vertical',
};

export const btnPrimary: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: 'none',
  background: COLOR.brand,
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'var(--pbt-font)',
  fontSize: 13,
};

export const btnSecondary: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid rgba(60,20,15,0.12)',
  background: 'rgba(255,255,255,0.6)',
  color: COLOR.ink,
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'var(--pbt-font)',
  fontSize: 13,
};

// ── Button ────────────────────────────────────────────────────
export type ButtonTone = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const TONE_STYLE: Record<ButtonTone, CSSProperties> = {
  primary: { border: 'none', background: COLOR.brand, color: '#fff' },
  secondary: {
    border: '1px solid rgba(60,20,15,0.12)',
    background: 'rgba(255,255,255,0.6)',
    color: COLOR.ink,
  },
  danger: { border: 'none', background: COLOR.danger, color: '#fff' },
  ghost: {
    border: '1px solid transparent',
    background: 'transparent',
    color: COLOR.inkSoft,
  },
};

const SIZE_STYLE: Record<ButtonSize, CSSProperties> = {
  sm: { padding: '5px 10px', fontSize: 12, borderRadius: 9 },
  md: { padding: '8px 14px', fontSize: 13, borderRadius: 10 },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ButtonTone;
  size?: ButtonSize;
  /** Shows a spinner glyph and blocks re-entry while an action is in flight. */
  busy?: boolean;
}

export function Button({
  tone = 'secondary',
  size = 'md',
  busy = false,
  disabled,
  children,
  style,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || busy;
  return (
    <button
      type="button"
      {...rest}
      disabled={isDisabled}
      aria-busy={busy || undefined}
      className={className ? `pbt-btn ${className}` : 'pbt-btn'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        fontWeight: 700,
        fontFamily: 'var(--pbt-font)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap',
        ...SIZE_STYLE[size],
        ...TONE_STYLE[tone],
        ...style,
      }}
    >
      {busy && (
        <span aria-hidden style={{ opacity: 0.8 }}>
          ⋯
        </span>
      )}
      {children}
    </button>
  );
}

// ── InlineAlert ───────────────────────────────────────────────
export type AlertTone = 'error' | 'warn' | 'info';

const ALERT_STYLE: Record<AlertTone, { bg: string; fg: string; border: string }> = {
  error: {
    bg: COLOR.dangerSoft,
    fg: 'oklch(0.42 0.18 25)',
    border: 'color-mix(in oklab, oklch(0.58 0.20 25) 26%, transparent)',
  },
  warn: {
    bg: COLOR.warnSoft,
    fg: 'oklch(0.42 0.14 70)',
    border: 'color-mix(in oklab, oklch(0.62 0.18 70) 26%, transparent)',
  },
  info: {
    bg: COLOR.infoSoft,
    fg: 'oklch(0.40 0.13 245)',
    border: 'color-mix(in oklab, oklch(0.55 0.16 250) 22%, transparent)',
  },
};

export function InlineAlert({
  tone,
  title,
  children,
  style,
}: {
  tone: AlertTone;
  title?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  const t = ALERT_STYLE[tone];
  return (
    <div
      // Only errors interrupt. A warning or a hint that shouts over whatever
      // the reader is doing is the reason people turn screen readers' verbosity
      // down, so those stay silent and are simply read in place.
      role={tone === 'error' ? 'alert' : undefined}
      style={{
        borderRadius: RADIUS.md,
        border: `1px solid ${t.border}`,
        background: t.bg,
        color: t.fg,
        padding: '10px 12px',
        fontSize: 12.5,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {title && (
        <div style={{ fontWeight: 800, marginBottom: children ? 3 : 0 }}>{title}</div>
      )}
      {children}
    </div>
  );
}
