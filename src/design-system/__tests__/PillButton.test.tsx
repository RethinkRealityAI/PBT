import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PillButton } from '../PillButton';
import { ThemeProvider } from '../../app/providers/ThemeProvider';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider initialTheme="light">{children}</ThemeProvider>;
}

describe('<PillButton>', () => {
  it('renders children and fires onClick', async () => {
    const onClick = vi.fn();
    render(<PillButton onClick={onClick}>Continue</PillButton>, {
      wrapper: Wrapper,
    });
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onClick).toHaveBeenCalled();
  });

  it('renders icon and label together', () => {
    render(
      <PillButton icon={<span data-testid="ico" />}>Go</PillButton>,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('ico')).toBeInTheDocument();
    expect(screen.getByText('Go')).toBeInTheDocument();
  });

  it('honours disabled', async () => {
    const onClick = vi.fn();
    render(
      <PillButton onClick={onClick} disabled>
        Disabled
      </PillButton>,
      { wrapper: Wrapper },
    );
    await userEvent.click(screen.getByRole('button', { name: /disabled/i }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
