import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ViewTabs } from '../ViewTabs';

function Harness({ onChange }: { onChange?: (v: 'a' | 'b') => void }) {
  const [value, setValue] = useState<'a' | 'b'>('a');
  return (
    <ViewTabs
      options={[
        { value: 'a', label: 'First' },
        { value: 'b', label: 'Second' },
      ]}
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      ariaLabel="Views"
    />
  );
}

const tab = (name: string) => within(screen.getByRole('tablist', { name: 'Views' })).getByRole('tab', { name });

describe('ViewTabs', () => {
  it('selects on click', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(tab('First')).toHaveAttribute('aria-selected', 'true');
    await user.click(tab('Second'));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(tab('Second')).toHaveAttribute('aria-selected', 'true');
  });

  it('moves and selects with the arrow keys, wrapping, and jumps with Home / End', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    tab('First').focus();
    await user.keyboard('{ArrowRight}');
    expect(tab('Second')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Second')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(tab('First')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{End}');
    expect(tab('Second')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Home}');
    expect(tab('First')).toHaveAttribute('aria-selected', 'true');
    expect(tab('First')).toHaveFocus();
  });
});
