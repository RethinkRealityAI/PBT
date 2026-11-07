/**
 * Scenario Studio gallery — small building blocks: icon actions with a
 * visible tooltip, tag pills, an anchored popover, an edge-fading chip row.
 *
 * Inline styles + one injected stylesheet, like ../ui.tsx. Anything that
 * floats (popovers) renders through a PORTAL into <body>: a gallery card
 * lifts on hover with a `transform`, and a transformed ancestor would trap a
 * `position: fixed` child inside the card (see the note in ../ui.tsx).
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { COLOR } from '../../lib/tokens';
import {
  focusableWithin,
  isTopModal,
  nextModalId,
  pushModal,
  removeModal,
  trapTab,
} from '../../primitives/modalStack';
import { TAG_COLORS, isTagColor, tagSwatch, type TagColor } from '../../../../src/shared/scenarios/tags';

export const GALLERY_STYLESHEET = `
  .pbt-gal-icon {
    position: relative;
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; padding: 0; flex-shrink: 0;
    border-radius: 10px; border: 1px solid rgba(60,20,15,0.10);
    background: rgba(255,255,255,0.85); color: ${COLOR.inkSoft};
    cursor: pointer; transition: background 0.14s ease, color 0.14s ease, border-color 0.14s ease;
  }
  .pbt-gal-icon:hover:not(:disabled):not([aria-disabled='true']) { background: #fff; color: ${COLOR.ink}; border-color: rgba(60,20,15,0.22); }
  .pbt-gal-icon:focus-visible { outline: 2px solid ${COLOR.brand}; outline-offset: 2px; }
  .pbt-gal-icon[aria-disabled='true'], .pbt-gal-icon:disabled { opacity: 0.45; cursor: not-allowed; }
  .pbt-gal-icon[data-tone='brand'] { color: ${COLOR.brand}; border-color: color-mix(in oklab, ${COLOR.brand} 30%, transparent); }
  .pbt-gal-icon[data-tone='brand']:hover:not(:disabled):not([aria-disabled='true']) { background: ${COLOR.brandSoft}; color: ${COLOR.brand}; }
  /* Touch: a 44 px hit area without a bigger glyph box. */
  @media (pointer: coarse) {
    .pbt-gal-icon::before { content: ''; position: absolute; inset: -5px; }
  }

  /* Visible tooltip on hover AND keyboard focus (the aria-label is the name). */
  .pbt-gal-tip {
    position: absolute; bottom: calc(100% + 7px); left: 50%; transform: translateX(-50%);
    padding: 5px 9px; border-radius: 8px; white-space: nowrap; pointer-events: none;
    background: oklch(0.22 0.03 20); color: #fff; font-size: 11.5px; font-weight: 650;
    font-family: var(--pbt-font); line-height: 1.3; box-shadow: 0 6px 18px -8px rgba(20,5,8,0.5);
    opacity: 0; visibility: hidden; transition: opacity 0.12s ease 0.25s; z-index: 5;
  }
  .pbt-gal-tip[data-align='end'] { left: auto; right: 0; transform: none; }
  .pbt-gal-tip[data-align='start'] { left: 0; transform: none; }
  .pbt-gal-tipwrap:hover > .pbt-gal-tip, .pbt-gal-tipwrap:focus-within > .pbt-gal-tip { opacity: 1; visibility: visible; }
  /* Its popover is open: the tooltip would sit on top of it. */
  .pbt-gal-tipwrap > .pbt-gal-icon[aria-expanded='true'] + .pbt-gal-tip { display: none; }

  .pbt-gal-pill { transition: filter 0.12s ease, box-shadow 0.12s ease; }
  .pbt-gal-pill:hover { filter: brightness(0.97); }
  .pbt-gal-pill:focus-visible { outline: 2px solid ${COLOR.brand}; outline-offset: 1px; }

  .pbt-gal-row:hover { background: rgba(60,20,15,0.045); }
  .pbt-gal-row[data-active='true'] { background: rgba(60,20,15,0.07); }

  .pbt-gal-seg:focus-visible { outline: 2px solid ${COLOR.brand}; outline-offset: 2px; }

  .pbt-gal-scroll::-webkit-scrollbar { display: none; }
  .pbt-gal-search::-webkit-search-cancel-button { display: none; }
  /* The animal switch: a big pill, full width on narrow admin screens. */
  .pbt-gal-animal { width: min(100%, 420px); }
  @media (max-width: 899px) { .pbt-gal-animal { width: 100%; } }

  .pbt-gal-pop { animation: pbt-gal-pop 0.14s ease backwards; }
  @keyframes pbt-gal-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

  @media (prefers-reduced-motion: reduce) {
    .pbt-gal-pop { animation: none !important; }
    .pbt-gal-tip, .pbt-gal-icon, .pbt-gal-pill { transition: none !important; }
  }
`;

if (typeof document !== 'undefined' && !document.getElementById('pbt-gallery-css')) {
  const s = document.createElement('style');
  s.id = 'pbt-gallery-css';
  s.textContent = GALLERY_STYLESHEET;
  document.head.appendChild(s);
}

// ── Icon action ──────────────────────────────────────────────

export interface IconActionProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Accessible name AND the visible tooltip. */
  label: string;
  /** Shown instead of `label` in the tooltip (e.g. why it is unavailable). */
  tip?: string;
  tipAlign?: 'center' | 'start' | 'end';
  tone?: 'default' | 'brand';
  /** Looks and announces disabled but stays focusable, so its tooltip can say why. */
  unavailable?: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}

/** A 34 px icon button with a tooltip on hover and keyboard focus. */
export function IconAction({
  icon: Icon,
  label,
  tip,
  tipAlign = 'center',
  tone = 'default',
  unavailable = false,
  buttonRef,
  onClick,
  ...rest
}: IconActionProps) {
  return (
    <span className="pbt-gal-tipwrap" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={buttonRef}
        type="button"
        className="pbt-gal-icon"
        aria-label={label}
        aria-disabled={unavailable || undefined}
        data-tone={tone}
        onClick={(e) => {
          if (unavailable) {
            e.preventDefault();
            return;
          }
          onClick?.(e);
        }}
        {...rest}
      >
        <Icon size={16} strokeWidth={2} aria-hidden focusable={false} />
      </button>
      <span className="pbt-gal-tip" data-align={tipAlign} aria-hidden>
        {tip ?? label}
      </span>
    </span>
  );
}

// ── Tags ─────────────────────────────────────────────────────

export function TagDot({ color, size = 10 }: { color: string; size?: number }) {
  const swatch = tagSwatch(isTagColor(color) ? color : 'slate');
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: swatch.dot,
        flexShrink: 0,
        display: 'inline-block',
      }}
    />
  );
}

/** A tag as a small pill. With `onClick` it is a button (filter by it). */
export function TagPill({
  name,
  color,
  onClick,
  title,
  size = 'sm',
  pressed,
}: {
  name: string;
  color: string;
  onClick?: () => void;
  title?: string;
  size?: 'sm' | 'md';
  pressed?: boolean;
}) {
  const swatch = tagSwatch(isTagColor(color) ? color : 'slate');
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    maxWidth: 140,
    padding: size === 'sm' ? '2px 8px' : '4px 10px',
    borderRadius: 999,
    background: swatch.bg,
    color: swatch.fg,
    border: `1px solid ${pressed ? swatch.fg : swatch.border}`,
    fontSize: size === 'sm' ? 11 : 12,
    fontWeight: 700,
    fontFamily: 'var(--pbt-font)',
    lineHeight: 1.45,
    whiteSpace: 'nowrap',
    cursor: onClick ? 'pointer' : 'default',
  };
  const text = (
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{name}</span>
  );
  if (!onClick) {
    return (
      <span style={style} title={title}>
        {text}
      </span>
    );
  }
  return (
    <button type="button" className="pbt-gal-pill" onClick={onClick} title={title} aria-pressed={pressed} style={style}>
      {text}
    </button>
  );
}

/** The fixed palette as a row of swatches (a radio group). */
export function PalettePicker({
  value,
  onChange,
  label,
}: {
  value: TagColor;
  onChange: (c: TagColor) => void;
  label: string;
}) {
  const keys = Object.keys(TAG_COLORS) as TagColor[];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
      onKeyDown={(e) => {
        const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!delta) return;
        e.preventDefault();
        const i = (keys.indexOf(value) + delta + keys.length) % keys.length;
        onChange(keys[i]);
        refs.current[i]?.focus();
      }}
    >
      {keys.map((k, i) => {
        const on = k === value;
        const sw = TAG_COLORS[k].light;
        return (
          <button
            key={k}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={TAG_COLORS[k].label}
            title={TAG_COLORS[k].label}
            tabIndex={on ? 0 : -1}
            className="pbt-gal-pill"
            onClick={() => onChange(k)}
            style={{
              width: 24,
              height: 24,
              borderRadius: 999,
              border: on ? `2px solid ${COLOR.ink}` : `1px solid ${sw.border}`,
              background: sw.dot,
              boxShadow: on ? '0 0 0 2px #fff inset' : 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          />
        );
      })}
    </div>
  );
}

// ── Popover ──────────────────────────────────────────────────

/**
 * A panel anchored under (or above, when there is no room) a trigger,
 * rendered in a portal. Escape closes it and returns focus to the trigger;
 * so does a click outside. Tab stays inside while it is open (it registers
 * in the modal stack, so Escape never also closes a modal underneath).
 */
export function Popover({
  open,
  anchorRef,
  onClose,
  ariaLabel,
  role = 'dialog',
  width = 300,
  align = 'end',
  children,
  initialFocus,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  ariaLabel: string;
  role?: 'dialog' | 'menu';
  width?: number;
  align?: 'start' | 'end';
  children: ReactNode;
  /** Focused on open (else the first focusable). */
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const idRef = useRef('');
  if (!idRef.current) idRef.current = nextModalId();
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(width, vw - 16);
    let left = align === 'end' ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, vw - w - 8));
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const panelH = panelRef.current?.offsetHeight ?? 320;
    const openUp = below < Math.min(panelH, 280) && above > below;
    const maxHeight = Math.max(160, Math.min(440, openUp ? above : below));
    const top = openUp ? Math.max(8, r.top - 6 - Math.min(panelH, maxHeight)) : r.bottom + 6;
    setPos({ top, left, maxHeight });
  }, [anchorRef, width, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const id = idRef.current;
    pushModal(id);
    const anchor = anchorRef.current;
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = initialFocus?.current ?? focusableWithin(panel)[0] ?? panel;
      target.focus();
    };
    const raf = window.requestAnimationFrame(() => {
      place();
      focusFirst();
    });
    const close = (returnFocus: boolean) => {
      closeRef.current();
      if (returnFocus && anchor && document.contains(anchor)) anchor.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!isTopModal(id)) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close(true);
      } else if (e.key === 'Tab') {
        if (role === 'menu') {
          close(true);
          return;
        }
        trapTab(e, panelRef.current);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!isTopModal(id)) return;
      const t = e.target as Node | null;
      if (t && (panelRef.current?.contains(t) || anchor?.contains(t))) return;
      close(false);
    };
    const onMove = () => place();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
      removeModal(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      role={role}
      aria-label={ariaLabel}
      aria-modal={role === 'dialog' ? false : undefined}
      tabIndex={-1}
      className="pbt-gal-pop"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: Math.min(width, typeof window !== 'undefined' ? window.innerWidth - 16 : width),
        maxHeight: pos?.maxHeight ?? 440,
        overflowY: 'auto',
        zIndex: 70,
        borderRadius: 16,
        background: '#fff',
        border: '1px solid rgba(60,20,15,0.12)',
        boxShadow: '0 18px 48px -18px rgba(20,5,8,0.45), 0 2px 6px -2px rgba(20,5,8,0.12)',
        outline: 'none',
        fontFamily: 'var(--pbt-font)',
        color: COLOR.ink,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

// ── Edge-fading horizontal row ───────────────────────────────

const FADE = 28;

/** A horizontally scrolling row that fades the edge with more behind it. */
export function EdgeScroller({ ariaLabel, children }: { ariaLabel: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
  }, []);
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, children]);
  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? 'transparent' : '#000'} 0, #000 ${edges.left ? FADE : 0}px, #000 calc(100% - ${
          edges.right ? FADE : 0
        }px), ${edges.right ? 'transparent' : '#000'} 100%)`
      : undefined;
  return (
    <div
      ref={ref}
      role="group"
      aria-label={ariaLabel}
      onScroll={measure}
      className="pbt-gal-scroll"
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        minWidth: 0,
        padding: '3px 3px',
        margin: '-3px -3px',
        scrollbarWidth: 'none',
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      {children}
    </div>
  );
}

/** "12" in the mono count style used across the gallery. */
export function CountBadge({ n, loading = false }: { n: number; loading?: boolean }) {
  return (
    <span style={{ marginLeft: 6, opacity: 0.72, fontFamily: 'var(--pbt-mono)', fontSize: 11, fontWeight: 600 }}>
      {loading ? '…' : n}
    </span>
  );
}
