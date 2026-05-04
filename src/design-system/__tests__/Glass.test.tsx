import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Glass } from '../Glass';
import { ThemeProvider } from '../../app/providers/ThemeProvider';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider initialTheme="light">{children}</ThemeProvider>;
}

describe('<Glass>', () => {
  it('renders children', () => {
    render(<Glass>hello</Glass>, { wrapper: Wrapper });
    expect(screen.getByText('hello')).toBeInTheDocument();
  });

  it('does not become a button without onClick', () => {
    render(<Glass>plain</Glass>, { wrapper: Wrapper });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('becomes interactive when onClick is provided', async () => {
    const onClick = vi.fn();
    render(
      <Glass onClick={onClick} ariaLabel="hero card">
        clickable
      </Glass>,
      { wrapper: Wrapper },
    );
    const node = screen.getByRole('button', { name: 'hero card' });
    await userEvent.click(node);
    expect(onClick).toHaveBeenCalled();
  });

  it('triggers onClick on Enter and Space', async () => {
    const onClick = vi.fn();
    render(
      <Glass onClick={onClick} ariaLabel="kbd card">
        kb
      </Glass>,
      { wrapper: Wrapper },
    );
    const node = screen.getByRole('button', { name: 'kbd card' });
    node.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
