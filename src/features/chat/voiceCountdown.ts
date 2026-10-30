import { useEffect, useState } from 'react';

/** Whole seconds left until `deadline` (epoch ms), never negative. Null in → null out. */
export function secondsUntil(deadline: number | null, now: number): number | null {
  if (deadline == null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** `m:ss` — the countdown's display form ("0:42", "2:05"). Locale-neutral digits. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Live seconds-remaining for a deadline, re-rendering once a second while
 * `active`. Inactive (or no deadline) → null and no interval running.
 */
export function useSecondsLeft(deadline: number | null, active = true): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || deadline == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active, deadline]);
  return active ? secondsUntil(deadline, now) : null;
}
