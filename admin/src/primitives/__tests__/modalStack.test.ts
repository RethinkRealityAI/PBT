import { beforeEach, describe, expect, it } from 'vitest';
import {
  bodyScrollLockCount,
  isTopModal,
  lockBodyScroll,
  modalStackDepth,
  nextModalId,
  pushModal,
  removeModal,
  resetModalStack,
  topModalId,
  trapTab,
  unlockBodyScroll,
} from '../modalStack';

beforeEach(() => {
  resetModalStack();
  document.body.style.overflow = '';
  document.body.innerHTML = '';
});

describe('modal stack ordering', () => {
  it('hands ownership to the most recently opened modal', () => {
    pushModal('outer');
    expect(isTopModal('outer')).toBe(true);

    pushModal('inner');
    // The regression this guards: an InfoTip opened from inside an editor used
    // to share Escape with its parent, closing both and discarding edits.
    expect(isTopModal('inner')).toBe(true);
    expect(isTopModal('outer')).toBe(false);
    expect(topModalId()).toBe('inner');
  });

  it('returns ownership to the parent when the child closes', () => {
    pushModal('outer');
    pushModal('inner');
    removeModal('inner');

    expect(isTopModal('outer')).toBe(true);
    expect(modalStackDepth()).toBe(1);
  });

  it('survives out-of-order removal', () => {
    pushModal('a');
    pushModal('b');
    pushModal('c');
    removeModal('b');

    expect(topModalId()).toBe('c');
    expect(modalStackDepth()).toBe(2);
    removeModal('c');
    expect(topModalId()).toBe('a');
  });

  it('ignores duplicate pushes and unknown removals', () => {
    pushModal('a');
    pushModal('a');
    expect(modalStackDepth()).toBe(1);
    removeModal('ghost');
    expect(modalStackDepth()).toBe(1);
  });

  it('mints unique ids', () => {
    const ids = new Set([nextModalId(), nextModalId(), nextModalId()]);
    expect(ids.size).toBe(3);
  });

  it('reports no owner when nothing is open', () => {
    expect(topModalId()).toBeNull();
    expect(isTopModal('anything')).toBe(false);
  });
});

describe('body scroll lock', () => {
  it('only restores the original overflow when the last modal closes', () => {
    document.body.style.overflow = 'scroll';

    lockBodyScroll();
    lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    expect(bodyScrollLockCount()).toBe(2);

    // Nested modal closes — the page behind must stay locked.
    unlockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');

    unlockBodyScroll();
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('does not go negative on an extra unlock', () => {
    unlockBodyScroll();
    expect(bodyScrollLockCount()).toBe(0);
  });
});

describe('trapTab', () => {
  function panelWithButtons(n: number) {
    const panel = document.createElement('div');
    panel.tabIndex = -1;
    for (let i = 0; i < n; i += 1) {
      const b = document.createElement('button');
      b.textContent = `b${i}`;
      panel.appendChild(b);
    }
    document.body.appendChild(panel);
    return panel;
  }

  it('wraps forward from the last focusable to the first', () => {
    const panel = panelWithButtons(2);
    const [first, last] = Array.from(panel.querySelectorAll('button'));
    last.focus();

    const e = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    expect(trapTab(e, panel)).toBe(true);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });

  it('wraps backward from the first focusable to the last', () => {
    const panel = panelWithButtons(2);
    const [first, last] = Array.from(panel.querySelectorAll('button'));
    first.focus();

    const e = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      cancelable: true,
    });
    expect(trapTab(e, panel)).toBe(true);
    expect(document.activeElement).toBe(last);
  });

  it('leaves interior tab stops alone', () => {
    const panel = panelWithButtons(3);
    const middle = panel.querySelectorAll('button')[1];
    middle.focus();

    const e = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    expect(trapTab(e, panel)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });

  it('pins focus to the panel when nothing inside is focusable', () => {
    const panel = panelWithButtons(0);
    const e = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });

    expect(trapTab(e, panel)).toBe(true);
    expect(document.activeElement).toBe(panel);
  });
});
