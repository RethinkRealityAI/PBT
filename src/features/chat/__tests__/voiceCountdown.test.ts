import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { formatClock, secondsUntil, useSecondsLeft } from '../voiceCountdown';

afterEach(() => {
  vi.useRealTimers();
});

describe('voiceCountdown', () => {
  it('rounds up so the clock never shows 0:00 while time remains', () => {
    expect(secondsUntil(10_001, 0)).toBe(11);
    expect(secondsUntil(10_000, 0)).toBe(10);
    expect(secondsUntil(1, 0)).toBe(1);
  });

  it('never goes negative and passes null through', () => {
    expect(secondsUntil(0, 5_000)).toBe(0);
    expect(secondsUntil(null, 0)).toBeNull();
  });

  it('formats m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(60)).toBe('1:00');
    expect(formatClock(125)).toBe('2:05');
    expect(formatClock(-3)).toBe('0:00');
  });

  it('ticks once a second while active, and stops when inactive', () => {
    vi.useFakeTimers();
    const deadline = Date.now() + 5_000;
    const { result, rerender } = renderHook(({ active }) => useSecondsLeft(deadline, active), {
      initialProps: { active: true },
    });
    expect(result.current).toBe(5);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe(3);
    rerender({ active: false });
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
