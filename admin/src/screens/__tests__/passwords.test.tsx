/**
 * The admin's own password (Change password dialog), and setting a
 * temporary password for someone else (People → user → Manage).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { updateUser, runUserAction } = vi.hoisted(() => ({ updateUser: vi.fn(), runUserAction: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({ auth: { updateUser } }) }));
vi.mock('../../data/queries', () => ({ runUserAction }));

// eslint-disable-next-line import/first
import { ChangePasswordDialog } from '../PasswordScreens';
// eslint-disable-next-line import/first
import { TemporaryPassword } from '../TemporaryPassword';
// eslint-disable-next-line import/first
import { ToastProvider } from '../../primitives/Toast';
// eslint-disable-next-line import/first
import { UNAMBIGUOUS_ALPHABET } from '../../lib/passwords';

beforeEach(() => {
  updateUser.mockReset();
  runUserAction.mockReset();
});

describe('ChangePasswordDialog', () => {
  function open() {
    const onClose = vi.fn();
    render(
      <ToastProvider>
        <ChangePasswordDialog open onClose={onClose} />
      </ToastProvider>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Change your password' });
    return { dialog, onClose };
  }

  it('asks for 12+ characters, typed twice, before calling Supabase', async () => {
    const { dialog } = open();
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'short' } });
    expect(within(dialog).getByText(/At least 12 characters — 7 to go/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await within(dialog).findByText('Use at least 12 characters (now 5).')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'correct horse battery' } });
    fireEvent.change(within(dialog).getByLabelText('Type it again'), { target: { value: 'correct horse batery' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await within(dialog).findByText('The two passwords don’t match yet.')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('shows or hides both fields', () => {
    const { dialog } = open();
    const pw = within(dialog).getByLabelText('New password');
    expect(pw).toHaveAttribute('type', 'password');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show passwords' }));
    expect(pw).toHaveAttribute('type', 'text');
    expect(within(dialog).getByLabelText('Type it again')).toHaveAttribute('type', 'text');
    expect(within(dialog).getByRole('button', { name: 'Hide passwords' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('changes the password and clears the temporary-password flag in the same call', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    const { dialog, onClose } = open();
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'correct horse battery' } });
    fireEvent.change(within(dialog).getByLabelText('Type it again'), { target: { value: 'correct horse battery' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(updateUser).toHaveBeenCalledWith({ password: 'correct horse battery', data: { must_change_password: false } });
    expect((await screen.findAllByText(/Password changed/)).length).toBeGreaterThan(0);
  });

  it('says plainly when Supabase refuses', async () => {
    updateUser.mockResolvedValue({ data: {}, error: new Error('New password should be different from the old password.') });
    const { dialog, onClose } = open();
    fireEvent.change(within(dialog).getByLabelText('New password'), { target: { value: 'correct horse battery' } });
    fireEvent.change(within(dialog).getByLabelText('Type it again'), { target: { value: 'correct horse battery' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Change password' }));
    expect(await within(dialog).findByText('That’s the password you already have — choose a new one.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('TemporaryPassword', () => {
  it('generates a strong one, sets it, and shows it once with Copy', async () => {
    runUserAction.mockResolvedValue({ ok: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<TemporaryPassword userId="u-chester" name="Chester" />);
    fireEvent.click(screen.getByRole('button', { name: /Set one/ }));
    expect(screen.getByRole('button', { name: 'Generate a strong one' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Share it with Chester privately/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() => expect(runUserAction).toHaveBeenCalledTimes(1));
    const body = runUserAction.mock.calls[0][0];
    expect(body).toMatchObject({ op: 'set_password', userId: 'u-chester' });
    const chars = body.password.replace(/-/g, '');
    expect(chars.length).toBeGreaterThanOrEqual(16);
    for (const c of chars) expect(UNAMBIGUOUS_ALPHABET).toContain(c);

    expect(await screen.findByLabelText('The temporary password')).toHaveTextContent(body.password);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(body.password));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    // Gone once dismissed — it is never shown again.
    expect(screen.queryByText(body.password)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Set one/ })).toBeInTheDocument();
  });

  it('refuses a typed password under 12 characters, then sets a good one', async () => {
    runUserAction.mockResolvedValue({ ok: true });
    render(<TemporaryPassword userId="u1" name="Chester" />);
    fireEvent.click(screen.getByRole('button', { name: /Set one/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Type one myself' }));
    fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'tooshort' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByText('Use at least 12 characters (now 8).')).toBeInTheDocument();
    expect(runUserAction).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Temporary password'), { target: { value: 'Welcome-to-PBT-2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    await waitFor(() =>
      expect(runUserAction).toHaveBeenCalledWith({ op: 'set_password', userId: 'u1', password: 'Welcome-to-PBT-2026' }),
    );
  });

  it('shows the server’s refusal in words', async () => {
    runUserAction.mockRejectedValue(new Error('Only an owner can change an owner’s password.'));
    render(<TemporaryPassword userId="u1" name="Chester" />);
    fireEvent.click(screen.getByRole('button', { name: /Set one/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Set password' }));
    expect(await screen.findByText('Only an owner can change an owner’s password.')).toBeInTheDocument();
    expect(screen.queryByLabelText('The temporary password')).not.toBeInTheDocument();
  });
});
