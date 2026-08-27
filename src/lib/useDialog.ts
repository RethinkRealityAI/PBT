/**
 * The parts of the dialog contract that `role="dialog"` alone does not give
 * you: Escape to close, focus moved in on open, focus kept inside while open,
 * and focus returned to whatever opened it on close.
 *
 * Without these a keyboard or screen-reader user can tab straight out of an
 * open dialog into the page behind it — which is still scrollable and still
 * clickable — and has no way to dismiss it except by finding the close button.
 *
 * Usage:
 *
 *   const ref = useDialog<HTMLDivElement>(onClose);
 *   return <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}>…</div>
 *
 * The element receives `tabIndex={-1}` so it can hold focus itself when it has
 * no focusable children yet (a dialog that opens in a loading state).
 */
import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

export function useDialog<T extends HTMLElement>(
  onClose: () => void,
  options: { closeOnEscape?: boolean } = {},
) {
  const { closeOnEscape = true } = options;
  const ref = useRef<T | null>(null);
  // Kept in a ref so changing the handler identity doesn't re-run the effect
  // and steal focus back to the top of the dialog mid-interaction.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    node.setAttribute('tabindex', '-1');
    const first = focusable(node)[0];
    (first ?? node).focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable(node);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends so Tab can never reach the page behind the dialog.
      if (e.shiftKey && (active === firstItem || active === node)) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    node.addEventListener('keydown', onKeyDown);
    return () => {
      node.removeEventListener('keydown', onKeyDown);
      // Returning focus matters as much as taking it: without this the next
      // Tab starts from the top of the document rather than the control the
      // reader was on.
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [closeOnEscape]);

  return ref;
}
