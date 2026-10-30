/**
 * /admin/reset — where a recovery email lands. Pins: the page waits for
 * Supabase's real answer (a slow phone is never told a good link expired),
 * an expired link says so at once, and the form is only ever for the link's
 * own account — never for whoever happens to be signed in already.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const { getSession, updateUser } = vi.hoisted(() => ({ getSession: vi.fn(), updateUser: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({ auth: { getSession, updateUser } }) }));

// eslint-disable-next-line import/first
import { ResetPasswordPage } from '../AuthPages';

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (sub: string) => `${b64url({ alg: 'HS256' })}.${b64url({ sub })}.sig`;
const session = (id: string) => ({ data: { session: { user: { id }, access_token: 't' } } });

function openAt(hash: string) {
  window.history.replaceState(null, '', `/admin/reset${hash}`);
  return render(<ResetPasswordPage />);
}

beforeEach(() => {
  getSession.mockReset();
  updateUser.mockReset();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, '', '/');
});

describe('ResetPasswordPage', () => {
  it('keeps checking while Supabase is slow, then shows the form', async () => {
    vi.useFakeTimers();
    let answer!: (v: unknown) => void;
    getSession.mockReturnValue(new Promise((r) => (answer = r)));
    openAt(`#access_token=${token('chester')}&type=recovery`);
    await act(async () => {
      vi.advanceTimersByTime(8_000); // the old page gave up after 2.5 s
    });
    expect(screen.getByText('Checking your link…')).toBeInTheDocument();
    await act(async () => answer(session('chester')));
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
  });

  it('offers a retry — not "expired" — when the server never answers', async () => {
    vi.useFakeTimers();
    getSession.mockReturnValue(new Promise(() => {}));
    openAt(`#access_token=${token('chester')}&type=recovery`);
    await act(async () => {
      vi.advanceTimersByTime(20_001);
    });
    expect(screen.getByRole('heading', { name: 'We couldn’t check your link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('says an expired or used link has expired, without asking Supabase', () => {
    openAt('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(screen.getByRole('heading', { name: 'Reset link expired' })).toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('never offers the form for a different signed-in account', async () => {
    getSession.mockResolvedValue(session('someone-already-signed-in'));
    openAt(`#access_token=${token('chester')}&type=recovery`);
    expect(await screen.findByRole('heading', { name: 'We couldn’t check your link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('without a link, a signed-in admin is not offered the form', async () => {
    getSession.mockResolvedValue(session('admin-1'));
    openAt('');
    expect(await screen.findByRole('heading', { name: 'Reset link expired' })).toBeInTheDocument();
    expect(getSession).not.toHaveBeenCalled();
  });

  it('a reload mid-form keeps the form for the account this tab confirmed, then sets the password', async () => {
    getSession.mockResolvedValue(session('chester'));
    const first = openAt(`#access_token=${token('chester')}&type=recovery`);
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    first.unmount();

    openAt(''); // supabase-js cleared the hash; the tab remembers who it confirmed
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();

    updateUser.mockResolvedValue({ error: null });
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'a-long-new-password' } });
    fireEvent.change(screen.getByLabelText(/Confirm password/), { target: { value: 'a-long-new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith({ password: 'a-long-new-password' });
    expect(sessionStorage.getItem('pbt:admin_recovery_user')).toBeNull();
  });
});
