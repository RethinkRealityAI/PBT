/**
 * Pieces shared by the category and objection editors: the dialog frame
 * (header · scrolling body · footer, usable at 390 px), the fold-away
 * section, the native select's look, and a portal for dialogs opened from
 * inside a dialog.
 *
 * Why the portal: a Modal panel has `backdrop-filter`, which makes it the
 * containing block for `position: fixed` descendants — a second dialog
 * rendered inside it would be pinned to (and clipped by) the first panel
 * instead of covering the screen.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ModalCloseButton } from '../../primitives';
import { COLOR } from '../../lib/tokens';
import { Kicker } from '../ui';

export const selectStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid rgba(60,20,15,0.14)',
  background: 'rgba(255,255,255,0.78)',
  fontSize: 14,
  fontFamily: 'var(--pbt-font)',
  color: COLOR.ink,
  minWidth: 0,
};

/** Render a nested dialog at the document root (see the header). */
export function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

/** Header · scrolling body · footer — the editors' dialog layout. */
export function EditorFrame({
  kicker,
  heading,
  sub,
  onClose,
  footer,
  children,
}: {
  kicker: string;
  heading: string;
  sub?: ReactNode;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '88vh', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '18px 18px 12px 20px',
          borderBottom: `1px solid ${COLOR.borderSoft}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Kicker>{kicker}</Kicker>
          <h2 style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 750, color: COLOR.ink, letterSpacing: '-0.02em' }}>
            {heading}
          </h2>
          {sub && (
            <div style={{ fontSize: 12.5, color: COLOR.inkMute, marginTop: 2, overflowWrap: 'anywhere' }}>{sub}</div>
          )}
        </div>
        <span style={{ flexShrink: 0 }}>
          <ModalCloseButton onClose={onClose} />
        </span>
      </div>
      <div
        className="pbt-studio-scroll"
        style={{ overflowY: 'auto', padding: '16px clamp(14px, 4vw, 20px) 20px', display: 'grid', gap: 18, minHeight: 0 }}
      >
        {children}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          padding: '12px 20px 16px',
          borderTop: `1px solid ${COLOR.borderSoft}`,
        }}
      >
        {footer}
      </div>
    </div>
  );
}

/** A fold-away section (French version, coaching). */
export function Disclosure({
  title,
  note,
  open,
  onToggle,
  children,
}: {
  title: string;
  note: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  return (
    <div style={{ borderRadius: 14, border: `1px solid ${COLOR.borderSoft}`, background: 'rgba(255,255,255,0.55)' }}>
      <button
        type="button"
        className="pbt-focusable"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
          padding: '12px 14px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--pbt-font)',
          borderRadius: 14,
        }}
      >
        <span
          aria-hidden
          style={{ fontSize: 11, color: COLOR.inkMute, transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block' }}
        >
          ▶
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 750, color: COLOR.ink }}>{title}</span>
        <span style={{ fontSize: 12, color: COLOR.inkMute }}>{note}</span>
      </button>
      {open && (
        <div id={panelId} style={{ padding: '2px 14px 14px', display: 'grid', gap: 14 }}>
          {children}
        </div>
      )}
    </div>
  );
}
