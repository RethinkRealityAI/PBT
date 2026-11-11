import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from '../Tooltip';

afterEach(() => {
  vi.useRealTimers();
});

function setup(props: Partial<React.ComponentProps<typeof Tooltip>> = {}) {
  render(
    <Tooltip label="History" {...props}>
      <button type="button" aria-label="History">
        icon
      </button>
    </Tooltip>,
  );
  return screen.getByRole('button', { name: 'History' });
}

/** Focus as the keyboard does (`:focus-visible` follows the last input). */
function keyboardFocus(el: HTMLElement) {
  fireEvent.keyDown(document.body, { key: 'Tab' });
  act(() => el.focus());
}

const tip = () => document.querySelector('[role="tooltip"]') as HTMLElement | null;

describe('Tooltip', () => {
  it('shows on mouse hover after the delay and hides on leave', () => {
    vi.useFakeTimers();
    const button = setup();
    const anchor = button.parentElement!;
    fireEvent.pointerOver(anchor, { pointerType: 'mouse' });
    expect(tip()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(tip()).toHaveTextContent('History');
    fireEvent.pointerOut(anchor, { pointerType: 'mouse' });
    expect(tip()).toBeNull();
  });

  it('never opens for a touch', () => {
    vi.useFakeTimers();
    const button = setup();
    fireEvent.pointerOver(button.parentElement!, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(tip()).toBeNull();
  });

  it('opens on keyboard focus and Escape dismisses it', () => {
    const button = setup();
    keyboardFocus(button);
    expect(tip()).toHaveTextContent('History');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(tip()).toBeNull();
  });

  it('is silent when disabled', () => {
    const button = setup({ disabled: true });
    keyboardFocus(button);
    expect(tip()).toBeNull();
  });

  it('repeats the name without being read twice, or describes the control', () => {
    const a = setup();
    keyboardFocus(a);
    expect(tip()).toHaveAttribute('aria-hidden', 'true');
    expect(a).not.toHaveAttribute('aria-describedby');
  });

  it('describe wires aria-describedby to the (always present) text', () => {
    render(
      <Tooltip label="How sessions are scored" describe>
        <button type="button">Scoring info</button>
      </Tooltip>,
    );
    expect(screen.getByRole('button', { name: 'Scoring info' })).toHaveAccessibleDescription(
      'How sessions are scored',
    );
  });
});
