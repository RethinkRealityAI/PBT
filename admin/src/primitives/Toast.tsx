/**
 * Toasts.
 *
 * The admin portal's feedback story was a `saveStatus` string per screen and a
 * `window.alert` on failure. This replaces both with one transient channel.
 *
 * Accessibility notes that are load-bearing, not decoration:
 *
 *  - The live regions render at mount, EMPTY. A container injected into the DOM
 *    with its message already inside is not announced by most screen readers —
 *    they only watch regions that existed before the mutation.
 *  - Success and info go to a polite `role="status"`; errors go to a separate
 *    `role="alert"`. One region can't be both, and an error that waits for a
 *    polite queue to drain arrives after the reader has moved on.
 *  - Focus is never moved to a toast. Stealing focus from a form to announce
 *    "Saved" loses the caret and, with an auto-dismiss, drops focus to <body>.
 *  - The dismiss timer pauses on hover AND focus-within, so a toast carrying an
 *    "Undo" button can't expire while someone is tabbing to it (WCAG 2.2.1).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { COLOR, RADIUS } from '../lib/tokens';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastActionSpec {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** An escape hatch from the action just taken — "Undo", "Retry", "View". */
  action?: ToastActionSpec;
  /** Milliseconds on screen. Defaults to 6s, or 10s when an action is present. */
  duration?: number;
}

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  action?: ToastActionSpec;
  duration: number;
}

export const MAX_VISIBLE_TOASTS = 3;
export const DEFAULT_TOAST_MS = 6000;
/**
 * A toast with an action has to survive long enough to notice it, read it, and
 * reach it with the keyboard. Six seconds does not cover that.
 */
export const ACTION_TOAST_MS = 10000;

export function resolveToastDuration(opts: ToastOptions): number {
  if (typeof opts.duration === 'number') return opts.duration;
  return opts.action ? ACTION_TOAST_MS : DEFAULT_TOAST_MS;
}

// ── Queue reducer (pure — unit tested) ───────────────────────
export type ToastQueueAction =
  | { type: 'push'; toast: ToastItem }
  | { type: 'dismiss'; id: string }
  | { type: 'clear' };

/**
 * Newest first. The container is anchored bottom-right and lays its children
 * out top-to-bottom, so index 0 renders as the topmost card — the one a reader
 * whose eye is drawn by the entrance animation lands on.
 *
 * Overflow drops the OLDEST: a burst of five saves should leave the three most
 * recent on screen, not freeze the first three and swallow what just happened.
 */
export function toastReducer(
  state: readonly ToastItem[],
  action: ToastQueueAction,
): ToastItem[] {
  switch (action.type) {
    case 'push':
      return [action.toast, ...state].slice(0, MAX_VISIBLE_TOASTS);
    case 'dismiss':
      return state.filter((t) => t.id !== action.id);
    case 'clear':
      return [];
    default:
      return state as ToastItem[];
  }
}

// ── Context ──────────────────────────────────────────────────
export type ToastFn = (opts: ToastOptions) => string;

const ToastContext = createContext<ToastFn | null>(null);

/**
 * Returns the `toast()` function. Outside a `ToastProvider` it degrades to a
 * console warning rather than throwing — a missing provider should not take a
 * screen down on the success path of a save that already happened.
 */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  return useMemo<ToastFn>(
    () =>
      ctx ??
      ((opts) => {
        if (typeof console !== 'undefined') {
          console.warn(`[toast:${opts.tone ?? 'info'}] ${opts.message}`);
        }
        return '';
      }),
    [ctx],
  );
}

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(
    toastReducer as (s: ToastItem[], a: ToastQueueAction) => ToastItem[],
    [] as ToastItem[],
  );
  // Mirrors of the newest message, for the live regions. Kept separate from
  // the visible stack so the announcement fires once, on arrival, and is not
  // re-read when an unrelated toast expires and re-renders the list.
  const [politeText, setPoliteText] = useState('');
  const [alertText, setAlertText] = useState('');

  const toast = useCallback<ToastFn>((opts) => {
    toastSeq += 1;
    const id = `toast-${toastSeq}`;
    dispatch({
      type: 'push',
      toast: {
        id,
        message: opts.message,
        tone: opts.tone ?? 'info',
        action: opts.action,
        duration: resolveToastDuration(opts),
      },
    });
    // Identical consecutive text is not a DOM change and would not be
    // announced; the zero-width toggle guarantees a mutation either way.
    const ZWSP = '\u200B';
    const bump = (prev: string) =>
      prev.endsWith(ZWSP) ? opts.message : opts.message + ZWSP;
    if (opts.tone === 'error') setAlertText(bump);
    else setPoliteText(bump);
    return id;
  }, []);

  const dismiss = useCallback((id: string) => dispatch({ type: 'dismiss', id }), []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/*
        Both regions exist from first paint, empty. Injecting a populated live
        region is the classic reason "the toast never announced".
      */}
      <div style={SR_ONLY} role="status" aria-live="polite" aria-atomic="true">
        {politeText}
      </div>
      <div style={SR_ONLY} role="alert" aria-live="assertive" aria-atomic="true">
        {alertText}
      </div>
      <div
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 90,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          maxWidth: 'min(380px, calc(100vw - 40px))',
          // The empty container must not swallow clicks on the page beneath.
          pointerEvents: 'none',
        }}
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

const TONE_ACCENT: Record<ToastTone, string> = {
  success: COLOR.success,
  error: COLOR.danger,
  info: COLOR.info,
};

const TONE_GLYPH: Record<ToastTone, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  // Remaining time survives pause/resume: hovering for ten seconds should not
  // hand back a fresh full countdown, and should not have burned the old one.
  const remainingRef = useRef(item.duration);
  const startedRef = useRef(0);

  useEffect(() => {
    if (paused) {
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedRef.current),
      );
      return;
    }
    startedRef.current = Date.now();
    const t = setTimeout(() => onDismiss(item.id), remainingRef.current);
    return () => clearTimeout(t);
  }, [paused, item.id, onDismiss]);

  const accent = TONE_ACCENT[item.tone];

  return (
    <div
      className="pbt-toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        // Only resume once focus has actually left the card — tabbing from the
        // action button to the dismiss button must not restart the clock.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '11px 12px',
        borderRadius: RADIUS.md,
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.9))',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '0.5px solid rgba(255,255,255,0.95)',
        borderLeft: `3px solid ${accent}`,
        boxShadow: '0 12px 32px -12px rgba(20,5,8,0.34)',
        animation: 'pbt-toast-in 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
        fontFamily: 'var(--pbt-font)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          marginTop: 1,
          borderRadius: '50%',
          background: accent,
          color: '#fff',
          fontSize: 11,
          fontWeight: 800,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {TONE_GLYPH[item.tone]}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: COLOR.ink, lineHeight: 1.45 }}>
          {item.message}
        </div>
        {item.action && (
          <button
            type="button"
            className="pbt-btn"
            onClick={() => {
              item.action?.onClick();
              onDismiss(item.id);
            }}
            style={{
              marginTop: 6,
              padding: '4px 10px',
              borderRadius: 8,
              border: `1px solid ${accent}`,
              background: 'transparent',
              color: accent,
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
              fontFamily: 'var(--pbt-font)',
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className="pbt-btn"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: 7,
          border: 'none',
          background: 'transparent',
          color: COLOR.inkMute,
          cursor: 'pointer',
          fontSize: 14,
          lineHeight: 1,
          fontFamily: 'var(--pbt-font)',
        }}
      >
        ×
      </button>
    </div>
  );
}
