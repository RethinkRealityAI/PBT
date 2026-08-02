import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../app/App';
import { STORAGE_KEYS, writeStorage } from '../lib/storage';

afterEach(() => {
  localStorage.clear();
});

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
    writeStorage(STORAGE_KEYS.termsAcceptedAt, new Date().toISOString());

    render(<App />);

    expect(await screen.findByText('ECHO Driver Quiz')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Loading' })).toBeNull();
  });
});
