/**
 * Hash routing for the admin portal.
 *
 * `#/analytics/sessions` — destination, then tab, then (optionally) the one
 * record the tab is open on: `#/analytics/trainees/<user id>` is a trainee's
 * profile, `#/analytics/sessions/<session id>` a session. Deliberately not a router
 * library (the consumer app's state machine is intentional and this follows
 * suit), but a URL is worth having here: admins share links to a screen,
 * bookmark the one they live in, and expect the browser's back button to undo a
 * tab switch rather than leave the portal.
 */
import { useCallback, useEffect, useState } from 'react';

export interface AdminRoute {
  screen: string;
  tab: string | null;
  /**
   * The record a tab is open on (a trainee's user id, a session id). Optional
   * so every existing `{ screen, tab }` literal stays a valid route; absent
   * and `null` both mean "the tab itself".
   */
  id?: string | null;
}

const SEGMENT = /^[a-z0-9_-]+$/i;

export function parseRoute(hash: string): AdminRoute | null {
  const raw = hash.replace(/^#\/?/, '').split('?')[0];
  if (!raw) return null;
  const [screen, tab, id] = raw.split('/');
  if (!screen || !SEGMENT.test(screen)) return null;
  const validTab = tab && SEGMENT.test(tab) ? tab : null;
  // An id only means something under a tab — `#/analytics//x` is not a route.
  const validId = validTab && id && SEGMENT.test(id) ? id : null;
  return validId ? { screen, tab: validTab, id: validId } : { screen, tab: validTab };
}

export function formatRoute(route: AdminRoute): string {
  if (!route.tab) return `#/${route.screen}`;
  return route.id ? `#/${route.screen}/${route.tab}/${route.id}` : `#/${route.screen}/${route.tab}`;
}

export function useHashRoute(): [AdminRoute | null, (route: AdminRoute, replace?: boolean) => void] {
  const [route, setRoute] = useState<AdminRoute | null>(() =>
    typeof window === 'undefined' ? null : parseRoute(window.location.hash),
  );

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: AdminRoute, replace = false) => {
    const hash = formatRoute(next);
    if (window.location.hash === hash) {
      // Same hash → no `hashchange` event, so mirror it into state ourselves.
      setRoute(next);
      return;
    }
    if (replace) {
      // Canonicalising a partial or forbidden URL shouldn't add a history
      // entry — otherwise Back lands the user right back on the bad one.
      history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
      setRoute(next);
    } else {
      window.location.hash = hash;
    }
  }, []);

  return [route, navigate];
}
