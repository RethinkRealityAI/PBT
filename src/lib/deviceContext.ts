/**
 * Coarse device context for product analytics — the `app_open` nav_event
 * (src/lib/analytics.ts) that lets the admin's Engagement tab answer "what do
 * my trainees use?".
 *
 * Deliberately COARSE: a device class, an OS family, whether the app runs as
 * an installed (home-screen / standalone) app, and the IANA time zone. No
 * versions, no browser name, no screen resolution, no model — nothing that
 * narrows a device down further than that question needs. It is not a
 * fingerprint and must not grow into one.
 *
 * Every probe is guarded: a missing API (jsdom, SSR, an old browser) yields
 * the neutral answer ('desktop' / 'other' / false / no time zone) instead of
 * throwing. The classifiers (`classifyDevice`, `parseOs`) are pure so the
 * decision rules are unit-tested without faking a browser.
 *
 * The admin's label maps (`DEVICE_LABELS`, `OS_LABELS` in
 * admin/src/lib/labels.ts) are exhaustive against `DEVICE_CLASSES` and
 * `OS_FAMILIES` below — add a value here, add its label there.
 */

export const DEVICE_CLASSES = ['mobile', 'tablet', 'desktop'] as const;
export type DeviceClass = (typeof DEVICE_CLASSES)[number];

export const OS_FAMILIES = [
  'ios',
  'android',
  'macos',
  'windows',
  'linux',
  'chromeos',
  'other',
] as const;
export type OsFamily = (typeof OS_FAMILIES)[number];

export interface DeviceContext {
  device: DeviceClass;
  os: OsFamily;
  installed: boolean;
  /** IANA zone, e.g. `America/Toronto`. Omitted when the runtime won't say. */
  tz?: string;
}

/**
 * A touch-first device whose SHORT side is under this many CSS px is a phone;
 * a larger one is a tablet. Phones sit around 360–430, small tablets ≥ 600.
 */
export const PHONE_MAX_SHORT_SIDE = 600;

/** Pure rule: coarse pointer + short side < 600 → mobile; coarse → tablet; else desktop. */
export function classifyDevice(coarsePointer: boolean, shortSide: number | null): DeviceClass {
  if (!coarsePointer) return 'desktop';
  if (shortSide != null && shortSide > 0 && shortSide < PHONE_MAX_SHORT_SIDE) return 'mobile';
  return 'tablet';
}

/**
 * Pure rule: OS family from a platform hint (`navigator.userAgentData.platform`,
 * e.g. "macOS", "Android", "Chrome OS") or a full user-agent string.
 *
 * Order matters: iOS and Android UAs also say "Mac OS X" / "Linux", and a
 * Chromebook says "X11; CrOS". iPadOS Safari reports itself as a Mac — a "Mac"
 * with a multi-touch screen is an iPad (real Macs report 0 touch points).
 */
export function parseOs(source: string, maxTouchPoints = 0): OsFamily {
  const s = source.toLowerCase();
  if (/iphone|ipad|ipod|\bios\b/.test(s)) return 'ios';
  if (s.includes('android')) return 'android';
  if (/\bcros\b|chrome ?os|chromium ?os/.test(s)) return 'chromeos';
  if (/macintosh|mac ?os/.test(s)) return maxTouchPoints > 1 ? 'ios' : 'macos';
  if (s.includes('windows')) return 'windows';
  if (/linux|x11/.test(s)) return 'linux';
  return 'other';
}

function mediaMatches(query: string): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query)?.matches === true;
  } catch {
    return false;
  }
}

/** Shorter side of the device screen in CSS px (viewport as a fallback), or null. */
function screenShortSide(): number | null {
  try {
    if (typeof window === 'undefined') return null;
    const w = window.screen?.width || window.innerWidth || 0;
    const h = window.screen?.height || window.innerHeight || 0;
    const sides = [w, h].filter((n) => Number.isFinite(n) && n > 0);
    return sides.length ? Math.min(...sides) : null;
  } catch {
    return null;
  }
}

interface NavigatorHints {
  userAgent?: string;
  userAgentData?: { platform?: string };
  maxTouchPoints?: number;
  /** iOS Safari's non-standard "launched from the home screen" flag. */
  standalone?: boolean;
}

function navigatorHints(): NavigatorHints | null {
  try {
    return typeof navigator === 'undefined' ? null : (navigator as unknown as NavigatorHints);
  } catch {
    return null;
  }
}

export function detectDevice(): DeviceClass {
  return classifyDevice(mediaMatches('(pointer: coarse)'), screenShortSide());
}

export function detectOs(): OsFamily {
  try {
    const nav = navigatorHints();
    if (!nav) return 'other';
    const hint = nav.userAgentData?.platform?.trim();
    const source = hint && hint.toLowerCase() !== 'unknown' ? hint : (nav.userAgent ?? '');
    return parseOs(source, nav.maxTouchPoints ?? 0);
  } catch {
    return 'other';
  }
}

/** Running as an installed app (home screen / standalone window), not a browser tab. */
export function detectInstalled(): boolean {
  if (mediaMatches('(display-mode: standalone)')) return true;
  try {
    return navigatorHints()?.standalone === true;
  } catch {
    return false;
  }
}

export function detectTimeZone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.length > 0 ? tz : undefined;
  } catch {
    return undefined;
  }
}

/** Everything above in one object; `tz` is left out when unknown. Never throws. */
export function getDeviceContext(): DeviceContext {
  const ctx: DeviceContext = {
    device: detectDevice(),
    os: detectOs(),
    installed: detectInstalled(),
  };
  const tz = detectTimeZone();
  if (tz) ctx.tz = tz;
  return ctx;
}
