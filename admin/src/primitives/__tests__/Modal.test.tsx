import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, ModalCloseButton } from '../index';
import { resetModalStack } from '../modalStack';

beforeEach(() => {
  resetModalStack();
  document.body.style.overflow = '';
});

/** Editor with a nested explainer, mirroring the InfoTip-inside-a-modal shape. */
function NestedHarness({ onOuterClose }: { onOuterClose?: () => void }) {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(false);
  return (
    <Modal
      open={outer}
      onClose={() => {
        setOuter(false);
        onOuterClose?.();
      }}
      ariaLabel="Editor"
    >
      <input aria-label="name" defaultValue="unsaved edit" />
      <button onClick={() => setInner(true)}>explain</button>
      <Modal open={inner} onClose={() => setInner(false)} ariaLabel="Explainer">
        <p>how this works</p>
        <button>ok</button>
      </Modal>
    </Modal>
  );
}

describe('Modal stacking', () => {
  it('closes only the topmost modal on Escape', async () => {
    const user = userEvent.setup();
    const onOuterClose = vi.fn();
    render(<NestedHarness onOuterClose={onOuterClose} />);

    await user.click(screen.getByRole('button', { name: 'explain' }));
    expect(screen.getByRole('dialog', { name: 'Explainer' })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    // The bug this guards: one Escape used to close the explainer AND the
    // editor underneath it, discarding the edit in the input.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Explainer' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('dialog', { name: 'Editor' })).toBeInTheDocument();
    expect(onOuterClose).not.toHaveBeenCalled();

    // A second Escape, now that the editor is topmost again, does close it.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onOuterClose).toHaveBeenCalledOnce());
  });

  it('keeps body scroll locked while a parent modal is still open', async () => {
    const user = userEvent.setup();
    render(<NestedHarness />);
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(screen.getByRole('button', { name: 'explain' }));
    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Explainer' })).not.toBeInTheDocument(),
    );
    // A boolean lock would have restored scrolling here, behind the scrim.
    expect(document.body.style.overflow).toBe('hidden');
  });
});

describe('Modal focus management', () => {
  function Toggler() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>open</button>
        <Modal open={open} onClose={() => setOpen(false)} ariaLabel="Dialog">
          <button onClick={() => setOpen(false)}>done</button>
        </Modal>
      </>
    );
  }

  it('moves focus into the dialog and returns it to the opener on close', async () => {
    const user = userEvent.setup();
    render(<Toggler />);
    const opener = screen.getByRole('button', { name: 'open' });

    await user.click(opener);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'done' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'done' }));
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe('onRequestClose guard', () => {
  function Guarded({ guard }: { guard: () => boolean }) {
    const [open, setOpen] = useState(true);
    return (
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        onRequestClose={guard}
        ariaLabel="Guarded"
      >
        <ModalCloseButton onClose={() => setOpen(false)} />
      </Modal>
    );
  }

  it('blocks Escape, scrim clicks, and the X when the guard returns false', async () => {
    const user = userEvent.setup();
    const guard = vi.fn(() => false);
    render(<Guarded guard={guard} />);

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(guard).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('dialog', { name: 'Guarded' })).toBeInTheDocument();
  });

  it('allows the close when the guard returns anything else', async () => {
    const user = userEvent.setup();
    render(<Guarded guard={vi.fn(() => true)} />);

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Guarded' })).not.toBeInTheDocument(),
    );
  });
});
