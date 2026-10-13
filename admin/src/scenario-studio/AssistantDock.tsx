/**
 * Where the assistant lives in the editor.
 *
 *   • Wide screens: a docked column to the right of the step (`AssistantColumn`),
 *     sticky so the conversation stays beside whatever step is open. It can be
 *     tucked away; the floating launcher brings it back.
 *   • Narrower screens: a slide-over from the right (`AssistantDrawer`) opened
 *     from the floating "✦ Assistant" launcher (`AssistantLauncher`).
 *
 * The panel itself (chat + cards) is `CopilotPanel`; this file only places it.
 * The drawer stays mounted once opened, so closing it mid-reply doesn't throw
 * the reply away — the transcript lives in the editor either way.
 */
import { useEffect, useRef, useState } from 'react';
import { COLOR } from '../lib/tokens';
import { AssistMark } from './ui';
import { CopilotPanel } from './copilot/CopilotPanel';
import type { CopilotPanelProps } from './types';

export type AssistantPanelProps = Omit<CopilotPanelProps, 'variant' | 'onClose'>;

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

/** The docked right-hand column. */
export function AssistantColumn({
  panel,
  top,
  onClose,
}: {
  panel: AssistantPanelProps;
  /** Sticky offset (the editor header's height). */
  top: number;
  onClose: () => void;
}) {
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
      <CopilotPanel {...panel} variant="docked" onClose={onClose} />
    </aside>
  );
}

/** The floating "✦ Assistant" button that opens the drawer / brings back the dock. */
export function AssistantLauncher({
  onOpen,
  hasNews,
}: {
  onOpen: () => void;
  /** A reply arrived while the panel was closed. */
  hasNews?: boolean;
}) {
  return (
    <button
      type="button"
      className="pbt-btn"
      onClick={onOpen}
      aria-label={hasNews ? 'Open the assistant — new reply' : 'Open the assistant'}
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
      {hasNews && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 6,
            left: 30,
            width: 10,
            height: 10,
            borderRadius: 999,
            background: COLOR.brand,
            border: '2px solid #fff',
          }}
        />
      )}
    </button>
  );
}

/** The slide-over used below the docking width. */
export function AssistantDrawer({
  open,
  panel,
  onClose,
}: {
  open: boolean;
  panel: AssistantPanelProps;
  onClose: () => void;
}) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  // Mount on first open, then keep the panel alive (an in-flight reply
  // survives the drawer closing).
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // Escape closes; focus moves in on open and back to the opener on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A dialog above us (a confirm) owns its own Escape.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    const id = window.setTimeout(() => {
      const panel = ref.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target = panel.querySelector<HTMLElement>(
        'textarea, input, button, [tabindex]:not([tabindex="-1"])',
      );
      (target ?? panel).focus({ preventScroll: true });
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(id);
      if (opener && document.contains(opener) && ref.current?.contains(document.activeElement)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, onClose]);

  if (!mounted) return null;
  const transition = reduced
    ? 'none'
    : open
      ? 'transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1)'
      : 'transform 0.22s ease, visibility 0s linear 0.22s';

  return (
    <div
      ref={ref}
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
        <CopilotPanel {...panel} variant="drawer" onClose={onClose} />
      </div>
    </div>
  );
}
