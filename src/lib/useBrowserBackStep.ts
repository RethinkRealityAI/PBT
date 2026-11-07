/**
 * An in-screen step the BROWSER's back (Android's back gesture, the
 * browser button) undoes before it leaves the page.
 *
 * The app's navigation is a state machine with no URL history (no router —
 * on purpose), so a screen with two steps — the Training library's focus
 * areas → scenarios — would otherwise lose the trainee's place: one back
 * gesture and the whole app is gone. While `active` is true one history
 * entry is held for the step; a popstate that leaves it calls `onBack`.
 *
 * When the step ends any other way (the app's own Back button, picking
 * "All focus areas", starting a scenario) the held entry is given back with
 * `history.back()`, so the browser's back stack never collects dead steps.
 *
 * The marker rides in `history.state` (`pbtStep`), so a popstate that lands
 * on another step entry (React StrictMode's double effect in development)
 * is not mistaken for leaving the step.
 */
import { useEffect, useRef } from 'react';

const MARK = 'pbtStep';

function onStepEntry(): boolean {
  const state = window.history.state as Record<string, unknown> | null;
  return Boolean(state && state[MARK]);
}

export function useBrowserBackStep(active: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.history?.pushState) return;
    const { [MARK]: _stale, ...base } = (window.history.state as Record<string, unknown> | null) ?? {};
    window.history.pushState({ ...base, [MARK]: true }, '');
    let left = false;
    const onPopState = () => {
      if (onStepEntry()) return;
      left = true;
      onBackRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (!left && onStepEntry()) window.history.back();
    };
  }, [active]);
}
