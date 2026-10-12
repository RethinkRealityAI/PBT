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
import { render, screen } from '@testing-library/react';

const session = { access_token: 'mock-access-token' };

vi.mock('../lib/supabase', () => ({
  getSupabase: () => ({
    auth: {
      // Resolve on a later tick, so the first render is the loading state.
      getSession: () =>
        new Promise((resolve) => setTimeout(() => resolve({ data: { session } }), 0)),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
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
  });

  it('goes from the loading card to the portal without a hook-order error', async () => {
    const { App } = await import('../App');
    render(<App />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    // The rail renders only once signed in as an admin.
    expect(await screen.findAllByText('Scenario Studio', {}, { timeout: 8000 })).not.toHaveLength(0);
    const hookErrors = consoleError.mock.calls.filter((args) =>
      args.some((a) => String(a instanceof Error ? a.message : a).includes('Rendered more hooks')),
    );
    expect(hookErrors).toEqual([]);
  });
});
