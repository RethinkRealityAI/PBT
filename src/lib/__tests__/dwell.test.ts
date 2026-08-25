import { describe, expect, it } from 'vitest';
import { createDwellTracker, MAX_DWELL_MS, MIN_DWELL_MS } from '../dwell';

function harness(initial = 'home') {
  let t = 0;
  const emitted: { screen: string; dwellMs: number }[] = [];
  const tracker = createDwellTracker(initial, {
    emit: (screen, dwellMs) => emitted.push({ screen, dwellMs }),
    now: () => t,
  });
  return { tracker, emitted, tick: (ms: number) => (t += ms) };
}

describe('createDwellTracker', () => {
  it('emits dwell for the previous screen on navigation', () => {
    const { tracker, emitted, tick } = harness();
    tick(5_000);
    tracker.onScreenChange('history');
    expect(emitted).toEqual([{ screen: 'home', dwellMs: 5_000 }]);
    tick(2_500);
    tracker.onScreenChange('settings');
    expect(emitted[1]).toEqual({ screen: 'history', dwellMs: 2_500 });
  });

  it('ignores same-screen changes', () => {
    const { tracker, emitted, tick } = harness();
    tick(5_000);
    tracker.onScreenChange('home');
    expect(emitted).toHaveLength(0);
  });

  it('drops blips shorter than MIN_DWELL_MS', () => {
    const { tracker, emitted, tick } = harness();
    tick(MIN_DWELL_MS - 1);
    tracker.onScreenChange('history');
    expect(emitted).toHaveLength(0);
    // timing restarted on the new screen regardless
    tick(1_200);
    tracker.onScreenChange('home');
    expect(emitted).toEqual([{ screen: 'history', dwellMs: 1_200 }]);
  });

  it('caps a single stretch at MAX_DWELL_MS', () => {
    const { tracker, emitted, tick } = harness();
    tick(MAX_DWELL_MS * 3);
    tracker.onScreenChange('history');
    expect(emitted).toEqual([{ screen: 'home', dwellMs: MAX_DWELL_MS }]);
  });

  it('emits on hide and pauses until shown again', () => {
    const { tracker, emitted, tick } = harness();
    tick(4_000);
    tracker.onHide();
    expect(emitted).toEqual([{ screen: 'home', dwellMs: 4_000 }]);
    // hidden time never counts
    tick(60_000);
    tracker.onShow();
    tick(3_000);
    tracker.onScreenChange('history');
    expect(emitted[1]).toEqual({ screen: 'home', dwellMs: 3_000 });
  });

  it('double hide emits once', () => {
    const { tracker, emitted, tick } = harness();
    tick(2_000);
    tracker.onHide();
    tracker.onHide();
    expect(emitted).toHaveLength(1);
  });

  it('navigation while hidden restarts only on show', () => {
    const { tracker, emitted, tick } = harness();
    tick(2_000);
    tracker.onHide();
    tracker.onScreenChange('history');
    tick(10_000); // still hidden — must not count toward history
    tracker.onShow();
    tick(1_500);
    tracker.onHide();
    expect(emitted).toEqual([
      { screen: 'home', dwellMs: 2_000 },
      { screen: 'history', dwellMs: 1_500 },
    ]);
  });

  it('show while already running is a no-op', () => {
    const { tracker, emitted, tick } = harness();
    tick(1_000);
    tracker.onShow();
    tick(1_000);
    tracker.onScreenChange('history');
    expect(emitted).toEqual([{ screen: 'home', dwellMs: 2_000 }]);
  });
});
