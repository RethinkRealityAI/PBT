import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccessProvider, ReadOnlyBanner, useCan } from '../access';

function Probe({ permission }: { permission: string }) {
  const can = useCan();
  return <span>{can(permission) ? 'yes' : 'no'}</span>;
}

describe('useCan', () => {
  it('answers from the granted permission set', () => {
    render(
      <AccessProvider permissions={['scenarios.read']}>
        <Probe permission="scenarios.read" />
      </AccessProvider>,
    );
    expect(screen.getByText('yes')).toBeInTheDocument();
  });

  it('denies a permission that was not granted', () => {
    render(
      <AccessProvider permissions={['scenarios.read']}>
        <Probe permission="scenarios.write" />
      </AccessProvider>,
    );
    expect(screen.getByText('no')).toBeInTheDocument();
  });

  it('treats owner as absolute, including permissions that do not exist yet', () => {
    render(
      <AccessProvider permissions={[]} isOwner>
        <Probe permission="something.invented.tomorrow" />
      </AccessProvider>,
    );
    expect(screen.getByText('yes')).toBeInTheDocument();
  });

  it('denies everything without a provider', () => {
    // Hiding a control is a smaller failure than rendering one that 403s.
    render(<Probe permission="flags.read" />);
    expect(screen.getByText('no')).toBeInTheDocument();
  });
});

describe('ReadOnlyBanner', () => {
  it('names the missing permission so the ask is actionable', () => {
    render(
      <AccessProvider permissions={['flags.read']}>
        <ReadOnlyBanner permission="flags.write" />
      </AccessProvider>,
    );
    const alert = screen.getByText(/view-only access/i);
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('flags.write')).toBeInTheDocument();
  });

  it('renders nothing once the reader holds the permission', () => {
    const { container } = render(
      <AccessProvider permissions={['flags.read', 'flags.write']}>
        <ReadOnlyBanner permission="flags.write" />
      </AccessProvider>,
    );
    // Screens mount it unconditionally, so it must self-hide.
    expect(container).toBeEmptyDOMElement();
  });
});
