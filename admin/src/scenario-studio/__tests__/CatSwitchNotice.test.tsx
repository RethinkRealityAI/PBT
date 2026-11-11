import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const perms = vi.hoisted(() => ({ flagsWrite: true }));
vi.mock('../../primitives/access', () => ({
  useCan: () => (p: string) => (p === 'flags.write' ? perms.flagsWrite : true),
}));

import { CatSwitchNotice, catNoticeTitle } from '../CatSwitchNotice';

describe('CatSwitchNotice', () => {
  it('says nothing when cats are on or the switch is unknown', () => {
    const { container, rerender } = render(<CatSwitchNotice state="on" context={{ kind: 'gallery' }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<CatSwitchNotice state={undefined} context={{ kind: 'gallery' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('warns while cats are off and links to Flags for an admin who can change it', () => {
    perms.flagsWrite = true;
    render(<CatSwitchNotice state="off" context={{ kind: 'gallery' }} />);
    expect(
      screen.getByText('Cats are switched off for trainees, so these scenarios aren’t visible to them yet.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cat scenarios for trainees/ })).toHaveAttribute('href', '#/flags');
  });

  it('offers no link without flags.write', () => {
    perms.flagsWrite = false;
    render(<CatSwitchNotice state="off" context={{ kind: 'publish' }} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Ask an admin who manages Flags/)).toBeInTheDocument();
  });

  it('titles every context', () => {
    expect(catNoticeTitle('off', { kind: 'liveCats', count: 2 })).toBe(
      '2 live cat scenarios aren’t visible to anyone yet: cats are switched off for trainees.',
    );
    expect(catNoticeTitle('some', { kind: 'publish' })).toBe(
      'Cats are switched on for only some trainees, so this scenario won’t be visible to the others yet.',
    );
  });
});
