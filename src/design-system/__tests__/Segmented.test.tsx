import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Segmented } from '../Segmented';
import { SpeciesIcon } from '../SpeciesIcon';
import { ThemeProvider } from '../../app/providers/ThemeProvider';

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider initialTheme="light">{children}</ThemeProvider>;
}

const OPTIONS = [
  { value: 'dog' as const, label: 'Dog', icon: <SpeciesIcon species="dog" /> },
  { value: 'cat' as const, label: 'Cat', icon: <SpeciesIcon species="cat" /> },
];

describe('<Segmented>', () => {
  it('draws an option icon before its label without changing the tab name', () => {
    render(<Segmented options={OPTIONS} value="dog" onChange={() => {}} ariaLabel="Animal" />, {
      wrapper: Wrapper,
    });
    const dog = screen.getByRole('tab', { name: 'Dog' });
    const icon = dog.querySelector('svg');
    expect(icon).not.toBeNull();
    // Decorative: the label names the tab; the icon precedes it.
    expect(icon!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(dog.firstElementChild).toBe(icon!.parentElement);
    expect(dog).toHaveTextContent(/^Dog$/);
    expect(screen.getByRole('tab', { name: 'Cat' }).querySelector('svg')).not.toBeNull();
  });

  it('paints the icon in the active tab colour (white), muted on inactive tabs', () => {
    render(<Segmented options={OPTIONS} value="dog" onChange={() => {}} ariaLabel="Animal" />, {
      wrapper: Wrapper,
    });
    const iconBox = (name: string) =>
      screen.getByRole('tab', { name }).querySelector('svg')!.parentElement as HTMLElement;
    expect(iconBox('Dog').style.color).toBe('inherit');
    expect(screen.getByRole('tab', { name: 'Dog' }).style.color).toBe('rgb(255, 255, 255)');
    expect(iconBox('Cat').style.color).toBe('var(--pbt-text-muted)');
  });

  it('keeps the tablist semantics and selection', async () => {
    const onChange = vi.fn();
    render(<Segmented options={OPTIONS} value="dog" onChange={onChange} ariaLabel="Animal" />, {
      wrapper: Wrapper,
    });
    expect(screen.getByRole('tablist', { name: 'Animal' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dog' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Cat' })).toHaveAttribute('aria-selected', 'false');
    await userEvent.click(screen.getByRole('tab', { name: 'Cat' }));
    expect(onChange).toHaveBeenCalledWith('cat');
  });

  it('renders no icon slot for options without one', () => {
    render(
      <Segmented
        options={[
          { value: 'a', label: 'Build' },
          { value: 'b', label: 'Library' },
        ]}
        value="a"
        onChange={() => {}}
      />,
      { wrapper: Wrapper },
    );
    const build = screen.getByRole('tab', { name: 'Build' });
    expect(build.children).toHaveLength(0);
    expect(build).toHaveTextContent('Build');
  });
});
