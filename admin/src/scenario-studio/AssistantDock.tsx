/**
 * Where the assistant lives in the editor.
 *
 *   • Wide screens: a docked column to the right of the step (`AssistantColumn`),
 *     sticky so the conversation stays beside whatever step is open. It
 *     collapses to a slim rail (✦ + "Assistant") so the step gets the width;
 *     the choice is remembered in this browser. Collapsed, the panel stays
 *     MOUNTED (just hidden), so a reply in flight still lands — and a dot on
 *     the rail says so instead of the panel springing open.
 *   • Narrower screens: a slide-over from the right (`AssistantDrawer`) opened
 *     from the floating "✦ Assistant" launcher (`AssistantLauncher`) — never
 *     stacked under the step, where it would push the form into a long page.
 *
 * The panel itself (chat + cards) is `CopilotPanel`; this file only places it.
 * The drawer stays mounted once opened, so closing it mid-reply doesn't throw
 * the reply away — the transcript lives in the editor either way.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { COLOR, RADIUS } from '../lib/tokens';
import { AssistMark } from './ui';
import { CopilotPanel } from './copilot/CopilotPanel';
import type { CopilotPanelProps } from './types';

export type AssistantPanelProps = Omit<CopilotPanelProps, 'variant' | 'onClose'>;

/** Browser-local preference: the docked assistant is folded to its rail. */
export const ASSISTANT_COLLAPSED_KEY = 'pbt:admin:studio_assistant_collapsed';

/** Width of the folded rail (px). */
export const ASSISTANT_RAIL_WIDTH = 56;

export function readAssistantCollapsed(): boolean {
  try {
    return localStorage.getItem(ASSISTANT_COLLAPSED_KEY) === '1';
  } catch {
    // Private mode / blocked storage: open by default.
    return false;
  }
}

export function writeAssistantCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(ASSISTANT_COLLAPSED_KEY, '1');
    else localStorage.removeItem(ASSISTANT_COLLAPSED_KEY);
  } catch {
    // Private mode: the toggle still works for this visit.
  }
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      return;
    }
    const on = () => setReduced(Boolean(mq?.matches));
    mq?.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/** The small "something new" dot — on the rail and on the launcher. */
function NewsDot({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      aria-hidden
      data-testid="assistant-news-dot"
      style={{
        position: 'absolute',
        width: 10,
        height: 10,
        borderRadius: 999,
        background: COLOR.brand,
        border: '2px solid #fff',
        ...style,
      }}
    />
  );
}

/** The docked right-hand column — the panel, or its folded rail. */
export function AssistantColumn({
  panel,
  top,
  collapsed,
  hasNews,
  onCollapse,
  onExpand,
}: {
  panel: AssistantPanelProps;
  /** Sticky offset (the editor header's height). */
  top: number;
  /** Folded to the rail. */
  collapsed: boolean;
  /** A reply arrived while folded. */
  hasNews: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}) {
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const railButtonRef = useRef<HTMLButtonElement | null>(null);
  /** Set by the fold / unfold buttons: focus follows the admin's own click. */
  const moveFocus = useRef(false);

  // The button that was clicked disappears with the state it belonged to, so
  // focus goes to its counterpart — never back to the top of the page.
  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    if (collapsed) {
      railButtonRef.current?.focus({ preventScroll: true });
    } else {
      const target =
        panelRef.current?.querySelector<HTMLElement>('textarea:not(:disabled)') ??
        panelRef.current?.querySelector<HTMLElement>('button:not(:disabled)');
      target?.focus({ preventScroll: true });
    }
  }, [collapsed]);

  return (
    <aside
      aria-label="Assistant"
      style={{
        position: 'sticky',
        top,
        height: `calc(100vh - ${top + 20}px)`,
        minHeight: 420,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      {collapsed && (
        <AssistantRail
          buttonRef={railButtonRef}
          controls={panelId}
          hasNews={hasNews}
          onExpand={() => {
            moveFocus.current = true;
            onExpand();
          }}
        />
      )}
      {/* Kept mounted while folded: an in-flight reply still arrives. */}
      <div
        id={panelId}
        ref={panelRef}
        hidden={collapsed}
        style={{ display: collapsed ? 'none' : 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        <CopilotPanel
          {...panel}
          variant="docked"
          onClose={() => {
            moveFocus.current = true;
            onCollapse();
          }}
          controlsId={panelId}
        />
      </div>
    </aside>
  );
}

/** The folded assistant: one tall button — ✦, a vertical "Assistant", and a dot for news. */
function AssistantRail({
  buttonRef,
  controls,
  hasNews,
  onExpand,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  controls: string;
  hasNews: boolean;
  onExpand: () => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        borderRadius: RADIUS.xl,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.80) 100%)',
        border: '0.5px solid rgba(255,255,255,0.95)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.95) inset, 0 8px 24px -12px rgba(60,20,15,0.16)',
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className="pbt-row-hover pbt-focusable"
        onClick={onExpand}
        aria-expanded={false}
        aria-controls={controls}
        aria-label={hasNews ? 'Show assistant — new reply' : 'Show assistant'}
        title="Show assistant"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          padding: '14px 0 12px',
          border: 'none',
          borderRadius: RADIUS.xl,
          background: 'transparent',
          color: COLOR.inkSoft,
          fontFamily: 'var(--pbt-font)',
          cursor: 'pointer',
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <AssistMark size={32} />
          {hasNews && <NewsDot style={{ top: -2, right: -2 }} />}
        </span>
        <span
          aria-hidden
          style={{
            writingMode: 'vertical-rl',
            fontSize: 12.5,
            fontWeight: 750,
            letterSpacing: '0.04em',
            color: COLOR.inkSoft,
          }}
        >
          Assistant
        </span>
        <span style={{ marginTop: 'auto', display: 'inline-flex', color: COLOR.inkMute }}>
          <PanelRightOpen size={18} strokeWidth={1.8} aria-hidden focusable={false} />
        </span>
      </button>
      {/* The panel's own announcements are hidden with it; say it here. */}
      <span
        role="status"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        {hasNews ? 'The assistant has replied.' : ''}
      </span>
    </div>
  );
}

/** The floating "✦ Assistant" button that opens the drawer. */
export function AssistantLauncher({
  onOpen,
  hasNews,
  controls,
}: {
  onOpen: () => void;
  /** A reply arrived while the panel was closed. */
  hasNews?: boolean;
  /** The drawer's id, once it exists. */
  controls?: string;
}) {
  return (
    <button
      type="button"
      className="pbt-btn"
      onClick={onOpen}
      aria-label={hasNews ? 'Open the assistant — new reply' : 'Open the assistant'}
      aria-expanded={false}
      aria-controls={controls}
      style={{
        position: 'fixed',
        right: 20,
        bottom: 20,
        zIndex: 40,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 18px 10px 10px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.9)',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        boxShadow: '0 16px 40px -16px rgba(60,20,15,0.45)',
        color: COLOR.ink,
        fontFamily: 'var(--pbt-font)',
        fontSize: 14,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      <AssistMark size={28} />
      Assistant
      {hasNews && <NewsDot style={{ top: 6, left: 30 }} />}
    </button>
  );
}

/** The slide-over used below the docking width. */
export function AssistantDrawer({
  id,
  open,
  panel,
  onClose,
}: {
  /** For the launcher's `aria-controls`. */
  id?: string;
  open: boolean;
  panel: AssistantPanelProps;
  onClose: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const drawerId = id;
  // Mount the panel on first open, then keep it alive (an in-flight reply
  // survives the drawer closing). The empty shell is always there, so the
  // launcher's `aria-controls` never points at nothing.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  // Read through a ref: a new `onClose` each render must not re-run the
  // focus effect below (its cleanup hands focus back to the opener).
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Escape closes; focus moves in on open and back to the opener on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A dialog above us (a confirm) owns its own Escape.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const id = window.setTimeout(() => {
      const panel = ref.current;
      if (!panel || panel.contains(document.activeElement)) return;
      // The composer first — opening the assistant is opening a conversation.
      const target =
        panel.querySelector<HTMLElement>('textarea:not(:disabled)') ??
        panel.querySelector<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])');
      (target ?? panel).focus({ preventScroll: true });
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(id);
      // Hand focus back only if it was in here (the drawer turning inert may
      // already have dropped it to the page) — never steal it from elsewhere.
      const active = document.activeElement;
      const lost = !active || active === document.body || Boolean(ref.current?.contains(active));
      if (!lost) return;
      // The opener — or, when that was the launcher (it is hidden while the
      // drawer is open), the launcher that's back now.
      const back =
        opener && document.contains(opener) && opener !== document.body
          ? opener
          : drawerId
            ? Array.from(document.querySelectorAll<HTMLElement>('[aria-controls]')).find(
                (el) => el.getAttribute('aria-controls') === drawerId && !ref.current?.contains(el),
              )
            : undefined;
      back?.focus({ preventScroll: true });
    };
  }, [open, drawerId]);

  const transition = reduced
    ? 'none'
    : open
      ? 'transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1)'
      : 'transform 0.22s ease, visibility 0s linear 0.22s';

  return (
    <div
      ref={ref}
      id={id}
      role="complementary"
      aria-label="Assistant"
      tabIndex={-1}
      inert={!open}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        width: 'min(440px, 100vw)',
        display: 'flex',
        flexDirection: 'column',
        padding: 10,
        boxSizing: 'border-box',
        // `none` (not translateX(0)) once open: any transform makes this the
        // containing block for position:fixed dialogs inside the panel.
        transform: open ? 'none' : 'translateX(104%)',
        visibility: open ? 'visible' : 'hidden',
        transition,
        outline: 'none',
      }}
    >
      {mounted && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 22,
            overflow: 'hidden',
            // Opaque: the drawer sits over the step, and the panel's own
            // translucent surface would let the form show through.
            background: 'linear-gradient(180deg, #fffdfc 0%, #fbf6f4 100%)',
            border: '0.5px solid rgba(255,255,255,0.95)',
            boxShadow: '0 30px 80px -24px rgba(20,5,8,0.45)',
          }}
        >
          <CopilotPanel {...panel} variant="drawer" onClose={onClose} controlsId={id} />
        </div>
      )}
    </div>
  );
}
