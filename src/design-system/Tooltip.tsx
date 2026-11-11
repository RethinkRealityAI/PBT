import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../app/providers/ThemeProvider';

export type TooltipPlacement = 'top' | 'bottom' | 'right';

export interface TooltipProps {
  /** The tooltip text (from the catalog: never hardcode it). */
  label: string;
  children: ReactNode;
  /** Preferred side; flips to the opposite side when it would leave the viewport. */
  placement?: TooltipPlacement;
  /** No tooltip (e.g. the tab's label is already visible). */
  disabled?: boolean;
  /**
   * The text adds information the control's accessible name doesn't carry:
   * wire it as the child's `aria-describedby`. Leave false when the tooltip
   * repeats the `aria-label` (an icon-only button), or it is read twice.
   */
  describe?: boolean;
  /** Mouse hover delay. Keyboard focus shows it at once. */
  delayMs?: number;
  /** Styles for the wrapping span (it takes the trigger's place in a flex row). */
  className?: string;
  style?: CSSProperties;
}

const GAP = 8;
const EDGE = 8;

/** `:focus-visible` keeps a tap's focus from opening it; old browsers throw. */
function isKeyboardFocus(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * Hover + keyboard-focus tooltip for icon-only controls.
 *
 *  - Mouse: shows after `delayMs`, hides on leave or press.
 *  - Keyboard: shows on `:focus-visible`, hides on blur.
 *  - Touch: never. A tap navigates; nothing is left floating over the
 *    next screen, and the tap is never swallowed.
 *  - Escape dismisses it (WCAG 1.4.13).
 *
 * The bubble is portalled to `<body>` with fixed positioning: the triggers
 * live inside `<Glass>` (backdrop-filter makes a containing block for fixed
 * children) and inside clipped rails, which would trap or cut it.
 */
export function Tooltip({
  label,
  children,
  placement = 'top',
  disabled = false,
  describe = false,
  delayMs = 350,
  className,
  style,
}: TooltipProps) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const hide = useCallback(() => {
    clearTimer();
    setOpen(false);
    setPos(null);
  }, []);

  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    if (disabled) hide();
  }, [disabled, hide]);

  // Escape dismisses; a scroll or resize would leave it pointing at nothing.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, hide]);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current?.getBoundingClientRect();
    const bubble = bubbleRef.current?.getBoundingClientRect();
    if (!anchor || !bubble) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    if (placement === 'right') {
      left = anchor.right + GAP;
      top = anchor.top + anchor.height / 2 - bubble.height / 2;
      if (left + bubble.width > vw - EDGE) left = anchor.left - GAP - bubble.width;
    } else {
      left = anchor.left + anchor.width / 2 - bubble.width / 2;
      const above = anchor.top - GAP - bubble.height;
      const below = anchor.bottom + GAP;
      if (placement === 'top') top = above < EDGE ? below : above;
      else top = below + bubble.height > vh - EDGE ? above : below;
    }
    left = Math.min(Math.max(EDGE, left), Math.max(EDGE, vw - EDGE - bubble.width));
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, vh - EDGE - bubble.height));
    setPos({ left, top });
  }, [open, placement, label]);

  const show = () => {
    if (!disabled) setOpen(true);
  };

  const child =
    describe && isValidElement(children)
      ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
          'aria-describedby': id,
        })
      : children;

  return (
    <span
      ref={anchorRef}
      className={className}
      style={{ display: 'inline-flex', ...style }}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse' || disabled) return;
        clearTimer();
        timer.current = window.setTimeout(show, delayMs);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') hide();
      }}
      onPointerDown={hide}
      onFocus={(e) => {
        if (isKeyboardFocus(e.target)) show();
      }}
      onBlur={hide}
    >
      {child}
      {/* Rendered (hidden) while closed when it describes the control, so the
          aria-describedby target always exists. */}
      {(open || describe) &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={bubbleRef}
            id={id}
            role="tooltip"
            aria-hidden={describe ? undefined : true}
            style={{
              position: 'fixed',
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              zIndex: 1000,
              maxWidth: 240,
              padding: '6px 10px',
              borderRadius: 9,
              fontFamily: 'var(--pbt-font-body)',
              fontSize: 12,
              fontWeight: 600,
              lineHeight: 1.35,
              letterSpacing: '-0.005em',
              whiteSpace: 'normal',
              textAlign: 'center',
              pointerEvents: 'none',
              color: dark ? 'oklch(0.18 0.01 20)' : '#fff',
              background: dark ? 'rgba(250, 247, 246, 0.96)' : 'rgba(24, 16, 18, 0.92)',
              boxShadow: '0 6px 18px -6px rgba(0,0,0,0.35)',
              // Measured before it is placed: invisible until `pos` is set.
              visibility: open && pos ? 'visible' : 'hidden',
              opacity: open && pos ? 1 : 0,
              transition: 'opacity 0.12s ease',
            }}
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}
