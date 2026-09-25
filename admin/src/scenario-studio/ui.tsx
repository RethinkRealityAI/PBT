/**
 * Scenario Studio — shared UI vocabulary.
 *
 * Every Studio surface (steps, assistant, simulator, gallery) composes from
 * these so the guided flow reads as ONE product. Same tokens and inline-style
 * approach as the rest of the admin (no Tailwind, no CSS files); the few
 * states inline styles can't express (focus rings, hover lift, the typing
 * dots) live in STUDIO_STYLESHEET, injected once like ADMIN_STATE_STYLESHEET.
 *
 * Visual language:
 *   • Glass surfaces, 16–20 px radius, generous 20–24 px padding.
 *   • Selection = brand border + soft brand wash + a check badge, never
 *     colour alone (a11y).
 *   • The assistant's identity is the ✦ glyph on the ASSIST_GRADIENT
 *     (brand coral → Analyzer blue). Anything AI-driven wears it; nothing
 *     else does.
 */
import {
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { COLOR, RADIUS } from '../lib/tokens';

export const ASSIST_GRADIENT =
  'linear-gradient(135deg, oklch(0.60 0.22 22) 0%, oklch(0.55 0.18 320) 55%, oklch(0.55 0.16 250) 100%)';

export const STUDIO_STYLESHEET = `
  @keyframes pbt-studio-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pbt-studio-dot { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
  @keyframes pbt-studio-spin { to { transform: rotate(360deg); } }

  .pbt-studio-in { animation: pbt-studio-in 0.22s ease both; }

  .pbt-studio-field {
    transition: border-color 0.14s ease, box-shadow 0.14s ease, background 0.14s ease;
  }
  .pbt-studio-field:focus {
    outline: none;
    border-color: ${COLOR.brand} !important;
    box-shadow: 0 0 0 3px color-mix(in oklab, ${COLOR.brand} 18%, transparent);
    background: #fff !important;
  }

  .pbt-studio-tile {
    transition: transform 0.14s ease, box-shadow 0.14s ease, border-color 0.14s ease, background 0.14s ease;
  }
  .pbt-studio-tile:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 10px 24px -14px rgba(60,20,15,0.28);
  }
  .pbt-studio-tile:focus-visible, .pbt-studio-chip:focus-visible {
    outline: 2px solid ${COLOR.brand};
    outline-offset: 2px;
  }
  .pbt-studio-chip { transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease; }
  .pbt-studio-chip:hover:not(:disabled):not([aria-pressed='true']) { background: rgba(60,20,15,0.09) !important; }

  .pbt-studio-typing span {
    display: inline-block; width: 6px; height: 6px; border-radius: 999px;
    background: currentColor; margin: 0 2px;
    animation: pbt-studio-dot 1.1s infinite ease-in-out;
  }
  .pbt-studio-typing span:nth-child(2) { animation-delay: 0.15s; }
  .pbt-studio-typing span:nth-child(3) { animation-delay: 0.3s; }

  .pbt-studio-spinner {
    width: 14px; height: 14px; border-radius: 999px;
    border: 2px solid currentColor; border-right-color: transparent;
    animation: pbt-studio-spin 0.8s linear infinite; display: inline-block;
  }

  .pbt-studio-scroll { scrollbar-width: thin; scrollbar-color: rgba(60,20,15,0.18) transparent; }

  @media (prefers-reduced-motion: reduce) {
    .pbt-studio-in, .pbt-studio-typing span, .pbt-studio-spinner { animation: none !important; }
    .pbt-studio-tile, .pbt-studio-field, .pbt-studio-chip { transition: none !important; }
    .pbt-studio-tile:hover:not(:disabled) { transform: none; }
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('pbt-studio-css')) {
  const s = document.createElement('style');
  s.id = 'pbt-studio-css';
  s.textContent = STUDIO_STYLESHEET;
  document.head.appendChild(s);
}

// ── Typography ───────────────────────────────────────────────

/** Mono, uppercase, tracked — the admin's eyebrow voice. */
export function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: 'var(--pbt-mono)',
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: COLOR.inkMute,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A step's headline block: "STEP 2 OF 7" · the question · one hint line. */
export function StepHeading({
  eyebrow,
  title,
  hint,
  right,
}: {
  eyebrow?: string;
  title: string;
  hint?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        {eyebrow && <Kicker>{eyebrow}</Kicker>}
        <h2
          style={{
            margin: eyebrow ? '6px 0 0' : 0,
            fontSize: 26,
            lineHeight: 1.15,
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: COLOR.ink,
          }}
        >
          {title}
        </h2>
        {hint && (
          <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.55, color: COLOR.inkSoft, maxWidth: 620 }}>
            {hint}
          </div>
        )}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}

/** A labelled group within a step. */
export function StudioSection({
  title,
  hint,
  optional,
  right,
  children,
}: {
  title: string;
  hint?: ReactNode;
  optional?: boolean;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.01em' }}>
          {title}
        </h3>
        {optional && <OptionalTag />}
        {right && <div style={{ marginLeft: 'auto' }}>{right}</div>}
      </div>
      {hint && <div style={{ fontSize: 12.5, color: COLOR.inkMute, lineHeight: 1.5, marginTop: -6 }}>{hint}</div>}
      {children}
    </section>
  );
}

export function OptionalTag() {
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: COLOR.inkMute,
        background: 'rgba(60,20,15,0.06)',
        padding: '2px 8px',
        borderRadius: 999,
        letterSpacing: '0.02em',
      }}
    >
      Optional
    </span>
  );
}

// ── Selection ────────────────────────────────────────────────

/**
 * A large selectable card — species, pushback category, driver, difficulty.
 * `accent` tints the selected state (drivers use their own colour).
 */
export function OptionTile({
  selected,
  onSelect,
  title,
  description,
  glyph,
  accent = COLOR.brand,
  disabled,
  footer,
  compact,
}: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  description?: ReactNode;
  glyph?: ReactNode;
  accent?: string;
  disabled?: boolean;
  footer?: ReactNode;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className="pbt-studio-tile"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      style={{
        position: 'relative',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 4 : 8,
        padding: compact ? '12px 14px' : '16px 16px 14px',
        borderRadius: RADIUS.lg,
        border: `1.5px solid ${selected ? accent : 'rgba(60,20,15,0.10)'}`,
        background: selected
          ? `color-mix(in oklab, ${accent} 9%, white)`
          : 'rgba(255,255,255,0.72)',
        boxShadow: selected ? `0 8px 22px -14px color-mix(in oklab, ${accent} 60%, transparent)` : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'var(--pbt-font)',
        color: COLOR.ink,
        minHeight: compact ? 0 : 88,
      }}
    >
      {selected && <CheckBadge color={accent} />}
      {glyph && <div style={{ fontSize: compact ? 20 : 28, lineHeight: 1 }}>{glyph}</div>}
      <div style={{ fontSize: compact ? 13.5 : 14.5, fontWeight: 700, letterSpacing: '-0.01em', paddingRight: 22 }}>
        {title}
      </div>
      {description && (
        <div style={{ fontSize: 12.5, lineHeight: 1.45, color: COLOR.inkSoft }}>{description}</div>
      )}
      {footer}
    </button>
  );
}

export function CheckBadge({ color = COLOR.brand }: { color?: string }) {
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        width: 20,
        height: 20,
        borderRadius: 999,
        background: color,
        color: '#fff',
        fontSize: 12,
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      ✓
    </span>
  );
}

/** Responsive tile grid. */
export function TileGrid({ min = 200, gap = 10, children }: { min?: number; gap?: number; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap }}>
      {children}
    </div>
  );
}

/** A small toggle pill (breed shortcuts, persona, filters). */
export function Chip({
  selected = false,
  onClick,
  children,
  title,
  disabled,
  tone = 'brand',
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  disabled?: boolean;
  tone?: 'brand' | 'assist';
}) {
  const assist = tone === 'assist';
  return (
    <button
      type="button"
      className="pbt-studio-chip"
      aria-pressed={onClick ? selected : undefined}
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        padding: '7px 13px',
        borderRadius: 999,
        border: assist
          ? '1px solid color-mix(in oklab, oklch(0.55 0.18 320) 28%, transparent)'
          : `1px solid ${selected ? COLOR.brand : 'transparent'}`,
        background: selected ? COLOR.brand : assist ? 'rgba(255,255,255,0.75)' : 'rgba(60,20,15,0.055)',
        color: selected ? '#fff' : COLOR.ink,
        fontSize: 12.5,
        fontWeight: 650,
        fontFamily: 'var(--pbt-font)',
        cursor: disabled ? 'not-allowed' : onClick ? 'pointer' : 'default',
        opacity: disabled ? 0.5 : 1,
        lineHeight: 1.35,
        textAlign: 'left',
      }}
    >
      {assist && <span aria-hidden style={{ marginRight: 6, color: 'oklch(0.55 0.18 320)' }}>✦</span>}
      {children}
    </button>
  );
}

// ── Fields ───────────────────────────────────────────────────

/** Label row + optional tag + live character counter, around one control. */
export function FieldBlock({
  label,
  hint,
  optional,
  count,
  htmlFor,
  children,
  error,
}: {
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  count?: { value: number; max: number };
  htmlFor?: string;
  children: ReactNode;
  error?: string | null;
}) {
  const over = count ? count.value > count.max : false;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label
          htmlFor={htmlFor}
          style={{ fontSize: 13, fontWeight: 700, color: COLOR.ink, letterSpacing: '-0.005em' }}
        >
          {label}
        </label>
        {optional && <OptionalTag />}
        {count && (
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--pbt-mono)',
              fontSize: 11,
              color: over ? COLOR.danger : COLOR.inkMute,
              fontWeight: over ? 800 : 500,
            }}
          >
            {count.value}/{count.max}
          </span>
        )}
      </div>
      {children}
      {error ? (
        <div role="alert" style={{ fontSize: 12, fontWeight: 700, color: COLOR.danger }}>
          {error}
        </div>
      ) : (
        hint && <div style={{ fontSize: 12, color: COLOR.inkMute, lineHeight: 1.5 }}>{hint}</div>
      )}
    </div>
  );
}

const fieldBase: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '11px 13px',
  borderRadius: 12,
  border: '1px solid rgba(60,20,15,0.14)',
  background: 'rgba(255,255,255,0.78)',
  fontSize: 14,
  lineHeight: 1.5,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
};

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { style, className, ...rest } = props;
  return (
    <input
      {...rest}
      className={className ? `pbt-studio-field ${className}` : 'pbt-studio-field'}
      style={{ ...fieldBase, ...style }}
    />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { style, className, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={className ? `pbt-studio-field ${className}` : 'pbt-studio-field'}
      style={{ ...fieldBase, resize: 'vertical', minHeight: 84, ...style }}
    />
  );
}

/** `useId` wrapper so FieldBlock labels bind to their control. */
export function useFieldId(): string {
  return useId();
}

// ── Assistant identity ───────────────────────────────────────

/** The ✦ mark on the assistant gradient. */
export function AssistMark({ size = 22 }: { size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: ASSIST_GRADIENT,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.55),
        flexShrink: 0,
        boxShadow: '0 4px 12px -4px oklch(0.55 0.18 320 / 0.55)',
      }}
    >
      ✦
    </span>
  );
}

/** "✦ Ask the assistant to …" — hands a prompt to the assistant panel. */
export function AssistButton({
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      type="button"
      className="pbt-btn"
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 13px 7px 8px',
        borderRadius: 999,
        border: '1px solid color-mix(in oklab, oklch(0.55 0.18 320) 26%, transparent)',
        background: 'rgba(255,255,255,0.8)',
        color: COLOR.ink,
        fontSize: 12.5,
        fontWeight: 700,
        fontFamily: 'var(--pbt-font)',
        cursor: rest.disabled ? 'not-allowed' : 'pointer',
        ...rest.style,
      }}
    >
      <AssistMark size={20} />
      {children}
    </button>
  );
}

/** Three animated dots — "thinking". */
export function TypingDots({ label = 'Thinking' }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="pbt-studio-typing" style={{ color: COLOR.inkMute }}>
      <span />
      <span />
      <span />
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span role="status" aria-label={label} className="pbt-studio-spinner" />;
}

// ── Misc ─────────────────────────────────────────────────────

/** A quiet explanatory panel ("What this does"). */
export function Explainer({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 14,
        background: 'rgba(60,20,15,0.035)',
        border: `1px solid ${COLOR.borderSoft}`,
        fontSize: 12.5,
        lineHeight: 1.55,
        color: COLOR.inkSoft,
      }}
    >
      {title && <div style={{ fontWeight: 800, color: COLOR.ink, marginBottom: 3 }}>{title}</div>}
      {children}
    </div>
  );
}

/** Coloured status dot + label (Live / Draft / Unsaved). */
export function StatusDot({
  tone,
  children,
}: {
  tone: 'success' | 'warn' | 'neutral' | 'info' | 'danger';
  children: ReactNode;
}) {
  const color =
    tone === 'success'
      ? COLOR.success
      : tone === 'warn'
        ? COLOR.warn
        : tone === 'info'
          ? COLOR.info
          : tone === 'danger'
            ? COLOR.danger
            : COLOR.inkMute;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: COLOR.inkSoft }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      {children}
    </span>
  );
}

/** Species glyphs — friendly, dependency-free. */
export const SPECIES_GLYPH: Record<'dog' | 'cat', string> = { dog: '🐕', cat: '🐈' };
