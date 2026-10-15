import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// No backend: a flush on hide just drops the batch (and stays quiet about it).
vi.mock('../../features/auth/supabaseClient', () => ({ getSupabase: () => null }));

import { NEW_VISIT_AFTER_MS, startAnalytics } from '../analytics';
import { setTrainingUseAllowed } from '../privacy';
import { STORAGE_KEYS, writeStorage } from '../storage';

/**
 * `app_open` — the visit marker behind the admin's device / install / language
 * breakdowns. One on start, one more per return from ≥ 30 min in the
 * background, never more, and dropped like every other event on opt-out.
 *
 * startAnalytics() registers document listeners once per module instance, so
 * this file shares ONE instance: the first test starts the emitter and the
 * rest drive visibility changes against it.
 */

const T0 = new Date('2026-10-15T09:00:00Z').getTime();

let visibility: DocumentVisibilityState = 'visible';
let seen: Array<{ type: string; target?: string; screen?: string; meta?: Record<string, unknown> }> = [];
const listener = (e: Event) => seen.push((e as CustomEvent).detail);

const appOpens = () => seen.filter((e) => e.target === 'app_open');

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Hide the tab, let `ms` pass, show it again. */
function awayFor(ms: number) {
  setVisibility('hidden');
  vi.setSystemTime(Date.now() + ms);
  setVisibility('visible');
}

beforeAll(() => {
  vi.useFakeTimers({ now: T0 });
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  window.addEventListener('pbt:nav_event', listener);
});

afterAll(() => {
  window.removeEventListener('pbt:nav_event', listener);
  vi.useRealTimers();
});

beforeEach(() => {
  seen = [];
  visibility = 'visible';
});

describe('analytics — app_open', () => {
  it('logs one app_open on start with the coarse context, language and theme', () => {
    writeStorage(STORAGE_KEYS.locale, 'fr');
    writeStorage(STORAGE_KEYS.theme, 'system');

    startAnalytics();
    startAnalytics(); // idempotent — React StrictMode runs the mount effect twice

    expect(appOpens()).toHaveLength(1);
    const [event] = appOpens();
    expect(event.type).toBe('custom');
    expect(event.meta).toMatchObject({
      // jsdom: setup's matchMedia answers false, so a fine pointer and no
      // standalone display mode.
      device: 'desktop',
      installed: false,
      locale: 'fr',
      theme: 'system',
    });
    expect(typeof event.meta?.os).toBe('string');
    // Nothing beyond the declared fields.
    expect(
      Object.keys(event.meta ?? {}).every((k) =>
        ['device', 'os', 'installed', 'locale', 'theme', 'tz'].includes(k),
      ),
    ).toBe(true);
  });

  it('a short absence is the same visit — no new app_open', () => {
    awayFor(NEW_VISIT_AFTER_MS - 1000);
    expect(appOpens()).toHaveLength(0);
  });

  it('coming back after ≥ 30 minutes hidden is a new visit — exactly one app_open', () => {
    awayFor(NEW_VISIT_AFTER_MS);
    expect(appOpens()).toHaveLength(1);
    // Repeated "visible" without a fresh hide adds nothing.
    setVisibility('visible');
    expect(appOpens()).toHaveLength(1);
  });

  it('measures from the FIRST hide — repeated hidden events do not reset the clock', () => {
    setVisibility('hidden');
    vi.setSystemTime(Date.now() + NEW_VISIT_AFTER_MS / 2);
    setVisibility('hidden');
    vi.setSystemTime(Date.now() + NEW_VISIT_AFTER_MS / 2);
    setVisibility('visible');
    expect(appOpens()).toHaveLength(1);
  });

  it('logs nothing when the user has opted out of training use', () => {
    setTrainingUseAllowed(false);
    awayFor(NEW_VISIT_AFTER_MS * 2);
    expect(appOpens()).toHaveLength(0);
    expect(localStorage.getItem('pbt:nav_queue') ?? '').not.toContain('app_open');
  });
});
