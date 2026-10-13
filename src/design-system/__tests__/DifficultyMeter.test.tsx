import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DifficultyMeter } from '../DifficultyMeter';

function filledSteps(container: HTMLElement): number {
  return container.querySelectorAll('[data-filled="true"]').length;
}

describe('<DifficultyMeter>', () => {
  it('is one image named by its aria label, with the word visible', () => {
    const { container } = render(
      <DifficultyMeter level={4} label="Combative" ariaLabel="Difficulty: Combative, level 4 of 4" />,
    );
    const meter = screen.getByRole('img', { name: 'Difficulty: Combative, level 4 of 4' });
    expect(meter).toHaveTextContent('Combative');
    expect(filledSteps(container)).toBe(4);
    expect(container.querySelectorAll('[data-difficulty-step]')).toHaveLength(4);
  });

  it('fills exactly `level` bars, rising 7/9/11/13 px like the library card', () => {
    const { container } = render(<DifficultyMeter level={2} ariaLabel="Difficulty 2" />);
    expect(filledSteps(container)).toBe(2);
    const steps = Array.from(container.querySelectorAll<HTMLElement>('[data-difficulty-step]'));
    expect(steps.map((s) => s.style.height)).toEqual(['7px', '9px', '11px', '13px']);
    expect(steps.map((s) => s.dataset.filled)).toEqual(['true', 'true', 'false', 'false']);
  });

  it('renders bars only when no label is given', () => {
    render(<DifficultyMeter level={1} ariaLabel="Difficulty: Coachable, level 1 of 4" />);
    expect(screen.getByRole('img', { name: /level 1 of 4/ })).toHaveTextContent('');
  });

  it('clamps out-of-range levels instead of drawing extra bars', () => {
    const high = render(<DifficultyMeter level={9} ariaLabel="high" />);
    expect(filledSteps(high.container)).toBe(4);
    high.unmount();
    const low = render(<DifficultyMeter level={-2} ariaLabel="low" />);
    expect(filledSteps(low.container)).toBe(0);
    low.unmount();
    const nan = render(<DifficultyMeter level={Number.NaN} ariaLabel="nan" />);
    expect(filledSteps(nan.container)).toBe(0);
  });

  it('uses the caller colours (the admin has no driver vars)', () => {
    const { container } = render(
      <DifficultyMeter level={1} ariaLabel="a" color="rgb(1, 2, 3)" trackColor="rgb(4, 5, 6)" size="md" />,
    );
    const steps = Array.from(container.querySelectorAll<HTMLElement>('[data-difficulty-step]'));
    expect(steps[0].style.background).toBe('rgb(1, 2, 3)');
    expect(steps[1].style.background).toBe('rgb(4, 5, 6)');
    expect(steps.map((s) => s.style.height)).toEqual(['9px', '12px', '15px', '18px']);
  });
});
