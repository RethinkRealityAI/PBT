import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmProvider, useConfirm, type ConfirmOptions } from '../Confirm';
import { resetModalStack } from '../modalStack';

beforeEach(() => resetModalStack());

const DELETE: ConfirmOptions = {
  title: 'Delete this targeting rule?',
  consequences: ['Everyone falls back to the flag default.'],
  confirmLabel: 'Delete rule',
  tone: 'danger',
};

/** Exposes `confirm()` to the test without rendering a whole screen. */
function Harness({ onReady }: { onReady: (c: ReturnType<typeof useConfirm>) => void }) {
  const confirm = useConfirm();
  onReady(confirm);
  return <button>opener</button>;
}

function setup() {
  let confirm!: ReturnType<typeof useConfirm>;
  const utils = render(
    <ConfirmProvider>
      <Harness onReady={(c) => (confirm = c)} />
    </ConfirmProvider>,
  );
  return { ...utils, confirm: (o: ConfirmOptions) => confirm(o) };
}

describe('useConfirm promise resolution', () => {
  it('resolves true when the confirm button is pressed', async () => {
    const user = userEvent.setup();
    const { confirm } = setup();

    let result: boolean | undefined;
    act(() => {
      void confirm(DELETE).then((r) => (result = r));
    });

    expect(await screen.findByText('Delete this targeting rule?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete rule' }));
    await waitFor(() => expect(result).toBe(true));
  });

  it('resolves false on Cancel and closes the dialog', async () => {
    const user = userEvent.setup();
    const { confirm } = setup();

    let result: boolean | undefined;
    act(() => {
      void confirm(DELETE).then((r) => (result = r));
    });

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(result).toBe(false));
    expect(screen.queryByText('Delete this targeting rule?')).not.toBeInTheDocument();
  });

  it('resolves false on Escape', async () => {
    const user = userEvent.setup();
    const { confirm } = setup();

    let result: boolean | undefined;
    act(() => {
      void confirm(DELETE).then((r) => (result = r));
    });
    await screen.findByText('Delete this targeting rule?');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(result).toBe(false));
  });

  it('renders the consequences as concrete bullets', async () => {
    const { confirm } = setup();
    act(() => {
      void confirm(DELETE);
    });

    const bullets = await screen.findAllByRole('listitem');
    expect(bullets.map((b) => b.textContent)).toEqual([
      'Everyone falls back to the flag default.',
    ]);
  });

  it('supersedes an open dialog, resolving the abandoned one false', async () => {
    const user = userEvent.setup();
    const { confirm } = setup();

    let first: boolean | undefined;
    let second: boolean | undefined;
    act(() => {
      void confirm(DELETE).then((r) => (first = r));
    });
    act(() => {
      void confirm({ ...DELETE, title: 'Roll back this change?', confirmLabel: 'Revert' }).then(
        (r) => (second = r),
      );
    });

    // Nobody agreed to the first one, so it must not resolve true.
    await waitFor(() => expect(first).toBe(false));
    await user.click(await screen.findByRole('button', { name: 'Revert' }));
    await waitFor(() => expect(second).toBe(true));
  });

  it('resolves false rather than hanging if the provider unmounts', async () => {
    const { confirm, unmount } = setup();
    let result: boolean | undefined;
    act(() => {
      void confirm(DELETE).then((r) => (result = r));
    });
    await screen.findByText('Delete this targeting rule?');

    unmount();
    await waitFor(() => expect(result).toBe(false));
  });
});

describe('typeToConfirm', () => {
  const IRREVERSIBLE: ConfirmOptions = {
    title: 'Delete the knowledge base?',
    confirmLabel: 'Delete forever',
    tone: 'danger',
    typeToConfirm: 'clinical-reference',
  };

  it('keeps the confirm button disabled until the phrase matches exactly', async () => {
    const user = userEvent.setup();
    const { confirm } = setup();
    act(() => {
      void confirm(IRREVERSIBLE);
    });

    const button = await screen.findByRole('button', { name: 'Delete forever' });
    expect(button).toBeDisabled();

    const input = screen.getByLabelText('Type clinical-reference to confirm');
    await user.type(input, 'clinical-refer');
    expect(button).toBeDisabled();

    await user.type(input, 'ence');
    expect(button).toBeEnabled();
  });

  it('resolves true once the typed phrase matches', async () => {
    const user = userEvent.setup();
    const { confirm } = setup();
    let result: boolean | undefined;
    act(() => {
      void confirm(IRREVERSIBLE).then((r) => (result = r));
    });

    await user.type(
      await screen.findByLabelText('Type clinical-reference to confirm'),
      'clinical-reference',
    );
    await user.click(screen.getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(result).toBe(true));
  });

  it('does not carry a typed phrase into the next dialog', async () => {
    const user = userEvent.setup();
    const { confirm } = setup();

    act(() => {
      void confirm(IRREVERSIBLE);
    });
    await user.type(
      await screen.findByLabelText('Type clinical-reference to confirm'),
      'clinical-reference',
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    act(() => {
      void confirm(IRREVERSIBLE);
    });
    // A pre-armed confirm button is exactly the muscle-memory click this rung
    // of the ladder exists to stop.
    expect(await screen.findByRole('button', { name: 'Delete forever' })).toBeDisabled();
  });
});
