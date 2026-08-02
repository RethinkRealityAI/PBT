import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// FLAGS.EMAIL_VERIFICATION is false in production; flip it on here so the
// verify-pending branch is exercised. (The OFF path is the app's default and
// is covered by every other test rendering this modal.)
vi.mock('../../../app/flags', () => ({
  FLAGS: { EMAIL_VERIFICATION: true, CLOUD_SYNC: true },
}));

const signUp = vi.fn();
const signInWithPassword = vi.fn();
const resend = vi.fn();

vi.mock('../supabaseClient', () => ({
  getSupabase: () => ({
    auth: { signUp, signInWithPassword, resend },
    from: () => ({ upsert: vi.fn().mockResolvedValue({ error: null }) }),
  }),
}));

vi.mock('../backfillLocalData', () => ({
  backfillLocalDataToCloud: vi.fn().mockResolvedValue(undefined),
}));

import { AccountUpgradeModal } from '../AccountUpgradeModal';

const EMAIL = 'vet@clinic.com';
const PASSWORD = 'correct-horse-battery';

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('you@clinic.com'), EMAIL);
  await user.type(screen.getByPlaceholderText('At least 10 characters'), PASSWORD);
  await user.click(screen.getByRole('button', { name: /create account/i }));
}

describe('AccountUpgradeModal — email verification (flag on)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    resend.mockResolvedValue({ data: {}, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the check-your-inbox pane when sign-up returns no session', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: null },
      error: null,
    });
    const onClose = vi.fn();

    render(<AccountUpgradeModal open initialMode="signup" onClose={onClose} />);
    await fillAndSubmit(user);

    await screen.findByText('Check your inbox');
    // The address is echoed back so the user can spot a typo.
    expect(screen.getByText(new RegExp(EMAIL))).toBeInTheDocument();
    // Verification pending is NOT success — the modal stays open.
    expect(onClose).not.toHaveBeenCalled();
    // A real redirect target is passed once verification is on.
    expect(signUp.mock.calls[0][0].options.emailRedirectTo).toBe(window.location.origin);
  });

  it('treats an empty identities array as verify-pending', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [] }, session: { access_token: 'x' } },
      error: null,
    });

    render(<AccountUpgradeModal open initialMode="signup" onClose={vi.fn()} />);
    await fillAndSubmit(user);

    await screen.findByText('Check your inbox');
  });

  it('starts the resend button on a 60s cooldown and re-enables it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: null },
      error: null,
    });

    render(<AccountUpgradeModal open initialMode="signup" onClose={vi.fn()} />);
    await fillAndSubmit(user);
    await screen.findByText('Check your inbox');

    // Signing up already sent one mail — the button opens disabled.
    const cooling = screen.getByRole('button', { name: /resend in 60s/i });
    expect(cooling).toBeDisabled();

    await vi.advanceTimersByTimeAsync(60_000);

    const ready = await screen.findByRole('button', { name: /^resend email$/i });
    expect(ready).toBeEnabled();

    await user.click(ready);
    await waitFor(() => expect(resend).toHaveBeenCalledWith({ type: 'signup', email: EMAIL }));
    expect(await screen.findByText(/check your inbox again/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend in 60s/i })).toBeDisabled();
  });

  it('routes an unconfirmed sign-in to the inbox pane with a resend affordance', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    signInWithPassword.mockResolvedValue({
      data: {},
      error: Object.assign(new Error('Email not confirmed'), { code: 'email_not_confirmed' }),
    });

    render(<AccountUpgradeModal open initialMode="signin" onClose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText('you@clinic.com'), EMAIL);
    await user.type(screen.getByPlaceholderText('Your password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await screen.findByText('Check your inbox');
    expect(screen.getByRole('alert')).toHaveTextContent(/not confirmed yet/i);
    // No cooldown here — we never sent a mail, so resend is immediately live.
    expect(screen.getByRole('button', { name: /^resend email$/i })).toBeEnabled();
  });

  it('"Back" returns to the sign-up form', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: null },
      error: null,
    });

    render(<AccountUpgradeModal open initialMode="signup" onClose={vi.fn()} />);
    await fillAndSubmit(user);
    await screen.findByText('Check your inbox');

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(await screen.findByText('Create your account')).toBeInTheDocument();
  });
});
