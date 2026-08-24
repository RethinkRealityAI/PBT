/**
 * Modal stack registry + body-scroll lock counter.
 *
 * Both exist because modals nest. An `InfoTip` opened from inside an editor
 * modal used to share one Escape handler and one boolean scroll lock with its
 * parent, which produced two real bugs:
 *
 *   1. Escape closed BOTH — the explainer and the editor underneath it, taking
 *      unsaved edits with it.
 *   2. Closing the inner one restored `body.overflow` while the outer one was
 *      still open, so the page behind the scrim scrolled.
 *
 * Keeping the registry module-level (not React state) is deliberate: the
 * ordering question — "am I the topmost modal right now?" — is asked from a
 * DOM keydown handler, where a stale render closure would give the wrong
 * answer.
 */

const stack: string[] = [];
let seq = 0;

/** Fresh id for a Modal instance. */
export function nextModalId(): string {
  seq += 1;
  return `pbt-modal-${seq}`;
}

/** Register a modal as the new topmost. Idempotent for a given id. */
export function pushModal(id: string): void {
  if (stack.includes(id)) return;
  stack.push(id);
}

/** Deregister a modal, wherever it sits in the stack. */
export function removeModal(id: string): void {
  const i = stack.indexOf(id);
  if (i >= 0) stack.splice(i, 1);
}

/** The modal that should own Escape and scrim clicks right now. */
export function topModalId(): string | null {
  return stack.length ? stack[stack.length - 1] : null;
}

export function isTopModal(id: string): boolean {
  return topModalId() === id;
}

export function modalStackDepth(): number {
  return stack.length;
}

/** Test helper — the registry outlives any single render tree. */
export function resetModalStack(): void {
  stack.length = 0;
  seq = 0;
  lockCount = 0;
  previousOverflow = null;
}

// ── Body scroll lock (count-based) ────────────────────────────
//
// A boolean lock breaks under nesting: the inner modal's cleanup would restore
// scrolling while the outer one is still up. Counting means the original
// overflow value is only restored when the last modal closes.

let lockCount = 0;
let previousOverflow: string | null = null;

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow ?? '';
    previousOverflow = null;
  }
}

export function bodyScrollLockCount(): number {
  return lockCount;
}

// ── Focus helpers (APG dialog pattern) ────────────────────────

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement || !el.hidden,
  );
}

/**
 * Keep Tab inside `root`. Returns true when the event was handled, so callers
 * can leave normal tabbing alone when there is nothing to trap.
 */
export function trapTab(e: KeyboardEvent, root: HTMLElement | null): boolean {
  if (!root) return false;
  const items = focusableWithin(root);
  if (items.length === 0) {
    // Nothing tabbable inside — pin focus on the panel itself rather than
    // letting Tab escape to the page behind the scrim.
    e.preventDefault();
    root.focus();
    return true;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey) {
    if (active === first || active === root || !root.contains(active)) {
      e.preventDefault();
      last.focus();
      return true;
    }
  } else if (active === last || !root.contains(active)) {
    e.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
