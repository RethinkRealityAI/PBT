import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectScenarioModal, type SelectScenarioChoice } from '../SelectScenarioModal';

function Harness({
  onChoose = () => {},
  libraryCount = 7,
  canBuild = true,
}: {
  onChoose?: (c: SelectScenarioChoice) => void;
  libraryCount?: number;
  canBuild?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Select scenario
      </button>
      <button type="button">Behind the dialog</button>
      <SelectScenarioModal
        open={open}
        onClose={() => setOpen(false)}
        libraryCount={libraryCount}
        canBuild={canBuild}
        onChoose={(c) => {
          setOpen(false);
          onChoose(c);
        }}
      />
    </>
  );
}

const dialog = () => screen.queryByRole('dialog', { name: 'How would you like to practice?' });

describe('SelectScenarioModal', () => {
  it('is a labelled modal dialog that takes focus and keeps Tab inside', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Select scenario' }));
    const d = dialog()!;
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(d.contains(document.activeElement)).toBe(true);
    // Close, library, build — then back round to close; never the page behind.
    for (let i = 0; i < 5; i += 1) {
      await user.tab();
      expect(d.contains(document.activeElement)).toBe(true);
    }
    await user.tab({ shift: true });
    expect(d.contains(document.activeElement)).toBe(true);
  });

  it('Escape closes it and focus returns to the button that opened it', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Select scenario' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(dialog()).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('the close button and the scrim close it; a tap inside does not', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Select scenario' }));
    await user.click(within(dialog()!).getByRole('heading', { name: 'How would you like to practice?' }));
    expect(dialog()).not.toBeNull();
    await user.click(screen.getByTestId('select-scenario-scrim'));
    await waitFor(() => expect(dialog()).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Select scenario' }));
    await user.click(within(dialog()!).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  it('reports each choice, with the library count', async () => {
    const onChoose = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChoose={onChoose} libraryCount={7} />);
    await user.click(screen.getByRole('button', { name: 'Select scenario' }));
    const library = within(dialog()!).getByRole('button', { name: /Choose from the library/ });
    expect(library).toHaveTextContent('Ready-made scenarios written by your training team');
    expect(library).toHaveTextContent('7 scenarios');
    await user.click(library);
    expect(onChoose).toHaveBeenLastCalledWith('library');
    await user.click(screen.getByRole('button', { name: 'Select scenario' }));
    await user.click(within(dialog()!).getByRole('button', { name: /Build your own/ }));
    expect(onChoose).toHaveBeenLastCalledWith('build');
  });

  it('says so when nothing is published, and hides Build when the builder is off', async () => {
    const user = userEvent.setup();
    render(<Harness libraryCount={0} canBuild={false} />);
    await user.click(screen.getByRole('button', { name: 'Select scenario' }));
    expect(within(dialog()!).getByRole('button', { name: /Choose from the library/ })).toHaveTextContent(
      'None published yet',
    );
    expect(within(dialog()!).queryByRole('button', { name: /Build your own/ })).toBeNull();
  });

  it('stops the page behind from scrolling while open', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Select scenario' }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(dialog()).toBeNull());
    expect(document.body.style.overflow).toBe('');
  });
});
