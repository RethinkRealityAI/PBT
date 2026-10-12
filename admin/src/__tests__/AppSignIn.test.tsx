/**
 * Regression: the admin shell must survive the sign-in transition.
 *
 * `App` renders a loading card, then the signed-in portal once `admin-whoami`
 * answers. Any hook declared after the early returns (loading / sign-in /
 * not-authorised) runs on the second render but not the first, and React
 * throws "Rendered more hooks than during the previous render" — the whole
 * portal goes blank right after a successful sign-in. That shipped once
 * (a canonicalisation effect placed below the returns); this test renders the
 * real App through loading → signed in so it cannot ship again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { session, updateUser, signOut } = vi.hoisted(() => ({
  session: {
    access_token: 'mock-access-token',
    user: { user_metadata: {} as Record<string, unknown> },
  },
  updateUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      // Resolve on a later tick, so the first render is the loading state.
      getSession: () =>
        new Promise((resolve) => setTimeout(() => resolve({ data: { session } }), 0)),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      updateUser,
      signOut,
    },
  }),
  getAccessToken: async () => session.access_token,
}));

describe('admin App sign-in transition', () => {
  const realFetch = window.fetch;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    window.location.hash = '#/scenarios/studio';
    const { installAdminMocks } = await import('../dev/mockApi');
    installAdminMocks();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    window.fetch = realFetch;
    consoleError.mockRestore();
    window.location.hash = '';
    session.user.user_metadata = {};
    updateUser.mockReset();
    signOut.mockReset();
  });

  const hookErrors = () =>
    consoleError.mock.calls.filter((args) =>
      args.some((a) => String(a instanceof Error ? a.message : a).includes('Rendered more hooks')),
    );

  it('goes from the loading card to the portal without a hook-order error', async () => {
    const { App } = await import('../App');
    render(<App />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    // The rail renders only once signed in as an admin.
    expect(await screen.findAllByText('Scenario Studio', {}, { timeout: 8000 })).not.toHaveLength(0);
    expect(hookErrors()).toEqual([]);
    // The account area offers Change password.
    expect(screen.getByRole('button', { name: 'Change password' })).toBeInTheDocument();
  });

  it('on a temporary password, asks for a new one before the portal — then opens it', async () => {
    session.user.user_metadata = { must_change_password: true };
    updateUser.mockResolvedValue({ data: {}, error: null });
    const { App } = await import('../App');
    render(<App />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Choose your own password' }, { timeout: 8000 })).toBeInTheDocument();
    // Nothing of the portal yet; Sign out is the only other way out.
    expect(screen.queryByRole('navigation', { name: 'Admin sections' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out instead' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'chester-picks-his-own' } });
    fireEvent.change(screen.getByLabelText('Type it again'), { target: { value: 'chester-picks-his-own' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith({ password: 'chester-picks-his-own', data: { must_change_password: false } }),
    );
    expect(await screen.findAllByText('Scenario Studio', {}, { timeout: 8000 })).not.toHaveLength(0);
    expect(screen.queryByRole('heading', { name: 'Choose your own password' })).not.toBeInTheDocument();
    expect(hookErrors()).toEqual([]);
  });

  it('Sign out instead signs out from the temporary-password screen', async () => {
    session.user.user_metadata = { must_change_password: true };
    const { App } = await import('../App');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out instead' }, { timeout: 8000 }));
    expect(signOut).toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
