import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  ACTION_TOAST_MS,
  DEFAULT_TOAST_MS,
  MAX_VISIBLE_TOASTS,
  ToastProvider,
  resolveToastDuration,
  toastReducer,
  useToast,
  type ToastItem,
} from '../Toast';

function item(id: string): ToastItem {
  return { id, message: id, tone: 'info', duration: DEFAULT_TOAST_MS };
}

describe('toastReducer', () => {
  it('puts the newest toast first', () => {
    const state = toastReducer(toastReducer([], { type: 'push', toast: item('a') }), {
      type: 'push',
      toast: item('b'),
    });
    expect(state.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('caps the stack and drops the oldest, not the newest', () => {
    let state: ToastItem[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      state = toastReducer(state, { type: 'push', toast: item(id) });
    }
    expect(state).toHaveLength(MAX_VISIBLE_TOASTS);
    // A burst of saves should leave the three most recent visible.
    expect(state.map((t) => t.id)).toEqual(['e', 'd', 'c']);
  });

  it('dismisses by id and leaves the rest in order', () => {
    let state = toastReducer([], { type: 'push', toast: item('a') });
    state = toastReducer(state, { type: 'push', toast: item('b') });
    state = toastReducer(state, { type: 'dismiss', id: 'b' });
    expect(state.map((t) => t.id)).toEqual(['a']);
  });

  it('ignores a dismiss for a toast that already expired', () => {
    const state = toastReducer([item('a')], { type: 'dismiss', id: 'gone' });
    expect(state.map((t) => t.id)).toEqual(['a']);
  });

  it('clears everything', () => {
    expect(toastReducer([item('a'), item('b')], { type: 'clear' })).toEqual([]);
  });
});

describe('resolveToastDuration', () => {
  it('defaults to 6s', () => {
    expect(resolveToastDuration({ message: 'saved' })).toBe(DEFAULT_TOAST_MS);
  });

  it('gives an actionable toast longer, so Undo is reachable by keyboard', () => {
    expect(
      resolveToastDuration({ message: 'deleted', action: { label: 'Undo', onClick: () => {} } }),
    ).toBe(ACTION_TOAST_MS);
    expect(ACTION_TOAST_MS).toBeGreaterThanOrEqual(10000);
  });

  it('honours an explicit duration', () => {
    expect(resolveToastDuration({ message: 'x', duration: 1200 })).toBe(1200);
  });
});

function Harness({ onReady }: { onReady: (t: ReturnType<typeof useToast>) => void }) {
  const toast = useToast();
  onReady(toast);
  return <button onClick={() => toast({ message: 'from button' })}>fire</button>;
}

describe('ToastProvider live regions', () => {
  it('renders both live regions empty at mount', () => {
    render(
      <ToastProvider>
        <div />
      </ToastProvider>,
    );
    // A live region injected together with its message is not announced —
    // screen readers only watch regions that already existed.
    const status = document.querySelector('[role="status"]');
    const alert = document.querySelector('[role="alert"]');
    expect(status).toBeTruthy();
    expect(alert).toBeTruthy();
    expect(status?.textContent).toBe('');
    expect(alert?.textContent).toBe('');
  });

  it('routes errors to the assertive region and success to the polite one', () => {
    let toast!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <Harness onReady={(t) => (toast = t)} />
      </ToastProvider>,
    );

    act(() => {
      toast({ message: 'Saved the rule.', tone: 'success' });
    });
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'Saved the rule.',
    );
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('');

    act(() => {
      toast({ message: 'Revert failed.', tone: 'error' });
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Revert failed.',
    );
  });

  it('mutates the region text even when the same message repeats', () => {
    let toast!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <Harness onReady={(t) => (toast = t)} />
      </ToastProvider>,
    );

    act(() => void toast({ message: 'Saved', tone: 'success' }));
    const first = document.querySelector('[role="status"]')?.textContent;
    act(() => void toast({ message: 'Saved', tone: 'success' }));
    const second = document.querySelector('[role="status"]')?.textContent;

    // Identical text is not a DOM change and would go unannounced.
    expect(second).not.toBe(first);
    expect(second).toContain('Saved');
  });
});

describe('toast behaviour', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('auto-dismisses after its duration', () => {
    let toast!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <Harness onReady={(t) => (toast = t)} />
      </ToastProvider>,
    );

    act(() => void toast({ message: 'Saved the rule.', tone: 'success' }));
    expect(screen.getByText('Saved the rule.')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(DEFAULT_TOAST_MS + 50);
    });
    expect(screen.queryByText('Saved the rule.')).not.toBeInTheDocument();
  });

  it('never moves focus to the toast', () => {
    let toast!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <Harness onReady={(t) => (toast = t)} />
      </ToastProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'fire' });
    trigger.focus();

    act(() => void toast({ message: 'Saved', tone: 'success' }));

    // Stealing focus to announce "Saved" loses the caret and, once the toast
    // auto-dismisses, drops focus to <body>.
    expect(document.activeElement).toBe(trigger);
  });

  it('pauses the timer while focus is inside the toast', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let toast!: ReturnType<typeof useToast>;
    render(
      <ToastProvider>
        <Harness onReady={(t) => (toast = t)} />
      </ToastProvider>,
    );

    const onUndo = vi.fn();
    act(() =>
      void toast({
        message: 'Rule deleted.',
        tone: 'success',
        action: { label: 'Undo', onClick: onUndo },
      }),
    );

    const undo = screen.getByRole('button', { name: 'Undo' });
    act(() => undo.focus());

    act(() => {
      vi.advanceTimersByTime(ACTION_TOAST_MS * 2);
    });
    // Still there — a toast must not expire out from under a keyboard user.
    expect(screen.getByText('Rule deleted.')).toBeInTheDocument();

    await user.click(undo);
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByText('Rule deleted.')).not.toBeInTheDocument();
  });
});
