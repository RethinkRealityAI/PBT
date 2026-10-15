import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../app/App';
import { STORAGE_KEYS, writeStorage, type StorageKeyDef } from '../lib/storage';
import { acceptTerms, hasAcceptedCurrentTerms } from '../lib/terms';
import type { Profile } from '../app/providers/ProfileProvider';

afterEach(() => {
  localStorage.clear();
});

const PROFILE_KEY: StorageKeyDef<Profile | null> = { key: 'profile', fallback: null };
const PROFILE: Profile = {
  primary: 'Analyzer',
  secondary: 'Harmonizer',
  tally: { Activator: 1, Energizer: 1, Analyzer: 10, Harmonizer: 3 },
  answers: [],
  takenAt: '2026-08-01T00:00:00.000Z',
};

/** A device that accepted the version-1 Terms (the old screen wrote a raw "1"). */
function acceptVersionOne() {
  writeStorage(STORAGE_KEYS.termsAcceptedAt, '2026-08-01T00:00:00.000Z');
  localStorage.setItem('pbt:terms_version', '1');
}

async function agree(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: /I agree/ }));
}

describe('App smoke', () => {
  it('mounts without throwing', () => {
    render(<App />);
  });

  /**
   * Most screens are behind React.lazy (see the loading-strategy note in
   * App.tsx). This walks the one lazy route reachable without user input —
   * terms accepted but no profile yet, so RouteResolver replaces to `quiz` —
   * and proves the Suspense boundary resolves its chunk and mounts the screen.
   *
   * (The <ScreenFallback /> itself is not asserted: under Vitest the modules
   * are already in memory, so the lazy promise settles inside the same act()
   * flush as the render and the fallback is never painted.)
   */
  it('resolves a lazily-loaded screen through the Suspense boundary', async () => {
    acceptTerms();

    render(<App />);

    expect(await screen.findByText('ECHO Driver Quiz')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });
});

describe('App — Terms updated since this device accepted them', () => {
  it('boots a version-1 device into the Terms with the update notice, then lands on home (not the quiz)', async () => {
    acceptVersionOne();
    writeStorage(PROFILE_KEY, PROFILE);
    const user = userEvent.setup();

    render(<App />);

    expect(screen.getByRole('note')).toHaveTextContent(/We've updated these terms/);
    await agree(user);

    expect(await screen.findByRole('button', { name: 'Build a scenario' })).toBeTruthy();
    expect(screen.queryByText('ECHO Driver Quiz')).toBeNull();
    expect(hasAcceptedCurrentTerms()).toBe(true);
  });

  it('sends a version-1 device with no ECHO profile on to the quiz', async () => {
    acceptVersionOne();
    const user = userEvent.setup();

    render(<App />);
    await agree(user);

    expect(await screen.findByText('ECHO Driver Quiz')).toBeTruthy();
  });

  it('boots straight to home once the current Terms are accepted — no notice', async () => {
    acceptTerms();
    writeStorage(PROFILE_KEY, PROFILE);

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Build a scenario' })).toBeTruthy();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('a fresh device still starts at onboarding', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /I already have an account/ })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
