import { describe, expect, it, beforeEach, vi } from 'vitest';
import { isTrainingUseAllowed, setTrainingUseAllowed } from '../privacy';
import { STORAGE_KEYS, readStorage } from '../storage';

describe('privacy — allow training data use', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to allowed when nothing is stored', () => {
    expect(isTrainingUseAllowed()).toBe(true);
  });

  it('round-trips an opt-out through namespaced storage', () => {
    setTrainingUseAllowed(false);
    expect(localStorage.getItem('pbt:allow_training_use')).toBe('false');
    expect(isTrainingUseAllowed()).toBe(false);

    setTrainingUseAllowed(true);
    expect(isTrainingUseAllowed()).toBe(true);
  });

  it('falls back to allowed when the stored value is corrupt', () => {
    localStorage.setItem('pbt:allow_training_use', '"nope"');
    expect(isTrainingUseAllowed()).toBe(true);
    // The validator resets the slot so it can't keep failing.
    expect(readStorage(STORAGE_KEYS.allowTrainingUse)).toBe(true);
  });
});

describe('privacy gate — analytics.logEvent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  const emit = async () => {
    const { logEvent } = await import('../analytics');
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener('pbt:nav_event', listener);
    logEvent({ type: 'screen_view', screen: 'settings' });
    window.removeEventListener('pbt:nav_event', listener);
    return seen;
  };

  it('emits when training use is allowed', async () => {
    setTrainingUseAllowed(true);
    expect(await emit()).toHaveLength(1);
    expect(localStorage.getItem('pbt:nav_queue')).toContain('screen_view');
  });

  it('drops the event entirely when the user has opted out', async () => {
    setTrainingUseAllowed(false);
    expect(await emit()).toHaveLength(0);
    // Nothing queued for a later flush either — an opt-out must not just
    // defer the write.
    expect(localStorage.getItem('pbt:nav_queue')).toBeNull();
  });
});
